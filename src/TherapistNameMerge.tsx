import MobileHelp from './MobileHelp';
import { useEffect, useState } from 'react';
import { useTranslation } from './localization';
import { readWixResponse } from './wixImportApi';

type Therapist = { id: number | string; name: string; active?: boolean };
type Preview = { sourceName: string; targetName: string; bookings: number; linkedEvents: number; issuedReceipts: number };
type Batch = { updated: number; remaining: number; calendarUpdated?: number; staffRecords?: number; calendarCursor?: { index: number; pageToken?: string }; done: boolean };
const validCount = (value: number) => Number.isSafeInteger(value) && value >= 0;

export default function TherapistNameMerge({ therapists, onMerged }: {
  therapists: Therapist[];
  onMerged: () => Promise<void>;
}) {
  const { translate: tr } = useTranslation();
  const [names, setNames] = useState<string[]>([]);
  const [sourceName, setSourceName] = useState('');
  const [targetId, setTargetId] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const target = therapists.find((therapist) => String(therapist.id) === targetId);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/booking?view=therapist-name-merge', { signal: controller.signal })
      .then((response) => readWixResponse<{ names: string[] }>(response))
      .then((data) => {
        if (!Array.isArray(data.names) || data.names.some((name) => typeof name !== 'string')) {
          throw new Error('Unable to load historical therapist names.');
        }
        if (!controller.signal.aborted) setNames(data.names);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Unable to load historical therapist names.');
      });
    return () => controller.abort();
  }, []);
  const request = <T,>(body: object) => fetch('/api/booking?view=therapist-name-merge', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceName, targetId, targetName: target?.name, ...body }),
  }).then((response) => readWixResponse<T>(response));

  async function review() {
    setBusy(true);
    setError('');
    setProgress('');
    setPreview(null);
    setConfirmed(false);
    try {
      const result = await request<Preview>({ preview: true });
      if (!result || result.sourceName !== sourceName.trim() || result.targetName !== target?.name ||
          ![result.bookings, result.linkedEvents, result.issuedReceipts].every(validCount)) {
        throw new Error('Unable to preview therapist name merge.');
      }
      setPreview(result);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to preview therapist name merge.');
    } finally {
      setBusy(false);
    }
  }
  async function merge() {
    if (!preview || !confirmed || busy) return;
    setBusy(true);
    setError('');
    let updated = 0;
    let calendarUpdated = 0;
    let calendarCursor: Batch['calendarCursor'];
    try {
      for (let batch = 0; batch < 1000; batch++) {
        const result = await request<Batch>({ confirm: true, calendarCursor });
        if (!result || typeof result.done !== 'boolean' || ![result.updated, result.remaining].every(validCount) ||
            (result.calendarUpdated !== undefined && !validCount(result.calendarUpdated)) ||
            (result.calendarCursor !== undefined && (!result.calendarCursor || !validCount(result.calendarCursor.index) ||
              (result.calendarCursor.pageToken !== undefined && typeof result.calendarCursor.pageToken !== 'string'))) ||
            (result.done && result.remaining !== 0)) {
          throw new Error('Unable to merge therapist names.');
        }
        updated += result.updated;
        calendarUpdated += result.calendarUpdated || 0;
        setProgress(tr('Merging: {bookings} bookings updated; {remaining} remaining; {events} additional Calendar events updated.', {
          bookings: updated, remaining: result.remaining, events: calendarUpdated,
        }));
        calendarCursor = result.calendarCursor;
        if (result.done) {
          await onMerged();
          setProgress(tr('Therapist name merge completed. Bookings, Calendar and availability records are synced.'));
          setPreview(null);
          setConfirmed(false);
          return;
        }
      }
      throw new Error(tr('Merge batch limit reached. Preview and retry the same mapping to continue.'));
    } catch (failure) {
      setError(`${failure instanceof Error ? failure.message : tr('Unable to merge therapist names.')} ${tr('Some records may already be updated. Preview and retry the same mapping to resume safely.')}`);
    } finally {
      setBusy(false);
    }
  }
  function resetReview() { setPreview(null); setConfirmed(false); setProgress(''); }
  return <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
    <h3 className="text-sm font-bold text-stone-900">{tr('Merge historical therapist name')}</h3>
    <MobileHelp><p className="text-xs text-stone-600">{tr('Map an old therapist label to an existing therapist across past and future bookings, Calendar and availability. Issued receipts, original Wix source details and treatment notes are preserved. Separate login accounts require manual review. Old roster entries are deactivated, not deleted.')}</p></MobileHelp>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-semibold">{tr('Historical therapist name')}
        <input list="historical-therapist-names" maxLength={150} disabled={busy} value={sourceName} onChange={(event) => { setSourceName(event.target.value); resetReview(); }} className="mt-1 w-full rounded-lg border border-stone-300 bg-white p-2" />
        <datalist id="historical-therapist-names">{names.map((name) => <option key={name} value={name} />)}</datalist>
      </label>
      <label className="text-xs font-semibold">{tr('Existing therapist')}
        <select disabled={busy} value={targetId} onChange={(event) => { setTargetId(event.target.value); resetReview(); }} className="mt-1 w-full rounded-lg border border-stone-300 bg-white p-2">
          <option value="">{tr('Choose therapist')}</option>
          {therapists.filter((therapist) => therapist.active !== false).map((therapist) => <option key={therapist.id} value={therapist.id}>{therapist.name}</option>)}
        </select>
      </label>
    </div>
    <button type="button" disabled={busy || !sourceName.trim() || !target} onClick={() => void review()} className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50">{tr('Preview name merge')}</button>
    {preview && <div className="space-y-2 text-xs">
      <p>{preview.sourceName} → {preview.targetName}</p>
      <p>{tr('{bookings} booking assignments and {events} linked Calendar events. {receipts} issued receipts remain unchanged. All configured booking calendars will also be scanned for historical labels.', {
        bookings: preview.bookings, events: preview.linkedEvents, receipts: preview.issuedReceipts,
      })}</p>
      <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />
        {tr('I confirm these names identify the same therapist and approve applying this mapping to past and future records.')}
      </label>
      <button type="button" disabled={busy || !confirmed} onClick={() => void merge()} className="rounded-lg bg-amber-800 px-3 py-2 font-semibold text-white disabled:opacity-50">{tr(busy ? 'Merging...' : 'Merge and sync therapist name')}</button>
    </div>}
    {progress && <p role="status" className="text-xs text-stone-700">{progress}</p>}
    {error && <p role="alert" className="text-xs text-red-700">{tr(error)}</p>}
    {busy && <p role="status" className="text-xs text-stone-700">{tr('Keep this page open until the merge finishes. Retry the same mapping if interrupted.')}</p>}
  </section>;
}
