import { useEffect, useRef, useState } from "react";
import { mergeBoards, type BoardState } from "@/lib/board-state";
import { lastSlot, readSave, rememberSlot, SaveConflictError, slotVersion, writeSave } from "@/lib/local-saves";

export type SaveStatus = "loading" | "saving" | "saved" | "error" | "conflict";

/**
 * Opens the slot this browser last used (slot 1 the first time), then autosaves every
 * change to that slot. Writes are queued so manual saves and autosaves never overlap.
 *
 * With cloud saving, each write says which version it was based on. If another browser saved in
 * between, its newer save is merged into what's on screen (see mergeBoards) and saving carries on;
 * nobody is asked. Every 15 seconds, and when the tab is shown again, newer saves from other
 * browsers are pulled in the same way. The "which version?" prompt is only a fallback if merging fails.
 */
const POLL_MS = 15_000;
export function useBoardPersistence(snapshot: BoardState, onRestore: (board: BoardState) => void, onMerge: (update: (board: BoardState) => BoardState) => void = () => {}) {
  const [slot, setSlot] = useState<number | null>(null);
  const [status, setStatus] = useState<SaveStatus>("loading");
  const [error, setError] = useState("");
  const latest = useRef(snapshot);
  latest.current = snapshot;
  const activeSlot = useRef<number | null>(null);
  // The board object last written or loaded. Boards are immutable, so comparing references is enough
  // and avoids serializing megabytes of photos on every keystroke.
  const saved = useRef<BoardState | null>(null);
  const version = useRef(0);
  const conflict = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const restore = useRef(onRestore);
  restore.current = onRestore;
  const merge = useRef(onMerge);
  merge.current = onMerge;
  const merging = useRef(false);

  const applyLoaded = (target: number, loaded: { board: BoardState; version: number } | null) => {
    if (loaded) { latest.current = loaded.board; restore.current(loaded.board); version.current = loaded.version; }
    else version.current = 0;
    saved.current = latest.current;
    conflict.current = false;
    activeSlot.current = target; setSlot(target); setStatus("saved"); setError("");
  };

  useEffect(() => {
    let cancelled = false;
    const target = lastSlot();
    readSave(target).then(loaded => { if (!cancelled) applyLoaded(target, loaded); }, () => {
      // Never autosave over a slot that could not be read; the person picks a slot instead.
      if (cancelled) return;
      setStatus("error"); setError(`Could not open slot ${target}. Pick a slot to keep saving.`);
    });
    return () => { cancelled = true; };
  }, []);

  const write = (data: { slot: number; snapshot: BoardState; overwrite: boolean; baseVersion?: number | null }) => {
    const task = queue.current.catch(() => {}).then(() => writeSave(data.slot, data.snapshot, data.overwrite, data.baseVersion ?? null));
    queue.current = task;
    return task;
  };
  /** Pulls the newest save of the active slot and folds it into what's on screen. */
  const pullRemote = async (target: number) => {
    if (merging.current) return;
    merging.current = true;
    try {
      const loaded = await readSave(target);
      if (!loaded || activeSlot.current !== target) return;
      if (latest.current === saved.current) { applyLoaded(target, loaded); return; }
      // Unsaved edits here: merge them with the other browser's save; autosave then writes the result.
      const base = saved.current ?? loaded.board;
      const theirs = loaded.board;
      saved.current = theirs; version.current = loaded.version; conflict.current = false;
      merge.current(board => mergeBoards(base, board, theirs));
      setStatus("saving"); setError("");
    } finally { merging.current = false; }
  };
  const autosave = (board: BoardState) => {
    const target = activeSlot.current;
    if (target === null || conflict.current) return;
    write({ slot: target, snapshot: board, overwrite: true, baseVersion: version.current })
      .then(result => {
        if (activeSlot.current !== target) return;
        saved.current = board; version.current = result.version; setError("");
        setStatus(latest.current === board ? "saved" : "saving");
      })
      .catch(err => {
        if (err instanceof SaveConflictError) {
          pullRemote(target).catch(() => { conflict.current = true; setStatus("conflict"); setError("This board was changed on another device."); });
        }
        else { setStatus("error"); setError("Autosave failed. Your edits are still here."); }
      });
  };
  // Every change autosaves (debounced) to the active slot.
  useEffect(() => {
    if (slot === null || conflict.current) return;
    const board = latest.current;
    if (board === saved.current) { setStatus(s => s === "saving" ? "saved" : s); return; }
    setStatus("saving");
    const timer = setTimeout(() => autosave(board), 700);
    return () => clearTimeout(timer);
  }, [snapshot, slot]);

  // Every 15 seconds while visible, and when the tab is shown again: pull in newer saves from other browsers.
  useEffect(() => {
    let checking = false;
    const check = async () => {
      const target = activeSlot.current;
      if (document.visibilityState !== "visible" || checking || target === null || conflict.current) return;
      checking = true;
      try {
        if ((await slotVersion(target)) > version.current && activeSlot.current === target) await pullRemote(target);
      } catch { /* Offline or unavailable: keep working with what's on screen. */ }
      finally { checking = false; }
    };
    const timer = window.setInterval(check, POLL_MS);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", check); window.removeEventListener("focus", check); };
  }, []);

  // Warn before closing the page while a change has not been saved yet.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (activeSlot.current !== null && latest.current !== saved.current) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const flush = async () => { await queue.current.catch(() => {}); };
  const selectSlot = (target: number, board: BoardState, loadedVersion = 0) => {
    activeSlot.current = target;
    saved.current = board;
    version.current = loadedVersion;
    conflict.current = false;
    rememberSlot(target);
    setSlot(target); setStatus("saved"); setError("");
  };
  /** After a conflict: load the other device's latest board, or overwrite it with what's on screen. */
  const resolveConflict = async (choice: "theirs" | "mine") => {
    const target = activeSlot.current;
    if (target === null) return;
    if (choice === "theirs") { applyLoaded(target, await readSave(target)); return; }
    conflict.current = false; setStatus("saving");
    const board = latest.current;
    const result = await write({ slot: target, snapshot: board, overwrite: true, baseVersion: null });
    saved.current = board; version.current = result.version; setStatus("saved"); setError("");
  };
  /** Saves what's on screen to the active slot right away (used before switching slots). */
  const saveNow = async (board: BoardState) => {
    const target = activeSlot.current;
    if (target === null || conflict.current || board === saved.current) return;
    const result = await write({ slot: target, snapshot: board, overwrite: true, baseVersion: version.current });
    saved.current = board; version.current = result.version;
  };
  return { slot, status, selectSlot, write, flush, error, resolveConflict, saveNow };
}
