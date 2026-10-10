import { useState } from 'react';
import { message, useTranslation, type TranslationMessage } from './localization';

export type CheckInState = { checkedInAt: string; checkedInBy: string };

export function formatCheckInTime(value: string, locale: string) {
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? value : time.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function AppointmentCheckIn({ bookingId, checkedInAt, checkedInBy, receiptIssued, cancelled, onChanged }: {
  bookingId: string;
  checkedInAt: string;
  checkedInBy: string;
  receiptIssued: boolean;
  cancelled: boolean;
  onChanged: (state: CheckInState) => Promise<void>;
}) {
  const { translate: tr, locale } = useTranslation();
  const [state, setState] = useState<CheckInState>({ checkedInAt, checkedInBy });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<string | TranslationMessage>('');

  async function save(checkedIn: boolean) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/booking?view=check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, checkedIn }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || tr('Unable to update the check-in.'));
      const next = { checkedInAt: data.checkedInAt || '', checkedInBy: data.checkedInBy || '' };
      setState(next);
      setNotice(checkedIn ? message('Client checked in.') : message('Check-in undone.'));
      await onChanged(next);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : tr('Unable to update the check-in.'));
    } finally {
      setBusy(false);
    }
  }

  const checkedIn = Boolean(state.checkedInAt);
  return (
    <div className={`rounded-xl border px-4 py-3 ${checkedIn ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{tr('Staff check-in')}</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {checkedIn
              ? tr('Checked in {time} by {staff}', { time: formatCheckInTime(state.checkedInAt, locale), staff: state.checkedInBy || tr('Not recorded') })
              : tr('Not checked in')}
          </p>
        </div>
        {!checkedIn && !cancelled && (
          <button type="button" disabled={busy} onClick={() => save(true)} className="rounded-lg bg-emerald-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? tr('Saving...') : tr('Check in client')}</button>
        )}
        {checkedIn && !receiptIssued && (
          <button type="button" disabled={busy} onClick={() => save(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">{busy ? tr('Saving...') : tr('Undo check-in')}</button>
        )}
      </div>
      {!checkedIn && <p className="mt-2 text-xs text-slate-600">{cancelled ? tr('Cancelled or no-show appointments cannot be checked in.') : tr('Check the client in when they arrive. A receipt can only be issued after check-in.')}</p>}
      {notice && <p role="status" className="mt-2 text-xs text-emerald-800">{tr(notice)}</p>}
      {error && <p role="alert" className="mt-2 text-xs text-red-800">{tr(error)}</p>}
    </div>
  );
}
