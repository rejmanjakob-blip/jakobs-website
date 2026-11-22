import { boardSchema, type BoardState, type SaveSlot } from "@/lib/board-state";
import { cloudGetPhotos, cloudList, cloudMissingPhotos, cloudPutPhoto, cloudRead, cloudStatus, cloudVersion, cloudWrite } from "@/lib/cloud-saves.functions";

/**
 * Whole-board save slots and uploaded videos.
 *
 * - Cloud (when set up): one shared set of slots for every device, stored in Upstash Redis.
 *   While running on this computer, every cloud save is also copied into the `saves/` folder as a backup.
 * - Folder (this computer, no cloud): files in the project's `saves/` folder via the save server in vite.config.ts.
 * - Browser (deployed site, no cloud): this browser's IndexedDB storage.
 *
 * Versions only matter for the cloud: they stop an older tab or device from overwriting newer edits.
 */
export type SaveLocation = "cloud" | "folder" | "browser";
export type SavedSlot = SaveSlot & { version: number };
type Backend = {
  kind: SaveLocation;
  list(): Promise<SavedSlot[]>;
  read(slot: number): Promise<{ snapshot: unknown; version: number } | null>;
  write(slot: number, snapshot: BoardState, overwrite: boolean, baseVersion: number | null): Promise<SavedSlot>;
  putVideo(name: string, file: Blob): Promise<void>;
  getVideo(name: string): Promise<Blob | null>;
};

export class SlotTakenError extends Error {
  constructor() { super("This slot is already saved. Choose overwrite."); }
}
export class SaveConflictError extends Error {
  constructor() { super("This board was changed on another device."); }
}

const HEADERS = { "x-local-saves": "1" };
const folderBackend: Backend = {
  kind: "folder",
  async list() {
    const res = await fetch("/__local-saves/slots", { headers: HEADERS });
    if (!res.ok) throw new Error("Could not read your saves.");
    return ((await res.json()) as SaveSlot[]).map(row => ({ ...row, version: 0 }));
  },
  async read(slot) {
    const res = await fetch(`/__local-saves/slots/${slot}`, { headers: HEADERS });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("Could not open this save.");
    return { snapshot: (await res.json()).snapshot, version: 0 };
  },
  async write(slot, snapshot, overwrite) {
    const saved_at = new Date().toISOString();
    const res = await fetch(`/__local-saves/slots/${slot}?overwrite=${overwrite ? 1 : 0}`, {
      method: "PUT", headers: { ...HEADERS, "content-type": "application/json" }, body: JSON.stringify({ saved_at, snapshot }),
    });
    if (res.status === 409) throw new SlotTakenError();
    if (!res.ok) throw new Error("Could not save. Your edits are still here; please try again.");
    return { ...(await res.json()), version: 0 };
  },
  async putVideo(name, file) {
    const res = await fetch(`/__local-saves/videos/${name}`, { method: "PUT", headers: HEADERS, body: file });
    if (!res.ok) throw new Error("Could not store the video.");
  },
  async getVideo(name) {
    const res = await fetch(`/__local-saves/videos/${name}`, { headers: HEADERS });
    return res.ok ? res.blob() : null;
  },
};

function idb<T>(store: "slots" | "videos", mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("glow-board", 1);
    open.onupgradeneeded = () => { open.result.createObjectStore("slots"); open.result.createObjectStore("videos"); };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const request = action(db.transaction(store, mode).objectStore(store));
      request.onsuccess = () => { resolve(request.result as T); db.close(); };
      request.onerror = () => { reject(request.error); db.close(); };
    };
  });
}

type StoredSlot = { saved_at: string; snapshot: unknown };
const browserBackend: Backend = {
  kind: "browser",
  async list() {
    const keys = await idb<IDBValidKey[]>("slots", "readonly", s => s.getAllKeys());
    const rows = await idb<StoredSlot[]>("slots", "readonly", s => s.getAll());
    return keys.map((slot, i) => ({ slot: Number(slot), saved_at: rows[i]?.saved_at ?? "", version: 0 })).sort((a, b) => a.slot - b.slot);
  },
  async read(slot) {
    const row = await idb<StoredSlot | undefined>("slots", "readonly", s => s.get(slot));
    return row ? { snapshot: row.snapshot, version: 0 } : null;
  },
  async write(slot, snapshot, overwrite) {
    if (!overwrite && (await idb<StoredSlot | undefined>("slots", "readonly", s => s.get(slot)))) throw new SlotTakenError();
    const saved_at = new Date().toISOString();
    await idb("slots", "readwrite", s => s.put({ saved_at, snapshot }, slot));
    return { slot, saved_at, version: 0 };
  },
  async putVideo(name, file) { await idb("videos", "readwrite", s => s.put(file, name)); },
  async getVideo(name) { return (await idb<Blob | undefined>("videos", "readonly", s => s.get(name))) ?? null; },
};

// ---- Cloud: pictures are stored once each, boards keep only "cloud-photo:<hash>" references. ----
const PHOTO_REF = "cloud-photo:";
const hashOf = new Map<string, string>();   // data URL -> hash (avoids re-hashing on every autosave)
const photoOf = new Map<string, string>();  // hash -> data URL
const uploaded = new Set<string>();

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
/** Deep-copies a value, replacing every picture `src` with fn(src). */
function mapSources(value: unknown, fn: (src: string) => string): unknown {
  if (Array.isArray(value)) return value.map(item => mapSources(item, fn));
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) out[key] = key === "src" && typeof item === "string" ? fn(item) : mapSources(item, fn);
  return out;
}
function collectSources(value: unknown, into: Set<string>) {
  if (Array.isArray(value)) value.forEach(item => collectSources(item, into));
  else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) { if (key === "src" && typeof item === "string") into.add(item); else collectSources(item, into); }
  return into;
}
async function encodePhotos(snapshot: BoardState): Promise<BoardState> {
  const pictures = [...collectSources(snapshot, new Set())].filter(src => src.startsWith("data:image/"));
  for (const src of pictures) if (!hashOf.has(src)) { const hash = await sha256(src); hashOf.set(src, hash); photoOf.set(hash, src); }
  const unknown = [...new Set(pictures.map(src => hashOf.get(src)!))].filter(hash => !uploaded.has(hash));
  if (unknown.length) {
    const missing = new Set(await cloudMissingPhotos({ data: unknown }));
    for (const hash of unknown) {
      if (missing.has(hash)) await cloudPutPhoto({ data: { hash, data: photoOf.get(hash)! } });
      uploaded.add(hash);
    }
  }
  return mapSources(snapshot, src => hashOf.has(src) ? PHOTO_REF + hashOf.get(src) : src) as BoardState;
}
async function decodePhotos(snapshot: unknown): Promise<unknown> {
  const hashes = [...collectSources(snapshot, new Set())].filter(src => src.startsWith(PHOTO_REF)).map(src => src.slice(PHOTO_REF.length)).filter(hash => !photoOf.has(hash));
  for (let i = 0; i < hashes.length; i += 8) {
    const batch = hashes.slice(i, i + 8);
    const found = await cloudGetPhotos({ data: batch });
    batch.forEach((hash, j) => { const src = found[j]; if (src) { photoOf.set(hash, src); hashOf.set(src, hash); uploaded.add(hash); } });
  }
  return mapSources(snapshot, src => src.startsWith(PHOTO_REF) ? photoOf.get(src.slice(PHOTO_REF.length)) ?? src : src);
}

function cloudBackend(mirror: Backend | null, videos: Backend): Backend {
  return {
    kind: "cloud",
    list: () => cloudList(),
    async read(slot) {
      const row = await cloudRead({ data: slot });
      return row ? { snapshot: await decodePhotos(JSON.parse(row.json)), version: row.version } : null;
    },
    async write(slot, snapshot, overwrite, baseVersion) {
      const result = await cloudWrite({ data: { slot, snapshot: await encodePhotos(snapshot), overwrite, baseVersion } });
      if (!result.ok) throw result.reason === "taken" ? new SlotTakenError() : new SaveConflictError();
      // Backup copy on this computer; failures here never block cloud saving.
      void mirror?.write(slot, snapshot, true, null).catch(() => {});
      return { slot: result.slot, saved_at: result.saved_at, version: result.version };
    },
    // Videos stay on each device for now.
    putVideo: (name, file) => videos.putVideo(name, file),
    getVideo: name => videos.getVideo(name),
  };
}

let chosen: Promise<Backend> | null = null;
function backend(): Promise<Backend> {
  chosen ??= (async () => {
    const folder = await fetch("/__local-saves/ping", { headers: HEADERS })
      .then(res => res.ok ? res.json() : null).then(body => body?.ok ? folderBackend : null, () => null);
    const cloud = await cloudStatus().catch(() => ({ enabled: false }));
    if (!cloud.enabled) return folder ?? browserBackend;
    const shared = cloudBackend(folder, folder ?? browserBackend);
    // First run on this computer with an empty cloud: upload the saves folder before anything opens,
    // so a blank board is never shown (or autosaved) in place of the real one.
    if (folder) {
      const [inCloud, onDisk] = await Promise.all([shared.list(), folder.list()]);
      if (!inCloud.length && onDisk.length) await copyFolderInto(shared);
    }
    return shared;
  })();
  return chosen;
}

/** Where saves live: the shared cloud, the project folder on this computer, or this browser. */
export const saveLocation = async () => (await backend()).kind;
export const listSaves = async () => (await backend()).list();
export async function readSave(slot: number): Promise<{ board: BoardState; version: number } | null> {
  const row = await (await backend()).read(slot);
  return row === null ? null : { board: boardSchema.parse(row.snapshot), version: row.version };
}
export const writeSave = async (slot: number, snapshot: BoardState, overwrite: boolean, baseVersion: number | null = null) =>
  (await backend()).write(slot, snapshot, overwrite, baseVersion);
/** Current cloud version of a slot (0 when empty or not using the cloud). */
export async function slotVersion(slot: number) {
  const b = await backend();
  if (b.kind !== "cloud") return 0;
  return cloudVersion({ data: slot });
}
export const putVideo = async (name: string, file: Blob) => (await backend()).putVideo(name, file);
export const getVideo = async (name: string) => (await backend()).getVideo(name);

async function copyFolderInto(cloud: Backend) {
  const rows = await folderBackend.list();
  for (const row of rows) {
    const saved = await folderBackend.read(row.slot);
    if (saved) await cloud.write(row.slot, boardSchema.parse(saved.snapshot), false, null);
  }
  return rows.length;
}

/** Copies saves from this computer's folder into the empty cloud (first-time setup). */
export async function uploadFolderToCloud() {
  const b = await backend();
  if (b.kind !== "cloud") throw new Error("Cloud saving is not set up.");
  if ((await b.list()).length) throw new Error("The cloud already has saves.");
  return copyFolderInto(b);
}

const LAST_SLOT = "glow-board:last-slot";
/** The slot this browser last worked in, so the board reopens where you left off. */
export function lastSlot(): number {
  try { const n = Number(localStorage.getItem(LAST_SLOT)); return n >= 1 && n <= 10 ? n : 1; } catch { return 1; }
}
export function rememberSlot(slot: number) {
  try { localStorage.setItem(LAST_SLOT, String(slot)); } catch { /* Not remembering only means slot 1 opens next time. */ }
}
