import { useState } from 'react';
import { readWixResponse } from './wixImportApi';
import { runWixCalendarSync, type CalendarSync } from './runWixCalendarSync';

export default function WixCalendarSync({ onSynced }: { onSynced: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  async function sync() {
    if (busy) return;
    setBusy(true);
    setError('');
    setProgress('Syncing Wix bookings to the primary Google Calendar...');
    try {
      const result = await runWixCalendarSync(async () => {
        const response = await fetch('/api/booking?view=wix-calendar-sync', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
        });
        return readWixResponse<CalendarSync>(response);
      }, ({ synced, pending }) => {
        setProgress(`${synced} Wix bookings synced in this run; ${pending ?? 'unknown'} remaining.`);
      });
      setProgress(`Wix Calendar sync complete: ${result.synced} bookings synced. Select the appointment date to view historical visits.`);
      await onSynced();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to sync Wix bookings. Retry to resume.');
      await onSynced();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-stone-200 p-3 text-xs space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-stone-600">Sync imported Wix bookings across all dates and branches to this Google Calendar. Keep this tab open until complete. Cancelled/no-show visits are skipped.</p>
        <button type="button" disabled={busy} onClick={() => void sync()} className="px-3 py-2 border border-emerald-800 text-emerald-800 rounded-lg font-bold disabled:opacity-50">
          {busy ? 'Syncing Wix bookings...' : 'Sync Wix bookings'}
        </button>
      </div>
      {progress && <p role="status" className="text-stone-700">{progress}</p>}
      {error && <p role="alert" className="text-red-800">{error}</p>}
    </div>
  );
}
