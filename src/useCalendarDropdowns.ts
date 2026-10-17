import { useEffect, type RefObject } from 'react';

export default function useCalendarDropdowns(panelRef: RefObject<HTMLElement>, enabled: boolean) {
  useEffect(() => {
    const panel = panelRef.current;
    if (!enabled || !panel) return;
    const menus = Array.from(panel.querySelectorAll<HTMLDetailsElement>('.calendar-actions details'));
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: HTMLDetailsElement | undefined;
    const clearTimer = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };
    const close = (restoreFocus = false) => {
      clearTimer();
      if (!current) return;
      const menu = current;
      current = undefined;
      menu.open = false;
      if (restoreFocus) menu.querySelector('summary')?.focus();
    };
    const scheduleClose = () => {
      clearTimer();
      if (!current) return;
      timer = setTimeout(() => {
        // Keyboard users keep the menu while working through its controls.
        const focused = document.activeElement;
        if (current && focused && current.contains(focused) && focused !== current.querySelector('summary')) {
          scheduleClose();
          return;
        }
        close();
      }, 5000);
    };
    const toggle = (event: Event) => {
      const menu = event.target;
      if (!(menu instanceof HTMLDetailsElement) || !menus.includes(menu)) return;
      if (!menu.open) {
        if (current === menu) close();
        return;
      }
      if (current !== menu) close();
      current = menu;
      scheduleClose();
    };
    const pointerDown = (event: PointerEvent) => {
      if (current && event.target instanceof Node && !current.contains(event.target)) close();
    };
    const interact = () => { if (current) scheduleClose(); };
    const click = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const action = event.target.closest('button, a');
      if (action && menus.some((menu) => menu.contains(action))) {
        const menu = action.closest('details');
        if (menu instanceof HTMLDetailsElement) menu.open = false;
        close();
      }
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && current) {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      } else interact();
    };
    panel.addEventListener('toggle', toggle, true);
    panel.addEventListener('pointermove', interact);
    panel.addEventListener('change', interact);
    document.addEventListener('pointerdown', pointerDown, true);
    document.addEventListener('click', click);
    document.addEventListener('keydown', keyDown, true);
    return () => {
      close();
      panel.removeEventListener('toggle', toggle, true);
      panel.removeEventListener('pointermove', interact);
      panel.removeEventListener('change', interact);
      document.removeEventListener('pointerdown', pointerDown, true);
      document.removeEventListener('click', click);
      document.removeEventListener('keydown', keyDown, true);
    };
  }, [panelRef, enabled]);
}
