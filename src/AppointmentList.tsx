import { useState } from 'react';
import { CalendarDays, Clock, CloudOff, Database, Edit, Eye, Loader2, StickyNote, Trash2, UserCheck, Users } from 'lucide-react';
import { useTranslation } from './localization';
import { coupleTimeMinutes } from '../lib/couple-pairing.js';

export type ListAppointment = {
  id: string;
  date: string;
  time: string;
  timeRange?: string;
  customerName: string;
  serviceName: string;
  therapistName: string;
  branchName: string;
  email?: string;
  phone?: string;
  bookingNote?: string;
  status?: string;
  total: number;
  syncedToSheets?: boolean;
  checkedInAt?: string;
  checkedInBy?: string;
};

export function matchesAppointment(booking: ListAppointment, search: string) {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  const values = [booking.id, booking.customerName, booking.email, booking.phone, booking.serviceName,
    booking.therapistName, booking.branchName, booking.date, booking.bookingNote, booking.status];
  if (values.some((value) => value?.toLowerCase().includes(query))) return true;
  const digits = query.replace(/\D/g, '');
  return digits.length >= 3 && /^[+\d\s().-]+$/.test(query) &&
    Boolean(booking.phone?.replace(/\D/g, '').includes(digits));
}

export function groupAppointments(bookings: ListAppointment[], order: 'asc' | 'desc') {
  const groups = new Map<string, ListAppointment[]>();
  for (const booking of bookings) {
    const entries = groups.get(booking.date) || [];
    entries.push(booking);
    groups.set(booking.date, entries);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => order === 'asc' ? left.localeCompare(right) : right.localeCompare(left))
    .map(([date, entries]) => ({
      date,
      bookings: [...entries].sort((left, right) =>
        (coupleTimeMinutes(left.time.split(/\s*[-–—]\s*/)[0]) ?? Infinity) -
        (coupleTimeMinutes(right.time.split(/\s*[-–—]\s*/)[0]) ?? Infinity) || left.id.localeCompare(right.id)),
    }));
}

type Props = {
  bookings: ListAppointment[];
  onOpen: (booking: ListAppointment) => void;
  onEdit: (booking: ListAppointment) => void;
  onDelete?: (id: string) => void;
  deletingId: string;
  defaultOrder?: 'asc' | 'desc';
  loading?: boolean;
};

export default function AppointmentList({ bookings, onOpen, onEdit, onDelete, deletingId, defaultOrder = 'desc', loading }: Props) {
  const { translate: tr, locale, formatTime } = useTranslation();
  const [order, setOrder] = useState(defaultOrder);
  const groups = groupAppointments(bookings, order);
  const actionClass = 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-50';

  return (
    <div className="appointment-list space-y-4" aria-busy={loading}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span role="status">{tr('{count} appointments', { count: bookings.length })}</span>
        <label className="inline-flex items-center gap-2">
          <span className="sr-only">{tr('Date order')}</span>
          <select aria-label={tr('Date order')} value={order} onChange={(event) => setOrder(event.target.value === 'asc' ? 'asc' : 'desc')} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            <option value="desc">{tr('Newest first')}</option>
            <option value="asc">{tr('Oldest first')}</option>
          </select>
        </label>
      </div>
      {groups.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-12 text-center">
        <CalendarDays aria-hidden="true" className="mx-auto mb-3 h-7 w-7 text-slate-300" />
        <p className="text-sm text-slate-500">{tr(loading ? 'Loading...' : 'No appointments found. Try another search or filter.')}</p>
      </div>}
      {groups.map(({ date, bookings: entries }) => {
        const parsed = new Date(`${date}T12:00:00Z`);
        const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
        const dateLabel = validDate ? new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(parsed) : date || tr('Date not set');
        return <section key={date} aria-label={dateLabel} className="appointment-date-group grid grid-cols-[3.25rem_minmax(0,1fr)] gap-3 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-5">
          <h3 className="appointment-date-rail self-start rounded-xl bg-slate-100 px-1 py-3 text-center text-slate-600">
            {validDate ? <time dateTime={date} title={dateLabel}>
              <span className="block text-[10px] font-bold uppercase tracking-wide">{new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(parsed)}</span>
              <span className="block text-2xl font-bold leading-tight text-slate-900">{new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone: 'UTC' }).format(parsed)}</span>
              <span className="mt-1 block text-[10px]">{new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(parsed)}</span>
              <span className="block text-[10px] text-slate-400">{new Intl.DateTimeFormat(locale, { year: 'numeric', timeZone: 'UTC' }).format(parsed)}</span>
            </time> : <span className="text-xs">{dateLabel}</span>}
            <span className="sr-only">{tr('{count} appointments', { count: entries.length })}</span>
          </h3>
          <div className="min-w-0 space-y-2">
            {entries.map((booking) => <article key={booking.id} className="appointment-card rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-emerald-200 sm:p-4 xl:grid xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center xl:gap-x-4">
              <div className="flex items-start justify-between gap-3">
                <button type="button" onClick={() => onOpen(booking)} aria-label={tr('Appointment details for {name}', { name: booking.customerName })} className="min-w-0 flex-1 text-left xl:grid xl:grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1fr)] xl:items-center xl:gap-x-3">
                  <span className="block text-xs font-bold text-emerald-800 xl:row-span-2">{formatTime(booking.timeRange || booking.time)}</span>
                  <span className="mt-1 flex items-center gap-1.5 break-words text-sm font-bold text-slate-900 xl:col-start-2 xl:row-start-1 xl:mt-0">{/couple/i.test(booking.serviceName) && <Users aria-label={tr('Couple massage')} className="h-3.5 w-3.5 shrink-0 text-rose-500" />}{booking.customerName}</span>
                  {booking.phone && <span className="block text-[11px] text-slate-400 xl:col-start-2 xl:row-start-2">{booking.phone}</span>}
                  <span className="mt-1 block text-xs text-slate-600 xl:col-start-3 xl:row-start-1 xl:mt-0">{tr(booking.serviceName)}</span>
                  <span className="mt-1 block text-xs text-slate-400 xl:col-start-3 xl:row-start-2">{booking.therapistName || tr('Unassigned appointments')}{booking.branchName && ` · ${booking.branchName}`}</span>
                </button>
                <span className="shrink-0 text-sm font-bold tabular-nums text-slate-900">${booking.total.toFixed(2)}</span>
              </div>
              {booking.bookingNote && <p className="mt-2 flex items-start gap-1.5 text-xs text-blue-700 xl:col-start-1"><StickyNote aria-label={tr('Team note:')} className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span className="line-clamp-2 whitespace-pre-wrap">{booking.bookingNote}</span></p>}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:mt-0 xl:flex-col xl:items-end xl:border-0 xl:pt-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span title={booking.id} className="max-w-28 truncate font-mono text-[10px] text-slate-400">#{booking.id}</span>
                  {booking.status && <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${['Cancelled', 'No Show'].includes(booking.status) ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{tr(booking.status)}</span>}
                  <span role="img" aria-label={tr(booking.syncedToSheets ? 'Synced' : 'Local Only')} title={tr(booking.syncedToSheets ? 'Synced' : 'Local Only')} className={booking.syncedToSheets ? 'text-emerald-600' : 'text-amber-600'}>
                    {booking.syncedToSheets ? <Database aria-hidden="true" className="h-3.5 w-3.5" /> : <CloudOff aria-hidden="true" className="h-3.5 w-3.5" />}
                  </span>
                  <span role="img" aria-label={tr(booking.checkedInAt ? 'Checked in' : 'Not checked in')} title={[tr(booking.checkedInAt ? 'Checked in' : 'Not checked in'), booking.checkedInBy].filter(Boolean).join(' · ')} className={booking.checkedInAt ? 'text-emerald-600' : 'text-amber-600'}>
                    {booking.checkedInAt ? <UserCheck aria-hidden="true" className="h-4 w-4" /> : <Clock aria-hidden="true" className="h-4 w-4" />}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => onEdit(booking)} title={tr('Edit booking')} aria-label={tr('Edit booking')} className={actionClass}><Edit aria-hidden="true" className="h-4 w-4" /></button>
                  <button type="button" onClick={() => onOpen(booking)} title={tr('Appointment details')} aria-label={tr('Appointment details')} className={actionClass}><Eye aria-hidden="true" className="h-4 w-4" /></button>
                  {onDelete && <button type="button" onClick={() => onDelete(booking.id)} disabled={deletingId === booking.id} title={tr('Delete appointment {value0}', { value0: booking.id })} aria-label={tr('Delete appointment {value0}', { value0: booking.id })} className={`${actionClass} hover:!bg-rose-50 hover:!text-rose-700`}>
                    {deletingId === booking.id ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Trash2 aria-hidden="true" className="h-4 w-4" />}
                  </button>}
                </div>
              </div>
            </article>)}
          </div>
        </section>;
      })}
    </div>
  );
}
