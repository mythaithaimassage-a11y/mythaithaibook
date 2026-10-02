import { useEffect, useState } from 'react';
import { Upload } from 'lucide-react';
import { readWixResponse } from './wixImportApi';
import { wixImportServices, packageSessionCount } from '../lib/wix-pricing.js';

type Booking = {
  booking_id: string;
  customer_name: string;
  email: string;
  phone: string;
  date: string;
  time: string;
  service_name: string;
  therapist_name: string;
  duration_minutes: number;
  status: string;
  total: number;
  paid_amount: number;
};
type Service = { id: number | string; name: string; duration: number; price: number; taxRate: number; active: boolean };
type PriceGroup = { key: string; serviceName: string; durationMinutes: number; count: number };
type PriceMapping = { key: string; serviceId: number | string; serviceName: string; price: number; taxRate: number };
type Summary = {
  totalRows: number;
  validBookings: number;
  invalidRows: number;
  duplicates: number;
  futureRows: number;
  warnings: number;
  branchName: string;
  timeZone: string;
  throughDate: string;
  earliestDate: string;
  latestDate: string;
  issues: { row: number; message: string }[];
  sample?: Booking[];
  imported?: number;
  existing?: number;
  updated?: number;
  priceGroups: PriceGroup[];
  pricedBookings: number;
  approvedTotal: number;
};

export default function WixBookings({ onViewBookings }: { onViewBookings: () => void }) {
  const [csv, setCsv] = useState('');
  const [filename, setFilename] = useState('');
  const [preview, setPreview] = useState<Summary | null>(null);
  const [result, setResult] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [services, setServices] = useState<Service[]>([]);
  const [catalogueError, setCatalogueError] = useState('');
  const [mappings, setMappings] = useState<PriceMapping[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [pricesReviewed, setPricesReviewed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/booking?view=services', { signal: controller.signal })
      .then((response) => readWixResponse<{ services: Service[] }>(response))
      .then((data) => setServices(wixImportServices(data.services)))
      .catch((failure: unknown) => { if (!controller.signal.aborted) setCatalogueError(failure instanceof Error ? failure.message : 'Unable to load current catalogue.'); });
    return () => controller.abort();
  }, []);

  const request = (content: string, previewOnly: boolean, priceMappings?: PriceMapping[]) => fetch('/api/booking?view=wix-bookings-import', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv: content, preview: previewOnly, priceMappings, confirmPaid: !previewOnly && confirmed }),
  }).then((response) => readWixResponse<Summary>(response));

  const selectFile = async (file: File | undefined) => {
    setCsv('');
    setFilename('');
    setPreview(null);
    setResult(null);
    setError('');
    setMappings([]);
    setConfirmed(false);
    setPricesReviewed(false);
    if (!file) return;
    setBusy(true);
    try {
      if (!/\.csv$/i.test(file.name)) throw new Error('Choose the Wix bookings CSV export.');
      if (file.size > 3 * 1024 * 1024) throw new Error('The CSV must be 3 MiB or smaller. Split larger exports before importing.');
      const content = await file.text();
      setPreview(await request(content, true));
      setCsv(content);
      setFilename(file.name);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to preview Wix bookings.');
    } finally {
      setBusy(false);
    }
  };

  const importBookings = async () => {
    if (!preview?.validBookings || busy || !confirmed || !pricesReviewed) return;
    setBusy(true);
    setError('');
    try {
      setResult(await request(csv, false, mappings));
      setPreview(null);
      setCsv('');
    } catch (failure) {
      setError(`${failure instanceof Error ? failure.message : 'Unable to import Wix bookings.'} If the request timed out, check Events & bookings and retry the same CSV; existing IDs are skipped.`);
    } finally {
      setBusy(false);
    }
  };
  const reviewPrices = async () => {
    setBusy(true);
    setError('');
    setPricesReviewed(false);
    setConfirmed(false);
    try {
      const data = await request(csv, true, mappings);
      setPreview(data);
      setPricesReviewed(data.pricedBookings === data.validBookings);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to review catalogue prices.');
    } finally {
      setBusy(false);
    }
  };
  const summary = result || preview;
  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">Import historical Wix bookings</h2>
      <p className="text-sm text-slate-600">Destination: the existing BigQuery bookings table, for <strong>Mississauga Central</strong>. No tables or schema changes are created. Bookings receive stable Wix-prefixed IDs. Re-imports can fill zero-amount Wix records without receipts; existing recorded payments and receipts are preserved.</p>
      <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p>The CSV has no payment amounts. Map each Wix service to a current catalogue service, review the tax-inclusive prices, and confirm that these amounts may be used for the paid records and receipts. These are owner-approved current prices, not historical amounts verified by Wix. Original Wix details remain in notes. Each CSV row represents one booking; prices are not multiplied by spots filled. Four-session package visits use one-quarter of the package subtotal; register and link a verified package in Package tracking to deduct sessions.</p>
        <p>Session times are interpreted in the clinic timezone. Future session dates are skipped. Staff names and original Wix fields are preserved; mapped service labels are used for receipts. The import does not create Calendar events, send emails, issue receipts, charge customers, or award loyalty points.</p>
      </div>
      <label htmlFor="wix-bookings-file" className="block text-sm font-semibold text-slate-800"><Upload className="mr-2 inline h-4 w-4" />Preview Wix bookings CSV (up to 3 MiB / 10,000 records)</label>
      <input id="wix-bookings-file" type="file" accept=".csv,text/csv" disabled={busy} className="block w-full text-sm" onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        void selectFile(file);
      }} />
      {busy && <p role="status" className="text-sm text-slate-600">Processing historical bookings...</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {catalogueError && <p role="alert" className="text-sm text-red-700">{catalogueError} Reload this page to retry loading the catalogue.</p>}
      {summary && <div className="space-y-3 text-sm">
        <p className="font-semibold">{filename}: {summary.totalRows} rows, {summary.validBookings} unique valid bookings, {summary.duplicates} duplicates, {summary.invalidRows} invalid rows and {summary.futureRows} future sessions skipped.</p>
        <p className="text-slate-600">{summary.branchName} | {summary.timeZone} | Through {summary.throughDate}. {summary.earliestDate && `Import range: ${summary.earliestDate} to ${summary.latestDate}.`}</p>
        {summary.warnings > 0 && <p className="text-amber-800">{summary.warnings} bookings have missing names or invalid contact/registration values; originals retained in notes.</p>}
        {summary.issues.length > 0 && <ul className="list-inside list-disc text-xs text-amber-800">{summary.issues.map((issue, index) => <li key={`${issue.row}-${index}`}>CSV record {issue.row}: {issue.message}</li>)}</ul>}
        {preview?.sample && <div className="overflow-x-auto"><table className="w-full text-left text-xs">
          <caption className="py-2 text-left font-semibold">First five valid bookings in chronological order</caption>
          <thead><tr>{['Booking / client', 'Session', 'Service', 'Staff', 'Duration', 'Status', 'Total / paid'].map((heading) => <th key={heading} className="p-2">{heading}</th>)}</tr></thead>
          <tbody>{preview.sample.map((booking) => <tr key={booking.booking_id}><td className="p-2">{booking.customer_name || booking.email || booking.phone}<span className="block font-mono text-[10px] text-slate-500">{booking.booking_id}</span></td><td className="p-2">{booking.date} {booking.time}</td><td className="p-2">{booking.service_name}</td><td className="p-2">{booking.therapist_name}</td><td className="p-2">{booking.duration_minutes} min</td><td className="p-2">{booking.status}</td><td className="p-2">${booking.total.toFixed(2)} / ${booking.paid_amount.toFixed(2)}</td></tr>)}</tbody>
        </table></div>}
        {preview && <div className="space-y-3">
          <h3 className="font-semibold">Review current catalogue prices</h3>
          {preview.priceGroups.map((group) => {
            const selected = mappings.find((mapping) => mapping.key === group.key);
            return <label key={group.key} className="block space-y-1 text-xs">
              <span>{group.serviceName} | {group.durationMinutes} min | {group.count} bookings</span>
              <select disabled={busy} value={selected?.serviceId ?? ''} className="block w-full rounded-lg border border-slate-300 p-2" onChange={(event) => {
                const service = services.find((item) => String(item.id) === event.target.value);
                setMappings((current) => [...current.filter((mapping) => mapping.key !== group.key), ...(service ? [{ key: group.key, serviceId: service.id, serviceName: service.name, price: service.price, taxRate: service.taxRate }] : [])]);
                setPricesReviewed(false);
                setConfirmed(false);
              }}>
                <option value="">Select a catalogue service</option>
                {services.filter((service) => service.active !== false && service.duration === group.durationMinutes && service.price > 0).map((service) => <option key={service.id} value={service.id}>{service.name} | ${(service.price / packageSessionCount(service.name)).toFixed(2)}{packageSessionCount(service.name) > 1 ? ' per session (4-session package)' : ''} + {service.taxRate * 100}% tax</option>)}
              </select>
            </label>;
          })}
          <button type="button" disabled={busy || !!catalogueError || mappings.length !== preview.priceGroups.length} onClick={() => void reviewPrices()} className="rounded-lg border border-slate-300 px-4 py-2 font-semibold disabled:opacity-50">Preview mapped prices</button>
          {pricesReviewed && <div className="space-y-2">
            <p className="font-semibold">Tax-inclusive total for this CSV: ${preview.approvedTotal.toFixed(2)}. Each mapped booking will be marked paid in full.</p>
            <label className="flex items-start gap-2"><input type="checkbox" disabled={busy} checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1" /><span>I confirm these historical bookings were paid and approve the reviewed current catalogue prices for their records and receipts. These prices may differ from the original charges.</span></label>
          </div>}
          <button type="button" disabled={busy || !preview.validBookings || !pricesReviewed || !confirmed} onClick={() => void importBookings()} className="rounded-lg bg-emerald-900 px-4 py-2 font-semibold text-white disabled:opacity-50">Import {preview.validBookings} paid bookings</button>
        </div>}
        {result && <p role="status" className="font-semibold text-emerald-800">Imported {result.imported} new paid bookings; updated {result.updated} zero-amount Wix records; skipped {result.existing} existing paid/receipt records. Issue receipts individually in Events & bookings (valid email required).</p>}
      </div>}
      <button type="button" disabled={busy} onClick={onViewBookings} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">View Events & bookings</button>
    </section>
  );
}
