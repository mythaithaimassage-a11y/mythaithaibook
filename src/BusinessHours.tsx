import { BUSINESS_WEEKDAYS, defaultBusinessHours, type WeeklyBusinessHours } from '../lib/booking-options.js';
import { useTranslation } from './localization';

export default function BusinessHours({ hours, onChange }: {
  hours?: WeeklyBusinessHours;
  onChange: (hours: WeeklyBusinessHours) => void;
}) {
  const { translate: tr } = useTranslation();
  const schedule = hours || defaultBusinessHours();
  const labels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return <fieldset className="sm:col-span-12 mt-2 border-t border-stone-100 pt-3">
    <legend className="text-xs font-bold text-stone-700">{tr('Weekly business hours')}</legend>
    <p className="mb-3 text-xs text-stone-500">{tr('Last appointments start one hour before closing and must finish by closing. Save branches to apply changes.')}</p>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {BUSINESS_WEEKDAYS.map((day, index) => {
        const entry = schedule[day];
        const update = (field: keyof typeof entry, value: string | boolean) => onChange({
          ...schedule, [day]: { ...entry, [field]: value },
        });
        return <div key={day} className="rounded-lg border border-stone-200 p-3 text-xs">
          <div className="mb-2 flex justify-between gap-3">
            <strong>{tr(labels[index])}</strong>
            <label className="flex items-center gap-1"><input type="checkbox" checked={entry.closed} onChange={(event) => update('closed', event.target.checked)} />{tr('Closed')}</label>
          </div>
          <div className="flex gap-2">
            <label className="min-w-0 flex-1">{tr('Opens')}<input type="time" required step={900} disabled={entry.closed} value={entry.open} onChange={(event) => update('open', event.target.value)} className="mt-1 w-full rounded border border-stone-300 p-2 disabled:bg-stone-100" /></label>
            <label className="min-w-0 flex-1">{tr('Closes')}<input type="time" required step={900} disabled={entry.closed} value={entry.close} onChange={(event) => update('close', event.target.value)} className="mt-1 w-full rounded border border-stone-300 p-2 disabled:bg-stone-100" /></label>
          </div>
        </div>;
      })}
    </div>
  </fieldset>;
}
