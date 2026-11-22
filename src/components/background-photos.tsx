import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Pause, Play, Volume1, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { uploadVideo, useVideoUrl } from "@/lib/video-storage";

export type Photo = { id: string; src: string; muted?: boolean | undefined; volume?: number | undefined; x: number; y: number; width: number; ratio: number; rotation: number; flipped: boolean; video?: boolean | undefined; crop?: Crop | undefined; collapsed?: boolean | undefined; title?: string | undefined; titleX?: number | undefined; titleY?: number | undefined; group?: string | undefined };
export type Crop = { top: number; right: number; bottom: number; left: number };
const NO_CROP: Crop = { top: 0, right: 0, bottom: 0, left: 0 };

export function useBackgroundPhotos(controlled?: { photos: Photo[]; onChange: (photos: Photo[]) => void; centered?: boolean }) {
  const [localPhotos, setLocalPhotos] = useState<Photo[]>([]);
  const photos = controlled?.photos ?? localPhotos;
  const latest = useRef(photos);
  latest.current = photos;
  const setPhotos = (update: (photos: Photo[]) => Photo[]) => {
    const next = update(latest.current);
    latest.current = next;
    if (controlled) controlled.onChange(next);
    else setLocalPhotos(next);
  };
  const [selected, select] = useState<string | null>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(".background-photo, .photo-options")) return;
      select(null);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  const update = (id: string, changes: Partial<Photo>) => setPhotos(list => list.map(photo => photo.id === id ? { ...photo, ...changes } : photo));
  const add = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).filter(file => file.type.startsWith("image/")).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== "string") return;
        const src = reader.result;
        const image = new Image();
        image.onload = () => {
          const width = Math.min(360, window.innerWidth * 0.6);
          const photo: Photo = { id: crypto.randomUUID(), src, x: controlled?.centered ? -width / 2 : Math.max(0, (window.innerWidth - width) / 2), y: controlled?.centered ? -width / (image.naturalWidth / image.naturalHeight) / 2 : 240, width, ratio: image.naturalWidth / image.naturalHeight, rotation: 0, flipped: false };
          setPhotos(list => [...list, photo]);
          select(photo.id);
        };
        image.src = src;
      };
      reader.readAsDataURL(file);
    });
  };
  const addVideo = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).filter(file => file.type.startsWith("video/")).forEach(file => {
      const probe = document.createElement("video");
      const local = URL.createObjectURL(file);
      probe.preload = "metadata";
      probe.onloadedmetadata = async () => {
        const ratio = probe.videoWidth && probe.videoHeight ? probe.videoWidth / probe.videoHeight : 16 / 9;
        URL.revokeObjectURL(local);
        const id = toast.loading("Uploading video…");
        try {
          const src = await uploadVideo(file);
          toast.success("Video added", { id });
          const width = Math.min(360, window.innerWidth * 0.6);
          const photo: Photo = { id: crypto.randomUUID(), src, video: true, x: controlled?.centered ? -width / 2 : Math.max(0, (window.innerWidth - width) / 2), y: controlled?.centered ? -width / ratio / 2 : 240, width, ratio, rotation: 0, flipped: false };
          setPhotos(list => [...list, photo]);
          select(photo.id);
        } catch (e) { toast.error(e instanceof Error ? e.message : "Could not upload the video.", { id }); }
      };
      probe.src = local;
    });
  };
  const groupOf = (p: Photo) => p.group ?? p.id;
  const collapseGroup = (id: string) => setPhotos(list => { const t = list.find(p => p.id === id); if (!t) return list; const g = groupOf(t); const lead = list.find(p => p.video && groupOf(p) === g && p.collapsed) ?? t;
    return list.map(p => p.video && groupOf(p) === g ? { ...p, collapsed: true, titleX: lead.titleX ?? t.x, titleY: lead.titleY ?? t.y, title: lead.title ?? t.title } : p); });
  // Opening restores each video to its own saved spot; the title's position never moves the videos.
  const openGroup = (g: string, _x?: number, _y?: number) => setPhotos(list => list.map(p => p.video && groupOf(p) === g ? { ...p, collapsed: false } : p));
  const updateGroup = (g: string, changes: Partial<Photo>) => setPhotos(list => list.map(p => p.video && groupOf(p) === g ? { ...p, ...changes } : p));
  const snap = (g: string, x: number, y: number) => setPhotos(list => {
    const target = list.find(p => p.video && p.collapsed && groupOf(p) !== g && Math.abs((p.titleX ?? p.x) - x) < 40 && Math.abs((p.titleY ?? p.y) - y) < 24);
    if (!target) return list.map(p => p.video && groupOf(p) === g ? { ...p, titleX: x, titleY: y } : p);
    const tg = groupOf(target);
    const size = (grp: string) => list.filter(p => p.video && groupOf(p) === grp).length;
    if (size(g) + size(tg) > MAX_GROUP) return list.map(p => p.video && groupOf(p) === g ? { ...p, titleX: x, titleY: y } : p);
    return list.map(p => p.video && (groupOf(p) === g || groupOf(p) === tg) ? { ...p, group: tg, titleX: target.titleX ?? target.x, titleY: target.titleY ?? target.y, title: target.title, collapsed: true } : p); });
  return { photos, selected, select, update, add, addVideo, collapseGroup, openGroup, updateGroup, snap, remove: (id: string) => { setPhotos(list => list.filter(photo => photo.id !== id)); select(null); } };
}

type Editor = ReturnType<typeof useBackgroundPhotos>;

/** View-only toggle: hides pictures and shows every video as its (group) title without changing saved state. */
export const MediaHiddenContext = createContext(false);

export function BackgroundPhotos({ editor: rawEditor, centered = false, scale = 1 }: { editor: Editor; centered?: boolean; scale?: number }) {
  const hidden = useContext(MediaHiddenContext);
  const editor = hidden ? { ...rawEditor, photos: rawEditor.photos.filter(p => p.video).map(p => p.collapsed ? p : { ...p, collapsed: true, titleX: p.titleX ?? p.x, titleY: p.titleY ?? p.y }), selected: null } : rawEditor;
  const gesture = useRef<{ id: string; corner: { x: number; y: number } | null; side?: { x: number; y: number }; x: number; y: number; photo: Photo; moved: boolean } | null>(null);
  const taps = useRef<{ id: string; times: number[] } | null>(null);
  const [cutting, setCutting] = useState<string | null>(null);
  const hold = useRef<number | null>(null);
  const endHold = () => { if (hold.current) window.clearTimeout(hold.current); hold.current = null; };
  const selectedPhoto = editor.photos.find(p => p.id === editor.selected);
  const layer = centered ? "photo-layer photo-layer-centered" : "photo-layer";
  return <>
  {/* Collapsed video titles sit above the dashboard boxes so they stay clickable and draggable anywhere. */}
  <div className={layer} style={{ zIndex: 25 }} aria-label="Video titles">
    {(() => { const seen = new Set<string>(); return editor.photos.filter(p => p.video && p.collapsed).map(p => { const g = p.group ?? p.id; if (seen.has(g)) return null; seen.add(g);
      const members = editor.photos.filter(m => m.video && m.collapsed && (m.group ?? m.id) === g);
      return <VideoTitle key={g} lead={p} count={members.length} scale={scale} editor={editor} group={g} />; }); })()}
  </div>
  <div className={layer} aria-label="Background photos">
    {editor.photos.map(photo => photo.video && photo.collapsed ? null : <div key={photo.id} className={`background-photo ${editor.selected === photo.id ? "is-selected" : ""}`}
      style={{ left: photo.x, top: photo.y, width: photo.width, height: photo.width / photo.ratio, transform: `rotate(${photo.rotation}deg)` }}
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault();
        endHold();
        if (photo.video && cutting !== photo.id) hold.current = window.setTimeout(() => { hold.current = null; gesture.current = null; editor.collapseGroup(photo.id); editor.select(null); }, 800);
        editor.select(photo.id);
        event.currentTarget.setPointerCapture(event.pointerId);
        const rect = event.currentTarget.getBoundingClientRect();
        const edge = Math.min(16, rect.width / 4, rect.height / 4);
        const horizontal = event.clientX - rect.left <= edge ? -1 : rect.right - event.clientX <= edge ? 1 : 0;
        const vertical = event.clientY - rect.top <= edge ? -1 : rect.bottom - event.clientY <= edge ? 1 : 0;
        if (cutting === photo.id) { gesture.current = { id: photo.id, corner: null, side: { x: horizontal, y: vertical }, x: event.clientX, y: event.clientY, photo, moved: false }; return; }
        gesture.current = { id: photo.id, corner: horizontal && vertical ? { x: horizontal, y: vertical } : null, x: event.clientX, y: event.clientY, photo, moved: false };
      }}
      onPointerMove={event => {
        const drag = gesture.current;
        if (!drag || drag.id !== photo.id) {
          const rect = event.currentTarget.getBoundingClientRect();
          const edge = Math.min(16, rect.width / 4, rect.height / 4);
          const left = event.clientX - rect.left <= edge;
          const right = rect.right - event.clientX <= edge;
          const top = event.clientY - rect.top <= edge;
          const bottom = rect.bottom - event.clientY <= edge;
          event.currentTarget.style.cursor = (left || right) && (top || bottom) ? ((left && top) || (right && bottom) ? "nwse-resize" : "nesw-resize") : "move";
          return;
        }
        const dx = (event.clientX - drag.x) / scale;
        const dy = (event.clientY - drag.y) / scale;
        if (Math.hypot(dx, dy) > 4) { drag.moved = true; endHold(); }
        if (!drag.moved) return;
        taps.current = null;
        if (drag.side) {
          if (!drag.side.x && !drag.side.y) return;
          const c = drag.photo.crop ?? NO_CROP;
          const fullW = drag.photo.width / (1 - c.left - c.right);
          const fullH = drag.photo.width / drag.photo.ratio / (1 - c.top - c.bottom);
          const n = { ...c };
          if (drag.side.x < 0) n.left = Math.max(0, Math.min(0.95 - c.right, c.left + dx / fullW));
          if (drag.side.x > 0) n.right = Math.max(0, Math.min(0.95 - c.left, c.right - dx / fullW));
          if (drag.side.y < 0) n.top = Math.max(0, Math.min(0.95 - c.bottom, c.top + dy / fullH));
          if (drag.side.y > 0) n.bottom = Math.max(0, Math.min(0.95 - c.top, c.bottom - dy / fullH));
          const width = fullW * (1 - n.left - n.right);
          editor.update(photo.id, { crop: n, width, ratio: width / (fullH * (1 - n.top - n.bottom)), x: drag.photo.x + (n.left - c.left) * fullW, y: drag.photo.y + (n.top - c.top) * fullH });
          return;
        }
        if (!drag.corner) editor.update(photo.id, { x: drag.photo.x + dx, y: drag.photo.y + dy });
        else {
          const ratio = drag.photo.ratio;
          const width = Math.max(40, Math.min(3000, drag.photo.width + (drag.corner.x * dx + drag.corner.y * dy / ratio) / (1 + 1 / ratio ** 2)));
          editor.update(photo.id, { width, x: drag.photo.x + (drag.corner.x < 0 ? drag.photo.width - width : 0), y: drag.photo.y + (drag.corner.y < 0 ? (drag.photo.width - width) / ratio : 0) });
        }
      }}
      onPointerUp={event => {
        endHold();
        const drag = gesture.current;
        gesture.current = null;
        if (!drag || drag.moved || drag.side) return;
        const now = event.timeStamp;
        const recent = taps.current?.id === photo.id ? taps.current.times.filter(time => now - time < 2000) : [];
        recent.push(now);
        if (recent.length === 3) { editor.remove(photo.id); taps.current = null; }
        else taps.current = { id: photo.id, times: recent };
      }} onPointerCancel={() => { endHold(); gesture.current = null; taps.current = null; }}>
      {(() => { const c = photo.crop ?? NO_CROP; const fw = photo.width / (1 - c.left - c.right); const fh = photo.width / photo.ratio / (1 - c.top - c.bottom);
        return <div className={`photo-crop ${photo.flipped ? "photo-flipped" : ""}`}>{photo.video ? <BoardVideo path={photo.src} sound={photo} selected={editor.selected === photo.id} onSound={changes => editor.update(photo.id, changes)} style={{ position: "absolute", width: fw, height: fh, left: -c.left * fw, top: -c.top * fh, maxWidth: "none", objectFit: "cover" }} /> : <img src={photo.src} alt="Uploaded background photo" draggable={false} style={{ position: "absolute", width: fw, height: fh, left: -c.left * fw, top: -c.top * fh, maxWidth: "none" }} />}</div>; })()}
      {cutting === photo.id && <span className="photo-cut-frame" aria-hidden="true" />}
    </div>)}
    {selectedPhoto && <div className="photo-options photo-toolbar" role="toolbar" aria-label="Picture tools" style={{ left: selectedPhoto.x, top: selectedPhoto.y - 26 }} onPointerDown={e => e.stopPropagation()}>
      <button type="button" aria-label="Rotate" title="Rotate" onClick={() => editor.update(selectedPhoto.id, { rotation: (selectedPhoto.rotation + 90) % 360 })}>⟳</button>
      <button type="button" aria-label="Flip" title="Flip" onClick={() => editor.update(selectedPhoto.id, { flipped: !selectedPhoto.flipped })}>⇋</button>
      <button type="button" aria-label="Cut" title="Cut: drag edges to trim" aria-pressed={cutting === selectedPhoto.id} className={cutting === selectedPhoto.id ? "is-on" : ""} onClick={() => setCutting(v => v === selectedPhoto.id ? null : selectedPhoto.id)}>✂</button>
    </div>}
  </div>
  </>;
}

export function InsertPhoto({ editor, children, className = "glow-button mx-auto flex aspect-square h-auto w-full p-1" }: { editor: Editor; children?: React.ReactNode; className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  return <>
    <Button variant="outline" aria-label="Insert pictures" title="Insert pictures" className={className} onClick={() => input.current?.click()}>
      {children ?? <span className="photo-stack" aria-hidden="true">{[0, 1, 2, 3, 4].map(n => <span key={n} style={{ left: n * 3, top: 12 - n * 3 }} />)}</span>}
    </Button>
    <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={event => { editor.add(event.target.files); event.target.value = ""; }} />
  </>;
}

export function PhotoOptions({ editor }: { editor: Editor }) {
  return <section className="photo-options w-[68.2667px] max-w-[10.1333vw] self-end text-center" aria-label="Image options"><InsertPhoto editor={editor} /></section>;
}
function VideoTitle({ lead, count, scale, editor, group }: { lead: Photo; count: number; scale: number; editor: Editor; group: string }) {
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean; onInput: boolean } | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const x = pos?.x ?? lead.titleX ?? lead.x, y = pos?.y ?? lead.titleY ?? lead.y;
  return <div className="background-photo flex items-stretch gap-1" aria-label="Collapsed video" style={{ left: x, top: y, width: "auto", height: "auto", cursor: "grab", touchAction: "none", zIndex: 30 }}
    onPointerDown={e => { if (e.button !== 0) return; e.stopPropagation(); drag.current = { x: e.clientX, y: e.clientY, ox: x, oy: y, moved: false, onInput: e.target instanceof HTMLInputElement }; }}
    onPointerMove={e => { const d = drag.current; if (!d) return; const dx = (e.clientX - d.x) / scale, dy = (e.clientY - d.y) / scale;
      if (!d.moved && Math.hypot(dx, dy) > 4) { d.moved = true; e.currentTarget.setPointerCapture(e.pointerId); (document.activeElement as HTMLElement | null)?.blur(); }
      if (d.moved) { e.preventDefault(); setPos({ x: d.ox + dx, y: d.oy + dy }); } }}
    onPointerUp={() => { const d = drag.current; drag.current = null; if (!d) return; if (d.moved && pos) editor.snap(group, pos.x, pos.y); else if (!d.moved && !d.onInput) editor.openGroup(group, x, y); setPos(null); }}
    onPointerCancel={() => { drag.current = null; setPos(null); }}>
    <div className="glow-box flex items-center gap-1 bg-background p-1">
    <svg viewBox="0 0 10 10" className="size-2.5 shrink-0" aria-hidden="true"><path d="M2 1l7 4-7 4z" fill="currentColor" /></svg>
    <input value={lead.title ?? ""} placeholder="Video title" aria-label="Video title" size={Math.max(4, (lead.title ?? "").length || 11)} onChange={e => editor.updateGroup(group, { title: e.target.value })} className="bg-transparent text-xs outline-none" />
    </div>
    {Array.from({ length: count - 1 }, (_, i) => <span key={i} aria-label="Snapped video" className="glow-box block w-[9px] shrink-0 self-stretch bg-background" />)}
  </div>;
}

export const MAX_GROUP = 4;
export const SMALL_VIDEO_PX = 220;

/**
 * Looping videos are kept cheap:
 * - only videos that are on screen, on the open tab and big enough actually play (others show a still frame);
 * - at most 2 play at once (1 on phones, small-memory devices or data saver);
 * - nothing plays while the page is in the background;
 * - nothing starts by itself when the device asks for reduced motion or data saving (press play instead);
 * - one shared timer checks sizes instead of one per video.
 */
const lite = () => typeof window !== "undefined" && (matchMedia("(pointer: coarse)").matches
  || (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true
  || ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4);
const calm = () => typeof window !== "undefined" && (matchMedia("(prefers-reduced-motion: reduce)").matches
  || (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true);
const maxPlaying = () => lite() ? 1 : 2;
const playing: HTMLVideoElement[] = [];
function startVideo(el: HTMLVideoElement, keep: boolean) {
  if (!playing.includes(el)) playing.push(el);
  // Videos with sound on are never the ones stopped to make room.
  while (playing.length > maxPlaying()) {
    const victim = playing.find(v => v !== el && v.muted) ?? (keep ? undefined : playing.find(v => v !== el));
    if (!victim) break;
    playing.splice(playing.indexOf(victim), 1); victim.pause();
  }
  if (el.paused) void el.play().catch(() => { if (!el.muted) { el.muted = true; void el.play().catch(() => {}); } });
}
function stopVideo(el: HTMLVideoElement) { const i = playing.indexOf(el); if (i >= 0) playing.splice(i, 1); if (!el.paused) el.pause(); }
const checks = new Set<() => void>();
let ticker: number | null = null;
function watch(check: () => void) {
  checks.add(check);
  if (ticker === null) {
    ticker = window.setInterval(() => checks.forEach(fn => fn()), 1500);
    document.addEventListener("visibilitychange", runChecks);
  }
  return () => { checks.delete(check); if (!checks.size && ticker !== null) { window.clearInterval(ticker); ticker = null; document.removeEventListener("visibilitychange", runChecks); } };
}
function runChecks() { checks.forEach(fn => fn()); }

/** Device-wide "all sound off" switch, kept in this browser. */
export const SoundContext = createContext<{ allMuted: boolean }>({ allMuted: false });

type Sound = { muted?: boolean | undefined; volume?: number | undefined };
function BoardVideo({ path, style, sound, selected, onSound }: { path: string; style: React.CSSProperties; sound: Sound; selected: boolean; onSound: (changes: Sound) => void }) {
  const url = useVideoUrl(path);
  const ref = useRef<HTMLVideoElement>(null);
  const { allMuted } = useContext(SoundContext);
  const [hovered, setHovered] = useState(false);
  // auto: plays when big and on screen. forced: the person pressed play. paused: the person pressed pause.
  const [mode, setMode] = useState<"auto" | "forced" | "paused">(() => calm() ? "paused" : "auto");
  const [isPlaying, setIsPlaying] = useState(false);
  const muted = allMuted || (sound.muted ?? true);
  const volume = sound.volume ?? 0.8;
  useEffect(() => { const el = ref.current; if (el) { el.muted = muted; el.volume = volume; } }, [muted, volume, url]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let visible = false;
    const update = () => {
      if (mode === "paused" || document.hidden || !visible) return stopVideo(el);
      const big = el.getBoundingClientRect().width >= SMALL_VIDEO_PX;
      if (mode === "forced" || !el.muted || big || hovered) startVideo(el, mode === "forced" || !el.muted); else stopVideo(el);
    };
    const io = new IntersectionObserver(([entry]) => { visible = !!entry?.isIntersecting; update(); });
    const ro = new ResizeObserver(update);
    io.observe(el); ro.observe(el);
    const unwatch = watch(update);
    update();
    return () => { io.disconnect(); ro.disconnect(); unwatch(); stopVideo(el); };
  }, [url, hovered, mode, muted]);
  if (!url) return <div aria-label="Loading video" style={style} />;
  const showControls = hovered || selected || !muted || mode === "paused";
  const stop = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation();
  return <>
    <video ref={ref} src={url} aria-label="Uploaded background video" loop playsInline muted disablePictureInPicture disableRemotePlayback
      preload={mode === "forced" || hovered || selected ? "auto" : "metadata"} style={style}
      onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)}
      onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)} />
    {showControls && <div className="video-controls" role="group" aria-label="Video controls" onPointerDown={stop} onPointerUp={stop} onClick={stop} onDoubleClick={stop}
      onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
      <button type="button" aria-label={isPlaying ? "Pause video" : "Play video"} title={isPlaying ? "Pause" : "Play"}
        onClick={() => setMode(isPlaying ? "paused" : "forced")}>
        {isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
      </button>
      <button type="button" aria-label={muted ? "Turn sound on" : "Turn sound off"} aria-pressed={!muted} title={allMuted ? "All sound is off (top bar)" : muted ? "Sound on" : "Sound off"} disabled={allMuted}
        onClick={() => { onSound({ muted: !muted }); if (muted) setMode("forced"); }}>
        {muted ? <VolumeX aria-hidden="true" /> : volume < 0.5 ? <Volume1 aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
      </button>
      {!muted && <input type="range" min={0} max={100} step={5} value={Math.round(volume * 100)} aria-label="Volume" title={`Volume ${Math.round(volume * 100)}%`}
        onChange={e => onSound({ volume: Number(e.target.value) / 100 })} />}
    </div>}
  </>;
}

/** Video uploads are switched off for now (no cross-device video storage yet). */
export function InsertVideo(_props: { editor: Editor }) {
  return <section className="photo-options w-[68.2667px] max-w-[10.1333vw] self-end text-center" aria-label="Video options">
    <Button variant="outline" aria-disabled="true" aria-label="Video upload not available rn" title="Video upload not available rn"
      className="glow-button mx-auto flex aspect-square h-auto w-full cursor-not-allowed whitespace-normal p-1 opacity-60 hover:bg-background hover:text-foreground"
      onClick={() => toast("Video upload not available rn")}>
      <span className="text-[7px] font-normal leading-tight">Video upload not available rn</span>
    </Button>
  </section>;
}
