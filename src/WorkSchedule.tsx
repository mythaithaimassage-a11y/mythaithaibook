import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Save } from 'lucide-react';
import { DEFAULT_THERAPIST_END, DEFAULT_THERAPIST_START, defaultTherapistShift, type TherapistWorkShift } from '../lib/work-schedule.js';
import { useTranslation } from './localization';

type Branch = { id: number; name: string };
type Therapist = {
  id: number | string; name: string; branches?: number[];
  schedule?: Record<string, number | null>;
};
type Props = { branches: Branch[]; therapists: Therapist[]; initialBranchId?: string; initialDate?: string };

function monthDates(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`);
}

function weekStartFor(date: string) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() - daysSinceMonday);
  return result.toISOString().slice(0, 10);
}

function shiftKey(therapistId: number | string, date: string) {
  return `${therapistId}:${date}`;
}

export default function WorkSchedule({ branches, therapists, initialBranchId = '', initialDate = '' }: Props) {
  const { translate: tr } = useTranslation();
  const today = new Date();
  const [month, setMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`);
  const [branchId, setBranchId] = useState(() =>
    branches.some((branch) => String(branch.id) === initialBranchId) ? initialBranchId : String(branches[0]?.id || ''),
  );
  const [weekStart, setWeekStart] = useState(() => weekStartFor(initialDate || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`));
  const [overrides, setOverrides] = useState<Record<string, TherapistWorkShift>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<{ therapistId: number | string; date: string } | null>(null);
  const [editShift, setEditShift] = useState<TherapistWorkShift | null>(null);
  const branchTherapists = useMemo(() => therapists.filter((therapist) =>
    (therapist.branches || []).some((id) => Number(id) === Number(branchId)) ||
    Object.values(therapist.schedule || {}).some((id) => Number(id) === Number(branchId)),
  ), [therapists, branchId]);
  const dates = useMemo(() => monthDates(month), [month]);
  const weeks = useMemo(() => {
    const first = weekStartFor(dates[0]);
    const firstDate = new Date(`${first}T12:00:00Z`);
    const weeksInMonth: string[][] = [];
    for (let index = 0; index < 42; index += 1) {
      const date = new Date(firstDate);
      date.setUTCDate(date.getUTCDate() + index);
      const dateKey = date.toISOString().slice(0, 10);
      if (index % 7 === 0) weeksInMonth.push([]);
      if (dateKey.startsWith(`${month}-`)) weeksInMonth[weeksInMonth.length - 1].push(dateKey);
    }
    return weeksInMonth.filter((week) => week.length);
  }, [dates, month]);
  const currentWeekIndex = Math.max(0, weeks.findIndex((week) => week.some((date) => weekStartFor(date) === weekStart)));
  const visibleDates = weeks[currentWeekIndex] || weeks[0] || [];

  useEffect(() => {
    if (branches.some((branch) => String(branch.id) === branchId)) return;
    setBranchId(String(branches[0]?.id || ''));
  }, [branches, branchId]);

  useEffect(() => {
    if (initialBranchId && branches.some((branch) => String(branch.id) === initialBranchId)) {
      setBranchId(initialBranchId);
    }
  }, [branches, initialBranchId]);

  useEffect(() => {
    setWeekStart(weekStartFor(initialDate.startsWith(`${month}-`) ? initialDate : `${month}-01`));
    setEditing(null);
    setNotice('');
  }, [month, initialDate]);

  useEffect(() => {
    if (!month || !branchId) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch(`/api/booking?${new URLSearchParams({ view: 'staff-work-schedule', month, branchId })}`, {
      signal: controller.signal, cache: 'no-store',
    }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      if (!Array.isArray(data.overrides)) throw new Error('Saved work schedule could not be loaded. Refresh and try again.');
      if (!controller.signal.aborted) {
        setOverrides(Object.fromEntries(data.overrides.map((entry: TherapistWorkShift) => [shiftKey(entry.therapistId, entry.date), entry])));
      }
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Saved work schedule could not be loaded.');
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [month, branchId]);

  const openEditor = (therapist: Therapist, date: string) => {
    const saved = overrides[shiftKey(therapist.id, date)];
    const defaults = defaultTherapistShift(therapist, branchId, date);
    setEditing({ therapistId: therapist.id, date });
    setEditShift(saved || defaults);
    setError('');
    setNotice('');
  };

  const saveOverride = () => {
    if (!editing || !editShift) return;
    if (editShift.isWorking && (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(editShift.startTime) ||
        !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(editShift.endTime) || editShift.startTime >= editShift.endTime)) {
      setError('Choose a valid start and end time. The end must be after the start.');
      return;
    }
    setOverrides((current) => ({ ...current, [shiftKey(editing.therapistId, editing.date)]: { ...editShift, isOverride: true } }));
    setEditing(null);
    setEditShift(null);
  };

  const resetOverride = () => {
    if (!editing) return;
    setOverrides((current) => {
      const next = { ...current };
      delete next[shiftKey(editing.therapistId, editing.date)];
      return next;
    });
    setEditing(null);
    setEditShift(null);
  };

  const saveMonth = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/booking?view=staff-work-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month,
          branchId: Number(branchId),
          overrides: Object.values(overrides).map((entry) => ({ ...entry, branchId: Number(branchId) })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setOverrides(Object.fromEntries(data.overrides.map((entry: TherapistWorkShift) => [shiftKey(entry.therapistId, entry.date), entry])));
      setNotice('Monthly work schedule saved.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to save the monthly work schedule.');
    } finally {
      setSaving(false);
    }
  };

  const selectedTherapist = editing && branchTherapists.find((therapist) => String(therapist.id) === String(editing.therapistId));
  const selectedDateLabel = editing && new Date(`${editing.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return <section className="space-y-4">
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-bold text-slate-900">{tr('Work schedule')}</h2><p className="mt-1 text-sm text-slate-600">{tr('Review and adjust therapist working hours for the month. Weekly working days default to 10:00 AM–8:00 PM.')}</p></div>
        <button type="button" onClick={saveMonth} disabled={saving || loading || !branchId} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"><Save className="h-4 w-4" />{tr(saving ? 'Saving…' : 'Save month')}</button>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-slate-600">{tr('Month')}<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
        <label className="text-xs font-semibold text-slate-600">{tr('Branch')}<select value={branchId} onChange={(event) => setBranchId(event.target.value)} className="mt-1 block min-w-48 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => setWeekStart(weekStartFor(weeks[Math.max(0, currentWeekIndex - 1)]?.[0] || `${month}-01`))} disabled={currentWeekIndex === 0} aria-label={tr('Previous week')} className="rounded-lg border border-slate-300 p-2 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-24 text-center text-xs font-semibold text-slate-600">{tr('Week {value0} of {value1}', { value0: currentWeekIndex + 1, value1: weeks.length })}</span>
          <button type="button" onClick={() => setWeekStart(weekStartFor(weeks[Math.min(weeks.length - 1, currentWeekIndex + 1)]?.[0] || `${month}-01`))} disabled={currentWeekIndex >= weeks.length - 1} aria-label={tr('Next week')} className="rounded-lg border border-slate-300 p-2 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{tr(error)}</p>}
      {notice && <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{tr(notice)}</p>}
      {loading ? <p role="status" className="py-8 text-center text-sm text-slate-500">{tr('Loading work schedule…')}</p> : branchTherapists.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">{tr('No active therapists are assigned to this branch.')}</p> : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full border-collapse text-left text-xs">
            <thead className="bg-slate-50 text-slate-600"><tr>
              <th className="sticky left-0 min-w-44 border-b border-r bg-slate-50 p-3">{tr('Staff member')}</th>
              {visibleDates.map((date) => <th key={date} className="min-w-32 border-b border-r p-3 text-center">{new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {branchTherapists.map((therapist) => <tr key={therapist.id}>
                <th scope="row" className="sticky left-0 border-r bg-white p-3 font-semibold text-slate-800">{therapist.name}</th>
                {visibleDates.map((date) => {
                  const shift = overrides[shiftKey(therapist.id, date)] || defaultTherapistShift(therapist, branchId, date);
                  return <td key={date} className="border-r p-1.5">
                    <button type="button" onClick={() => openEditor(therapist, date)} className={`min-h-11 w-full rounded-md px-2 py-2 text-left transition hover:ring-2 hover:ring-blue-300 ${shift.isWorking ? 'bg-blue-50 text-blue-900' : 'text-slate-400 hover:bg-slate-50'}`}>
                      <span className="block font-semibold">{shift.isWorking ? `${shift.startTime}–${shift.endTime}` : tr('Off')}</span>
                      {shift.isOverride && <span className="mt-0.5 block text-[10px] text-blue-600">{tr('Custom')}</span>}
                      {shift.isWorking && <span className="mt-0.5 block text-[10px]">{tr(shift.showToPublic ? 'Name visible to customers' : 'Availability kept anonymous')}</span>}
                    </button>
                  </td>;
                })}
              </tr>)}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"><CalendarDays className="h-3.5 w-3.5" />{tr('Click a day to adjust or remove that therapist’s hours. Changes affect only the selected date.')}</p>
    </div>
    {editing && editShift && selectedTherapist && <div role="dialog" aria-modal="true" aria-labelledby="work-schedule-editor-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onClick={(event) => { if (event.target === event.currentTarget) setEditing(null); }}>
      <section className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h3 id="work-schedule-editor-title" className="font-bold text-slate-900">{tr('Edit work hours')}</h3>
        <p className="mt-1 text-sm text-slate-600">{selectedTherapist.name} · {selectedDateLabel} · {branches.find((branch) => String(branch.id) === branchId)?.name}</p>
        <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={editShift.isWorking} onChange={(event) => setEditShift({
          ...editShift,
          isWorking: event.target.checked,
          startTime: event.target.checked && !editShift.startTime ? DEFAULT_THERAPIST_START : editShift.startTime,
          endTime: event.target.checked && !editShift.endTime ? DEFAULT_THERAPIST_END : editShift.endTime,
        })} />{tr('Working this day')}</label>
        <label className="mt-3 flex items-start gap-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={editShift.showToPublic === true} disabled={!editShift.isWorking}
            onChange={(event) => setEditShift({ ...editShift, showToPublic: event.target.checked })} />
          <span>{tr('Show this therapist’s name to customers (with consent)')}
            <span className="mt-0.5 block text-xs font-normal text-slate-500">{tr('If unchecked, customers may book the available time without seeing the therapist’s name; staff can assign the therapist.')}</span>
          </span>
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-slate-600">{tr('Starts')}<input type="time" disabled={!editShift.isWorking} value={editShift.startTime} onChange={(event) => setEditShift({ ...editShift, startTime: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100" /></label>
          <label className="text-xs font-semibold text-slate-600">{tr('Ends')}<input type="time" disabled={!editShift.isWorking} value={editShift.endTime} onChange={(event) => setEditShift({ ...editShift, endTime: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100" /></label>
        </div>
        <div className="mt-5 flex flex-wrap justify-between gap-2">
          <button type="button" onClick={resetOverride} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">{tr('Reset to weekly schedule')}</button>
          <div className="flex gap-2"><button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">{tr('Cancel')}</button><button type="button" onClick={saveOverride} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">{tr('Apply')}</button></div>
        </div>
      </section>
    </div>}
  </section>;
}
