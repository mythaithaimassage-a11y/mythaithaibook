import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from './localization';

export type EditableBooking = {
  id: string; customerName: string; email: string; phone: string; bookingNote?: string;
  branchName: string; serviceName: string; therapistName: string; date: string; time: string;
  paymentOption: string; total: number; paidAmount: number; editVersion: string;
  receiptNumber?: string; paymentLocked?: boolean;
};
type Service = { id: number; name: string; price: number; duration: number; taxRate: number; active?: boolean; isRmt?: boolean };
type Therapist = { id: number; name: string; active?: boolean; rmtCertified?: boolean };
type Props = {
  booking: EditableBooking; services: Service[]; therapists: Therapist[];
  times: string[]; isScheduled: (therapist: Therapist, date: string) => boolean;
  onClose: () => void; onSaved: (booking: EditableBooking) => Promise<void>;
};

export default function EditBooking({ booking, services, therapists, times, isScheduled, onClose, onSaved }: Props) {
  const { translate: tr, formatTime } = useTranslation();
  const [form, setForm] = useState(() => ({
    customerName: booking.customerName, email: booking.email, phone: booking.phone,
    bookingNote: booking.bookingNote || '', date: booking.date, time: booking.time,
    total: String(booking.total), paidAmount: String(booking.paidAmount),
    paymentOption: booking.paymentOption || (booking.receiptNumber || booking.paymentLocked ? '' : 'Cash'),
    serviceId: String(services.find((service) => service.name === booking.serviceName)?.id || '__existing__'),
  }));
  const exactTherapist = therapists.find((therapist) => booking.therapistName === therapist.name);
  const assigned = exactTherapist ? [exactTherapist] : therapists.filter((therapist) =>
    booking.therapistName.split(',').map((name) => name.trim()).includes(therapist.name));
  const [therapist1, setTherapist1] = useState(assigned[0]?.name || booking.therapistName);
  const [therapist2, setTherapist2] = useState(assigned[1]?.name || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const locked = Boolean(booking.receiptNumber || booking.paymentLocked);
  const service = services.find((item) => String(item.id) === form.serviceId);
  const couple = /couple/i.test(service?.name || booking.serviceName) && (assigned.length > 0 || form.serviceId !== '__existing__');
  const eligible = therapists.filter((item) => item.active !== false && isScheduled(item, form.date) && (!service?.isRmt || item.rmtCertified));
  const choices = therapists.filter((item) => eligible.includes(item) || assigned.includes(item));
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/booking?view=edit-booking', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, bookingId: booking.id, expectedVersion: booking.editVersion, therapistNames: couple ? [therapist1, therapist2] : [therapist1] }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to save this booking.');
      await onSaved(data.booking);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to save this booking.');
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }
  const inputClass = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100';
  return (
    <dialog ref={dialog} aria-labelledby="edit-booking-title" onCancel={(event) => { event.preventDefault(); if (!saving) onClose(); }} className="w-[calc(100%_-_2rem)] max-w-xl rounded-2xl p-0 shadow-xl backdrop:bg-slate-950/55">
      <div className="flex items-center justify-between border-b p-5"><h2 id="edit-booking-title" className="font-bold">{tr('Edit booking')} · {booking.id}</h2><button type="button" disabled={saving} aria-label={tr('Close booking editor')} onClick={onClose}><X /></button></div>
      <form onSubmit={save} className="space-y-4 p-5">
        <p className="text-xs text-slate-600">{tr('Changes update the database and linked calendar appointment. No payment or refund is sent automatically.')}</p>
        {locked && <p role="status" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{tr('Issued receipts, prepaid packages and membership records lock customer, service, schedule and payment details. You can still edit the shared note and therapist.')}</p>}
        <fieldset disabled={saving} className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold">{tr('Client name')}<input required maxLength={150} disabled={locked} value={form.customerName} onChange={(event) => update('customerName', event.target.value)} className={inputClass} /></label>
          <label className="text-xs font-semibold">{tr('Email')}<input type="email" maxLength={254} disabled={locked} value={form.email} onChange={(event) => update('email', event.target.value)} className={inputClass} /></label>
          <label className="text-xs font-semibold">{tr('Phone')}<input type="tel" maxLength={40} disabled={locked} value={form.phone} onChange={(event) => update('phone', event.target.value)} className={inputClass} /></label>
          <label className="text-xs font-semibold">{tr('Service')}<select required disabled={locked} value={form.serviceId} onChange={(event) => update('serviceId', event.target.value)} className={inputClass}><option value="">{tr('Choose service')}</option>{!services.some((item) => item.name === booking.serviceName) && <option value="__existing__">{tr(booking.serviceName)}</option>}{services.filter((item) => item.active !== false || item.name === booking.serviceName).map((item) => <option key={item.id} value={item.id}>{tr(item.name)}</option>)}</select></label>
          <label className="text-xs font-semibold">{tr('Date')}<input type="date" required disabled={locked} value={form.date} onChange={(event) => update('date', event.target.value)} className={inputClass} /></label>
          <label className="text-xs font-semibold">{tr('Time')}<select required disabled={locked} value={form.time} onChange={(event) => update('time', event.target.value)} className={inputClass}>{[...new Set([form.time, ...times])].filter(Boolean).map((time) => <option key={time} value={time}>{formatTime(time)}</option>)}</select></label>
          <label className="text-xs font-semibold">{tr('Therapist')}<select required value={therapist1} onChange={(event) => setTherapist1(event.target.value)} className={inputClass}><option value="">{tr('Choose therapist')}</option>{!choices.some((item) => item.name === therapist1) && therapist1 && <option value={therapist1}>{therapist1}</option>}{choices.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label>
          {couple && <label className="text-xs font-semibold">{tr('Second therapist')}<select required value={therapist2} onChange={(event) => setTherapist2(event.target.value)} className={inputClass}><option value="">{tr('Choose a different therapist')}</option>{choices.filter((item) => item.name !== therapist1).map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label>}
          <label className="text-xs font-semibold">{tr('Payment method')}<select required disabled={locked} value={form.paymentOption} onChange={(event) => update('paymentOption', event.target.value)} className={inputClass}>{[...new Set([form.paymentOption, 'Cash', 'Card', 'E-transfer', 'Other'])].map((value) => <option key={value} value={value}>{tr(value)}</option>)}</select></label>
          <label className="text-xs font-semibold">{tr('Appointment total ($)')}<input type="number" required min="0" step="0.01" disabled={locked} value={form.total} onChange={(event) => update('total', event.target.value)} className={inputClass} /></label>
          <label className="text-xs font-semibold">{tr('Amount paid ($)')}<input type="number" required min="0" max={form.total} step="0.01" disabled={locked} value={form.paidAmount} onChange={(event) => update('paidAmount', event.target.value)} className={inputClass} /></label>
          <label className="text-xs font-semibold sm:col-span-2">{tr('Shared internal booking note')}<textarea rows={3} maxLength={2000} value={form.bookingNote} onChange={(event) => update('bookingNote', event.target.value)} className={inputClass} /></label>
        </fieldset>
        <p className="text-xs text-slate-500">{tr('Review the total and amount paid when changing a service. Use receipt reconciliation for manual discounts.')}</p>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{tr(error)}</p>}
        <div className="flex justify-end gap-2"><button type="button" disabled={saving} onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">{tr('Cancel')}</button><button disabled={saving} type="submit" className="rounded-lg bg-emerald-900 px-4 py-2 text-sm text-white">{tr(saving ? 'Saving…' : 'Save booking')}</button></div>
      </form>
    </dialog>
  );
}
