import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { message, useTranslation, type TranslationMessage } from './localization';
import { branchAppointmentTimes, type WeeklyBusinessHours } from '../lib/booking-options.js';
import useTherapistAvailability from './useTherapistAvailability';
import { validateBookingContact } from '../lib/booking-contact.js';

type Branch = { id: number; name: string; active?: boolean; businessHours?: WeeklyBusinessHours };
type Service = { id: number; name: string; active?: boolean; isRmt?: boolean; duration?: number; price?: number };
type Therapist = { id: number; name: string; active?: boolean; rmtCertified?: boolean };
type Customer = { name: string; email: string; phone: string };
type Props = {
  branches: Branch[];
  services: Service[];
  therapists: Therapist[];
  times: string[];
  date: string;
  branchId: string;
  therapistId: string;
  time?: string;
  onClose: () => void;
  onSaved: (appointment: { date: string; branchId: string; therapistId: string; notice: string | TranslationMessage }) => Promise<void>;
};

export default function QuickBooking(props: Props) {
  const { translate: tr, formatTime } = useTranslation();
  const activeServices = props.services.filter((item) => item.active !== false);
  const couplePackages = activeServices.filter((item) => /couple/i.test(item.name) && [60, 90].includes(item.duration ?? 0));
  const singleServices = activeServices.filter((item) => !/couple/i.test(item.name));
  const initialService = activeServices.find((item) => singleServices.includes(item) || couplePackages.includes(item));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [bookingNote, setBookingNote] = useState('');
  const [date, setDate] = useState(props.date);
  const [branchId, setBranchId] = useState(props.branchId === 'all' ? String(props.branches.find((branch) => branch.active !== false)?.id || '') : props.branchId);
  const [serviceId, setServiceId] = useState(String(initialService?.id || ''));
  const [couplePackage, setCouplePackage] = useState(Boolean(initialService && couplePackages.includes(initialService)));
  const [therapistId, setTherapistId] = useState(props.therapistId === 'all' ? '' : props.therapistId);
  const [therapistId2, setTherapistId2] = useState('');
  const [time, setTime] = useState(props.time || props.times[0] || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [activeCustomer, setActiveCustomer] = useState(-1);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [phone, setPhone] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const selectableServices = couplePackage ? couplePackages : singleServices;
  const service = selectableServices.find((item) => String(item.id) === serviceId);
  const branch = props.branches.find((item) => String(item.id) === branchId);
  const availableTimes = date && branch ? branchAppointmentTimes(branch, date, service?.duration ?? 60) : [];
  const validTime = availableTimes.includes(time) ? time : '';
  const couple = couplePackage;
  const availability = useTherapistAvailability({
    branchId, date, time: validTime, durationMinutes: service?.duration ?? 60, isRmt: Boolean(service?.isRmt),
  });
  const therapists = props.therapists.filter((item) => item.active !== false
    && (!service?.isRmt || item.rmtCertified)
    && availability.therapistIds.has(String(item.id)));
  const validTherapistId = therapists.some((item) => String(item.id) === therapistId) ? therapistId : '';
  const validTherapistId2 = therapists.some((item) => String(item.id) === therapistId2 && String(item.id) !== validTherapistId) ? therapistId2 : '';

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  useEffect(() => {
    if (!searchOpen || !name.trim()) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/booking?${new URLSearchParams({ view: 'customer-search', search: name.trim() })}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Unable to search customers. You can still enter a new client manually.');
        if (!Array.isArray(data.customers) || !data.customers.every((customer: Customer) => customer &&
            typeof customer.name === 'string' && typeof customer.email === 'string' && typeof customer.phone === 'string')) {
          throw new Error('Unable to search customers. You can still enter a new client manually.');
        }
        if (!controller.signal.aborted) setCustomers(data.customers);
      } catch (failure) {
        if (!controller.signal.aborted) setSearchError(failure instanceof Error ? failure.message : 'Unable to search customers. You can still enter a new client manually.');
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [name, searchOpen]);

  const selectCustomer = (customer: Customer) => {
    setName(customer.name);
    setEmail(customer.email);
    setPhone(customer.phone);
    setSelectedCustomer(customer);
    setSearchOpen(false);
    setCustomers([]);
    setActiveCustomer(-1);
  };

  const toggleCouplePackage = (checked: boolean) => {
    const choices = checked ? couplePackages : singleServices;
    const nextService = choices.find((item) => item.duration === service?.duration) || choices[0];
    setCouplePackage(checked);
    setServiceId(nextService ? String(nextService.id) : '');
    setTherapistId2('');
    setError('');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError('');
    try {
      if (!service) throw new Error('Choose an available service or couple package.');
      const contactDetails = validateBookingContact({ email, phone });
      const response = await fetch('/api/booking?view=manual-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerName: name, ...contactDetails, branchId, serviceId, therapistId: validTherapistId, therapistId2: couple ? validTherapistId2 : '', date, time: validTime, bookingNote }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to save this appointment.');
      const customerConfirmation = data.emailSkipped ? message('Phone-only booking; no email confirmation sent.')
        : data.emailSent ? message('Confirmation email sent.') : message('Confirmation email was not sent: {error}', { error: message(data.emailError || '') });
      const confirmation = data.staffNotificationError
        ? message('{confirmation} Staff booking alert failed: {error}', { confirmation: customerConfirmation, error: data.staffNotificationError })
        : customerConfirmation;
      await props.onSaved({ date, branchId, therapistId: validTherapistId, notice: message('Appointment {id} saved. No payment collected. {confirmation}', { id: data.bookingId, confirmation }) });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save this appointment.');
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };
  const inputClass = 'mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm font-normal text-stone-900';

  return (
    <dialog ref={dialog} onCancel={(event) => { event.preventDefault(); if (!saving) props.onClose(); }} aria-labelledby="quick-booking-title" className="w-[calc(100%_-_2rem)] max-w-lg rounded-2xl bg-white p-0 shadow-xl backdrop:bg-slate-950/55">
      <div className="flex items-center justify-between border-b border-stone-200 p-5">
        <div><h2 id="quick-booking-title" className="text-lg font-bold text-stone-900">{tr('Quick appointment')}</h2><p className="mt-1 text-xs text-stone-500">{tr('Save now. Handle payment and medical history separately.')}</p></div>
        <button type="button" disabled={saving} onClick={props.onClose} aria-label={tr('Close quick appointment')} className="rounded-lg p-2 hover:bg-stone-100 disabled:opacity-50"><X className="h-5 w-5" /></button>
      </div>
      <label className="block text-xs font-bold text-stone-700">{tr('Internal booking note (optional)')}
        <textarea maxLength={2000} rows={2} value={bookingNote} onChange={(event) => setBookingNote(event.target.value)} placeholder={tr('For the clinic team, e.g. client requested Tanya')} className={inputClass} />
        <span className="mt-1 block font-normal text-stone-500">{tr('Shared with authorized staff and the assigned therapist. Not included in customer emails or receipts. Do not enter medical information here.')}</span>
      </label>
      <form onSubmit={submit} className="space-y-4 p-5">
        <div className="relative" onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false);
        }}>
          <label className="block text-xs font-bold text-stone-700">{tr('Client name')}<input autoFocus required maxLength={150} value={name} onChange={(event) => {
            setName(event.target.value);
            setCustomers([]);
            setSearchError('');
            setSearching(Boolean(event.target.value.trim()));
            setActiveCustomer(-1);
            setSelectedCustomer(null);
            setSearchOpen(true);
          }} onFocus={() => {
            if (!selectedCustomer && name.trim()) {
              setSearchError('');
              setSearching(true);
              setSearchOpen(true);
            }
          }} onKeyDown={(event) => {
            if (event.key === 'Escape' && searchOpen) {
              event.preventDefault();
              event.stopPropagation();
              setSearchOpen(false);
            } else if (searchOpen && customers.length && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
              event.preventDefault();
              setActiveCustomer((current) => event.key === 'ArrowDown' ? (current + 1) % customers.length : (current <= 0 ? customers.length - 1 : current - 1));
            } else if (event.key === 'Enter' && searchOpen && activeCustomer >= 0 && customers[activeCustomer]) {
              event.preventDefault();
              selectCustomer(customers[activeCustomer]);
            }
          }} role="combobox" aria-autocomplete="list" aria-expanded={searchOpen && Boolean(name.trim())}
            aria-controls={searchOpen && name.trim() ? 'quick-booking-customers' : undefined} aria-activedescendant={searchOpen && activeCustomer >= 0 ? `quick-booking-customer-${activeCustomer}` : undefined}
            autoComplete="off" placeholder={tr('Search existing customers by name, email or phone')} className={inputClass} /></label>
          {searchOpen && name.trim() && <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-stone-200 bg-white p-1 shadow-lg">
            {searching && <p role="status" className="p-2 text-xs text-stone-500">{tr('Searching customers...')}</p>}
            {searchError && <p role="alert" className="p-2 text-xs text-red-700">{tr(searchError)}</p>}
            {!searching && !searchError && customers.length === 0 && <p role="status" className="p-2 text-xs text-stone-500">{tr('No matching customers. Enter a new client name and contact details.')}</p>}
            <div id="quick-booking-customers" role="listbox" aria-label={tr('Existing customers')}>
              {customers.map((customer, index) => <button key={`${customer.email}-${customer.phone}`} id={`quick-booking-customer-${index}`} type="button" role="option"
                aria-selected={activeCustomer === index} onMouseDown={(event) => event.preventDefault()} onClick={() => selectCustomer(customer)}
                className={`block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-blue-50 ${activeCustomer === index ? 'bg-blue-50' : ''}`}>
                <span className="block font-semibold text-stone-900">{customer.name || customer.email || customer.phone}</span>
                <span className="block text-xs text-stone-500">{[customer.email, customer.phone].filter(Boolean).join(' / ')}</span>
              </button>)}
            </div>
          </div>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-bold text-stone-700">{tr('Email')}<input type="email" autoComplete="email" required={!phone.trim()} maxLength={254} value={email} onChange={(event) => {
            setEmail(event.target.value);
            setSelectedCustomer(null);
          }} aria-describedby="quick-booking-contact-help" placeholder="client@example.com" className={inputClass} /></label>
          <label className="block text-xs font-bold text-stone-700">{tr('Phone')}<input type="tel" autoComplete="tel" required={!email.trim()} maxLength={40} value={phone} onChange={(event) => {
            setPhone(event.target.value);
            setSelectedCustomer(null);
          }} aria-describedby="quick-booking-contact-help" placeholder="+1 437 898 7424" className={inputClass} /></label>
        </div>
        <p id="quick-booking-contact-help" className="text-xs text-stone-500">{tr('Enter at least one email address or phone number.')}</p>
        <label className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-stone-800">
          <input type="checkbox" checked={couplePackage} disabled={saving} onChange={(event) => toggleCouplePackage(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-blue-600" />
          <span>{tr('Couple massage (2 people)')}<span className="mt-1 block text-xs font-normal text-stone-600">{tr('Two massages at the same start time, both 60 or both 90 minutes. Uses the existing couple package price.')}</span></span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-bold text-stone-700">{tr('Therapist')}<select required value={validTherapistId} onChange={(event) => setTherapistId(event.target.value)} className={inputClass}><option value="">{tr('Choose therapist')}</option>{therapists.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="text-xs font-bold text-stone-700">{tr('Time')}<select required value={validTime} onChange={(event) => setTime(event.target.value)} className={inputClass}><option value="">{tr('Choose time')}</option>{availableTimes.map((value) => <option key={value} value={value}>{formatTime(value)}</option>)}</select></label>
          {couple && <label className="col-span-2 text-xs font-bold text-stone-700">{tr('Second therapist')}<select required value={validTherapistId2} onChange={(event) => setTherapistId2(event.target.value)} className={inputClass}><option value="">{tr('Choose a different therapist')}</option>{therapists.filter((item) => String(item.id) !== validTherapistId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
          <label className="text-xs font-bold text-stone-700">{tr('Date')}<input type="date" required value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} /></label>
          <label className="text-xs font-bold text-stone-700">{tr('Branch')}<select required value={branchId} onChange={(event) => setBranchId(event.target.value)} className={inputClass}>{props.branches.filter((item) => item.active !== false).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="col-span-2 text-xs font-bold text-stone-700">{tr(couplePackage ? 'Couple package' : 'Service')}<select required value={service ? serviceId : ''} onChange={(event) => { setServiceId(event.target.value); setTherapistId2(''); }} className={inputClass}>
            <option value="">{tr(couplePackage ? 'Choose a couple package' : 'Choose a service')}</option>
            {selectableServices.map((item) => <option key={item.id} value={item.id}>{tr(item.name)}{couplePackage && item.price !== undefined ? ` - $${item.price.toFixed(2)}` : ''}</option>)}
          </select></label>
        </div>
        {couplePackage && couplePackages.length === 0 && <p role="alert" className="text-xs text-amber-800">{tr('No active 60- or 90-minute couple packages are available. Configure a couple package in Services or turn off couple booking.')}</p>}
        {couple && validTime && !availability.loading && !availability.error && therapists.length < 2 && <p role="alert" className="text-xs text-amber-800">{tr('Two different therapists must be available at the same time for a couple massage. Choose another time.')}</p>}
        {availableTimes.length === 0 && <p role="alert" className="text-xs text-amber-800">{tr('No appointment times fit the business hours for this branch, date and service.')}</p>}
        {availability.loading && <p role="status" className="text-xs text-stone-600">{tr('Checking therapist availability…')}</p>}
        {availability.error && <p role="alert" className="text-xs text-red-800">{tr(availability.error)}</p>}
        {!availability.loading && !availability.error && validTime && therapists.length === 0 && <p role="alert" className="text-xs text-amber-800">{tr('No eligible therapists are available for this branch, date, time, and service. Choose different appointment details.')}</p>}
        {!availability.loading && !availability.error && validTime && availability.unavailableTherapists?.length > 0 && <details className="text-xs text-stone-700">
          <summary className="cursor-pointer font-semibold">{tr('Why is a therapist unavailable?')}</summary>
          <ul className="mt-2 space-y-2">{availability.unavailableTherapists.map((item) => <li key={item.id}><strong>{item.name}:</strong> {tr(item.reason)}</li>)}</ul>
        </details>}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{tr(error)}</p>}
        <div className="flex justify-end gap-2"><button type="button" disabled={saving} onClick={props.onClose} className="rounded-lg border border-stone-300 px-4 py-2 text-sm">{tr('Cancel')}</button><button type="submit" disabled={saving || availability.loading || Boolean(availability.error) || !therapists.length || !validTime || !service || (couple && !validTherapistId2)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">{tr(saving ? 'Saving...' : 'Save appointment')}</button></div>
      </form>
    </dialog>
  );
}
