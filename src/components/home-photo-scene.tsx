import { useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BackgroundPhotos, InsertPhoto, type useBackgroundPhotos } from "@/components/background-photos";
import type { BoardState } from "@/lib/board-state";

export function HomePhotoScene({ editor, view, onViewChange }: { editor: ReturnType<typeof useBackgroundPhotos>; view?: BoardState["homeView"]; onViewChange?: (view: BoardState["homeView"]) => void }) {
  const [localView, setLocalView] = useState({ zoom: 1, x: 0, y: 0 });
  const current = view ?? localView;
  const zoom = current.zoom;
  const offset = current;
  const updateView = (next: BoardState["homeView"]) => { if (onViewChange) onViewChange(next); else setLocalView(next); };
  const setZoom = (value: number | ((value: number) => number)) => updateView({ ...current, zoom: typeof value === "number" ? value : value(zoom) });
  const setOffset = (offset: { x: number; y: number }) => updateView({ ...current, ...offset });
  const drag = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null);
  const changeZoom = (delta: number) => setZoom(value => Math.max(0.25, Math.min(3, Math.round((value + delta) * 100) / 100)));
  return <>
    <div aria-label="Home scene" className="absolute inset-0 touch-none" onPointerDown={event => {
      if (event.button !== 0 || (event.target instanceof Element && event.target.closest("button, .background-photo, input, .photo-options"))) return;
      editor.select(null);
      drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: offset.x, originY: offset.y };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    }} onPointerMove={event => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      setOffset({ x: current.originX + event.clientX - current.x, y: current.originY + event.clientY - current.y });
    }} onPointerUp={event => {
      if (drag.current?.pointerId === event.pointerId) drag.current = null;
    }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }} onWheel={event => {
      if (editor.selected || (event.target instanceof Element && event.target.closest("button, .background-photo, input"))) return;
      changeZoom(event.deltaY < 0 ? 0.1 : -0.1);
    }}>
      <div aria-label="Home frame" className="absolute inset-0 flex items-center justify-center" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}>
        <BackgroundPhotos editor={editor} centered scale={zoom} />
        <div className="photo-options relative z-10"><InsertPhoto editor={editor} className="home-moon border-0 bg-transparent text-foreground hover:bg-transparent hover:text-foreground p-0"><svg aria-label="Moon" role="img" viewBox="0 0 100 100" fill="var(--background)" stroke="currentColor" strokeWidth={2.2} strokeLinecap="butt" strokeLinejoin="miter"><path d="M 64 5 A 46 46 0 1 0 95 66 C 53 79 25 42 64 5 Z" /></svg></InsertPhoto></div>
      </div>
    </div>
    {!editor.selected && <div role="group" aria-label="Home zoom" className="zoom-controls absolute z-10 flex items-center gap-2 bg-background">
      <Button variant="outline" size="icon" className="glow-button h-7 w-7" aria-label="Zoom out" title="Zoom out" disabled={zoom <= 0.25} onClick={() => changeZoom(-0.1)}><Minus /></Button>
      <output aria-label="Zoom level" className="w-10 text-center text-xs">{Math.round(zoom * 100)}%</output>
      <Button variant="outline" size="icon" className="glow-button h-7 w-7" aria-label="Zoom in" title="Zoom in" disabled={zoom >= 3} onClick={() => changeZoom(0.1)}><Plus /></Button>
      <Button variant="outline" size="icon" className="glow-button h-7 w-7" aria-label="Reset zoom" title="Reset zoom" onClick={() => setZoom(1)}><RotateCcw /></Button>
    </div>}
  </>;
}