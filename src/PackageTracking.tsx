import { useEffect, useState } from 'react';
import { readWixResponse } from './wixImportApi';

type Usage = { bookingId: string; remainingSessions: number; redeemedAt: string; allocatedTotal: number };
type Package = {
  package_id: string; email: string; customer_name: string; package_name: string;
  purchase_reference: string; purchase_date: string; duration_minutes: number;
  initial_remaining: number; remaining_sessions: number; subtotal: number; tax_rate: number; usages: Usage[];
};
type Booking = {
  id: string; email: string; customerName: string; serviceName: string; date: string; time: string;
  durationMinutes: number; status: string; receiptNumber: string; paymentOption: string; total: number;
};
type Form = {
  email: string; customerName: string; packageName: string; purchaseReference: string; purchaseDate: string;
  durationMinutes: string; remainingSessions: string; subtotal: string; taxRate: string; confirmed: boolean;
};
const initialForm: Form = {
  email: '', customerName: '', packageName: 'Package: 60 min x 4 Sessions',
  purchaseReference: '', purchaseDate: '', durationMinutes: '60', remainingSessions: '4',
  subtotal: '360', taxRate: '0.13', confirmed: false,
};
const message = (error: unknown) => error instanceof Error ? error.message : 'Unable to update packages.';
const post = <T,>(view: string, body: unknown) => fetch(`/api/booking?view=${view}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}).then((response) => readWixResponse<T>(response));

export default function PackageTracking({ onViewBookings }: { onViewBookings: () => void }) {
  const [form, setForm] = useState<Form>(initialForm);
  const [packages, setPackages] = useState<Package[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const [bookingId, setBookingId] = useState('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [confirmUse, setConfirmUse] = useState(false);
  const selected = packages.find((pkg) => pkg.package_id === selectedId);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ view: 'packages', search: query, offset: String(offset) });
    fetch(`/api/booking?${params}`, { signal: controller.signal })
      .then((response) => readWixResponse<{ packages: Package[]; total: number }>(response))
      .then((data) => { setPackages(data.packages); setTotal(data.total); })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(message(failure)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, offset, refresh]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    setBookings([]);
    fetch('/api/booking', { signal: controller.signal })
      .then((response) => readWixResponse<{ bookings: Booking[] }>(response))
      .then((data) => setBookings(data.bookings))
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(message(failure)); });
    return () => controller.abort();
  }, [selectedId, refresh]);

  const register = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const data = await post<{ package: Package }>('package-register', {
        ...form, durationMinutes: Number(form.durationMinutes), remainingSessions: Number(form.remainingSessions),
        subtotal: Number(form.subtotal), taxRate: Number(form.taxRate),
      });
      setNotice(`Package ${data.package.package_id} registered/verified. Remaining: ${data.package.remaining_sessions} of 4.`);
      setForm(initialForm);
      setQuery(''); setSearch(''); setOffset(0);
      setSelectedId(data.package.package_id);
      setRefresh((value) => value + 1);
    } catch (failure) { setError(message(failure)); } finally { setBusy(false); }
  };
  const redeem = async () => {
    if (!selected || !bookingId || !confirmUse) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const data = await post<{ alreadyLinked: boolean; usage: Usage }>('package-redeem', { packageId: selected.package_id, bookingId });
      setNotice(`${data.alreadyLinked ? 'Already linked; no duplicate deduction.' : 'Deducted one session.'} ${data.usage.remainingSessions} sessions remained after this visit. Receipt is now available in Events & bookings.`);
      setBookingId(''); setConfirmUse(false);
      setRefresh((value) => value + 1);
    } catch (failure) { setError(`${message(failure)} Refresh and retry if another update occurred; the same booking is never deducted twice.`); }
    finally { setBusy(false); }
  };
  const candidates = selected ? bookings.filter((booking) =>
    booking.email.trim().toLowerCase() === selected.email && booking.durationMinutes === selected.duration_minutes &&
    ['Confirmed', 'Completed'].includes(booking.status) && !booking.receiptNumber,
  ).sort((a, b) => `${a.date} ${a.id}`.localeCompare(`${b.date} ${b.id}`)) : [];
  const chosenBooking = candidates.find((booking) => booking.id === bookingId);

  return <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <h2 className="text-lg font-bold">Four-session package tracking</h2>
    <p className="text-sm text-slate-600">Register an owner-verified purchase and remaining balance. Then link each completed visit once to deduct a session. Wix exports do not establish package purchases. Register a new purchase with a different reference; reusing a reference never replenishes a balance.</p>
    <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">If entering a remaining balance that already accounts for old visits, do not deduct those visits again. To link old visits for receipt tracking, register the verified balance before those visits and link them chronologically. Use the actual package purchase price. A linked receipt records an allocated prepaid session value, not a new charge.</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
    <form onSubmit={(event) => void register(event)} className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-3">
      <h3 className="font-semibold sm:col-span-2 lg:col-span-3">Register / verify a package</h3>
      {([
        ['customerName', 'Customer name', 'text'], ['email', 'Customer email', 'email'],
        ['packageName', 'Package name', 'text'], ['purchaseReference', 'Unique purchase reference', 'text'],
        ['purchaseDate', 'Purchase date', 'date'], ['durationMinutes', 'Minutes per session', 'number'],
        ['remainingSessions', 'Verified sessions remaining (0-4)', 'number'], ['subtotal', 'Full four-session package price before tax ($)', 'number'],
      ] as const).map(([key, label, type]) => <label key={key} className="text-xs font-semibold">{label}
        <input required disabled={busy} type={type} value={form[key]} maxLength={200}
          min={key === 'remainingSessions' ? 0 : type === 'number' ? 1 : undefined}
          max={key === 'remainingSessions' ? 4 : key === 'durationMinutes' ? 240 : undefined}
          step={key === 'subtotal' ? '0.01' : type === 'number' ? 1 : undefined}
          onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value, confirmed: false }))}
          className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm" />
      </label>)}
      <label className="text-xs font-semibold">Tax rate<select disabled={busy} value={form.taxRate} onChange={(event) => setForm((current) => ({ ...current, taxRate: event.target.value, confirmed: false }))} className="mt-1 block w-full rounded-lg border p-2"><option value="0.13">13% HST - regular massage</option><option value="0">0% - RMT/acupuncture</option></select></label>
      <label className="flex items-start gap-2 text-xs sm:col-span-2 lg:col-span-3"><input type="checkbox" required disabled={busy} checked={form.confirmed} onChange={(event) => setForm((current) => ({ ...current, confirmed: event.target.checked }))} /><span>I have verified the prepaid purchase, full package price, and starting balance. This registration does not charge or email the customer.</span></label>
      <button disabled={busy || !form.confirmed} className="rounded-lg bg-emerald-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Register verified package</button>
    </form>
    <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); setQuery(search); setOffset(0); setSelectedId(''); setBookingId(''); setRefresh((value) => value + 1); }}>
      <input aria-label="Search packages by customer, email or purchase reference" value={search} maxLength={200} onChange={(event) => setSearch(event.target.value)} placeholder="Find customer / email / purchase reference" className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" />
      <button className="rounded-lg border px-3 text-sm font-semibold">Search / refresh</button>
    </form>
    {loading ? <p role="status">Loading packages...</p> : <div className="overflow-x-auto"><table className="w-full text-left text-xs">
      <thead><tr>{['Customer', 'Package / purchase', 'Balance', 'Tracked visits', 'Action'].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead>
      <tbody>{packages.map((pkg) => <tr key={pkg.package_id} className="border-t">
        <td className="p-3">{pkg.customer_name}<span className="block">{pkg.email}</span></td>
        <td className="p-3">{pkg.package_name} | {pkg.duration_minutes} min<span className="block">{pkg.purchase_reference} | {pkg.purchase_date}</span><span className="block font-mono">{pkg.package_id}</span></td>
        <td className="p-3 font-semibold">{pkg.remaining_sessions} / 4 remaining<span className="block font-normal">Starting verified balance: {pkg.initial_remaining}</span></td>
        <td className="p-3">{pkg.usages.length} linked visits</td>
        <td className="p-3"><button type="button" disabled={busy} className="rounded border px-3 py-2" onClick={() => { setSelectedId(pkg.package_id); setBookingId(''); setConfirmUse(false); }}>View / deduct</button></td>
      </tr>)}</tbody>
    </table>{!packages.length && <p className="p-3 text-sm">No matching packages.</p>}</div>}
    <div className="flex items-center gap-3 text-sm"><button disabled={busy || offset === 0} onClick={() => { setOffset(Math.max(0, offset - 50)); setSelectedId(''); }} className="rounded border p-2 disabled:opacity-40">Previous</button><span>{total} packages</span><button disabled={busy || offset + 50 >= total} onClick={() => { setOffset(offset + 50); setSelectedId(''); }} className="rounded border p-2 disabled:opacity-40">Next</button></div>
    {selected && <div className="space-y-3 rounded-xl border p-4">
      <h3 className="font-semibold">{selected.package_name} - {selected.remaining_sessions} sessions remaining</h3>
      <ul className="space-y-2 text-xs">{selected.usages.map((usage) => <li key={usage.bookingId}>{usage.bookingId} | 1 deducted | {usage.remainingSessions} remained after visit | allocated ${usage.allocatedTotal.toFixed(2)}</li>)}</ul>
      <label className="block text-sm">Link a completed booking<select disabled={busy} value={bookingId} onChange={(event) => { setBookingId(event.target.value); setConfirmUse(false); }} className="mt-1 block w-full rounded-lg border p-2"><option value="">Select a matching customer/duration booking</option>{candidates.map((booking) => <option key={booking.id} value={booking.id}>{booking.date} {booking.time} | {booking.serviceName} | {booking.id}</option>)}</select></label>
      {chosenBooking && <p className="text-xs text-amber-900">The session will be covered by this prepaid package. Its allocated total/paid amount replaces the booking amount before receipt issuance. No new payment is collected. Existing normal paid bookings are rejected; reconstructed Wix payments can be linked.</p>}
      <label className="flex gap-2 text-xs"><input type="checkbox" disabled={busy} checked={confirmUse} onChange={(event) => setConfirmUse(event.target.checked)} /><span>I confirm this visit occurred, belongs to this package, and has not already been deducted from the registered starting balance.</span></label>
      <button type="button" disabled={busy || !bookingId || !confirmUse || selected.remaining_sessions < 1} onClick={() => void redeem()} className="rounded-lg bg-emerald-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Deduct one session & link receipt</button>
    </div>}
    <button type="button" disabled={busy} onClick={onViewBookings} className="rounded border px-4 py-2 text-sm">View bookings / issue receipt</button>
  </section>;
}
