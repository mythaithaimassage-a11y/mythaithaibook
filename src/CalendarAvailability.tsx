import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { X } from 'lucide-react';
import TodayWorkSchedule from './TodayWorkSchedule';
import { useTranslation } from './localization';

type Props = Omit<ComponentProps<typeof TodayWorkSchedule>, 'onBusyChange'> & { onClose: () => void; error?: string };

export default function CalendarAvailability({ onClose, error, ...props }: Props) {
  const { translate: tr } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} aria-labelledby="calendar-availability-title" onCancel={(event) => {
    event.preventDefault();
    if (!busy) onClose();
  }} className="calendar-availability max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-3xl overflow-y-auto overscroll-contain rounded-2xl bg-white p-0 shadow-2xl backdrop:bg-slate-950/55">
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4">
      <h2 id="calendar-availability-title" className="text-base font-bold text-slate-900">{tr('Therapist availability')}</h2>
      <button type="button" disabled={busy} onClick={onClose} title={tr('Close availability')} aria-label={tr('Close availability')} className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X aria-hidden="true" className="h-5 w-5" /></button>
    </div>
    {error && <p role="alert" className="m-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{tr(error)}</p>}
    <TodayWorkSchedule {...props} onBusyChange={setBusy} />
  </dialog>;
}
