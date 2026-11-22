import { useEffect, useRef, type ReactNode } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ViewState } from "@/lib/board-state";

const clampZoom = (z: number) => Math.max(0.25, Math.min(3, z));
const INTERACTIVE = "button, input, textarea, a, .background-photo, .bar-graph, .floating-box, .glow-box, [contenteditable]";

/** Pans and zooms an entire dashboard page; everything inside moves together. */
export function DashboardView({ view, onChange, children }: { view: ViewState; onChange: (view: ViewState) => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef({ view, onChange }); latest.current = { view, onChange };
  const drag = useRef<{ id: number; x: number; y: number; ox: number; oy: number } | null>(null);
  const zoomAt = (next: number, px: number, py: number) => {
    const { view: v, onChange: set } = latest.current;
    const z = clampZoom(next); const k = z / v.zoom;
    set({ zoom: z, x: px - (px - v.x) * k, y: py - (py - v.y) * k });
  };
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (e.target instanceof Element && e.target.closest("textarea, .bar-graph, .floating-box") && !e.ctrlKey) return;
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      const r = el.getBoundingClientRect();
      zoomAt(latest.current.view.zoom * Math.exp(-dy * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  const center = (z: number) => { const r = ref.current?.getBoundingClientRect(); zoomAt(z, (r?.width ?? 0) / 2, (r?.height ?? 0) / 2); };
  return <div ref={ref} data-tab-background aria-label="Dashboard page" className="relative isolate flex-1 overflow-hidden touch-none"
    onPointerDown={e => {
      if (e.button !== 0 || (e.target instanceof Element && e.target.closest(INTERACTIVE))) return;
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: view.x, oy: view.y };
      e.currentTarget.setPointerCapture(e.pointerId);
    }}
    onPointerMove={e => { const d = drag.current; if (d && d.id === e.pointerId) onChange({ ...view, x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y }); }}
    onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
    <div data-tab-background aria-label="Dashboard frame" className="absolute inset-0 flex flex-col" style={{ transformOrigin: "0 0", transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
      {children}
    </div>
    <div role="group" aria-label="Page zoom" className="zoom-controls absolute z-30 flex items-center gap-2 bg-background">
      <Button variant="outline" size="icon" className="glow-button h-7 w-7" aria-label="Zoom out" disabled={view.zoom <= 0.25} onClick={() => center(view.zoom - 0.1)}><Minus /></Button>
      <output aria-label="Zoom level" className="w-10 text-center text-xs">{Math.round(view.zoom * 100)}%</output>
      <Button variant="outline" size="icon" className="glow-button h-7 w-7" aria-label="Zoom in" disabled={view.zoom >= 3} onClick={() => center(view.zoom + 0.1)}><Plus /></Button>
      <Button variant="outline" size="icon" className="glow-button h-7 w-7" aria-label="Reset zoom" onClick={() => onChange({ zoom: 1, x: 0, y: 0 })}><RotateCcw /></Button>
    </div>
  </div>;
}
