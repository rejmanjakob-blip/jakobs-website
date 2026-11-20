import { useEffect, useRef, useState } from "react";
import type { BoardState } from "@/lib/board-state";
import { lastSlot, readSave, rememberSlot, writeSave } from "@/lib/local-saves";

export type SaveStatus = "loading" | "saving" | "saved" | "error";

/**
 * Opens the slot this browser last used (slot 1 the first time), then autosaves every
 * change to that slot. Writes are queued so manual saves and autosaves never overlap.
 */
export function useBoardPersistence(snapshot: BoardState, onRestore: (board: BoardState) => void) {
  const [slot, setSlot] = useState<number | null>(null);
  const [status, setStatus] = useState<SaveStatus>("loading");
  const [error, setError] = useState("");
  const latest = useRef(snapshot);
  latest.current = snapshot;
  const activeSlot = useRef<number | null>(null);
  // The board object last written to disk. Boards are immutable, so comparing references is enough
  // and avoids serializing megabytes of photos on every keystroke.
  const saved = useRef<BoardState | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const restore = useRef(onRestore);
  restore.current = onRestore;

  useEffect(() => {
    let cancelled = false;
    const target = lastSlot();
    readSave(target).then(board => {
      if (cancelled) return;
      if (board) { latest.current = board; restore.current(board); }
      saved.current = latest.current;
      activeSlot.current = target; setSlot(target); setStatus("saved");
    }, () => {
      // Never autosave over a slot that could not be read; the person picks a slot instead.
      if (cancelled) return;
      setStatus("error"); setError(`Could not open slot ${target}. Pick a slot to keep saving.`);
    });
    return () => { cancelled = true; };
  }, []);

  const write = (data: { slot: number; snapshot: BoardState; overwrite: boolean }) => {
    const task = queue.current.catch(() => {}).then(() => writeSave(data.slot, data.snapshot, data.overwrite));
    queue.current = task;
    return task;
  };
  // Every change autosaves (debounced) to the active slot.
  useEffect(() => {
    if (slot === null) return;
    const board = latest.current;
    if (board === saved.current) { setStatus(s => s === "saving" ? "saved" : s); return; }
    setStatus("saving");
    const timer = setTimeout(() => {
      const target = activeSlot.current;
      if (target === null) return;
      write({ slot: target, snapshot: board, overwrite: true })
        .then(() => { if (activeSlot.current === target) saved.current = board; setError(""); setStatus("saved"); })
        .catch(() => { setStatus("error"); setError("Autosave failed. Your edits are still here."); });
    }, 700);
    return () => clearTimeout(timer);
  }, [snapshot, slot]);
  // Warn before closing the page while a change has not reached the disk yet.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (activeSlot.current !== null && latest.current !== saved.current) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const flush = async () => { await queue.current.catch(() => {}); };
  const selectSlot = (target: number, board: BoardState) => {
    activeSlot.current = target;
    saved.current = board;
    rememberSlot(target);
    setSlot(target); setStatus("saved"); setError("");
  };
  return { slot, status, selectSlot, write, flush, error };
}
