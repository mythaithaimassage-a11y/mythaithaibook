import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from './localization';

type BookingAlert = {
  id: string; type?: string; customerName: string; branchName: string; serviceName: string;
  therapistName: string; date: string; time: string; durationMinutes: number; createdAt: string;
  previousDate?: string; previousTime?: string;
};

export const bookingActivityTitles: Record<string, string> = {
  created: 'New appointment booked',
  rescheduled: 'Appointment rescheduled',
  cancelled: 'Appointment cancelled',
  edited: 'Appointment updated',
  deleted: 'Appointment deleted',
};

const activityTitle = (type?: string) => bookingActivityTitles[type || 'created'] || bookingActivityTitles.created;

export default function BookingNotifications({ userId, portalTarget }: { userId: string; portalTarget?: Element | null }) {
  const { translate: tr, formatTime } = useTranslation();
  const [alerts, setAlerts] = useState<BookingAlert[]>([]);
  const [error, setError] = useState('');
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

  useEffect(() => {
    const controller = new AbortController();
    const seen = new Map<string, string>();
    let cursor = '';
    let baseline = '';
    let loading = false;
    setAlerts([]);
    const poll = async () => {
      if (loading) return;
      loading = true;
      try {
        const response = await fetch(`/api/booking?view=booking-notifications${cursor ? `&since=${encodeURIComponent(cursor)}` : ''}`, {
          cache: 'no-store', signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Unable to load booking alerts.');
        if (typeof data.cursor !== 'string' || !Number.isFinite(Date.parse(data.cursor)) || !Array.isArray(data.notifications) ||
            data.notifications.some((item: BookingAlert) => !item || typeof item.id !== 'string' || !Number.isFinite(Date.parse(item.createdAt)))) {
          throw new Error('Unable to load booking alerts.');
        }
        if (controller.signal.aborted) return;
        if (!baseline) baseline = data.cursor;
        const fresh: BookingAlert[] = data.notifications.filter((item: BookingAlert) => item.createdAt >= baseline && !seen.has(item.id));
        for (const item of fresh) seen.set(item.id, item.createdAt);
        cursor = data.cursor;
        const oldest = new Date(Date.parse(cursor) - 120000).toISOString();
        for (const [id, createdAt] of seen) if (createdAt < oldest) seen.delete(id);
        setError('');
        if (fresh.length) {
          setAlerts((current) => [...current, ...fresh]);
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            for (const item of fresh) {
              // Keep customer details inside the authenticated app, not on the lock screen.
              const notification = new Notification(tr(activityTitle(item.type)), {
                body: tr('Open the booking calendar to view this appointment.'), tag: `booking-${item.id}`,
              });
              notification.onclick = () => { window.focus(); notification.close(); };
            }
          }
        }
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Unable to load booking alerts.');
      } finally {
        loading = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 15000);
    const resume = () => { if (!document.hidden) void poll(); };
    document.addEventListener('visibilitychange', resume);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [userId, tr]);

  const enableNotifications = async () => {
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to enable browser notifications.');
    }
  };
  const alert = alerts[0];
  const content = <>
    <div className="fixed bottom-20 right-3 z-[80] max-w-sm space-y-2 lg:bottom-3">
      {permission === 'default' && <button type="button" onClick={() => void enableNotifications()} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs text-blue-800 shadow">
        {tr('Enable browser booking alerts')}
      </button>}
      {permission === 'denied' && <p className="rounded-lg bg-white p-2 text-xs text-stone-600 shadow">{tr('Browser alerts are blocked. Enable notifications in browser settings. In-app alerts remain active.')}</p>}
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-white p-3 text-xs text-red-800 shadow">{tr(error)}</p>}
      {alert && <section role="alertdialog" aria-modal="false" aria-labelledby="new-booking-title" className={`rounded-xl border bg-white p-4 text-sm text-stone-800 shadow-xl ${alert.type === 'cancelled' || alert.type === 'deleted' ? 'border-red-300' : alert.type === 'rescheduled' || alert.type === 'edited' ? 'border-amber-300' : 'border-emerald-300'}`}>
        <h2 id="new-booking-title" className="font-bold">{tr(activityTitle(alert.type))}</h2>
        <p className="mt-2 font-semibold">{alert.customerName}</p>
        <p>{alert.serviceName}</p>
        {alert.previousDate && <p className="text-stone-500 line-through">{alert.previousDate} · {formatTime(alert.previousTime || '')}</p>}
        <p>{alert.date} · {formatTime(alert.time)} · {tr('{minutes} minutes', { minutes: alert.durationMinutes })}</p>
        <p>{alert.branchName} · {alert.therapistName}</p>
        <button type="button" onClick={() => setAlerts((current) => current.slice(1))} className="mt-3 rounded-lg bg-emerald-700 px-3 py-1.5 font-semibold text-white">{tr('Dismiss')}</button>
      </section>}
    </div>
  </>;
  return portalTarget ? createPortal(content, portalTarget) : content;
}
