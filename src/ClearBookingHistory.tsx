import { useState } from 'react';

type Preview = {
  count: number;
  receipts: number;
  paidBookings: number;
  kept: number;
  cutoff: string;
  timeZone: string;
  token: string;
};

export default function ClearBookingHistory({ onCleared }: { onCleared: () => Promise<void> }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function request(view: string, body: object) {
    const response = await fetch(`/api/booking?view=${view}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
    return data;
  }

  async function loadPreview() {
    setBusy(true);
    setError('');
    setMessage('');
    setPreview(null);
    setConfirmation('');
    try {
      setPreview(await request('booking-history-preview', {}));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to preview past bookings.');
    } finally {
      setBusy(false);
    }
  }

  async function clearHistory() {
    if (!preview || confirmation !== 'CLEAR PAST BOOKINGS' || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await request('clear-booking-history', { token: preview.token, confirmation });
      setPreview(null);
      setConfirmation('');
      setMessage(`Cleared ${result.deleted} past bookings. Package and loyalty ledgers were not changed.`);
      await onCleared();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to clear past bookings.');
      setPreview(null);
      setConfirmation('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-red-200 p-3 space-y-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-stone-900">Clear past booking history</h3>
          <p className="text-stone-600">All branches, including Wix imports. Future and ongoing appointments are kept.</p>
        </div>
        <button type="button" onClick={loadPreview} disabled={busy} className="px-3 py-2 border border-red-300 text-red-700 rounded-lg font-bold hover:bg-red-50 disabled:opacity-50">
          {busy ? 'Working...' : 'Clear past bookings'}
        </button>
      </div>
      {preview && (
        <div className="space-y-3">
          <p>
            <strong>{preview.count} bookings</strong> will be permanently deleted, including {preview.paidBookings} paid bookings and {preview.receipts} issued receipt records.
            {' '}{preview.kept} bookings will be kept. Cutoff: {new Date(preview.cutoff).toLocaleString('en-CA', { timeZone: preview.timeZone })} ({preview.timeZone}).
          </p>
          <p className="text-red-800">
            No archive is created. Stored booking payment and receipt details will be lost and cannot be reissued from the dashboard.
            Package balances and usage, loyalty ledgers, separate Square payment records, contacts, patient records, and Google Calendar events are not deleted.
            Past bookings with invalid dates, times, or durations are kept for manual review.
            Booking-based reports will no longer include deleted visits. Reimporting the Wix CSV can recreate deleted bookings.
          </p>
          {preview.count > 0 && (
            <label className="block font-semibold">
              Type CLEAR PAST BOOKINGS to confirm
              <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={busy} autoComplete="off" className="block mt-1 p-2 border border-stone-300 rounded-lg w-full max-w-sm" />
            </label>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={clearHistory} disabled={busy || preview.count === 0 || confirmation !== 'CLEAR PAST BOOKINGS'} className="px-3 py-2 bg-red-700 text-white rounded-lg font-bold disabled:opacity-50">
              Permanently delete {preview.count} past bookings
            </button>
            <button type="button" disabled={busy} onClick={() => { setPreview(null); setConfirmation(''); }} className="px-3 py-2 border border-stone-300 rounded-lg">Cancel</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-red-800">{error}</p>}
      {message && <p role="status" className="text-emerald-800">{message}</p>}
    </div>
  );
}
