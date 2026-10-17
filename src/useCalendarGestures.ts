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
  const lastWheelAt = useRef(0);
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
    let armed = false;
    let previousTop = options.fullscreen ? panel.scrollTop : window.scrollY;
    const excluded = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest(
      'button, input, select, textarea, a, summary, details, [role="dialog"], [contenteditable], nav, .calendar-filters, .calendar-actions',
    ));
    const navigate = (days: number) => {
      if (gestureLocked.current || latest.current.blocked) return;
      gestureLocked.current = true;
      armed = false;
      touch = null;
      pendingReset.current = true;
      latest.current.onNavigate(days);
    };
    const start = (event: TouchEvent) => {
      touch = null;
      armed = false;
      gestureLocked.current = false;
      if (event.touches.length !== 1 || latest.current.blocked || excluded(event.target)) return;
      const point = event.touches[0];
      touch = { x: point.clientX, y: point.clientY, horizontal: false };
      armed = true;
    };
    const move = (event: TouchEvent) => {
      if (!touch || event.touches.length !== 1 || latest.current.blocked) {
        touch = null;
        armed = false;
        return;
      }
      const dx = event.touches[0].clientX - touch.x;
      const dy = event.touches[0].clientY - touch.y;
      if (Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        touch.horizontal = true;
        armed = false;
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
    const cancel = () => { touch = null; armed = false; };
    const wheel = (event: WheelEvent) => {
      if (latest.current.blocked || excluded(event.target) || event.ctrlKey) {
        armed = false;
        return;
      }
      const now = Date.now();
      if (now - lastWheelAt.current > 250) gestureLocked.current = false;
      lastWheelAt.current = now;
      armed = !gestureLocked.current && event.deltaY > 0 && Math.abs(event.deltaY) > Math.abs(event.deltaX);
    };
    const scroll = () => {
      const top = options.fullscreen ? panel.scrollTop : window.scrollY;
      const down = top > previousTop;
      previousTop = top;
      const atBottom = options.fullscreen
        ? panel.scrollHeight > panel.clientHeight && panel.scrollHeight - panel.clientHeight - top <= 2
        : panel.getBoundingClientRect().bottom <= window.innerHeight && panel.getBoundingClientRect().top < 0;
      if (armed && down && atBottom) navigate(1);
    };
    const scrollTarget = options.fullscreen ? panel : window;
    panel.addEventListener('touchstart', start, { passive: true });
    panel.addEventListener('touchmove', move, { passive: false });
    panel.addEventListener('touchend', end, { passive: true });
    panel.addEventListener('touchcancel', cancel);
    panel.addEventListener('wheel', wheel, { passive: true });
    scrollTarget.addEventListener('scroll', scroll, { passive: true });
    return () => {
      panel.removeEventListener('touchstart', start);
      panel.removeEventListener('touchmove', move);
      panel.removeEventListener('touchend', end);
      panel.removeEventListener('touchcancel', cancel);
      panel.removeEventListener('wheel', wheel);
      scrollTarget.removeEventListener('scroll', scroll);
    };
  }, [options.enabled, options.fullscreen, options.panelRef, options.date]);
}
