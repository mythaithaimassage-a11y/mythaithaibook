import { useEffect, useRef, useState } from 'react';
import AppointmentCheckIn, { type CheckInState } from './AppointmentCheckIn';
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

export default function CheckInReminders({ bookings, onChanged, onRefresh }: {
  bookings: ReminderBooking[];
  onChanged: (bookingId: string, state: CheckInState) => Promise<void>;
  onRefresh: () => Promise<unknown>;
}) {
  const { translate: tr } = useTranslation();
  const [now, setNow] = useState(() => new Date());
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
  const overdue = overdueCheckIns(bookings, now);
  if (!overdue.length) return null;
  return (
    <section aria-label={tr('Overdue check-in reminders')} className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-3">
      <p role="status" className="text-sm font-bold text-amber-950">{tr('Check-in overdue (10 minutes after appointment time)')}</p>
      <p className="mt-1 text-xs text-amber-900">{tr('Confirm the client has arrived before checking them in.')}</p>
      <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
        {overdue.map(({ booking }) => (
          <div key={booking.id} className="rounded-lg border border-amber-200 bg-white p-2">
            <p className="text-xs font-semibold text-slate-900">{booking.customerName} · {booking.time} · {booking.branchName}</p>
            <AppointmentCheckIn
              bookingId={booking.id}
              checkedInAt={booking.checkedInAt || ''}
              checkedInBy={booking.checkedInBy || ''}
              receiptIssued={Boolean(booking.receiptNumber)}
              cancelled={false}
              onChanged={(state) => onChanged(booking.id, state)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
