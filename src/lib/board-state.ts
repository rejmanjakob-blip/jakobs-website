import { z } from "zod";

const metricFields = { boxMode: z.boolean().optional(), boxTotal: z.number().int().min(1).max(10000).optional(), boxFilled: z.array(z.boolean()).max(10000).optional() };
const itemSchema = z.object({ label: z.string(), value: z.number().min(0).max(100), text: z.string(), ...metricFields });
const photoSchema = z.object({ id: z.string(), src: z.string(), x: z.number(), y: z.number(), width: z.number(), ratio: z.number().positive(), rotation: z.number(), flipped: z.boolean(), video: z.boolean().optional(), muted: z.boolean().optional(), volume: z.number().min(0).max(1).optional(), collapsed: z.boolean().optional(), title: z.string().optional(), titleX: z.number().optional(), titleY: z.number().optional(), group: z.string().optional(), crop: z.object({ top: z.number(), right: z.number(), bottom: z.number(), left: z.number() }).optional() });
export const graphSchema = z.object({ id: z.string(), xTitle: z.string(), yTitle: z.string(), values: z.array(z.number().min(0).max(100)).min(1), x: z.number().default(40), y: z.number().default(260), width: z.number().default(260), height: z.number().default(240), mode: z.enum(["percent", "fraction"]).default("percent"), denominator: z.number().int().min(1).max(25).default(1) });
/** textScale zooms a box's text and controls together (corner resizing); older saves without it show at 1. */
const textScale = z.number().min(0.2).max(5).optional();
export const progressBoxSchema = z.object({ id: z.string(), label: z.string(), value: z.number().min(0).max(100), x: z.number(), y: z.number(), width: z.number(), height: z.number().positive().optional(), textScale, ...metricFields });
export const noteBoxSchema = z.object({ id: z.string(), label: z.string(), text: z.string(), x: z.number(), y: z.number(), width: z.number(), height: z.number(), textScale });
export type ProgressBoxState = z.infer<typeof progressBoxSchema>;
export type NoteBoxState = z.infer<typeof noteBoxSchema>;
const viewSchema = z.object({ zoom: z.number().min(0.25).max(3), x: z.number(), y: z.number() });
export type ViewState = z.infer<typeof viewSchema>;
export type BarGraphState = z.infer<typeof graphSchema>;
type Item = z.infer<typeof itemSchema>;
const uid = () => crypto.randomUUID();
/** Original 7 bars/paragraphs become a movable template; only items[0] stays as the permanent anchor bar. */
export function templateBoxes(items: Item[], mini: Item[]) {
  const bars = [...items.slice(1), ...mini].map((it, i) => ({ id: uid(), label: it.label, value: it.value, x: 16, y: 70 + i * 54, width: 220 }));
  const notes = [...items.map(it => ({ it, w: 160, h: 150 })), ...mini.map(it => ({ it, w: 128, h: 120 }))]
    .map(({ it, w, h }, i) => ({ id: uid(), label: it.label, text: it.text, x: 16 + i * 170, y: 420, width: w, height: h }));
  return { bars, notes };
}
function migrate(raw: unknown) {
  if (!raw || typeof raw !== "object") return raw;
  const d = raw as { items?: Item[]; mini?: Item[]; bars?: unknown[]; notes?: unknown[] };
  if (!Array.isArray(d.items) || (d.items.length <= 1 && !d.mini)) return raw;
  const { bars, notes } = templateBoxes(d.items, d.mini ?? []);
  const { mini: _m, ...rest } = d;
  return { ...rest, items: d.items.slice(0, 1), bars: [...bars, ...(d.bars ?? [])], notes: [...notes, ...(d.notes ?? [])] };
}
const MAX_PARENTS_ = 30;
const dashboardContentObject = z.object({ title: z.string(), items: z.array(itemSchema).length(1), photos: z.array(photoSchema), graphs: z.array(graphSchema).default([]), bars: z.array(progressBoxSchema).default([]), notes: z.array(noteBoxSchema).default([]), view: viewSchema.default({ zoom: 1, x: 0, y: 0 }) });
const dashboardContentSchema = z.preprocess(migrate, dashboardContentObject);
export const dashboardSchema = z.preprocess(migrate, dashboardContentObject.extend({ subTabs: z.array(dashboardContentSchema).max(7).default([]) }));
export const boardSchema = z.object({ active: z.number().int().min(0).max(29).nullable(), activeSubtab: z.number().int().min(0).max(6).nullable().default(null), homePhotos: z.array(photoSchema), homeView: z.object({ zoom: z.number().min(0.25).max(3), x: z.number(), y: z.number() }).default({ zoom: 1, x: 0, y: 0 }), dashboards: z.array(dashboardSchema).min(1).max(MAX_PARENTS_) });
export const MAX_PARENTS = 30;
export function addParent(board: BoardState): BoardState {
  if (board.dashboards.length >= MAX_PARENTS) return board;
  return { ...board, active: board.dashboards.length, activeSubtab: null, dashboards: [...board.dashboards, { ...newDashboard(), subTabs: [] }] };
}
export type BoardState = z.infer<typeof boardSchema>;
export type DashboardState = z.infer<typeof dashboardContentSchema>;
export type SaveSlot = { slot: number; saved_at: string };
export const slotSchema = z.number().int().min(1).max(10);
export function initialBoard(): BoardState {
  return { active: null, activeSubtab: null, homePhotos: [], homeView: { zoom: 1, x: 0, y: 0 }, dashboards: Array.from({ length: 10 }, () => ({ ...newDashboard(), subTabs: [] })) };
}
export function newDashboard(): DashboardState {
  const items = [{ label: "metric 1", value: 0, text: "" }];
  const bars = Array.from({ length: 6 }, (_, i) => ({ id: uid(), label: `metric ${i + 2}`, value: 0, x: 24, y: 80 + i * 64, width: 220 }));
  const notes = Array.from({ length: 7 }, (_, i) => ({ id: uid(), label: `note ${i + 1}`, text: "", x: 24 + (i % 4) * 184, y: 490 + Math.floor(i / 4) * 174, width: 160, height: 150 }));
  return { title: "", items, photos: [], graphs: [], bars, notes, view: { zoom: 1, x: 0, y: 0 } };
}
export function addSubtab(board: BoardState): BoardState {
  const parent = board.active === null ? undefined : board.dashboards[board.active];
  if (!parent || parent.subTabs.length >= 7) return board;
  return { ...board, activeSubtab: parent.subTabs.length, dashboards: board.dashboards.map((dashboard, index) => index === board.active ? { ...dashboard, subTabs: [...dashboard.subTabs, newDashboard()] } : dashboard) };
}

function movedIndex(index: number | null, from: number, to: number): number | null {
  if (index === null) return null;
  if (index === from) return to;
  if (from < to && index > from && index <= to) return index - 1;
  if (from > to && index >= to && index < from) return index + 1;
  return index;
}

function moveEntry<T>(entries: T[], from: number, to: number): T[] {
  const result = [...entries];
  const [entry] = result.splice(from, 1);
  if (entry === undefined) return entries;
  result.splice(to, 0, entry);
  return result;
}

export function reorderParent(board: BoardState, from: number, to: number): BoardState {
  if (from === to || !board.dashboards[from] || !board.dashboards[to]) return board;
  return { ...board, active: movedIndex(board.active, from, to), dashboards: moveEntry(board.dashboards, from, to) };
}

export function reorderSubtab(board: BoardState, parent: number, from: number, to: number): BoardState {
  const dashboard = board.dashboards[parent];
  if (from === to || !dashboard?.subTabs[from] || !dashboard.subTabs[to]) return board;
  return { ...board, activeSubtab: board.active === parent ? movedIndex(board.activeSubtab, from, to) : board.activeSubtab,
    dashboards: board.dashboards.map((entry, index) => index === parent ? { ...entry, subTabs: moveEntry(entry.subTabs, from, to) } : entry) };
}

export function removeSubtab(board: BoardState, parent: number, child: number): BoardState {
  const target = board.dashboards[parent];
  if (!target || !target.subTabs[child]) return board;
  let activeSubtab = board.activeSubtab;
  if (board.active === parent && activeSubtab !== null) activeSubtab = activeSubtab === child ? null : activeSubtab > child ? activeSubtab - 1 : activeSubtab;
  return { ...board, activeSubtab, dashboards: board.dashboards.map((d, i) => i === parent ? { ...d, subTabs: d.subTabs.filter((_, j) => j !== child) } : d) };
}

// ---- Merging edits from two browsers ----
// Three-way merge: "base" is the version both started from. For every part of the board, whoever changed
// it wins; if both changed the very same part, "mine" (this browser) wins. Boxes, pictures and graphs are
// matched by id, so edits to different boxes on the same tab are both kept, and deletions stick.
const sameValue = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);
const pick = <T,>(base: T | undefined, mine: T, theirs: T): T => base !== undefined && sameValue(mine, base) ? theirs : mine;

function mergeById<T extends { id: string }>(base: T[] = [], mine: T[] = [], theirs: T[] = []): T[] {
  const index = (list: T[]) => new Map(list.map(item => [item.id, item]));
  const B = index(base), M = index(mine), T_ = index(theirs);
  const ids = [...mine.map(item => item.id), ...theirs.map(item => item.id).filter(id => !M.has(id))];
  const out: T[] = [];
  for (const id of ids) {
    const b = B.get(id), m = M.get(id), t = T_.get(id);
    if (m && t) out.push(pick(b, m, t));
    else if (m) { if (!(b && sameValue(b, m))) out.push(m); }       // they deleted it, unless I changed it
    else if (t) { if (!(b && sameValue(b, t))) out.push(t); }       // I deleted it, unless they changed it
  }
  return out;
}

function mergeDashboard<D extends DashboardState & { subTabs?: DashboardState[] }>(base: D | undefined, mine: D, theirs: D): D {
  if (!base) return mine;
  const merged = {
    ...mine,
    title: pick(base.title, mine.title, theirs.title),
    items: pick(base.items, mine.items, theirs.items),
    view: pick(base.view, mine.view, theirs.view),
    photos: mergeById(base.photos, mine.photos, theirs.photos),
    graphs: mergeById(base.graphs, mine.graphs, theirs.graphs),
    bars: mergeById(base.bars, mine.bars, theirs.bars),
    notes: mergeById(base.notes, mine.notes, theirs.notes),
  } as D;
  if (mine.subTabs && theirs.subTabs) {
    const b = base.subTabs ?? [];
    merged.subTabs = b.length === mine.subTabs.length && b.length === theirs.subTabs.length
      ? mine.subTabs.map((sub, i) => mergeDashboard(b[i], sub, theirs.subTabs![i]!))
      : pick(base.subTabs, mine.subTabs, theirs.subTabs);
  }
  return merged;
}

/** Combines this browser's board with another browser's newer save of the same slot. */
export function mergeBoards(base: BoardState, mine: BoardState, theirs: BoardState): BoardState {
  const b = base.dashboards, m = mine.dashboards, t = theirs.dashboards;
  const dashboards = b.length === m.length && b.length === t.length
    ? m.map((dashboard, i) => mergeDashboard(b[i], dashboard, t[i]!))
    : pick(b, m, t); // tabs added, removed or reordered on one side: keep that side's tab list
  return {
    ...mine, // which tab is open stays per browser
    homePhotos: mergeById(base.homePhotos, mine.homePhotos, theirs.homePhotos),
    homeView: pick(base.homeView, mine.homeView, theirs.homeView),
    dashboards,
  };
}
