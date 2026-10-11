import { useEffect, useRef, useState } from 'react';
import { type CheckInState } from './AppointmentCheckIn';
import { useTranslation } from './localization';

type ReminderBooking = {
  id: string;
  date: string;
  time: string;
  customerName: string;
  branchName: string;
  status?: string;
  checkedInAt?: string;
  checkedInBy?: string;
  receiptNumber?: string;
};

export function overdueCheckIns(bookings: ReminderBooking[], now: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(({ type, value }) => [type, value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const currentMinutes = Number(parts.hour) * 60 + Number(parts.minute);
  return bookings.flatMap((booking) => {
    if (!booking.id || booking.date !== today || booking.checkedInAt ||
        ['Cancelled', 'No Show', 'Completed'].includes(booking.status || '')) return [];
    const match = /^(\d{1,2}):([0-5]\d)(?:\s*(AM|PM))?/i.exec(booking.time || '');
    if (!match) return [];
    const hour = Number(match[1]);
    if (match[3] ? hour < 1 || hour > 12 : hour > 23) return [];
    const start = (match[3] ? hour % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0) : hour) * 60 + Number(match[2]);
    return currentMinutes >= start + 10 ? [{ booking, start }] : [];
  }).sort((left, right) => left.start - right.start);
}

export async function checkInOverdueBookings(
  bookings: ReminderBooking[],
  onChanged: (bookingId: string, state: CheckInState) => Promise<void>,
  currentTime = () => new Date(),
  sendRequest: typeof fetch = fetch,
) {
  for (const booking of bookings) {
    if (!overdueCheckIns([booking], currentTime()).length) continue;
    const response = await sendRequest('/api/booking?view=check-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: booking.id, checkedIn: true }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`${booking.customerName}: ${data.message || 'Unable to update the check-in.'}`);
    if (typeof data.checkedInAt !== 'string' || !data.checkedInAt) {
      throw new Error(`${booking.customerName}: Unable to verify the check-in.`);
    }
    await onChanged(booking.id, { checkedInAt: data.checkedInAt, checkedInBy: data.checkedInBy || '' });
  }
}

export default function CheckInReminders({ bookings, onChanged, onRefresh }: {
  bookings: ReminderBooking[];
  onChanged: (bookingId: string, state: CheckInState) => Promise<void>;
  onRefresh: () => Promise<unknown>;
}) {
  const { translate: tr } = useTranslation();
  const [now, setNow] = useState(() => new Date());
  const [dismissed, setDismissed] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const overdue = overdueCheckIns(bookings.filter((booking) => !savedIds.includes(booking.id)), now);
  const reminderKey = overdue.map(({ booking }) => `${booking.date}:${booking.id}`).join('|');
  const showPopup = Boolean(reminderKey && dismissed !== reminderKey);
  useEffect(() => {
    if (showPopup && !dialog.current?.open) dialog.current?.showModal();
    if (!showPopup && !busy) dialog.current?.close();
  }, [showPopup, busy]);

  async function accept() {
    if (busy) return;
    setBusy(true);
    setError('');
    const displayedBookings = overdue.map(({ booking }) => booking);
    try {
      await checkInOverdueBookings(displayedBookings, async (bookingId, state) => {
        setSavedIds((current) => [...current, bookingId]);
        await onChanged(bookingId, state);
      });
      setDismissed(reminderKey);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : tr('Unable to update the check-in.'));
    } finally {
      setBusy(false);
    }
  }
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;
  useEffect(() => {
    let refreshing = false;
    const update = async () => {
      if (document.visibilityState === 'hidden' || refreshing) return;
      setNow(new Date());
      refreshing = true;
      try {
        await refresh.current();
      } finally {
        refreshing = false;
      }
    };
    const timer = window.setInterval(() => { void update(); }, 30000);
    document.addEventListener('visibilitychange', update);
    void update();
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return (
    <>
      {overdue.length > 0 && <button type="button" onClick={() => setDismissed('')}
        className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-950">
        {tr('Overdue check-in reminders')} ({overdue.length})
      </button>}
      <dialog ref={dialog} aria-labelledby="overdue-check-in-title"
        onCancel={(event) => { event.preventDefault(); if (!busy) setDismissed(reminderKey); }}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-amber-200 bg-white p-5 shadow-2xl backdrop:bg-slate-950/50">
        <h2 id="overdue-check-in-title" className="text-sm font-bold text-amber-950">{tr('Check-in overdue (10 minutes after appointment time)')}</h2>
        <p className="mt-2 text-xs text-amber-900">{tr('Check in only the overdue appointments listed below for today. Confirm every listed client has arrived.')}</p>
        <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
          {overdue.map(({ booking }) => (
            <p key={booking.id} className="rounded-lg border border-amber-200 p-2 text-xs font-semibold text-slate-900">
              {booking.customerName} · {booking.time} · {booking.branchName}
            </p>
          ))}
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" disabled={busy} onClick={() => setDismissed(reminderKey)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold disabled:opacity-50">{tr('Not now')}</button>
          <button type="button" disabled={busy || !overdue.length} onClick={() => { void accept(); }}
            className="rounded-lg bg-emerald-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
            {busy ? tr('Saving...') : tr('Confirm arrival and check in all listed')}
          </button>
        </div>
      </dialog>
    </>
  );
}
