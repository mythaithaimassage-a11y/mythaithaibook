import { useTranslation } from './localization';

export default function AppointmentDateRail({ date, count }: { date: string; count: number }) {
  const { translate: tr, locale } = useTranslation();
  const parsed = new Date(`${date}T12:00:00Z`);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  const label = valid ? new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(parsed) : date || tr('Date not set');
  return <h3 className="appointment-date-rail self-start rounded-xl bg-slate-100 px-1 py-3 text-center text-slate-600">
    {valid ? <time dateTime={date} title={label}>
      <span className="block text-[10px] font-bold uppercase tracking-wide">{new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(parsed)}</span>
      <span className="block text-2xl font-bold leading-tight text-slate-900">{new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone: 'UTC' }).format(parsed)}</span>
      <span className="mt-1 block text-[10px]">{new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(parsed)}</span>
      <span className="block text-[10px] text-slate-400">{new Intl.DateTimeFormat(locale, { year: 'numeric', timeZone: 'UTC' }).format(parsed)}</span>
    </time> : <span className="text-xs">{label}</span>}
    <span className="sr-only">{count}</span>
  </h3>;
}
