import { boardSchema, type BoardState, type SaveSlot } from "@/lib/board-state";

/**
 * Whole-board save slots and uploaded videos, stored on this device.
 *
 * - Running on this computer (`bun run dev`): files in the project's `saves/` folder,
 *   via the small save server in vite.config.ts.
 * - Anywhere else (the deployed site): this browser's IndexedDB storage.
 */
type Backend = {
  kind: "folder" | "browser";
  list(): Promise<SaveSlot[]>;
  read(slot: number): Promise<unknown | null>;
  write(slot: number, snapshot: BoardState, overwrite: boolean): Promise<SaveSlot>;
  putVideo(name: string, file: Blob): Promise<void>;
  getVideo(name: string): Promise<Blob | null>;
};

export class SlotTakenError extends Error {
  constructor() { super("This slot is already saved. Choose overwrite."); }
}

const HEADERS = { "x-local-saves": "1" };
const folderBackend: Backend = {
  kind: "folder",
  async list() {
    const res = await fetch("/__local-saves/slots", { headers: HEADERS });
    if (!res.ok) throw new Error("Could not read your saves.");
    return res.json();
  },
  async read(slot) {
    const res = await fetch(`/__local-saves/slots/${slot}`, { headers: HEADERS });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("Could not open this save.");
    return (await res.json()).snapshot;
  },
  async write(slot, snapshot, overwrite) {
    const saved_at = new Date().toISOString();
    const res = await fetch(`/__local-saves/slots/${slot}?overwrite=${overwrite ? 1 : 0}`, {
      method: "PUT", headers: { ...HEADERS, "content-type": "application/json" }, body: JSON.stringify({ saved_at, snapshot }),
    });
    if (res.status === 409) throw new SlotTakenError();
    if (!res.ok) throw new Error("Could not save. Your edits are still here; please try again.");
    return res.json();
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
    return keys.map((slot, i) => ({ slot: Number(slot), saved_at: rows[i]?.saved_at ?? "" })).sort((a, b) => a.slot - b.slot);
  },
  async read(slot) {
    const row = await idb<StoredSlot | undefined>("slots", "readonly", s => s.get(slot));
    return row?.snapshot ?? null;
  },
  async write(slot, snapshot, overwrite) {
    if (!overwrite && (await idb<StoredSlot | undefined>("slots", "readonly", s => s.get(slot)))) throw new SlotTakenError();
    const saved_at = new Date().toISOString();
    await idb("slots", "readwrite", s => s.put({ saved_at, snapshot }, slot));
    return { slot, saved_at };
  },
  async putVideo(name, file) { await idb("videos", "readwrite", s => s.put(file, name)); },
  async getVideo(name) { return (await idb<Blob | undefined>("videos", "readonly", s => s.get(name))) ?? null; },
};

let chosen: Promise<Backend> | null = null;
function backend(): Promise<Backend> {
  chosen ??= fetch("/__local-saves/ping", { headers: HEADERS })
    .then(res => res.ok ? res.json() : null)
    .then(body => body?.ok ? folderBackend : browserBackend, () => browserBackend);
  return chosen;
}

/** Where saves live on this device: the project folder, or this browser. */
export const saveLocation = async () => (await backend()).kind;
export const listSaves = async () => (await backend()).list();
export async function readSave(slot: number): Promise<BoardState | null> {
  const raw = await (await backend()).read(slot);
  return raw === null ? null : boardSchema.parse(raw);
}
export const writeSave = async (slot: number, snapshot: BoardState, overwrite: boolean) => (await backend()).write(slot, snapshot, overwrite);
export const putVideo = async (name: string, file: Blob) => (await backend()).putVideo(name, file);
export const getVideo = async (name: string) => (await backend()).getVideo(name);

const LAST_SLOT = "glow-board:last-slot";
/** The slot this browser last worked in, so the board reopens where you left off. */
export function lastSlot(): number {
  try { const n = Number(localStorage.getItem(LAST_SLOT)); return n >= 1 && n <= 10 ? n : 1; } catch { return 1; }
}
export function rememberSlot(slot: number) {
  try { localStorage.setItem(LAST_SLOT, String(slot)); } catch { /* Not remembering only means slot 1 opens next time. */ }
}
