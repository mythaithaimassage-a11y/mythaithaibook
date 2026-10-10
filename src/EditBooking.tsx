import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from './localization';
import { bookingTaxTreatment, HST_RATE, isCashPayment, preTaxSubtotal, taxOn } from '../lib/booking-tax.js';
import { branchAppointmentTimes, type WeeklyBusinessHours } from '../lib/booking-options.js';

export type EditableBooking = {
  id: string; customerName: string; email: string; phone: string; bookingNote?: string;
  branchName: string; serviceName: string; therapistName: string; date: string; time: string;
  paymentOption: string; total: number; paidAmount: number; editVersion: string;
  receiptNumber?: string; paymentLocked?: boolean;
  manualBookingDiscount?: number; originalBookingTotal?: number;
  durationMinutes?: number;
};
type Service = { id: number; name: string; price: number; duration: number; taxRate: number; active?: boolean; isRmt?: boolean };
type Therapist = { id: number; name: string; active?: boolean; rmtCertified?: boolean };
type Props = {
  booking: EditableBooking; services: Service[]; therapists: Therapist[];
  times: string[]; isScheduled: (therapist: Therapist, date: string) => boolean;
  branch?: { businessHours?: WeeklyBusinessHours };
  onClose: () => void; onSaved: (booking: EditableBooking) => Promise<void>;
};

export default function EditBooking({ booking, services, therapists, times, branch, isScheduled, onClose, onSaved }: Props) {
  const { translate: tr, formatTime } = useTranslation();
  const [form, setForm] = useState(() => ({
    customerName: booking.customerName, email: booking.email, phone: booking.phone,
    bookingNote: booking.bookingNote || '', date: booking.date, time: booking.time,
    total: String(booking.receiptNumber || booking.paymentLocked ? booking.total : booking.originalBookingTotal ?? booking.total),
    paidAmount: String(booking.paidAmount),
    manualDiscount: String(booking.manualBookingDiscount || 0),
    paymentOption: booking.paymentOption || '',
    serviceId: String(services.find((service) => service.name === booking.serviceName)?.id || '__existing__'),
  }));
  const exactTherapist = therapists.find((therapist) => booking.therapistName === therapist.name);
  const assigned = exactTherapist ? [exactTherapist] : therapists.filter((therapist) =>
    booking.therapistName.split(',').map((name) => name.trim()).includes(therapist.name));
  const [therapist1, setTherapist1] = useState(assigned[0]?.name || booking.therapistName);
  const [therapist2, setTherapist2] = useState(assigned[1]?.name || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const locked = Boolean(booking.receiptNumber || booking.paymentLocked);
  const service = services.find((item) => String(item.id) === form.serviceId);
  const availableTimes = branch && form.date ? branchAppointmentTimes(branch, form.date, service?.duration ?? booking.durationMinutes ?? 60) : times;
  const preservingSchedule = form.date === booking.date && service?.name === booking.serviceName;
  const timeChoices = [...new Set([...(locked || preservingSchedule || form.serviceId === '__existing__' && form.date === booking.date ? [booking.time] : []), ...availableTimes])];
  const validTime = timeChoices.includes(form.time) ? form.time : '';
  const couple = /couple/i.test(service?.name || booking.serviceName) && (assigned.length > 0 || form.serviceId !== '__existing__');
  const eligible = therapists.filter((item) => item.active !== false && isScheduled(item, form.date) && (!service?.isRmt || item.rmtCertified));
  const choices = therapists.filter((item) => eligible.includes(item) || assigned.includes(item));
  const serviceName = service?.name || booking.serviceName;
  const discountChanged = !locked && (Number(form.manualDiscount) !== (booking.manualBookingDiscount || 0) ||
    Boolean(booking.manualBookingDiscount && (Number(form.total) !== booking.originalBookingTotal || serviceName !== booking.serviceName ||
      isCashPayment(form.paymentOption) !== isCashPayment(booking.paymentOption))));
  const taxTreatment = bookingTaxTreatment(serviceName, form.paymentOption);
  const subtotal = preTaxSubtotal(Number(form.total), serviceName, form.paymentOption);
  const remaining = Math.round((subtotal - Number(form.manualDiscount || 0)) * 100) / 100;
  const discountedTotal = Number(form.manualDiscount) > 0 ? Math.round((remaining + taxOn(remaining, serviceName, form.paymentOption)) * 100) / 100 : Number(form.total);
  const round = (value: number) => Math.round(value * 100) / 100;
  const update = (key: keyof typeof form, value: string) => {
    setForm((current) => {
      const next = { ...current, [key]: value };
      // Cash is charged without HST, so switching to or from cash re-prices a taxable appointment.
      const name = services.find((item) => String(item.id) === next.serviceId)?.name || booking.serviceName;
      if (key === 'paymentOption' && isCashPayment(value) !== isCashPayment(current.paymentOption) &&
          bookingTaxTreatment(name, 'Card').taxable && Number.isFinite(Number(current.total))) {
        const oldTotal = Number(current.total), paid = Number(current.paidAmount) || 0;
        const newTotal = round(isCashPayment(value) ? oldTotal / (1 + HST_RATE) : oldTotal * (1 + HST_RATE));
        next.total = newTotal.toFixed(2);
        next.paidAmount = (oldTotal > 0 && paid + 0.005 >= oldTotal ? newTotal : Math.min(paid, newTotal)).toFixed(2);
      }
      return next;
    });
    if (['manualDiscount', 'total', 'serviceId', 'paymentOption'].includes(key)) setConfirmed(false);
  };
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
        body: JSON.stringify({ ...form, confirmReconciliation: confirmed, bookingId: booking.id, expectedVersion: booking.editVersion, therapistNames: couple ? [therapist1, therapist2] : [therapist1] }),
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
          <label className="text-xs font-semibold">{tr('Time')}<select required disabled={locked} value={validTime} onChange={(event) => update('time', event.target.value)} className={inputClass}><option value="">{tr('Choose time')}</option>{timeChoices.map((time) => <option key={time} value={time}>{formatTime(time)}</option>)}</select></label>
          <label className="text-xs font-semibold">{tr('Therapist')}<select required value={therapist1} onChange={(event) => setTherapist1(event.target.value)} className={inputClass}><option value="">{tr('Choose therapist')}</option>{!choices.some((item) => item.name === therapist1) && therapist1 && <option value={therapist1}>{therapist1}</option>}{choices.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label>
          {couple && <label className="text-xs font-semibold">{tr('Second therapist')}<select required value={therapist2} onChange={(event) => setTherapist2(event.target.value)} className={inputClass}><option value="">{tr('Choose a different therapist')}</option>{choices.filter((item) => item.name !== therapist1).map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label>}
          <label className="text-xs font-semibold">{tr('Payment method')}<select required disabled={locked} value={form.paymentOption} onChange={(event) => update('paymentOption', event.target.value)} className={inputClass}>{[...new Set([form.paymentOption, 'Cash', 'Card', 'E-transfer', 'Other'])].map((value) => <option key={value} value={value}>{tr(value)}</option>)}</select></label>
          <label className="text-xs font-semibold">{tr('Appointment total ($)')}<input type="number" required min="0" step="0.01" disabled={locked} value={form.total} onChange={(event) => update('total', event.target.value)} className={inputClass} /></label>
          <label className="text-xs font-semibold">{tr('Manual discount ($) — optional')}<input type="number" min="0" max={subtotal} step="0.01" disabled={locked} value={form.manualDiscount} onChange={(event) => update('manualDiscount', event.target.value)} className={inputClass} /></label>
          <label className="text-xs font-semibold sm:col-span-2">{tr('Shared internal booking note')}<textarea rows={3} maxLength={2000} value={form.bookingNote} onChange={(event) => update('bookingNote', event.target.value)} className={inputClass} /></label>
        </fieldset>
        {!locked && <p role="status" className="text-xs text-slate-600">{tr('Total after discount: $')}{Number.isFinite(discountedTotal) ? discountedTotal.toFixed(2) : '—'} · {tr(taxTreatment.label)}</p>}
        <p className="text-xs text-slate-500">{tr('Cash payments are not charged HST; card and other payments include 13% HST. Changing to or from cash recalculates the appointment total.')}</p>
        <p className="text-xs text-slate-500">{tr('Discounts are deducted before HST. Saved totals sync to bookings, calendar and receipts. No payment or refund is sent automatically.')}</p>
        {discountChanged && <label className="flex items-start gap-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-950"><input type="checkbox" checked={confirmed} disabled={saving} onChange={(event) => setConfirmed(event.target.checked)} /><span><strong className="block">{tr('Confirm reconciliation')}</strong>{tr('I confirm any external payment adjustment or refund has been handled. Save the discounted total and reconciled payment record.')}</span></label>}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{tr(error)}</p>}
        <div className="flex justify-end gap-2"><button type="button" disabled={saving} onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">{tr('Cancel')}</button><button disabled={saving || (discountChanged && !confirmed)} type="submit" className="rounded-lg bg-emerald-900 px-4 py-2 text-sm text-white">{tr(saving ? 'Saving…' : 'Save booking')}</button></div>
      </form>
    </dialog>
  );
}
