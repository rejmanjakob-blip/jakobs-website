import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/**
 * Tab drag-to-reorder.
 *
 * Mouse: press and drag a tab.
 * Touch (phones): a quick sideways swipe scrolls the one-row tab bar. Pressing and holding a parent tab
 * "lifts" it (it grows, glows and the phone gives a short buzz); dragging it then reorders the tabs, and
 * the tab bar scrolls by itself when the finger nears either end.
 */
type Drag = { parent: number; child: number | null; x: number; y: number; pointer: number; target: number; moved: boolean;
  touch: { row: HTMLElement | null; scrollLeft: number; scrolling: boolean; lifted: boolean; timer: number | null } | null };
const HOLD_MS = 350;
// A finger wobbles a little while holding still; only a clear sideways move counts as a swipe.
const SWIPE_PX = 12;
const freeze = (on: boolean) => document.documentElement.classList.toggle("tab-reordering", on);

export function useTabDrag(onDrop: (parent: number, child: number | null, target: number) => void, onMove: () => void) {
  const drag = useRef<Drag | null>(null);
  const callbacks = useRef({ onDrop, onMove });
  callbacks.current = { onDrop, onMove };
  const [target, setTarget] = useState<Pick<Drag, "parent" | "child" | "target"> | null>(null);
  const [lifted, setLifted] = useState<number | null>(null);
  const suppressClick = useRef(false);
  // Swallow only the click that the same gesture produces. Touch drags often produce no click at all,
  // so the flag expires quickly instead of eating the next real tap.
  const suppressTimer = useRef<number | null>(null);
  const suppressNextClick = () => {
    suppressClick.current = true;
    if (suppressTimer.current !== null) clearTimeout(suppressTimer.current);
    suppressTimer.current = window.setTimeout(() => { suppressClick.current = false; suppressTimer.current = null; }, 400);
  };
  const autoScroll = useRef<{ frame: number | null; speed: number; x: number; y: number }>({ frame: null, speed: 0, x: 0, y: 0 });

  useEffect(() => {
    const pickTarget = (current: Drag, x: number, y: number) => {
      const selector = current.child === null ? "[data-drag-parent]" : `[data-drag-child][data-drag-owner="${current.parent}"]`;
      const element = document.elementFromPoint(x, y)?.closest(selector);
      if (element) {
        const index = Number(element.getAttribute(current.child === null ? "data-drag-parent" : "data-drag-child"));
        if (Number.isInteger(index)) current.target = index;
      }
      setTarget({ parent: current.parent, child: current.child, target: current.target });
    };
    const stopAutoScroll = () => { const a = autoScroll.current; if (a.frame !== null) cancelAnimationFrame(a.frame); a.frame = null; a.speed = 0; };
    const runAutoScroll = () => {
      const a = autoScroll.current, current = drag.current, row = current?.touch?.row;
      if (!current || !row || !a.speed) { a.frame = null; return; }
      row.scrollLeft += a.speed;
      pickTarget(current, a.x, a.y);
      a.frame = requestAnimationFrame(runAutoScroll);
    };
    const move = (event: PointerEvent) => {
      const current = drag.current;
      if (!current || event.pointerId !== current.pointer) return;
      const delta = current.child === null ? event.clientX - current.x : event.clientY - current.y;
      const touch = current.touch;
      if (touch && !touch.lifted) {
        // Moving before the hold finishes scrolls the tab row instead of reordering.
        if (touch.scrolling || Math.abs(event.clientX - current.x) >= SWIPE_PX || Math.abs(event.clientY - current.y) >= SWIPE_PX) {
          if (touch.timer !== null) { clearTimeout(touch.timer); touch.timer = null; }
          touch.scrolling = true;
          event.preventDefault();
          if (touch.row) touch.row.scrollLeft = touch.scrollLeft - (event.clientX - current.x);
          suppressNextClick();
        }
        return;
      }
      if (!current.moved && Math.abs(delta) < 6) return;
      current.moved = true;
      event.preventDefault();
      callbacks.current.onMove();
      pickTarget(current, event.clientX, event.clientY);
      // While a tab is lifted nothing scrolls on its own; only dragging it past either end of the
      // tab row moves the row, so far-away tabs can still be reached.
      if (touch?.row) {
        const r = touch.row.getBoundingClientRect(), a = autoScroll.current;
        a.x = Math.min(Math.max(event.clientX, r.left + 2), r.right - 2); a.y = r.top + r.height / 2;
        const past = event.clientX < r.left ? event.clientX - r.left : event.clientX > r.right ? event.clientX - r.right : 0;
        a.speed = Math.max(-8, Math.min(8, past / 4));
        if (a.speed && a.frame === null) a.frame = requestAnimationFrame(runAutoScroll);
        if (!a.speed) stopAutoScroll();
      }
    };
    const end = (event: PointerEvent) => {
      const current = drag.current;
      if (!current || current.pointer !== event.pointerId) return;
      drag.current = null;
      stopAutoScroll();
      freeze(false);
      if (current.touch?.timer != null) clearTimeout(current.touch.timer);
      setTarget(null); setLifted(null);
      if (current.touch?.scrolling) return;
      if (current.moved) {
        suppressNextClick();
        if (event.type === "pointerup") callbacks.current.onDrop(current.parent, current.child, current.target);
      }
    };
    const click = (event: MouseEvent) => {
      if (!suppressClick.current) return;
      suppressClick.current = false;
      event.preventDefault(); event.stopPropagation();
    };
    // A lifted tab must not open the phone's long-press menu, and no page or row scrolling may happen
    // (iOS only stops scrolling when touchmove itself is cancelled).
    const menu = (event: Event) => { if (drag.current?.touch?.lifted) event.preventDefault(); };
    const touchMove = (event: TouchEvent) => { if (drag.current?.touch?.lifted && event.cancelable) event.preventDefault(); };
    document.addEventListener("touchmove", touchMove, { passive: false });
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
    document.addEventListener("click", click, true);
    document.addEventListener("contextmenu", menu);
    return () => {
      stopAutoScroll();
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
      document.removeEventListener("click", click, true);
      document.removeEventListener("contextmenu", menu);
      document.removeEventListener("touchmove", touchMove);
      freeze(false);
    };
  }, []);

  const start = (event: ReactPointerEvent, parent: number, child: number | null = null) => {
    if (event.button !== 0 || event.isPrimary === false) return;
    suppressClick.current = false;
    const row = event.pointerType === "touch" && child === null ? (event.currentTarget as HTMLElement).closest<HTMLElement>(".board-tabs") : null;
    const current: Drag = { parent, child, x: event.clientX, y: event.clientY, pointer: event.pointerId, target: child ?? parent, moved: false,
      touch: row ? { row, scrollLeft: row.scrollLeft, scrolling: false, lifted: false, timer: null } : null };
    if (current.touch) {
      const touch = current.touch;
      touch.timer = window.setTimeout(() => {
        touch.timer = null;
        if (drag.current !== current || touch.scrolling) return;
        touch.lifted = true;
        freeze(true);
        setLifted(parent);
        callbacks.current.onMove();
        try { navigator.vibrate?.(15); } catch { /* no vibration on this device */ }
      }, HOLD_MS);
    }
    drag.current = current;
  };
  return { start, target, lifted };
}
