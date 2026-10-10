import { useEffect, useRef, useState } from 'react';
import { readWixResponse } from './wixImportApi';
import { runWixCalendarSync, type CalendarSync } from './runWixCalendarSync';
import { message, useTranslation, type TranslationMessage } from './localization';

export default function WixCalendarSync({ onSynced }: { onSynced: () => Promise<void> }) {
  const { translate: tr } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | TranslationMessage>('');
  const [error, setError] = useState('');
  const [scope, setScope] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const refresh = useRef(onSynced);
  useEffect(() => { refresh.current = onSynced; }, [onSynced]);

  async function sync() {
    if (busy) return;
    if (scope === 'range' && (!startDate || !endDate || startDate > endDate)) {
      setError('Choose start and end dates, with the end date on or after the start date.');
      return;
    }
    const dateRange = scope === 'range' ? { startDate, endDate } : {};
    const scopeLabel = scope === 'range' ? message('{start} to {end} (inclusive)', { start: startDate, end: endDate }) : message('all dates');
    setBusy(true);
    setError('');
    setProgress(message('Appending missing Wix bookings for {scope} to the primary Google Calendar...', { scope: scopeLabel }));
    try {
      let lastRefresh = 0;
      const result = await runWixCalendarSync(async (excludedIds = []) => {
        const response = await fetch('/api/booking?view=wix-calendar-sync', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ excludedIds, ...dateRange }),
        });
        return readWixResponse<CalendarSync>(response);
      }, async ({ synced, pending }) => {
        setProgress(message('{synced} Wix bookings appended for {scope}; {pending} remaining in this selection.', { synced, scope: scopeLabel, pending: pending ?? message('unknown') }));
        if (synced > 0 && Date.now() - lastRefresh >= 10000) {
          lastRefresh = Date.now();
          await refresh.current();
        }
      });
      setProgress(message('Wix Calendar sync complete for {scope}: {synced} bookings appended. Existing synced appointments were left unchanged.', { scope: scopeLabel, synced: result.synced }));
      await refresh.current();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to sync Wix bookings. Retry to resume.');
      await refresh.current();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-stone-200 p-3 text-xs space-y-2">
      <p className="text-stone-600">{tr('Append missing imported Wix bookings to this Google Calendar across all branches. Existing synced appointments are unchanged. Cancelled/no-show visits are skipped. Keep this tab open until complete.')}</p>
      <form onSubmit={(event) => { event.preventDefault(); void sync(); }} className="flex flex-wrap items-end gap-3">
        <label className="font-semibold text-stone-700">{tr('Sync dates')}
          <select value={scope} disabled={busy} onChange={(event) => { setScope(event.target.value); setError(''); setProgress(''); }} className="mt-1 block rounded-lg border border-stone-300 bg-white px-3 py-2">
            <option value="all">{tr('All dates')}</option><option value="range">{tr('Selected date range')}</option>
          </select>
        </label>
        {scope === 'range' && <>
          <label className="font-semibold text-stone-700">{tr('Start date')}
            <input type="date" required disabled={busy} value={startDate} max={endDate || undefined} onChange={(event) => { setStartDate(event.target.value); setError(''); setProgress(''); }} className="mt-1 block rounded-lg border border-stone-300 px-3 py-2" />
          </label>
          <label className="font-semibold text-stone-700">{tr('End date (inclusive)')}
            <input type="date" required disabled={busy} value={endDate} min={startDate || undefined} onChange={(event) => { setEndDate(event.target.value); setError(''); setProgress(''); }} className="mt-1 block rounded-lg border border-stone-300 px-3 py-2" />
          </label>
        </>}
        <button type="submit" disabled={busy} className="px-3 py-2 border border-emerald-800 text-emerald-800 rounded-lg font-bold disabled:opacity-50">
          {tr(busy ? 'Syncing Wix bookings...' : 'Sync Wix bookings')}
        </button>
      </form>
      {progress && <p role="status" className="text-stone-700">{tr(progress)}</p>}
      {error && <p role="alert" className="text-red-800">{tr(error)}</p>}
    </div>
  );
}
