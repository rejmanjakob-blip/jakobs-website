import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/**
 * Tab drag-to-reorder. On touch screens a parent tab must be held for a moment before it drags;
 * a quick sideways swipe scrolls the one-row tab bar instead (the tabs block native scrolling).
 */
type Drag = { parent: number; child: number | null; x: number; y: number; pointer: number; target: number; moved: boolean;
  touch: { row: HTMLElement | null; armAt: number; scrollLeft: number; scrolling: boolean } | null };
const HOLD_MS = 350;

export function useTabDrag(onDrop: (parent: number, child: number | null, target: number) => void, onMove: () => void) {
  const drag = useRef<Drag | null>(null);
  const callbacks = useRef({ onDrop, onMove });
  callbacks.current = { onDrop, onMove };
  const [target, setTarget] = useState<Pick<Drag, "parent" | "child" | "target"> | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const current = drag.current;
      if (!current || event.pointerId !== current.pointer) return;
      const delta = current.child === null ? event.clientX - current.x : event.clientY - current.y;
      const touch = current.touch;
      if (touch && !current.moved) {
        // Swiping before the hold finishes scrolls the tab row.
        if (touch.scrolling || (Math.abs(delta) >= 6 && event.timeStamp < touch.armAt)) {
          touch.scrolling = true;
          event.preventDefault();
          if (touch.row) touch.row.scrollLeft = touch.scrollLeft - (event.clientX - current.x);
          suppressClick.current = true;
          return;
        }
      }
      if (!current.moved && Math.abs(delta) < 6) return;
      current.moved = true;
      event.preventDefault();
      callbacks.current.onMove();
      const selector = current.child === null ? '[data-drag-parent]' : `[data-drag-child][data-drag-owner="${current.parent}"]`;
      const element = document.elementFromPoint(event.clientX, event.clientY)?.closest(selector);
      if (element) {
        const index = Number(element.getAttribute(current.child === null ? "data-drag-parent" : "data-drag-child"));
        if (Number.isInteger(index)) current.target = index;
      }
      setTarget({ parent: current.parent, child: current.child, target: current.target });
    };
    const end = (event: PointerEvent) => {
      const current = drag.current;
      if (!current || current.pointer !== event.pointerId) return;
      drag.current = null;
      setTarget(null);
      if (current.touch?.scrolling) return;
      if (current.moved) {
        suppressClick.current = true;
        if (event.type === "pointerup") callbacks.current.onDrop(current.parent, current.child, current.target);
      }
    };
    const click = (event: MouseEvent) => {
      if (!suppressClick.current) return;
      suppressClick.current = false;
      event.preventDefault(); event.stopPropagation();
    };
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
    document.addEventListener("click", click, true);
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
      document.removeEventListener("click", click, true);
    };
  }, []);
  const start = (event: ReactPointerEvent, parent: number, child: number | null = null) => {
    if (event.button !== 0 || event.isPrimary === false) return;
    suppressClick.current = false;
    const row = event.pointerType === "touch" && child === null ? (event.currentTarget as HTMLElement).closest<HTMLElement>(".board-tabs") : null;
    drag.current = { parent, child, x: event.clientX, y: event.clientY, pointer: event.pointerId, target: child ?? parent, moved: false,
      touch: row ? { row, armAt: event.timeStamp + HOLD_MS, scrollLeft: row.scrollLeft, scrolling: false } : null };
  };
  return { start, target };
}