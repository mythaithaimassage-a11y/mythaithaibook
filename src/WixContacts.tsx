import { useEffect, useState } from 'react';
import { RefreshCw, Upload } from 'lucide-react';
import { readWixResponse as readResponse } from './wixImportApi';
import { useTranslation } from './localization';

type Contact = {
  contact_id: string;
  name: string;
  email: string;
  phone: string;
  labels: string;
  wix_created_at: string;
  email_subscriber_status: string;
  sms_subscriber_status: string;
  last_activity: string;
  last_activity_at: string;
  linked_locations: string;
  source: string;
};

type Summary = {
  totalRows: number;
  validContacts: number;
  invalidRows: number;
  duplicates: number;
  invalidDates: number;
  issues: { row: number; message: string }[];
  sample?: Contact[];
  imported?: number;
  existing?: number;
};

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Unable to process Wix contacts.';

export default function WixContacts() {
  const { translate: tr } = useTranslation();
  const [csv, setCsv] = useState('');
  const [filename, setFilename] = useState('');
  const [preview, setPreview] = useState<Summary | null>(null);
  const [result, setResult] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setListError('');
    const params = new URLSearchParams({ view: 'wix-contacts', search: appliedSearch, offset: String(offset) });
    fetch(`/api/booking?${params}`, { signal: controller.signal })
      .then((response) => readResponse<{ contacts: Contact[]; total: number }>(response))
      .then((data) => { setContacts(data.contacts); setTotal(data.total); })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setListError(errorMessage(failure)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [appliedSearch, offset, refresh]);

  const selectFile = async (file: File | undefined) => {
    setCsv('');
    setFilename('');
    setPreview(null);
    setResult(null);
    setError('');
    if (!file) return;
    setBusy(true);
    try {
      if (!/\.csv$/i.test(file.name)) throw new Error('Choose the Wix contacts CSV export.');
      if (file.size > 3 * 1024 * 1024) throw new Error('The CSV must be 3 MiB or smaller. Split larger exports before importing.');
      const content = await file.text();
      const data = await readResponse<Summary>(await fetch('/api/booking?view=wix-contacts-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: content, preview: true }),
      }));
      setCsv(content);
      setFilename(file.name);
      setPreview(data);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const importContacts = async () => {
    if (!preview?.validContacts || busy) return;
    setBusy(true);
    setError('');
    try {
      const data = await readResponse<Summary>(await fetch('/api/booking?view=wix-contacts-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv }),
      }));
      setResult(data);
      setPreview(null);
      setCsv('');
      setOffset(0);
      setRefresh((current) => current + 1);
    } catch (failure) {
      setError(`${errorMessage(failure)} If the request timed out, refresh the list; re-importing the same CSV safely skips existing contacts.`);
    } finally {
      setBusy(false);
    }
  };

  const summary = result || preview;
  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{tr('Historical Wix contacts')}</h2>
        <p className="mt-1 text-sm text-slate-600">{tr('Import a Wix contacts CSV into a separate BigQuery contact archive. Existing bookings, patient records, payments and loyalty data are not changed.')}</p>
        <p className="mt-2 text-xs text-slate-500">{tr('Subscription statuses are historical only. This import does not send emails, enroll members or grant marketing consent. Duplicate primary emails (or phone numbers when email is missing) are skipped; existing imported contacts are never overwritten.')}</p>
      </div>
      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <label className="block text-sm font-semibold text-slate-800" htmlFor="wix-contacts-file"><Upload className="mr-2 inline h-4 w-4" />{tr('Preview Wix CSV (up to 3 MiB / 10,000 contacts)')}</label>
        <input id="wix-contacts-file" type="file" accept=".csv,text/csv" disabled={busy} className="block w-full text-sm" onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          void selectFile(file);
        }} />
        {busy && <p role="status" className="text-sm text-slate-600">{tr('Processing contacts...')}</p>}
        {error && <p role="alert" className="text-sm text-red-700">{tr(error)}</p>}
        {summary && (
          <div className="space-y-2 text-sm">
            <p className="font-semibold text-slate-800">{tr('{filename}: {rows} rows, {valid} unique valid contacts, {invalid} invalid rows skipped, {duplicates} CSV duplicates skipped.', { filename, rows: summary.totalRows, valid: summary.validContacts, invalid: summary.invalidRows, duplicates: summary.duplicates })}</p>
            {summary.invalidDates > 0 && <p className="text-amber-800">{tr('{count} contacts have unrecognized dates; original values are retained.', { count: summary.invalidDates })}</p>}
            {result && <p role="status" className="font-semibold text-emerald-800">{tr('Imported {imported} new contacts. Skipped {existing} contacts already in the archive.', { imported: result.imported ?? 0, existing: result.existing ?? 0 })}</p>}
            {summary.issues.length > 0 && <ul className="list-inside list-disc text-xs text-amber-800">{summary.issues.map((issue, index) => <li key={`${issue.row}-${index}`}>{tr('CSV record {row}: {message}', { row: issue.row, message: tr(issue.message) })}</li>)}</ul>}
            {preview?.sample && <div className="overflow-x-auto"><table className="w-full text-left text-xs"><caption className="py-2 text-left font-semibold">{tr('Preview: first five valid contacts')}</caption><thead><tr><th className="p-2">{tr('Name')}</th><th className="p-2">{tr('Email')}</th><th className="p-2">{tr('Phone')}</th><th className="p-2">{tr('Email status')}</th></tr></thead><tbody>{preview.sample.map((contact) => <tr key={contact.contact_id}><td className="p-2">{contact.name || tr('Not provided')}</td><td className="p-2">{contact.email || tr('Not provided')}</td><td className="p-2">{contact.phone || tr('Not provided')}</td><td className="p-2">{tr(contact.email_subscriber_status || 'Unknown')}</td></tr>)}</tbody></table></div>}
            {preview && <button type="button" disabled={busy || !preview.validContacts} onClick={() => void importContacts()} className="rounded-lg bg-emerald-900 px-4 py-2 font-semibold text-white disabled:opacity-50">{tr('Import {count} contacts', { count: preview.validContacts })}</button>}
          </div>
        )}
      </div>
      <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); setOffset(0); setAppliedSearch(search); setRefresh((current) => current + 1); }}>
        <label htmlFor="wix-contacts-search" className="sr-only">{tr('Search imported contacts')}</label>
        <input id="wix-contacts-search" value={search} maxLength={200} onChange={(event) => setSearch(event.target.value)} placeholder={tr('Search name, email, phone or labels')} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <button type="submit" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">{tr('Search')}</button>
        <button type="button" aria-label={tr('Refresh imported contacts')} onClick={() => setRefresh((current) => current + 1)} className="rounded-lg border border-slate-300 p-2"><RefreshCw className="h-4 w-4" /></button>
      </form>
      {listError && <p role="alert" className="text-sm text-red-700">{tr(listError)}</p>}
      {loading ? <p role="status" className="text-sm text-slate-500">{tr('Loading imported contacts...')}</p> : !listError && (
        <>
          <p className="text-sm text-slate-600">{tr('{count} matching contacts', { count: total })}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr>{['Contact', 'Phone', 'Labels', 'Wix created (UTC)', 'Email / SMS status', 'Last activity (UTC)', 'Source / locations'].map((heading) => <th key={heading} className="border-b p-3">{tr(heading)}</th>)}</tr></thead>
              <tbody>{contacts.map((contact) => <tr key={contact.contact_id} className="border-b border-slate-100">
                <td className="p-3"><span className="block font-semibold">{contact.name || tr('Not provided')}</span>{contact.email}</td>
                <td className="p-3">{contact.phone}</td><td className="max-w-xs whitespace-pre-wrap p-3">{contact.labels}</td>
                <td className="p-3">{contact.wix_created_at}</td>
                <td className="p-3">{tr(contact.email_subscriber_status || 'Unknown')} / {tr(contact.sms_subscriber_status || 'Unknown')}</td>
                <td className="p-3">{contact.last_activity}<span className="block text-slate-500">{contact.last_activity_at}</span></td>
                <td className="max-w-xs p-3">{contact.source}<span className="block text-slate-500">{contact.linked_locations}</span></td>
              </tr>)}</tbody>
            </table>
            {!contacts.length && <p className="py-4 text-sm text-slate-500">{tr('No imported contacts found.')}</p>}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <button type="button" disabled={offset === 0} onClick={() => setOffset((current) => Math.max(0, current - 50))} className="rounded-lg border px-3 py-2 disabled:opacity-40">{tr('Previous')}</button>
            <span>{total ? tr('{start}-{end} of {total}', { start: offset + 1, end: Math.min(offset + contacts.length, total), total }) : tr('0 contacts')}</span>
            <button type="button" disabled={offset + 50 >= total} onClick={() => setOffset((current) => current + 50)} className="rounded-lg border px-3 py-2 disabled:opacity-40">{tr('Next')}</button>
          </div>
        </>
      )}
    </section>
  );
}
