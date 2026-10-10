import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

type Branch = { id: number; name: string; active?: boolean };
type Service = { id: number; name: string; active?: boolean; isRmt?: boolean };
type Therapist = { id: number; name: string; active?: boolean; rmtCertified?: boolean };
type Props = {
  branches: Branch[];
  services: Service[];
  therapists: Therapist[];
  times: string[];
  date: string;
  branchId: string;
  therapistId: string;
  time?: string;
  isScheduled: (therapist: Therapist, branchId: string, date: string) => boolean;
  onClose: () => void;
  onSaved: (appointment: { date: string; branchId: string; therapistId: string; notice: string }) => Promise<void>;
};

export default function QuickBooking(props: Props) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [date, setDate] = useState(props.date);
  const [branchId, setBranchId] = useState(props.branchId === 'all' ? String(props.branches.find((branch) => branch.active !== false)?.id || '') : props.branchId);
  const [serviceId, setServiceId] = useState(String(props.services.find((service) => service.active !== false)?.id || ''));
  const [therapistId, setTherapistId] = useState(props.therapistId === 'all' ? '' : props.therapistId);
  const [therapistId2, setTherapistId2] = useState('');
  const [time, setTime] = useState(props.time || props.times[0] || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const service = props.services.find((item) => String(item.id) === serviceId);
  const couple = /couple/i.test(service?.name || '');
  const therapists = props.therapists.filter((item) => item.active !== false
    && props.isScheduled(item, branchId, date) && (!service?.isRmt || item.rmtCertified));
  const validTherapistId = therapists.some((item) => String(item.id) === therapistId) ? therapistId : '';
  const validTherapistId2 = therapists.some((item) => String(item.id) === therapistId2 && String(item.id) !== validTherapistId) ? therapistId2 : '';

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/booking?view=manual-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerName: name, contact, branchId, serviceId, therapistId: validTherapistId, therapistId2: couple ? validTherapistId2 : '', date, time }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to save this appointment.');
      const confirmation = data.emailSkipped ? 'Phone-only booking; no email confirmation sent.'
        : data.emailSent ? 'Confirmation email sent.' : `Confirmation email was not sent: ${data.emailError}`;
      await props.onSaved({ date, branchId, therapistId: validTherapistId, notice: `Appointment ${data.bookingId} saved. No payment collected. ${confirmation}` });
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
        <div><h2 id="quick-booking-title" className="text-lg font-bold text-stone-900">Quick appointment</h2><p className="mt-1 text-xs text-stone-500">Save now. Handle payment and medical history separately.</p></div>
        <button type="button" disabled={saving} onClick={props.onClose} aria-label="Close quick appointment" className="rounded-lg p-2 hover:bg-stone-100 disabled:opacity-50"><X className="h-5 w-5" /></button>
      </div>
      <form onSubmit={submit} className="space-y-4 p-5">
        <label className="block text-xs font-bold text-stone-700">Client name<input autoFocus required maxLength={150} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className={inputClass} /></label>
        <label className="block text-xs font-bold text-stone-700">Email or phone number<input required maxLength={254} value={contact} onChange={(event) => setContact(event.target.value)} placeholder="client@example.com or +1 437 898 7424" className={inputClass} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-bold text-stone-700">Therapist<select required value={validTherapistId} onChange={(event) => setTherapistId(event.target.value)} className={inputClass}><option value="">Choose therapist</option>{therapists.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="text-xs font-bold text-stone-700">Time<select required value={time} onChange={(event) => setTime(event.target.value)} className={inputClass}>{props.times.map((value) => <option key={value}>{value}</option>)}</select></label>
          {couple && <label className="col-span-2 text-xs font-bold text-stone-700">Second therapist<select required value={validTherapistId2} onChange={(event) => setTherapistId2(event.target.value)} className={inputClass}><option value="">Choose a different therapist</option>{therapists.filter((item) => String(item.id) !== validTherapistId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
          <label className="text-xs font-bold text-stone-700">Date<input type="date" required value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} /></label>
          <label className="text-xs font-bold text-stone-700">Branch<select required value={branchId} onChange={(event) => setBranchId(event.target.value)} className={inputClass}>{props.branches.filter((item) => item.active !== false).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="col-span-2 text-xs font-bold text-stone-700">Service<select required value={serviceId} onChange={(event) => setServiceId(event.target.value)} className={inputClass}>{props.services.filter((item) => item.active !== false).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </div>
        {therapists.length === 0 && <p role="alert" className="text-xs text-amber-800">No eligible therapists are scheduled for this branch, date, and service. Choose different appointment details.</p>}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" disabled={saving} onClick={props.onClose} className="rounded-lg border border-stone-300 px-4 py-2 text-sm">Cancel</button><button type="submit" disabled={saving || !therapists.length} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save appointment'}</button></div>
      </form>
    </dialog>
  );
}
