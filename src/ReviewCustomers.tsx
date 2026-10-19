import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Mail, MessageSquare, Search } from 'lucide-react';
import { useTranslation } from './localization';

export type ReviewCandidate = {
  email: string; name: string; bookingId: string; serviceName: string; branchName: string;
  visitDate: string; lastRequestedAt: string; unsubscribed: boolean; eligible: boolean;
  reviewTracking?: { messageId: string; sentAt: string; openedAt: string } | null;
};
export type ReviewFilters = { query: string; days: string; from: string; to: string; branch: string; service: string; status: string };
export const defaultReviewFilters: ReviewFilters = { query: '', days: '30', from: '', to: '', branch: '', service: '', status: '' };
export const reviewDateOptions = [
  ['7', 'Last week (7 days)'], ['30', 'Last month (30 days)'], ['60', 'Last 2 months (60 days)'],
  ['90', 'Last 3 months (90 days)'], ['180', 'Last 6 months (180 days)'],
  ['365', 'Last year (365 days)'], ['all', 'All available visits'], ['custom', 'Custom visit dates'],
];

export function filterReviewCustomers(candidates: ReviewCandidate[], filters: ReviewFilters, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).map(({ type, value }) => [type, value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const days = Number(filters.days);
  const from = filters.days === 'custom' ? filters.from : Number.isInteger(days) && days > 0
    ? new Date(Date.parse(`${today}T12:00:00Z`) - (days - 1) * 86400000).toISOString().slice(0, 10) : '';
  const to = filters.days === 'custom' ? filters.to : today;
  const words = filters.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return candidates.filter((candidate) => {
    const text = [candidate.name, candidate.email, candidate.bookingId, candidate.branchName, candidate.serviceName].join(' ').toLowerCase();
    return (!from || candidate.visitDate >= from) && (!to || candidate.visitDate <= to)
      && words.every((word) => text.includes(word))
      && (!filters.branch || candidate.branchName === filters.branch)
      && (!filters.service || candidate.serviceName === filters.service)
      && (!filters.status || (filters.status === 'asked' ? Boolean(candidate.lastRequestedAt || candidate.reviewTracking)
        : filters.status === 'unasked' ? !candidate.lastRequestedAt && !candidate.reviewTracking
          : filters.status === 'opened' ? Boolean(candidate.reviewTracking?.openedAt)
            : filters.status === 'waiting' ? Boolean(candidate.reviewTracking && !candidate.reviewTracking.openedAt)
              : filters.status === 'eligible' ? candidate.eligible : candidate.unsubscribed));
  });
}

export function reviewRecipients(candidates: ReviewCandidate[], selected: string[]) {
  const addresses = new Set(selected);
  return candidates.filter((candidate) => addresses.has(candidate.email) && !candidate.unsubscribed).map((candidate) => candidate.email);
}

function ReviewReply({ candidate, revision }: { candidate: ReviewCandidate; revision: string }) {
  const { translate: tr, locale } = useTranslation();
  const [result, setResult] = useState<{ messageId: string; checkedAt: string; reply: { subject: string; snippet: string; occurredAt: string } | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const checked = useRef(false);
  const refresh = useRef(() => {});
  useEffect(() => {
    setResult(null);
    setError('');
    setBusy(false);
    request.current?.abort();
    request.current = null;
    checked.current = false;
    return () => { request.current?.abort(); };
  }, [candidate.reviewTracking?.messageId]);
  useEffect(() => {
    if (checked.current) refresh.current();
  }, [revision]);
  async function check() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    checked.current = true;
    setBusy(true);
    setError('');
    try {
      const query = new URLSearchParams({ view: 'review-request-reply', bookingId: candidate.bookingId });
      const response = await fetch(`/api/booking?${query}`, { signal: controller.signal, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to check review email replies.');
      if (data.messageId !== candidate.reviewTracking?.messageId || typeof data.checkedAt !== 'string'
        || !Number.isFinite(Date.parse(data.checkedAt)) || (data.reply !== null && (!data.reply
          || typeof data.reply.subject !== 'string' || typeof data.reply.snippet !== 'string'
          || !Number.isFinite(Date.parse(data.reply.occurredAt))))) throw new Error('The review email changed. Refresh customers and check again.');
      if (!controller.signal.aborted) setResult(data);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Unable to check review email replies.');
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
    refresh.current = () => { void check(); };
  }
  return (
    <div className="mt-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-slate-500">{tr(result ? result.reply ? 'Customer replied to review email' : 'No reply in this email thread' : 'Replies not checked')}</span>
        {candidate.reviewTracking && <button type="button" disabled={busy} onClick={() => { void check(); }} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-sky-100 bg-sky-50 px-3 font-bold text-sky-900 disabled:opacity-50"><MessageSquare aria-hidden="true" className="h-3.5 w-3.5" />{tr(busy ? 'Checking replies...' : result ? 'Check again' : 'Check replies')}</button>}
      </div>
      {result && <p className="mt-1 text-[10px] text-slate-400">{tr('Checked at {time}', { time: new Intl.DateTimeFormat(locale, { timeZone: 'America/Toronto', dateStyle: 'short', timeStyle: 'short' }).format(new Date(result.checkedAt)) })}</p>}
      {result?.reply && <p className="mt-2 break-words rounded-xl bg-sky-50 p-3 leading-5 text-sky-950">{result.reply.snippet || result.reply.subject}</p>}
      {error && <p role="alert" className="mt-2 break-words text-rose-800">{tr(error)}</p>}
    </div>
  );
}

export default function ReviewCustomers({ candidates, busy, sending, sendBlocked, revision, onOpen, onSend }: {
  candidates: ReviewCandidate[]; busy: boolean; sending: boolean; sendBlocked: boolean; revision: string;
  onOpen: (bookingId: string) => void; onSend: (emails: string[]) => Promise<void>;
}) {
  const { translate: tr, locale } = useTranslation();
  const [filters, setFilters] = useState(defaultReviewFilters);
  const [selected, setSelected] = useState<string[]>([]);
  const [limit, setLimit] = useState(20);
  const filtered = useMemo(() => filterReviewCustomers(candidates, filters), [candidates, filters, revision]);
  const recipients = reviewRecipients(filtered, selected);
  function update(key: keyof ReviewFilters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
    setSelected([]);
    setLimit(20);
  }
  const input = 'mt-1 min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800';
  const invalidRange = filters.days === 'custom' && filters.from && filters.to && filters.from > filters.to;
  const date = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'America/Toronto' }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value));
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
        <label className="block text-xs font-bold text-slate-600"><span className="flex items-center gap-2"><Search aria-hidden="true" className="h-4 w-4" />{tr('Search review customers')}</span>
          <input type="search" value={filters.query} onChange={(event) => update('query', event.target.value)} placeholder={tr('Name, email, booking reference, service or branch')} className={input} />
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-600">{tr('Last attended visit')}<select value={filters.days} onChange={(event) => update('days', event.target.value)} className={input}>{reviewDateOptions.map(([value, label]) => <option key={value} value={value}>{tr(label)}</option>)}</select></label>
          <label className="text-xs font-bold text-slate-600">{tr('Review email status')}<select value={filters.status} onChange={(event) => update('status', event.target.value)} className={input}>{[['', 'All customers'], ['unasked', 'Not asked yet'], ['asked', 'Already asked'], ['opened', 'Open signal detected (approximate)'], ['waiting', 'No open signal yet'], ['eligible', 'Suggested recipients'], ['unsubscribed', 'Unsubscribed from emails']].map(([value, label]) => <option key={value} value={value}>{tr(label)}</option>)}</select></label>
          {filters.days === 'custom' && <>
            <label className="text-xs font-bold text-slate-600">{tr('Visit from')}<input type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => update('from', event.target.value)} className={input} /></label>
            <label className="text-xs font-bold text-slate-600">{tr('Visit through')}<input type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => update('to', event.target.value)} className={input} /></label>
          </>}
          {(['branch', 'service'] as const).map((key) => <label key={key} className="text-xs font-bold text-slate-600">{tr(key === 'branch' ? 'Branch' : 'Service')}<select value={filters[key]} onChange={(event) => update(key, event.target.value)} className={input}><option value="">{tr(key === 'branch' ? 'All branches' : 'All services')}</option>{[...new Set(candidates.map((candidate) => key === 'branch' ? candidate.branchName : candidate.serviceName))].filter(Boolean).sort().map((value) => <option key={value} value={value}>{value}</option>)}</select></label>)}
        </div>
        <p className="mt-3 text-[11px] leading-5 text-slate-500">{tr('Date filters use each customer’s latest attended visit in the clinic time zone. Changing filters clears the selection; only matching selected customers are emailed.')}</p>
        {invalidRange && <p role="alert" className="mt-2 text-xs text-rose-800">{tr('Choose an end date on or after the start date.')}</p>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <p role="status" className="font-bold text-slate-600">{tr('{count} matching customers · {selected} selected', { count: filtered.length, selected: recipients.length })}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => setSelected(filtered.filter((candidate) => !candidate.unsubscribed).map((candidate) => candidate.email))} className="min-h-11 rounded-lg px-2 font-bold text-emerald-800 disabled:opacity-50">{tr('Select all')}</button>
          <button type="button" disabled={busy} onClick={() => setSelected(filtered.filter((candidate) => candidate.eligible && !candidate.unsubscribed).map((candidate) => candidate.email))} className="min-h-11 rounded-lg px-2 font-bold text-emerald-800 disabled:opacity-50">{tr('Select suggested')}</button>
          <button type="button" disabled={busy} onClick={() => setSelected([])} className="min-h-11 rounded-lg px-2 font-bold text-slate-500">{tr('Clear')}</button>
        </div>
      </div>
      {!filtered.length && <p className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">{tr('No customers match these filters. Try a wider visit range or clear the search.')}</p>}
      <ul className="space-y-3">
        {filtered.slice(0, limit).map((candidate) => <li key={candidate.email} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <label className="flex min-h-11 min-w-11 items-center justify-center"><input type="checkbox" checked={recipients.includes(candidate.email)} disabled={busy || candidate.unsubscribed} onChange={() => setSelected((current) => current.includes(candidate.email) ? current.filter((email) => email !== candidate.email) : [...current, candidate.email])} aria-label={tr('Select {name} for a review request', { name: candidate.name || candidate.email })} className="h-5 w-5 accent-emerald-800" /></label>
            <div className="min-w-0 flex-1">
              <button type="button" onClick={() => onOpen(candidate.bookingId)} className="min-h-11 max-w-full break-words text-left text-sm font-bold text-slate-900 underline decoration-emerald-200 underline-offset-4">{candidate.name || candidate.email}</button>
              <p className="break-all text-xs text-slate-500">{candidate.email}</p>
              <p className="mt-2 break-words text-xs text-slate-600">{tr('Last visit')} {date(candidate.visitDate)} · {candidate.branchName} · {candidate.serviceName}</p>
              <p className="mt-1 break-all text-[10px] text-slate-400">{tr('Ref:')} {candidate.bookingId}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold">
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${candidate.reviewTracking?.openedAt ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-500'}`}><Eye aria-hidden="true" className="h-3 w-3" />{tr(candidate.reviewTracking ? candidate.reviewTracking.openedAt ? 'Open signal detected (approximate)' : 'No open signal yet' : candidate.lastRequestedAt ? 'Open tracking unavailable' : 'Not asked yet')}</span>
                {candidate.unsubscribed && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-900">{tr('Unsubscribed from emails')}</span>}
              </div>
              {(candidate.lastRequestedAt || candidate.reviewTracking) && <p className="mt-2 text-[11px] text-slate-400">{tr('Already asked on')} {date(candidate.reviewTracking?.sentAt || candidate.lastRequestedAt)}</p>}
              <ReviewReply candidate={candidate} revision={revision} />
              <button type="button" onClick={() => onOpen(candidate.bookingId)} className="mt-2 inline-flex min-h-11 items-center gap-2 text-xs font-bold text-emerald-800"><Mail aria-hidden="true" className="h-4 w-4" />{tr('View communication history')}</button>
            </div>
          </div>
        </li>)}
      </ul>
      {filtered.length > limit && <button type="button" onClick={() => setLimit((value) => value + 20)} className="min-h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600">{tr('Show more customers')}</button>}
      <div className="sticky bottom-0 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg">
        <button type="button" disabled={busy || sendBlocked || !recipients.length || Boolean(invalidRange)} onClick={() => { setSelected([]); void onSend(recipients); }} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-950 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"><Mail aria-hidden="true" className="h-4 w-4" />{tr(sending ? 'Sending…' : 'Send to {value0}', { value0: recipients.length })}</button>
      </div>
    </div>
  );
}
