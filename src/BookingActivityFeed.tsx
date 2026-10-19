import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from './localization';
import { bookingActivityTitles } from './BookingNotifications';
import { RefreshCw } from 'lucide-react';
import AppointmentDateRail from './AppointmentDateRail';

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
  const { translate: tr, formatTime, locale } = useTranslation();
  const [events, setEvents] = useState<BookingActivity[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState('desc');

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
  const grouped = new Map<string, BookingActivity[]>();
  for (const event of displayed) {
    const entries = grouped.get(event.date) || [];
    entries.push(event);
    grouped.set(event.date, entries);
  }
  const groups = [...grouped.entries()].sort(([left], [right]) =>
    order === 'asc' ? left.localeCompare(right) : right.localeCompare(left));

  return (
    <section className="alerts-activity rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">{tr('Booking activity')}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">{tr('See what changed in the last 7 days. This list is for information only.')}</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} title={tr('Refresh')} aria-label={tr(loading ? 'Loading…' : 'Refresh')}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {tr('Refresh')}
        </button>
      </div>
      <div aria-label={tr('Activity filters')} className="mt-4 flex gap-2 overflow-x-auto pb-2">
        {FILTERS.map((option) => (
          <button key={option} type="button" onClick={() => setFilter(option)} aria-pressed={filter === option}
            className={`min-h-11 shrink-0 rounded-xl px-3 py-2 text-xs font-semibold ${filter === option ? 'bg-emerald-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
            {tr(FILTER_LABELS[option])} ({option === 'all' ? events.length : counts[option] || 0})
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span>{tr('Grouped by appointment date')}</span>
        <select aria-label={tr('Date order')} value={order} onChange={(event) => setOrder(event.target.value)} className="min-h-11 rounded-lg border border-slate-200 bg-white px-3">
          <option value="desc">{tr('Newest first')}</option>
          <option value="asc">{tr('Oldest first')}</option>
        </select>
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{tr(error)}</p>}
      {loading && !events.length && <p role="status" className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{tr('Loading booking activity…')}</p>}
      {!error && !loading && !displayed.length && <p className="mt-4 rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-600">{tr('No booking activity in the last 7 days.')}</p>}
      {displayed.length > 0 && (
        <div className="mt-4 space-y-4" aria-busy={loading}>
          {groups.map(([date, entries]) => <section key={date} className="appointment-date-group grid grid-cols-[3.25rem_minmax(0,1fr)] gap-3 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-5">
            <AppointmentDateRail date={date} count={entries.length} />
            <ul className="min-w-0 space-y-2">
              {[...entries].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).map((event) => (
                <li key={event.id} className="rounded-2xl border border-slate-200 bg-white p-3 text-sm shadow-sm sm:p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${TYPE_STYLES[event.type] || TYPE_STYLES.edited}`}>
                        {tr(bookingActivityTitles[event.type] || 'Appointment updated')}
                      </span>
                      <span className="font-semibold text-slate-900">{event.customerName || tr('Customer')}</span>
                    </div>
                    <p className="mt-2 break-words text-sm text-slate-700">{tr(event.serviceName)}</p>
                    <p className="mt-1 break-words text-xs text-slate-600">{[event.therapistName, event.branchName].filter(Boolean).join(' · ')}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-800">
                      {event.previousDate && <span className="mr-1 text-slate-400 line-through">{event.previousDate} {formatTime(event.previousTime)}</span>}
                      {event.previousDate && '→ '}
                      {formatTime(event.time)}
                      {event.durationMinutes > 0 && ` · ${tr('{minutes} minutes', { minutes: event.durationMinutes })}`}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap justify-between gap-2 break-words border-t border-slate-100 pt-2 text-xs text-slate-500">
                    <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString(locale, { timeZone: 'America/Toronto' })}</time>
                    {event.actor && <p>{event.actor === 'customer' ? tr('By customer') : tr('By {actor}', { actor: event.actor })}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </section>)}
        </div>
      )}
    </section>
  );
}
