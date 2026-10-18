import { useEffect, useRef, type RefObject } from 'react';

interface CalendarGesturesOptions {
  panelRef: RefObject<HTMLElement>;
  enabled: boolean;
  fullscreen: boolean;
  blocked: boolean;
  date: string;
  onNavigate: (days: number) => void;
}

export default function useCalendarGestures(options: CalendarGesturesOptions) {
  const latest = useRef(options);
  const pendingReset = useRef(false);
  const gestureLocked = useRef(false);
  useEffect(() => { latest.current = options; });

  useEffect(() => {
    if (!pendingReset.current) return;
    pendingReset.current = false;
    const panel = options.panelRef.current;
    if (!panel) return;
    if (options.fullscreen) panel.scrollTop = 0;
    else window.scrollTo({ top: window.scrollY + panel.getBoundingClientRect().top });
  }, [options.date, options.fullscreen, options.panelRef]);

  useEffect(() => {
    const panel = options.panelRef.current;
    if (!options.enabled || !panel) return;
    let touch: { x: number; y: number; horizontal: boolean } | null = null;
    const excluded = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest(
      'button, input, select, textarea, a, summary, details, [role="dialog"], [contenteditable], nav, .calendar-filters, .calendar-actions',
    ));
    const navigate = (days: number) => {
      if (gestureLocked.current || latest.current.blocked) return;
      gestureLocked.current = true;
      touch = null;
      pendingReset.current = true;
      latest.current.onNavigate(days);
    };
    const start = (event: TouchEvent) => {
      touch = null;
      gestureLocked.current = false;
      if (event.touches.length !== 1 || latest.current.blocked || excluded(event.target)) return;
      const point = event.touches[0];
      touch = { x: point.clientX, y: point.clientY, horizontal: false };
    };
    const move = (event: TouchEvent) => {
      if (!touch || event.touches.length !== 1 || latest.current.blocked) {
        touch = null;
        return;
      }
      const dx = event.touches[0].clientX - touch.x;
      const dy = event.touches[0].clientY - touch.y;
      if (Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        touch.horizontal = true;
        if (event.cancelable) event.preventDefault();
      }
    };
    const end = (event: TouchEvent) => {
      if (!touch || event.changedTouches.length !== 1) return;
      const dx = event.changedTouches[0].clientX - touch.x;
      const dy = event.changedTouches[0].clientY - touch.y;
      if (touch.horizontal && Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        navigate(dx < 0 ? 1 : -1);
      }
      touch = null;
    };
    const cancel = () => { touch = null; };
    panel.addEventListener('touchstart', start, { passive: true });
    panel.addEventListener('touchmove', move, { passive: false });
    panel.addEventListener('touchend', end, { passive: true });
    panel.addEventListener('touchcancel', cancel);
    return () => {
      panel.removeEventListener('touchstart', start);
      panel.removeEventListener('touchmove', move);
      panel.removeEventListener('touchend', end);
      panel.removeEventListener('touchcancel', cancel);
    };
  }, [options.enabled, options.fullscreen, options.panelRef, options.date]);
}
