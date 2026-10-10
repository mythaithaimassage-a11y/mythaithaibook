import { useState } from 'react';
import { message, useTranslation, type TranslationMessage } from './localization';

export default function BookingNote({ bookingId, initialNote, onSaved }: {
  bookingId: string;
  initialNote: string;
  onSaved: (note: string) => Promise<void>;
}) {
  const { translate: tr } = useTranslation();
  const [note, setNote] = useState(initialNote);
  const [savedNote, setSavedNote] = useState(initialNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<string | TranslationMessage>('');

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/booking?view=booking-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, note, expectedNote: savedNote }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to save the booking note.');
      setSavedNote(data.bookingNote);
      setNote(data.bookingNote);
      setNotice(message('Internal booking note saved for the clinic team.'));
      await onSaved(data.bookingNote);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to save the booking note.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
      <label className="block text-xs font-bold text-slate-700">{tr('Shared internal booking note')}
        <textarea maxLength={2000} rows={3} disabled={busy} value={note} onChange={(event) => setNote(event.target.value)} placeholder={tr("For everyone's reference in the clinic")} className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal" />
      </label>
      <p className="text-xs text-slate-500">{tr('Visible to authorized staff and the assigned therapist, not customers. Keep medical information in patient notes.')}</p>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">{note.length}/2000</span>
        <button type="submit" disabled={busy || note === savedNote} className="rounded-lg bg-emerald-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{tr(busy ? 'Saving...' : 'Save booking note')}</button>
      </div>
      {notice && <p role="status" className="text-xs text-emerald-800">{tr(notice)}</p>}
      {error && <p role="alert" className="text-xs text-red-800">{tr(error)}</p>}
    </form>
  );
}
