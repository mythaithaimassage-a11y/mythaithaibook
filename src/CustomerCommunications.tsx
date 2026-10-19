import { useEffect, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check, ChevronDown, Eye, Mail, MessageSquare, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { useTranslation } from './localization';

export type CustomerEmail = {
  id: string;
  subject: string;
  snippet: string;
  direction: 'received' | 'sent';
  kind: string;
  occurredAt: string;
  bookingIds: string[];
  tracked?: boolean;
  openedAt?: string;
};

type CommunicationResponse = {
  customer: { name: string; email: string; bookingId: string };
  messages: CustomerEmail[];
  reminders: CustomerEmail[];
  nextPageToken: string;
  historyError: string;
  trackingError?: string;
  restricted: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCustomerEmail(value: unknown): value is CustomerEmail {
  return isRecord(value) && typeof value.id === 'string' && Boolean(value.id)
    && typeof value.subject === 'string' && typeof value.snippet === 'string'
    && (value.direction === 'sent' || value.direction === 'received') && typeof value.kind === 'string'
    && typeof value.occurredAt === 'string' && Number.isFinite(Date.parse(value.occurredAt))
    && Array.isArray(value.bookingIds) && value.bookingIds.every((id) => typeof id === 'string')
    && (value.tracked === undefined || typeof value.tracked === 'boolean')
    && (value.openedAt === undefined || value.openedAt === '' || (typeof value.openedAt === 'string' && Number.isFinite(Date.parse(value.openedAt))));
}

export function parseCustomerCommunications(value: unknown): CommunicationResponse {
  if (!isRecord(value) || !isRecord(value.customer) || typeof value.customer.name !== 'string'
    || typeof value.customer.email !== 'string' || typeof value.customer.bookingId !== 'string'
    || !Array.isArray(value.messages) || !value.messages.every(isCustomerEmail)
    || !Array.isArray(value.reminders) || !value.reminders.every(isCustomerEmail)
    || typeof value.nextPageToken !== 'string' || typeof value.historyError !== 'string'
    || typeof value.restricted !== 'boolean' || (value.trackingError !== undefined && typeof value.trackingError !== 'string')) {
    throw new Error('Unable to verify customer email history.');
  }
  return {
    customer: { name: value.customer.name, email: value.customer.email, bookingId: value.customer.bookingId },
    messages: value.messages, reminders: value.reminders, nextPageToken: value.nextPageToken,
    historyError: value.historyError, restricted: value.restricted, trackingError: value.trackingError,
  };
}

export function mergeCustomerEmails(messages: CustomerEmail[], reminders: CustomerEmail[]) {
  const merged = new Map(messages.map((email) => [email.id, email]));
  for (const reminder of reminders) merged.set(reminder.id, { ...reminder, ...merged.get(reminder.id), tracked: true, openedAt: reminder.openedAt });
  return [...merged.values()].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id));
}

export function groupCustomerEmails(messages: CustomerEmail[]) {
  const groups = new Map<string, CustomerEmail[]>();
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' });
  for (const email of messages) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(email.occurredAt)).map(({ type, value }) => [type, value]));
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    groups.set(date, [...(groups.get(date) || []), email]);
  }
  return [...groups.entries()];
}

export function CustomerCommunicationHistory({ data, bookingId }: { data: CommunicationResponse; bookingId: string }) {
  const { translate: tr, locale } = useTranslation();
  const [filter, setFilter] = useState('All emails');
  const messages = mergeCustomerEmails(data.messages, data.reminders);
  const latestReply = messages.find((email) => email.direction === 'received');
  const latestSent = messages.find((email) => email.direction === 'sent');
  const latestReminder = messages.find((email) => email.tracked && email.bookingIds.includes(bookingId));
  const shown = messages.filter((email) => filter === 'All emails' || (filter === 'Customer replies' ? email.direction === 'received' : email.kind === filter));
  const filters = ['All emails', 'Customer replies', ...new Set(messages.map((email) => email.kind))];
  const timestamp = (value: string) => new Intl.DateTimeFormat(locale, {
    timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value));

  return (
    <div className="space-y-5">
      {data.historyError && <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <p className="font-bold">{tr('Mailbox history unavailable')}</p><p>{tr(data.historyError)}</p>
        <p className="mt-1">{tr('Saved reminder tracking is shown below. The conversation summary is incomplete until mailbox access is restored.')}</p>
      </div>}
      {data.trackingError && <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><p className="font-bold">{tr('Reminder tracking unavailable')}</p><p>{tr(data.trackingError)}</p></div>}
      {data.restricted && <p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />{tr('Branch access: only emails referencing accessible bookings are shown. Unreferenced marketing emails are visible to the owner only.')}</p>}
      <section aria-label={tr('Quick communication summary')} className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-4 sm:p-5">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-900"><MessageSquare aria-hidden="true" className="h-4 w-4" />{tr('Quick communication summary')}</div>
        <p className="mt-1 text-xs text-slate-500">{tr('Summary of loaded emails, newest first. Load older emails for more history.')}</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            ['Emails sent', messages.filter((email) => email.direction === 'sent').length],
            ['Customer replies', messages.filter((email) => email.direction === 'received').length],
            ['Open signals', messages.filter((email) => email.openedAt).length],
          ].map(([label, count]) => <div key={label} className="min-w-0 rounded-xl border border-white bg-white/80 p-3"><p className="text-xl font-black text-slate-900">{count}</p><p className="mt-1 break-words text-[11px] font-semibold text-slate-500">{tr(String(label))}</p></div>)}
        </div>
        <div className="mt-4 rounded-xl border border-emerald-100 bg-white p-3">
          <p className="text-xs font-bold text-slate-500">{tr('Latest reminder for this appointment')}</p>
          <p className="mt-1 flex items-center gap-2 text-sm font-bold text-emerald-950">
            <Eye aria-hidden="true" className="h-4 w-4 shrink-0" />
            {tr(data.trackingError ? 'Reminder tracking unavailable' : latestReminder ? latestReminder.openedAt ? 'Open signal detected (approximate)' : 'No open signal yet' : 'No tracked reminder for this appointment')}
          </p>
          {latestReminder && <p className="mt-1 text-xs text-slate-500">{tr('Sent')} {timestamp(latestReminder.occurredAt)}{latestReminder.openedAt ? ` · ${tr('Open signal')} ${timestamp(latestReminder.openedAt)}` : ''}</p>}
        </div>
        {latestSent && <div className="mt-3 border-l-2 border-emerald-300 pl-3">
          <p className="text-xs font-bold text-emerald-900">{tr('Latest message to customer')} · {timestamp(latestSent.occurredAt)}</p>
          <p className="mt-1 break-words text-sm font-semibold text-slate-800">{latestSent.subject}</p>
          {latestSent.snippet && <p className="mt-1 break-words text-xs leading-5 text-slate-600">{latestSent.snippet}</p>}
        </div>}
        {latestReply ? <div className="mt-3 border-l-2 border-sky-300 pl-3">
          <p className="text-xs font-bold text-sky-900">{tr('Latest customer reply')} · {timestamp(latestReply.occurredAt)}</p>
          <p className="mt-1 break-words text-sm font-semibold text-slate-800">{latestReply.subject}</p>
          <p className="mt-1 break-words text-xs leading-5 text-slate-600">{latestReply.snippet}</p>
        </div> : !data.historyError && <p className="mt-3 text-xs text-slate-500">{tr('No customer reply in the loaded history.')}</p>}
      </section>
      <p className="rounded-xl bg-slate-100 p-3 text-xs leading-5 text-slate-500">{tr('Open signals are approximate, not read receipts. Images may be blocked or loaded automatically by privacy tools. No signal does not mean unread. Only reminders sent after tracking was added can be tracked.')}</p>
      <nav aria-label={tr('Filter customer emails')} className="flex gap-2 overflow-x-auto pb-2">
        {filters.map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}
          className={`min-h-11 shrink-0 rounded-full border px-4 text-xs font-bold transition ${filter === value ? 'border-emerald-900 bg-emerald-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{tr(value)}</button>)}
      </nav>
      {shown.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center"><Mail aria-hidden="true" className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">{tr('No emails to show')}</p><p className="mt-1 text-xs text-slate-500">{tr('Try another filter or load older emails.')}</p></div>}
      {groupCustomerEmails(shown).map(([date, emails]) => (
        <section key={date} aria-label={new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'America/Toronto' }).format(new Date(`${date}T12:00:00Z`))}>
          <h3 className="mb-3 flex items-center gap-3 text-xs font-bold text-slate-500"><span className="shrink-0 rounded-full bg-slate-100 px-3 py-1.5">{new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'America/Toronto' }).format(new Date(`${date}T12:00:00Z`))}</span><span className="h-px flex-1 bg-slate-200" /></h3>
          <ol className="space-y-3">
            {emails.map((email) => (
              <li key={email.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${email.direction === 'received' ? 'bg-sky-50 text-sky-700' : 'bg-emerald-50 text-emerald-700'}`}>{email.direction === 'received' ? <ArrowDownLeft aria-hidden="true" className="h-4 w-4" /> : <ArrowUpRight aria-hidden="true" className="h-4 w-4" />}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]"><span className="font-bold text-slate-700">{tr(email.direction === 'received' ? 'Customer reply' : 'Sent to customer')}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-500">{tr(email.kind)}</span><time dateTime={email.occurredAt} className="text-slate-400">{new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: 'America/Toronto' }).format(new Date(email.occurredAt))}</time></div>
                    <h4 className="mt-2 break-words text-sm font-bold leading-5 text-slate-900">{email.subject}</h4>
                    {email.snippet && <p className="mt-1.5 break-words text-xs leading-5 text-slate-500">{email.snippet}</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-semibold">
                      {email.bookingIds.map((id) => <span key={id} className="max-w-full break-all rounded-md border border-slate-200 px-2 py-1 text-slate-500">{tr('Ref:')} {id}</span>)}
                      {email.direction === 'sent' && <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 ${email.openedAt ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-500'}`}>
                        {email.openedAt ? <Check aria-hidden="true" className="h-3 w-3" /> : <Eye aria-hidden="true" className="h-3 w-3" />}
                        {tr(email.tracked ? email.openedAt ? 'Open signal detected (approximate)' : 'No open signal yet' : 'Open tracking unavailable')}
                      </span>}
                    </div>
                    {email.openedAt && <p className="mt-2 text-[10px] text-slate-400">{tr('First open signal: {time}', { time: timestamp(email.openedAt) })}</p>}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

export default function CustomerCommunications({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const { translate: tr } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<CommunicationResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [revision, setRevision] = useState(0);
  const moreRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); moreRequest.current?.abort(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    moreRequest.current?.abort();
    setLoading(true);
    setLoadingMore(false);
    setData(null);
    setError('');
    void request('', controller.signal).then((result) => { if (!controller.signal.aborted) setData(result); })
      .catch((failure) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Unable to load customer emails.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [bookingId, revision]);

  async function request(pageToken: string, signal: AbortSignal) {
    const query = new URLSearchParams({ view: 'customer-communications', bookingId, ...(pageToken ? { pageToken } : {}) });
    const response = await fetch(`/api/booking?${query}`, { signal, cache: 'no-store' });
    const result: unknown = await response.json();
    if (!response.ok) throw new Error(isRecord(result) && typeof result.message === 'string' ? result.message : 'Unable to load customer emails.');
    const parsed = parseCustomerCommunications(result);
    if (parsed.customer.bookingId !== bookingId) throw new Error('Unable to verify customer email history.');
    return parsed;
  }
  async function loadMore() {
    if (!data?.nextPageToken || loadingMore || moreRequest.current) return;
    const controller = new AbortController();
    moreRequest.current = controller;
    setLoadingMore(true);
    setError('');
    try {
      const result = await request(data.nextPageToken, controller.signal);
      if (!controller.signal.aborted) {
        if (result.historyError) throw new Error(result.historyError);
        setData((current) => current ? { ...result, messages: mergeCustomerEmails([...current.messages, ...result.messages], []) } : result);
      }
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Unable to load customer emails.');
    } finally {
      if (moreRequest.current === controller) moreRequest.current = null;
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  }
  return (
    <dialog ref={dialog} aria-labelledby="customer-communications-title"
      onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}
      className="customer-communications-dialog m-auto w-[calc(100%_-_1rem)] max-w-3xl overflow-hidden rounded-3xl border-0 bg-slate-50 p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/60 sm:w-[calc(100%_-_2rem)]">
      <div className="flex flex-col">
        <header className="flex shrink-0 items-start justify-between gap-3 bg-gradient-to-br from-slate-950 to-emerald-900 p-5 text-white sm:p-6">
          <div className="min-w-0"><p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-200"><Mail aria-hidden="true" className="h-3.5 w-3.5" />{tr('Customer communications')}</p><h2 id="customer-communications-title" className="mt-2 break-words text-xl font-bold">{data?.customer.name || tr('Email history')}</h2><p className="mt-1 break-all text-xs text-emerald-100/80">{data?.customer.email || tr('Bookings, reminders, reviews, marketing and replies in one place.')}</p></div>
          <div className="flex shrink-0 gap-1"><button type="button" disabled={loading || loadingMore} onClick={() => setRevision((value) => value + 1)} aria-label={tr('Refresh email history')} className="flex h-11 w-11 items-center justify-center rounded-xl text-white/80 hover:bg-white/10 disabled:opacity-40"><RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button><button type="button" onClick={onClose} aria-label={tr('Close email history')} className="flex h-11 w-11 items-center justify-center rounded-xl text-white/80 hover:bg-white/10"><X aria-hidden="true" className="h-5 w-5" /></button></div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {loading && <p role="status" className="py-16 text-center text-sm text-slate-500">{tr('Loading customer emails...')}</p>}
          {error && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><p>{tr(error)}</p><button type="button" onClick={() => data?.nextPageToken ? void loadMore() : setRevision((value) => value + 1)} className="mt-2 min-h-11 font-bold underline">{tr('Try again')}</button></div>}
          {data && <CustomerCommunicationHistory data={data} bookingId={bookingId} />}
          {data?.nextPageToken && <button type="button" disabled={loadingMore} onClick={() => { void loadMore(); }} className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 disabled:opacity-50"><ChevronDown aria-hidden="true" className="h-4 w-4" />{tr(loadingMore ? 'Loading older emails...' : 'Load older emails')}</button>}
        </div>
      </div>
    </dialog>
  );
}
