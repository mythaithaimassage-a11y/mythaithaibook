import { useEffect, useRef, useState } from 'react';
import { readWixResponse } from './wixImportApi';
import { runWixCalendarSync, type CalendarSync } from './runWixCalendarSync';

export default function WixCalendarSync({ onSynced }: { onSynced: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
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
    const scopeLabel = scope === 'range' ? `${startDate} to ${endDate} (inclusive)` : 'all dates';
    setBusy(true);
    setError('');
    setProgress(`Appending missing Wix bookings for ${scopeLabel} to the primary Google Calendar...`);
    try {
      let lastRefresh = 0;
      const result = await runWixCalendarSync(async (excludedIds = []) => {
        const response = await fetch('/api/booking?view=wix-calendar-sync', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ excludedIds, ...dateRange }),
        });
        return readWixResponse<CalendarSync>(response);
      }, async ({ synced, pending }) => {
        setProgress(`${synced} Wix bookings appended for ${scopeLabel}; ${pending ?? 'unknown'} remaining in this selection.`);
        if (synced > 0 && Date.now() - lastRefresh >= 10000) {
          lastRefresh = Date.now();
          await refresh.current();
        }
      });
      setProgress(`Wix Calendar sync complete for ${scopeLabel}: ${result.synced} bookings appended. Existing synced appointments were left unchanged.`);
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
      <p className="text-stone-600">Append missing imported Wix bookings to this Google Calendar across all branches. Existing synced appointments are unchanged. Cancelled/no-show visits are skipped. Keep this tab open until complete.</p>
      <form onSubmit={(event) => { event.preventDefault(); void sync(); }} className="flex flex-wrap items-end gap-3">
        <label className="font-semibold text-stone-700">Sync dates
          <select value={scope} disabled={busy} onChange={(event) => { setScope(event.target.value); setError(''); setProgress(''); }} className="mt-1 block rounded-lg border border-stone-300 bg-white px-3 py-2">
            <option value="all">All dates</option><option value="range">Selected date range</option>
          </select>
        </label>
        {scope === 'range' && <>
          <label className="font-semibold text-stone-700">Start date
            <input type="date" required disabled={busy} value={startDate} max={endDate || undefined} onChange={(event) => { setStartDate(event.target.value); setError(''); setProgress(''); }} className="mt-1 block rounded-lg border border-stone-300 px-3 py-2" />
          </label>
          <label className="font-semibold text-stone-700">End date (inclusive)
            <input type="date" required disabled={busy} value={endDate} min={startDate || undefined} onChange={(event) => { setEndDate(event.target.value); setError(''); setProgress(''); }} className="mt-1 block rounded-lg border border-stone-300 px-3 py-2" />
          </label>
        </>}
        <button type="submit" disabled={busy} className="px-3 py-2 border border-emerald-800 text-emerald-800 rounded-lg font-bold disabled:opacity-50">
          {busy ? 'Syncing Wix bookings...' : 'Sync Wix bookings'}
        </button>
      </form>
      {progress && <p role="status" className="text-stone-700">{progress}</p>}
      {error && <p role="alert" className="text-red-800">{error}</p>}
    </div>
  );
}
