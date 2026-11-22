import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CircleHelp, Moon, Plus, Undo2, Volume2, VolumeX } from "lucide-react";
import { MediaHiddenContext, SoundContext } from "@/components/background-photos";
import { Button } from "@/components/ui/button";
import { BackgroundPhotos, PhotoOptions, InsertVideo, useBackgroundPhotos } from "@/components/background-photos";
import { BoardSaveMenu } from "@/components/board-save-menu";
import { BarGraphs, InsertGraph, newBarGraph } from "@/components/bar-graphs";
import { addParent, MAX_PARENTS, addSubtab, removeSubtab, reorderParent, reorderSubtab, initialBoard, newDashboard, type DashboardState } from "@/lib/board-state";
import { useTabDrag } from "@/hooks/use-tab-drag";
import { useSubtabPrompt } from "@/hooks/use-subtab-prompt";
import { HomePhotoScene } from "@/components/home-photo-scene";
import { MetricEditor, type MetricState } from "@/components/metric-editor";
import { FloatingBoxes, InsertNote, InsertProgress, newNoteBox, newProgressBox } from "@/components/floating-boxes";
import { DashboardView } from "@/components/dashboard-view";
import horusEye from "@/assets/horus-eye.png";

export function GlowBoard() {
  const [board, setBoard] = useState(initialBoard);
  const active = board.active;
  // Undo history: keeps the 3 most recent board states; rapid changes (typing, dragging) within 500ms count as one action.
  const history = useRef<ReturnType<typeof initialBoard>[]>([]);
  const lastBoard = useRef(board);
  const lastChange = useRef(0);
  const undoing = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  useEffect(() => {
    if (lastBoard.current === board) return;
    if (undoing.current) undoing.current = false;
    else {
      const now = Date.now();
      if (now - lastChange.current > 500) history.current = [...history.current, lastBoard.current].slice(-3);
      lastChange.current = now;
    }
    lastBoard.current = board;
    setCanUndo(history.current.length > 0);
  }, [board]);
  // Loading saved data is not an undoable action: start fresh history so undo never returns to the blank start board.
  const restoreBoard = (restored: ReturnType<typeof initialBoard>) => {
    history.current = []; undoing.current = true; lastChange.current = 0; setCanUndo(false);
    setBoard(restored);
  };
  const undo = () => {
    const previous = history.current.pop();
    if (!previous) return;
    undoing.current = true; lastChange.current = 0;
    setBoard(previous);
  };
  const undoRef = useRef(undo);
  undoRef.current = undo;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.key.toLowerCase() !== "z") return;
      if (event.target instanceof Element && event.target.closest("input, textarea, [contenteditable]")) return;
      event.preventDefault(); undoRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  useNoAccidentalSelection();
  const [helpOpen, setHelpOpen] = useState(false);
  // One stable updater for every dashboard, so unchanged tabs can skip re-rendering.
  const updateDashboard = useCallback((index: number, child: number | null, update: (state: DashboardState) => DashboardState) => setBoard(previous => ({
    ...previous,
    dashboards: previous.dashboards.map((item, i) => i !== index ? item : child === null ? { ...item, ...update(item) } : { ...item, subTabs: item.subTabs.map((entry, j) => j === child ? update(entry) : entry) }),
  })), []);
  const setActive = (active: number | null, activeSubtab: number | null = null) => setBoard(previous => ({ ...previous, active, activeSubtab }));
  const subtabPrompt = useSubtabPrompt(active !== null);
  const [hoveredParent, setHoveredParent] = useState<number | null>(null);
  const [pinnedParent, setPinnedParent] = useState<number | null>(null);
  const menuParent = pinnedParent ?? hoveredParent;
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(`[data-parent-tab="${pinnedParent}"]`)) return;
      setPinnedParent(null);
      setHoveredParent(null);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [pinnedParent]);
  const [parentSize, setParentSize] = useState({ width: 0, height: 24, left: 0, top: 0 });
  const revealSubtabs = (index: number, element: HTMLElement) => {
    const bounds = element.querySelector(':scope > [role="tab"]')?.getBoundingClientRect();
    if (bounds) setParentSize({ width: Math.max(0, window.innerWidth - bounds.left - 16), height: bounds.height, left: bounds.left, top: bounds.bottom });
    setHoveredParent(index);
  };
  const [deletePrompt, setDeletePrompt] = useState<{ parent: number; child: number; stage: 1 | 2 } | null>(null);
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelDeleteHold = () => { if (deleteTimer.current) clearTimeout(deleteTimer.current); deleteTimer.current = null; };
  const tabDrag = useTabDrag((parent, child, target) => {
    setBoard(previous => child === null ? reorderParent(previous, parent, target) : reorderSubtab(previous, parent, child, target));
    setPinnedParent(child === null ? target : parent);
    setHoveredParent(null);
  }, cancelDeleteHold);
  const [parentPrompt, setParentPrompt] = useState(false);
  const [hideMedia, setHideMedia] = useState(false);
  // Device-wide sound switch, remembered in this browser (e.g. keep a phone silent in public).
  const [allMuted, setAllMuted] = useState(false);
  useEffect(() => { try { setAllMuted(localStorage.getItem("glow-board:all-muted") === "1"); } catch { /* default: sound allowed */ } }, []);
  const toggleAllMuted = () => setAllMuted(value => { try { localStorage.setItem("glow-board:all-muted", value ? "0" : "1"); } catch { /* still applies for this visit */ } return !value; });
  const sound = useMemo(() => ({ allMuted }), [allMuted]);
  const parentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelParentHold = () => { if (parentTimer.current) clearTimeout(parentTimer.current); parentTimer.current = null; };
  useEffect(() => {
    if (!parentPrompt) return;
    const dismiss = (event: PointerEvent) => { if (event.target instanceof Element && event.target.closest("[data-parent-prompt]")) return; setParentPrompt(false); };
    const id = setTimeout(() => document.addEventListener("pointerdown", dismiss));
    return () => { clearTimeout(id); document.removeEventListener("pointerdown", dismiss); };
  }, [parentPrompt]);
  const titles = board.dashboards.map(dashboard => dashboard.title);
  const homePhotos = useBackgroundPhotos({ photos: board.homePhotos, onChange: homePhotos => setBoard(previous => ({ ...previous, homePhotos })), centered: true });
  return <MediaHiddenContext.Provider value={hideMedia}><SoundContext.Provider value={sound}><div className="board-shell flex flex-col overflow-hidden bg-background text-foreground">
    <nav aria-label="Dashboard tabs" className="board-navigation">
      <Button variant="outline" size="icon" aria-label="Home" title="Home" aria-pressed={active === null}
        className="glow-button home-button h-6 w-7 p-[3px] bg-background text-foreground hover:bg-background hover:text-foreground" onClick={() => setActive(null)}><Moon strokeWidth={active === null ? 2 : 1.5} /></Button>
      <div role="tablist" aria-label="Dashboards" className="board-tabs">
        {titles.map((title, index) => <div key={index} data-parent-tab={index} className="board-tab-parent" onPointerEnter={event => revealSubtabs(index, event.currentTarget)} onPointerLeave={() => setHoveredParent(null)}
          onFocus={event => revealSubtabs(index, event.currentTarget)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setHoveredParent(null); }}>
          <Button variant="outline" role="tab" id={`board-tab-${index}`} data-no-subtab-prompt data-drag-parent={index}
           data-drag-target={tabDrag.target?.child === null && tabDrag.target.target === index ? true : undefined}
           onPointerDown={event => { tabDrag.start(event, index); cancelParentHold(); if (index === titles.length - 1) parentTimer.current = setTimeout(() => setParentPrompt(true), 3000); }}
           onPointerUp={cancelParentHold} onPointerLeave={cancelParentHold} onPointerCancel={cancelParentHold}
          aria-label={`Dashboard ${index + 1}: ${title || "Title"}`} aria-selected={active === index}
           aria-controls={`board-panel-${index}`} className="glow-button board-tab h-auto min-h-6 w-auto px-1.5 py-0.5 text-[10px] whitespace-normal bg-background text-foreground hover:bg-background hover:text-foreground font-normal aria-selected:font-semibold" title={title || `Title ${index + 1}`}
          onClick={event => { setActive(index); setPinnedParent(index); if (event.currentTarget.parentElement) revealSubtabs(index, event.currentTarget.parentElement); }} onKeyDown={event => {
            const next = event.key === "ArrowRight" ? (index + 1) % titles.length : event.key === "ArrowLeft" ? (index + titles.length - 1) % titles.length : event.key === "Home" ? 0 : event.key === "End" ? titles.length - 1 : null;
            if (next === null) return;
            event.preventDefault(); setActive(next);
            document.getElementById(`board-tab-${next}`)?.focus();
           }}> <span>{title || "Title"}</span></Button>
          {menuParent === index && ((board.dashboards[index]?.subTabs.length ?? 0) > 0 || (pinnedParent === index && active === index)) && <div data-no-subtab-prompt className="board-subtabs" role="group" aria-label={`${title || "Title"} subtabs`}
            style={{ maxWidth: parentSize.width, left: parentSize.left, top: parentSize.top, "--parent-tab-height": `${parentSize.height}px` } as CSSProperties}>
            {board.dashboards[index]?.subTabs.map((subtab, child) => <Button key={child} variant="outline" role="tab" id={`board-subtab-${index}-${child}`}
              aria-label={`Subtab ${child + 1}: ${title || "Title"} - ${subtab.title || "Title"}`} aria-selected={active === index && board.activeSubtab === child}
              aria-controls={`board-subpanel-${index}-${child}`} className="glow-button board-tab h-auto min-h-6 px-1.5 py-0.5 text-[10px] bg-background text-foreground hover:bg-background hover:text-foreground font-normal aria-selected:font-semibold"
              data-drag-child={child} data-drag-owner={index}
              data-drag-target={tabDrag.target?.child !== null && tabDrag.target?.parent === index && tabDrag.target.target === child ? true : undefined}
              title={subtab.title || "Title"} onPointerDown={event => { tabDrag.start(event, index, child); setPinnedParent(index); cancelDeleteHold(); deleteTimer.current = setTimeout(() => { setDeletePrompt({ parent: index, child, stage: 1 }); setHoveredParent(null); }, 3000); }}
              onPointerUp={cancelDeleteHold} onPointerLeave={cancelDeleteHold} onPointerCancel={cancelDeleteHold}
              onClick={() => { setActive(index, child); setHoveredParent(null); }}><span className="min-w-0 truncate">{subtab.title || "Title"}</span></Button>)}
            {active === index && (board.dashboards[index]?.subTabs.length ?? 7) < 7 && <Button variant="outline" aria-label="Add sub tab" title="Add sub tab (up to 7)"
              className="glow-button board-tab board-add h-auto min-h-6 px-1.5 py-0.5 text-[10px] font-normal" onClick={() => setBoard(addSubtab)}><Plus strokeWidth={1.5} /> sub tab</Button>}
          </div>}
        </div>)}
        {titles.length < MAX_PARENTS && <Button variant="outline" aria-label="Add tab" title="Add tab" data-no-subtab-prompt
          className="glow-button board-tab board-add h-6 w-6 p-[3px] bg-background text-foreground" onClick={() => setBoard(addParent)}><Plus strokeWidth={1.5} /></Button>}
      </div>
      <Button variant="outline" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo}
        className="glow-button ml-auto h-6 w-7 shrink-0 p-[3px] bg-background text-foreground hover:bg-background hover:text-foreground" onClick={undo}><Undo2 strokeWidth={1.5} /></Button>
      <Button variant="outline" aria-label={hideMedia ? "Show pictures and videos" : "Hide pictures and videos"} aria-pressed={hideMedia} title={hideMedia ? "Show media" : "Hide media"}
        className="glow-button -mr-1 h-6 w-8 shrink-0 p-0.5 [&_svg]:size-auto bg-background text-foreground hover:bg-background hover:text-foreground" onClick={() => setHideMedia(v => !v)}>
        <HorusEye closed={hideMedia} /></Button>
      <Button variant="outline" aria-label={allMuted ? "Allow video sound" : "Turn off all video sound"} aria-pressed={allMuted} title={allMuted ? "All sound is off: click to allow sound" : "Sound allowed: click to silence every video"}
        className="glow-button h-6 w-7 shrink-0 p-[3px] bg-background text-foreground hover:bg-background hover:text-foreground" onClick={toggleAllMuted}>
        {allMuted ? <VolumeX strokeWidth={1.5} /> : <Volume2 strokeWidth={1.5} />}</Button>
      <BoardSaveMenu snapshot={board} onRestore={restoreBoard} />
      <Button variant="outline" aria-label="How to use" title="How to use" aria-expanded={helpOpen} data-no-subtab-prompt
        className="glow-button h-6 w-7 shrink-0 p-[3px] bg-background text-foreground hover:bg-background hover:text-foreground" onClick={() => setHelpOpen(v => !v)}><CircleHelp strokeWidth={1.5} /></Button>
    </nav>
    {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
    {subtabPrompt.open && <div ref={subtabPrompt.prompt} role="dialog" aria-modal="false" aria-labelledby="add-subtab-title" className="subtab-prompt glow-box">
      <p id="add-subtab-title">add sub tab?</p>
      <div className="flex justify-center gap-3">
        <Button variant="outline" className="glow-button h-7 px-3 text-xs" disabled={(active === null ? 7 : board.dashboards[active]?.subTabs.length ?? 7) >= 7}
          onClick={() => { setBoard(addSubtab); subtabPrompt.close(); }}>Yes</Button>
        <Button variant="outline" className="glow-button h-7 px-3 text-xs" onClick={subtabPrompt.close}>No</Button>
      </div>
      {(active === null ? 0 : board.dashboards[active]?.subTabs.length ?? 0) >= 7 && <p className="text-[10px]">7 / 7 subtabs</p>}
    </div>}
    {parentPrompt && <div data-no-subtab-prompt data-parent-prompt role="dialog" aria-modal="false" aria-labelledby="add-parent-title" className="subtab-prompt glow-box">
      <p id="add-parent-title">add parent tab?</p>
      <div className="flex justify-center gap-3">
        <Button variant="outline" className="glow-button h-7 px-3 text-xs" disabled={titles.length >= MAX_PARENTS}
          onClick={() => { setBoard(addParent); setParentPrompt(false); }}>Yes</Button>
        <Button variant="outline" className="glow-button h-7 px-3 text-xs" onClick={() => setParentPrompt(false)}>No</Button>
      </div>
      {titles.length >= MAX_PARENTS && <p className="text-[10px]">{MAX_PARENTS} / {MAX_PARENTS} tabs</p>}
    </div>}
    {deletePrompt && <div data-no-subtab-prompt role="dialog" aria-modal="false" aria-labelledby="delete-subtab-title" className="subtab-prompt glow-box">
      <p id="delete-subtab-title">{deletePrompt.stage === 1 ? "delete sub tab?" : "are you sure?"}</p>
      <div className="flex justify-center gap-3">
        <Button variant="outline" className="glow-button h-7 px-3 text-xs" onClick={() => {
          if (deletePrompt.stage === 1) return setDeletePrompt({ ...deletePrompt, stage: 2 });
          setBoard(previous => removeSubtab(previous, deletePrompt.parent, deletePrompt.child)); setDeletePrompt(null);
        }}>Yes</Button>
        <Button variant="outline" className="glow-button h-7 px-3 text-xs" onClick={() => setDeletePrompt(null)}>No</Button>
      </div>
    </div>}
    <main aria-label="Home" hidden={active !== null} className={active === null ? "relative isolate flex flex-1 items-center justify-center overflow-hidden p-6" : "hidden"}>
      <HomePhotoScene editor={homePhotos} view={board.homeView} onViewChange={homeView => setBoard(previous => ({ ...previous, homeView }))} />
    </main>
    {board.dashboards.map((parent, index) => <div key={index} className={active === index ? "flex min-h-0 flex-1 flex-col" : "hidden"} hidden={active !== index}>
      <div role="tabpanel" id={`board-panel-${index}`} aria-labelledby={`board-tab-${index}`} hidden={board.activeSubtab !== null}
        className={board.activeSubtab === null ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
        <Dashboard state={parent} index={index} child={null} onUpdate={updateDashboard} />
      </div>
      {parent.subTabs.map((subtab, child) => <div key={child} role="tabpanel" id={`board-subpanel-${index}-${child}`} aria-label={`${parent.title || "Title"} - ${subtab.title || "Title"}`}
        hidden={board.activeSubtab !== child} className={board.activeSubtab === child ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
        <Dashboard state={subtab} parentTitle={parent.title || "Title"} index={index} child={child} onUpdate={updateDashboard} />
      </div>)}
    </div>)}
  </div></SoundContext.Provider></MediaHiddenContext.Provider>;
}

type Item = MetricState & { text: string };

type DashboardProps = { state: DashboardState | undefined; index: number; child: number | null; onUpdate: (index: number, child: number | null, update: (state: DashboardState) => DashboardState) => void; parentTitle?: string };
const Dashboard = memo(function Dashboard({ state, index, child, onUpdate, parentTitle }: DashboardProps) {
  const onChange = useCallback((update: (state: DashboardState) => DashboardState) => onUpdate(index, child, update), [onUpdate, index, child]);
  const current = state ?? EMPTY_DASHBOARD;
  const zoom = current?.view?.zoom ?? 1;
  const photos = useBackgroundPhotos({ photos: current?.photos ?? [], onChange: photos => onChange(previous => ({ ...previous, photos })) });
  if (!current) return null;
  const { title, items } = current;
  const onTitleChange = (title: string) => onChange(previous => ({ ...previous, title }));
  const setItems = (update: (items: Item[]) => Item[]) => onChange(previous => ({ ...previous, items: update(previous.items) }));
  const update = (i: number, p: Partial<Item>) =>
    setItems((s) => s.map((it, j) => (j === i ? { ...it, ...p } : it)));

  return (
    <DashboardView view={current.view ?? { zoom: 1, x: 0, y: 0 }} onChange={view => onChange(previous => ({ ...previous, view }))}>
    <main className="board-fixed relative isolate flex min-h-[820px] w-[1100px] shrink-0 flex-col gap-6 bg-background p-6 text-foreground">
      <BackgroundPhotos editor={photos} scale={zoom} />
      <header className="pointer-events-none relative z-10 flex flex-nowrap items-start justify-between gap-2">
        <div className="pointer-events-auto flex min-w-0 flex-nowrap items-center gap-2 bg-background">
          {parentTitle !== undefined && <>
            <span className="shrink-0 whitespace-nowrap text-sm font-semibold uppercase" title={parentTitle}>{parentTitle}</span>
            <span className="shrink-0 text-sm font-semibold">-</span>
          </>}
          <span className="inline-grid min-w-0 overflow-hidden">
            <span aria-hidden className="invisible col-start-1 row-start-1 whitespace-pre border-b border-foreground/40 bg-transparent px-1 py-1 text-sm font-semibold uppercase tracking-widest">{title || "T"}</span>
            <input
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Title"
              size={1}
              className="col-start-1 row-start-1 w-0 min-w-full border-b border-foreground/40 bg-transparent px-1 py-1 text-sm font-semibold uppercase tracking-widest outline-none focus:border-foreground"
            />
          </span>
        </div>
        <div className="pointer-events-none flex shrink-0 flex-col-reverse items-stretch gap-1.5">
        {/* Empty space around the insert buttons lets clicks through to pictures/videos behind it. */}
        <div className="flex flex-col items-end gap-1.5 [&>*]:pointer-events-auto">
          <PhotoOptions editor={photos} />
          <InsertVideo editor={photos} />
          <InsertGraph onInsert={() => onChange(previous => ({ ...previous, graphs: [...previous.graphs, newBarGraph()] }))} />
          <InsertProgress onInsert={() => onChange(previous => ({ ...previous, bars: [...(previous.bars ?? []), newProgressBox()] }))} />
          <InsertNote onInsert={() => onChange(previous => ({ ...previous, notes: [...(previous.notes ?? []), newNoteBox()] }))} />
        </div>
        <section className="pointer-events-auto glow-box w-64 max-w-[38vw] space-y-1.5 p-2">
          {items.map((it, i) => (
            <MetricEditor key={i} metric={it} label={`Progress ${i + 1}`} onChange={change => update(i, change)} />
          ))}
        </section>
        </div>
      </header>

      <div className="pointer-events-none flex-1 min-h-12" />
      {current.graphs.length > 0 && <BarGraphs scale={zoom} graphs={current.graphs} onChange={graphs => onChange(previous => ({ ...previous, graphs }))} />}
      <FloatingBoxes bars={current.bars ?? []} notes={current.notes ?? []} scale={zoom}
        onBars={u => onChange(previous => ({ ...previous, bars: u(previous.bars ?? []) }))} onNotes={u => onChange(previous => ({ ...previous, notes: u(previous.notes ?? []) }))} />
    </main>
    </DashboardView>
  );
});
const EMPTY_DASHBOARD = newDashboard();


/** Eye of Horus icon traced from the user's reference; drawn in the current text color, with a slash when hidden. */
function HorusEye({ closed }: { closed: boolean }) {
  const mask = `url(${horusEye}) center / contain no-repeat`;
  return <span aria-hidden="true" className="relative block h-[15px] w-5">
    <span className="absolute inset-0 bg-current" style={{ mask, WebkitMask: mask }} />
    {closed && <svg viewBox="0 0 20 15" className="absolute inset-0 h-full w-full" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><path d="M1 14L19 1" /></svg>}
  </span>;
}

const EDITABLE = "input, textarea, [contenteditable='true']";
/** While a press-and-drag that started outside a text field is in progress, nothing on the page can get text-selected. */
function useNoAccidentalSelection() {
  useEffect(() => {
    const root = document.documentElement;
    const down = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(EDITABLE)) return;
      root.classList.add("is-dragging");
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && !(document.activeElement?.matches(EDITABLE))) selection.removeAllRanges();
    };
    const up = () => root.classList.remove("is-dragging");
    document.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    window.addEventListener("blur", up);
    return () => { document.removeEventListener("pointerdown", down, true); window.removeEventListener("pointerup", up, true); window.removeEventListener("pointercancel", up, true); window.removeEventListener("blur", up); };
  }, []);
}

const HELP: [string, string][] = [
  ["Tabs", "Click a tab to open it, then type its name at the top. Drag tabs sideways to reorder them. + adds a tab."],
  ["Sub tabs", "Click an open tab to see its sub tabs and + sub tab. Drag them up or down to reorder; hold one for 3 seconds to delete it."],
  ["Add things", "The square buttons on the right of a dashboard add pictures, videos, a bar graph, a progress bar or a note."],
  ["Move & resize", "Drag boxes (by their edge or title) and pictures to move them. Drag a box corner to resize the box. Hover the inner area and drag its small corner tick to make the title and text inside bigger or smaller (double-click the tick to reset). Click a title to edit it. Drag the empty background to pan and scroll to zoom (home has + and − buttons)."],
  ["Pictures", "Click a picture for rotate, flip and cut options. Tap it 3 times quickly to delete it. Hold a video to fold it into a title."],
  ["Checklists", "In a note, tap a line 3 times to turn it into a checkbox. Enter adds the next one; Enter twice stops."],
  ["Progress", "Hold a progress bar for 4 seconds to switch between a bar and checkboxes."],
  ["Graphs", "Double tap the bottom axis to add a bar, triple tap to remove one. Double tap the side axis for fractions."],
  ["Saving", "Everything saves automatically. The save button shows the slot in use; click it to keep copies in other slots."],
  ["Videos", "Video upload is not available right now. Videos start silent and only play while on screen and big enough. The speaker in the top bar silences every video on this device."],
  ["Undo", "The arrow button or Ctrl+Z undoes your last 3 changes. The eye hides pictures and videos."],
];

function HelpPanel({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  return <div data-no-subtab-prompt role="dialog" aria-labelledby="help-title" className="help-panel glow-box">
    <div className="flex items-center justify-between gap-2">
      <h2 id="help-title" className="text-sm font-semibold uppercase tracking-widest">How to use</h2>
      <Button variant="outline" className="glow-button h-6 px-2 text-[11px]" onClick={onClose}>Close</Button>
    </div>
    <dl>{HELP.map(([term, text]) => <div key={term}><dt>{term}</dt><dd>{text}</dd></div>)}</dl>
  </div>;
}
