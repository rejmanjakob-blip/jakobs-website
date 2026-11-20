import { memo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ChecklistParagraph } from "@/components/checklist-paragraph";
import { MetricEditor } from "@/components/metric-editor";
import type { NoteBoxState, ProgressBoxState } from "@/lib/board-state";

const startX = (width: number) => typeof window === "undefined" ? 40 : Math.max(0, (window.innerWidth - width) / 2);
export function newProgressBox(): ProgressBoxState { return { id: crypto.randomUUID(), label: "Progress", value: 0, x: startX(220), y: 260, width: 220 }; }
export function newNoteBox(): NoteBoxState { return { id: crypto.randomUUID(), label: "Note", text: "", x: startX(160), y: 260, width: 160, height: 160 }; }

type Rect = { x: number; y: number; width: number; height?: number | undefined };

/** Outer box gestures on the border area (and the title while not being edited): move, corner-resize, four-tap delete. */
function useBoxGesture<T extends Rect>(box: T, onChange: (c: Partial<T>) => void, onRemove: () => void, scale: number, min: { w: number; h: number }) {
  const g = useRef<{ corner: { x: number; y: number } | null; x: number; y: number; start: T; moved: boolean; field: HTMLInputElement | HTMLTextAreaElement | null } | null>(null);
  const taps = useRef<number[]>([]);
  const edgeOf = (e: React.PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect(); const edge = Math.min(16, r.width / 4, r.height / 4);
    return { h: e.clientX - r.left <= edge ? -1 : r.right - e.clientX <= edge ? 1 : 0, v: e.clientY - r.top <= edge ? -1 : r.bottom - e.clientY <= edge ? 1 : 0 };
  };
  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      // A box title that isn't being edited doubles as a grip: drag it to move the box, click it to edit.
      const field = e.target instanceof Element ? e.target.closest<HTMLInputElement | HTMLTextAreaElement>(".progress-title textarea, .box-title") : null;
      const grip = field !== null && field !== document.activeElement;
      if (e.target !== e.currentTarget && !grip) return;
      e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId);
      const { h, v } = grip ? { h: 0, v: 0 } : edgeOf(e);
      g.current = { corner: h && v ? { x: h, y: v } : null, x: e.clientX, y: e.clientY, start: box, moved: false, field: grip ? field : null };
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const s = g.current;
      if (!s) { if (e.target === e.currentTarget) { const { h, v } = edgeOf(e); e.currentTarget.style.cursor = h && v ? (h === v ? "nwse-resize" : "nesw-resize") : "move"; } return; }
      const dx = (e.clientX - s.x) / scale, dy = (e.clientY - s.y) / scale;
      if (Math.hypot(dx, dy) > 4) s.moved = true;
      if (!s.moved) return;
      taps.current = [];
      if (!s.corner) return onChange({ x: s.start.x + dx, y: s.start.y + dy } as Partial<T>);
      const width = Math.max(min.w, Math.min(3000, s.start.width + s.corner.x * dx));
      const changes: Partial<Rect> = { width, x: s.start.x + (s.corner.x < 0 ? s.start.width - width : 0) };
      if (s.start.height !== undefined) {
        const height = Math.max(min.h, Math.min(3000, s.start.height + s.corner.y * dy));
        changes.height = height; changes.y = s.start.y + (s.corner.y < 0 ? s.start.height - height : 0);
      }
      onChange(changes as Partial<T>);
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
      const s = g.current; g.current = null;
      if (!s || s.moved) return;
      if (s.field) { s.field.focus(); const end = s.field.value.length; try { s.field.setSelectionRange(end, end); } catch { /* number fields have no caret */ } return; }
      const recent = taps.current.filter(t => e.timeStamp - t < 2000); recent.push(e.timeStamp);
      if (recent.length >= 4) { taps.current = []; onRemove(); } else taps.current = recent;
    },
    onPointerCancel: () => { g.current = null; taps.current = []; },
  };
}

const MIN_TEXT_SCALE = 0.4, MAX_TEXT_SCALE = 4;
const clampScale = (k: number) => Math.round(Math.max(MIN_TEXT_SCALE, Math.min(MAX_TEXT_SCALE, k)) * 1000) / 1000;

/**
 * Corner grip of a box's inner area (shown on hover). Dragging it makes the inner text and controls
 * bigger or smaller while the outer box keeps its size and position.
 */
function InnerScaleGrip({ value, label, onChange }: { value: number; label: string; onChange: (textScale: number) => void }) {
  const g = useRef<{ id: number; x: number; y: number; start: number; size: number } | null>(null);
  return <span role="slider" tabIndex={0} aria-label={`${label} text size`} aria-valuemin={MIN_TEXT_SCALE} aria-valuemax={MAX_TEXT_SCALE} aria-valuenow={value}
    aria-valuetext={`${Math.round(value * 100)}%`} title="Drag to change the text size" className="inner-scale-grip"
    onPointerDown={e => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture?.(e.pointerId);
      const area = e.currentTarget.parentElement?.getBoundingClientRect();
      g.current = { id: e.pointerId, x: e.clientX, y: e.clientY, start: value, size: area ? Math.max(24, (area.width + area.height) / 2) : 80 };
    }}
    onPointerMove={e => {
      const s = g.current; if (!s || s.id !== e.pointerId) return;
      const drag = ((e.clientX - s.x) + (e.clientY - s.y)) / 2;
      onChange(clampScale(s.start * (s.size + drag) / s.size));
    }}
    onPointerUp={() => { g.current = null; }} onPointerCancel={() => { g.current = null; }}
    onDoubleClick={e => { e.stopPropagation(); onChange(1); }}
    onKeyDown={e => {
      const step = e.key === "ArrowUp" || e.key === "ArrowRight" ? 0.1 : e.key === "ArrowDown" || e.key === "ArrowLeft" ? -0.1 : 0;
      if (step) { e.preventDefault(); onChange(clampScale(value + step)); }
    }} />;
}

export function InsertProgress({ onInsert }: { onInsert: () => void }) {
  return <Button variant="outline" aria-label="Insert progress bar" title="Insert progress bar" onClick={onInsert}
    className="glow-button graph-insert aspect-square h-auto w-[68.2667px] max-w-[10.1333vw] self-end p-1">
    <span className="progress-symbol" aria-hidden="true"><span /></span>
  </Button>;
}
export function InsertNote({ onInsert }: { onInsert: () => void }) {
  return <Button variant="outline" aria-label="Insert paragraph" title="Insert paragraph" onClick={onInsert}
    className="glow-button graph-insert aspect-square h-auto w-[68.2667px] max-w-[10.1333vw] self-end p-1">
    <span className="note-symbol" aria-hidden="true"><span /><span /><span /></span>
  </Button>;
}

const ProgressBox = memo(function ProgressBox({ box, n, scale, onChange, onRemove }: { box: ProgressBoxState; n: number; scale: number; onChange: (c: Partial<ProgressBoxState>) => void; onRemove: () => void }) {
  const element = useRef<HTMLDivElement>(null);
  const minimumHeight = () => {
    const header = element.current?.querySelector<HTMLElement>("[data-metric-heading]");
    return (header?.getBoundingClientRect().height ?? 15) / scale + (box.boxMode ? 14 : 26);
  };
  const minimumWidth = () => {
    const title = element.current?.querySelector<HTMLElement>(".progress-title");
    const total = element.current?.querySelector<HTMLInputElement>("[data-metric-heading] > input");
    return title && total ? (title.getBoundingClientRect().width + total.getBoundingClientRect().width) / scale + 22 : 64;
  };
  const resizeBox = box.boxMode ? { ...box, height: box.height ?? (element.current?.getBoundingClientRect().height ?? 64 * scale) / scale } : box;
  const gesture = useBoxGesture(resizeBox, onChange, onRemove, scale, { w: box.boxMode ? minimumWidth() : 120, h: minimumHeight() });
  return <div ref={element} role="group" aria-label={`Progress box ${n}`} data-box-mode={box.boxMode ? "" : undefined} className="floating-box glow-box space-y-1 p-3" style={{ left: box.x, top: box.y, width: box.width, ...(box.boxMode ? { minWidth: minimumWidth() } : {}), ...(box.boxMode && box.height !== undefined ? { height: box.height, minHeight: minimumHeight() } : {}) }} {...gesture}>
    <div className="inner-box relative h-full">
      <div className="h-full overflow-hidden" style={{ zoom: box.textScale ?? 1 }}><MetricEditor metric={box} label={`Progress box ${n}`} onChange={onChange} /></div>
      <InnerScaleGrip value={box.textScale ?? 1} label={`Progress box ${n}`} onChange={textScale => onChange({ textScale })} />
    </div>
  </div>;
}, sameBox);

const NoteBox = memo(function NoteBox({ box, n, scale, onChange, onRemove }: { box: NoteBoxState; n: number; scale: number; onChange: (c: Partial<NoteBoxState>) => void; onRemove: () => void }) {
  const gesture = useBoxGesture(box, onChange, onRemove, scale, { w: 80, h: 60 });
  return <div role="group" aria-label={`Paragraph box ${n}`} className="floating-box glow-box flex flex-col gap-1 p-3" style={{ left: box.x, top: box.y, width: box.width, height: box.height }} {...gesture}>
    <input aria-label={`Paragraph box ${n} title`} value={box.label} onChange={e => onChange({ label: e.target.value })}
      style={{ fontSize: 8 * (box.textScale ?? 1) }} className="box-title bg-transparent text-[8px] font-semibold uppercase leading-tight outline-none" />
    <div className="inner-box relative flex min-h-0 flex-1">
      <ChecklistParagraph value={box.text} label={`${box.label} paragraph`} onChange={text => onChange({ text })} style={{ fontSize: 8 * (box.textScale ?? 1) }}
        className="glow-input h-full w-full min-h-0 resize-none p-1 text-[8px] leading-[1.15] tracking-tight" />
      <InnerScaleGrip value={box.textScale ?? 1} label={`Paragraph box ${n}`} onChange={textScale => onChange({ textScale })} />
    </div>
  </div>;
}, sameBox);

/** Boxes re-render only when their own data changes; their callbacks always apply functional updates by id, so older ones stay correct. */
function sameBox(a: { box: unknown; n: number; scale: number }, b: { box: unknown; n: number; scale: number }) {
  return a.box === b.box && a.n === b.n && a.scale === b.scale;
}

export function FloatingBoxes({ bars, notes, scale, onBars, onNotes }: { bars: ProgressBoxState[]; notes: NoteBoxState[]; scale: number; onBars: (u: (b: ProgressBoxState[]) => ProgressBoxState[]) => void; onNotes: (u: (n: NoteBoxState[]) => NoteBoxState[]) => void }) {
  if (!bars.length && !notes.length) return null;
  return <section className="bar-graphs" aria-label="Inserted boxes">
    {bars.map((b, i) => <ProgressBox key={b.id} box={b} n={i + 1} scale={scale} onRemove={() => onBars(l => l.filter(x => x.id !== b.id))} onChange={c => onBars(l => l.map(x => x.id === b.id ? { ...x, ...c } : x))} />)}
    {notes.map((b, i) => <NoteBox key={b.id} box={b} n={i + 1} scale={scale} onRemove={() => onNotes(l => l.filter(x => x.id !== b.id))} onChange={c => onNotes(l => l.map(x => x.id === b.id ? { ...x, ...c } : x))} />)}
  </section>;
}
