import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Save, Users } from 'lucide-react';
import { DEFAULT_THERAPIST_END, DEFAULT_THERAPIST_START, defaultTherapistShift, type TherapistWorkShift } from '../lib/work-schedule.js';
import { useTranslation } from './localization';

type Branch = { id: number; name: string };
type Therapist = {
  id: number | string; name: string; branches?: number[];
  schedule?: Record<string, number | null>;
};
type Props = {
  branches: Branch[];
  therapists: Therapist[];
  initialBranchId: string;
  onOpenFullSchedule: (branchId: string, date: string) => void;
};

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function shiftKey(therapistId: number | string) {
  return String(therapistId);
}

export default function TodayWorkSchedule({ branches, therapists, initialBranchId, onOpenFullSchedule }: Props) {
  const { translate: tr } = useTranslation();
  const [date] = useState(() => localDateKey(new Date()));
  const [branchId, setBranchId] = useState(() =>
    branches.some((branch) => String(branch.id) === initialBranchId)
      ? initialBranchId
      : String(branches[0]?.id || ''),
  );
  const [overrides, setOverrides] = useState<Record<string, TherapistWorkShift>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingTherapist, setEditingTherapist] = useState<Therapist | null>(null);
  const [editShift, setEditShift] = useState<TherapistWorkShift | null>(null);

  const branchTherapists = useMemo(() => therapists.filter((therapist) =>
    (therapist.branches || []).some((id) => Number(id) === Number(branchId)) ||
    Object.values(therapist.schedule || {}).some((id) => Number(id) === Number(branchId)),
  ), [therapists, branchId]);
  const selectedBranch = branches.find((branch) => String(branch.id) === branchId);
  const selectedDateLabel = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  useEffect(() => {
    if (initialBranchId !== 'all' && branches.some((branch) => String(branch.id) === initialBranchId)) {
      setBranchId(initialBranchId);
    }
  }, [branches, initialBranchId]);

  useEffect(() => {
    if (branches.some((branch) => String(branch.id) === branchId)) return;
    setBranchId(String(branches[0]?.id || ''));
  }, [branches, branchId]);

  useEffect(() => {
    if (!date || !branchId) return;
    const controller = new AbortController();
    const month = date.slice(0, 7);
    setLoading(true);
    setError('');
    setOverrides({});
    fetch(`/api/booking?${new URLSearchParams({ view: 'staff-work-schedule', month, branchId })}`, {
      signal: controller.signal, cache: 'no-store',
    }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      if (!Array.isArray(data.overrides)) throw new Error('Saved work schedule could not be loaded. Refresh and try again.');
      if (!controller.signal.aborted) {
        setOverrides(Object.fromEntries(data.overrides
          .filter((entry: TherapistWorkShift) => entry.date === date)
          .map((entry: TherapistWorkShift) => [shiftKey(entry.therapistId), { ...entry, isOverride: true }])));
      }
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Saved work schedule could not be loaded.');
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [date, branchId]);

  const openEditor = (therapist: Therapist) => {
    const saved = overrides[shiftKey(therapist.id)];
    setEditingTherapist(therapist);
    setEditShift(saved || defaultTherapistShift(therapist, branchId, date));
    setError('');
    setNotice('');
  };

  const saveShift = async (override: TherapistWorkShift | null) => {
    if (!editingTherapist) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/booking?view=staff-work-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          branchId: Number(branchId),
          therapistId: Number(editingTherapist.id),
          override,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
      setOverrides((current) => {
        const next = { ...current };
        if (data.override) next[shiftKey(editingTherapist.id)] = { ...data.override, isOverride: true };
        else delete next[shiftKey(editingTherapist.id)];
        return next;
      });
      setNotice('Today’s therapist availability was saved to the work schedule.');
      setEditingTherapist(null);
      setEditShift(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to save today’s therapist availability.');
    } finally {
      setSaving(false);
    }
  };

  const saveEditedShift = () => {
    if (!editingTherapist || !editShift) return;
    if (editShift.isWorking && (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(editShift.startTime) ||
        !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(editShift.endTime) || editShift.startTime >= editShift.endTime)) {
      setError('Choose a valid start and end time. The end must be after the start.');
      return;
    }
    void saveShift({ ...editShift, isOverride: true });
  };

  const resetToWeeklySchedule = () => {
    if (!editingTherapist) return;
    void saveShift(null);
  };

  return <>
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-900">{tr("Today's therapist availability")}</h3>
          <p className="mt-1 text-xs text-slate-500">{tr('Changes are saved to Work schedule and affect appointment availability for today.')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-semibold text-slate-600">{tr('Branch')}
            <select value={branchId} onChange={(event) => setBranchId(event.target.value)} className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => onOpenFullSchedule(branchId, date)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">{tr('Open full Work schedule')}</button>
        </div>
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{tr(error)}</p>}
      {notice && <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{tr(notice)}</p>}
      {!branchId ? <p className="py-5 text-center text-sm text-slate-500">{tr('No active branches are available.')}</p>
        : loading ? <p role="status" className="py-5 text-center text-sm text-slate-500">{tr('Loading work schedule…')}</p>
          : branchTherapists.length === 0 ? <p className="py-5 text-center text-sm text-slate-500">{tr('No active therapists are assigned to this branch.')}</p>
            : <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full border-collapse text-left text-xs">
                <thead className="bg-slate-50 text-slate-600"><tr>
                  <th className="min-w-40 border-b border-r p-3">{tr('Staff member')}</th>
                  <th className="min-w-44 border-b p-3 text-center"><span className="inline-flex items-center justify-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{selectedDateLabel}</span></th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {branchTherapists.map((therapist) => {
                    const shift = overrides[shiftKey(therapist.id)] || defaultTherapistShift(therapist, branchId, date);
                    return <tr key={therapist.id}>
                      <th scope="row" className="border-r bg-white p-3 font-semibold text-slate-800">{therapist.name}</th>
                      <td className="p-1.5">
                        <button type="button" onClick={() => openEditor(therapist)} aria-label={tr('Set availability for {value0}', { value0: therapist.name })} className={`min-h-11 w-full rounded-md px-3 py-2 text-left transition hover:ring-2 hover:ring-blue-300 ${shift.isWorking ? 'bg-blue-50 text-blue-900' : 'text-slate-400 hover:bg-slate-50'}`}>
                          <span className="block font-semibold">{shift.isWorking ? `${shift.startTime}–${shift.endTime}` : tr('Off')}</span>
                          {shift.isOverride && <span className="mt-0.5 block text-[10px] text-blue-600">{tr('Custom')}</span>}
                        </button>
                      </td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>}
      <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"><Users className="h-3.5 w-3.5" />{selectedBranch ? tr('{value0} · changes affect this date only', { value0: selectedBranch.name }) : ''}</p>
    </section>
    {editingTherapist && editShift && <div role="dialog" aria-modal="true" aria-labelledby="today-work-schedule-editor-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onClick={(event) => { if (event.target === event.currentTarget && !saving) setEditingTherapist(null); }}>
      <section className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h3 id="today-work-schedule-editor-title" className="font-bold text-slate-900">{tr('Edit work hours')}</h3>
        <p className="mt-1 text-sm text-slate-600">{editingTherapist.name} · {selectedDateLabel} · {selectedBranch?.name}</p>
        <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={editShift.isWorking} onChange={(event) => setEditShift({
          ...editShift,
          isWorking: event.target.checked,
          startTime: event.target.checked && !editShift.startTime ? DEFAULT_THERAPIST_START : editShift.startTime,
          endTime: event.target.checked && !editShift.endTime ? DEFAULT_THERAPIST_END : editShift.endTime,
        })} />{tr('Working this day')}</label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-slate-600">{tr('Starts')}<input type="time" disabled={!editShift.isWorking || saving} value={editShift.startTime} onChange={(event) => setEditShift({ ...editShift, startTime: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100" /></label>
          <label className="text-xs font-semibold text-slate-600">{tr('Ends')}<input type="time" disabled={!editShift.isWorking || saving} value={editShift.endTime} onChange={(event) => setEditShift({ ...editShift, endTime: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100" /></label>
        </div>
        <div className="mt-5 flex flex-wrap justify-between gap-2">
          <button type="button" onClick={resetToWeeklySchedule} disabled={saving} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-50">{tr('Reset to weekly schedule')}</button>
          <div className="flex gap-2"><button type="button" onClick={() => setEditingTherapist(null)} disabled={saving} className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">{tr('Cancel')}</button><button type="button" onClick={saveEditedShift} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />{tr(saving ? 'Saving…' : 'Save today')}</button></div>
        </div>
      </section>
    </div>}
  </>;
}
