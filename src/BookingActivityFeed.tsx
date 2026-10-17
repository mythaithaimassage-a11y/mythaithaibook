import MobileHelp from './MobileHelp';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from './localization';
import { bookingActivityTitles } from './BookingNotifications';

type BookingActivity = {
  id: string; bookingId: string; type: string; customerName: string; branchName: string;
  serviceName: string; therapistName: string; date: string; time: string; durationMinutes: number;
  previousDate: string; previousTime: string; actor: string; createdAt: string;
};

const FILTERS = ['all', 'created', 'rescheduled', 'cancelled', 'edited', 'deleted'];
const FILTER_LABELS: Record<string, string> = {
  all: 'All activity', created: 'New bookings', rescheduled: 'Rescheduled', cancelled: 'Cancelled',
  edited: 'Edited', deleted: 'Deleted',
};
const TYPE_STYLES: Record<string, string> = {
  created: 'bg-emerald-100 text-emerald-800',
  rescheduled: 'bg-amber-100 text-amber-800',
  cancelled: 'bg-rose-100 text-rose-800',
  edited: 'bg-sky-100 text-sky-800',
  deleted: 'bg-slate-200 text-slate-700',
};

export default function BookingActivityFeed() {
  const { translate: tr, formatTime } = useTranslation();
  const [events, setEvents] = useState<BookingActivity[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await fetch('/api/booking?view=booking-activity&days=7', { cache: 'no-store', signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to load booking activity.');
      if (!Array.isArray(data.events)) throw new Error('Unable to load booking activity.');
      setEvents(data.events);
      setError('');
    } catch (failure) {
      if (!signal?.aborted) setError(failure instanceof Error ? failure.message : 'Unable to load booking activity.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const timer = window.setInterval(() => void load(controller.signal), 30000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [load]);

  const counts = events.reduce<Record<string, number>>((totals, event) => {
    totals[event.type] = (totals[event.type] || 0) + 1;
    return totals;
  }, {});
  const displayed = filter === 'all' ? events : events.filter((event) => event.type === filter);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">{tr('Booking activity')}</h3>
          <MobileHelp><p className="text-xs text-slate-500">{tr('New bookings, reschedules, cancellations and staff edits from the last 7 days.')}</p></MobileHelp>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          {loading ? tr('Loading…') : tr('Refresh')}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <button key={option} type="button" onClick={() => setFilter(option)} aria-pressed={filter === option}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === option ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
            {tr(FILTER_LABELS[option])} ({option === 'all' ? events.length : counts[option] || 0})
          </button>
        ))}
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{tr(error)}</p>}
      {!error && !loading && !displayed.length && <p className="mt-4 text-sm text-slate-500">{tr('No booking activity in the last 7 days.')}</p>}
      {displayed.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100">
          {displayed.map((event) => (
            <li key={event.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${TYPE_STYLES[event.type] || TYPE_STYLES.edited}`}>
                    {tr(bookingActivityTitles[event.type] || 'Appointment updated')}
                  </span>
                  <span className="font-semibold text-slate-900">{event.customerName || tr('Customer')}</span>
                </div>
                <p className="mt-1 text-xs text-slate-600">{[event.serviceName, event.therapistName, event.branchName].filter(Boolean).join(' · ')}</p>
                <p className="mt-0.5 text-xs text-slate-700">
                  {event.previousDate && <span className="mr-1 text-slate-400 line-through">{event.previousDate} {formatTime(event.previousTime)}</span>}
                  {event.previousDate && '→ '}
                  {event.date} {formatTime(event.time)}
                  {event.durationMinutes > 0 && ` · ${tr('{minutes} minutes', { minutes: event.durationMinutes })}`}
                </p>
              </div>
              <div className="text-right text-[11px] text-slate-500">
                <p>{new Date(event.createdAt).toLocaleString()}</p>
                {event.actor && <p>{event.actor === 'customer' ? tr('By customer') : tr('By {actor}', { actor: event.actor })}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
