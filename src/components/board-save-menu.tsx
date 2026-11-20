import { useEffect, useRef, useState } from "react";
import { useHydrated } from "@tanstack/react-router";
import { Save, Check, LoaderCircle, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listSaves, readSave, saveLocation, SlotTakenError } from "@/lib/local-saves";
import { useBoardPersistence } from "@/hooks/use-board-persistence";
import type { BoardState, SaveSlot } from "@/lib/board-state";

const SLOTS = Array.from({ length: 10 }, (_, i) => i + 1);

export function BoardSaveMenu({ snapshot, onRestore }: { snapshot: BoardState; onRestore: (state: BoardState) => void }) {
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<SaveSlot[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [where, setWhere] = useState<"folder" | "browser" | null>(null);
  const [confirm, setConfirm] = useState<{ slot: number; action: "overwrite" | "load" } | null>(null);
  const persistence = useBoardPersistence(snapshot, onRestore);
  const root = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  const close = () => { setOpen(false); setConfirm(null); setMessage(""); };
  useEffect(() => {
    const dismiss = (event: PointerEvent) => { if (root.current && !root.current.contains(event.target as Node)) close(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("pointerdown", dismiss); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, []);
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage("");
    try { await action(); } catch (error) { setOpen(true); setMessage(error instanceof Error ? error.message : "Could not access saves."); }
    finally { lock.current = false; setBusy(false); }
  };
  const toggle = () => {
    if (open) return close();
    setOpen(true);
    void run(async () => { const [list, kind] = await Promise.all([listSaves(), saveLocation()]); setSlots(list); setWhere(kind); });
  };
  const save = (slot: number, overwrite: boolean) => void run(async () => {
    await persistence.flush();
    try {
      const saved = await persistence.write({ slot, snapshot, overwrite });
      setSlots(previous => [...previous.filter(item => item.slot !== slot), saved].sort((a, b) => a.slot - b.slot));
      persistence.selectSlot(slot, snapshot); setConfirm(null); setMessage(`Saved to slot ${slot}. Changes now autosave there.`);
    } catch (error) {
      if (error instanceof SlotTakenError) setConfirm({ slot, action: "overwrite" });
      else throw error;
    }
  });
  const load = (slot: number) => void run(async () => {
    // Store what's on screen first, so switching slots never loses the latest edits.
    if (persistence.slot !== null) await persistence.write({ slot: persistence.slot, snapshot, overwrite: true });
    await persistence.flush();
    const restored = await readSave(slot);
    if (!restored) throw new Error(`Slot ${slot} is empty.`);
    persistence.selectSlot(slot, restored); onRestore(restored); close();
  });
  const { status, slot: activeSlot } = persistence;
  const label = status === "loading" ? "Opening…" : status === "saving" ? "Saving…" : status === "error" ? "Not saved" : activeSlot ? `Saved · slot ${activeSlot}` : "Saved";

  return <div ref={root} className="board-save" data-ready={hydrated}>
    <Button variant="outline" className="glow-button save-button h-6 gap-1 px-1.5 text-[11px] font-normal" aria-label={`Save slots (${label})`} aria-expanded={open} aria-controls="save-slots"
      title="Your board saves automatically. Click to see save slots." onClick={toggle} data-status={status}>
      {busy || status === "saving" || status === "loading" ? <LoaderCircle className="animate-spin" /> : status === "error" ? <TriangleAlert /> : <Save />}
      <span className="save-label">{label}</span>
    </Button>
    {!open && persistence.error && <div role="status" className="save-status glow-box">{persistence.error}</div>}
    {open && <section id="save-slots" aria-label="Save slots" className="save-menu glow-box">
      <p className="save-help">
        Every change autosaves to {activeSlot ? <b>slot {activeSlot}</b> : "the slot you pick"}.
        {where === "folder" ? " Saves are files in the project's saves folder on this computer." : where === "browser" ? " Saves are kept in this browser on this device." : ""}
      </p>
      {SLOTS.map(slot => {
        const saved = slots.find(item => item.slot === slot);
        const current = slot === activeSlot;
        return <div key={slot} className="save-slot" data-current={current || undefined}>
          <div className="min-w-0"><span>Slot {slot}{current ? " · in use" : ""}</span><span className="save-time">{saved ? `Saved ${new Date(saved.saved_at).toLocaleString()}` : "Empty"}</span></div>
          {saved && !current && <Button variant="outline" className="glow-button h-6 px-1.5 text-[10px]" disabled={busy} aria-label={`Open slot ${slot}`} onClick={() => setConfirm({ slot, action: "load" })}>Open</Button>}
          {!current && <Button variant="outline" className="glow-button h-6 px-1.5 text-[10px]" disabled={busy} aria-label={`Save to slot ${slot}`} onClick={() => saved ? setConfirm({ slot, action: "overwrite" }) : save(slot, false)}>Save here</Button>}
        </div>;
      })}
      {confirm && <div className="save-confirm" role="alertdialog" aria-label="Confirm">
        <span>{confirm.action === "load" ? `Open slot ${confirm.slot}? What's on screen stays saved in slot ${activeSlot ?? "-"}.` : `Replace what's saved in slot ${confirm.slot}?`}</span>
        <Button variant="outline" className="glow-button h-6 gap-1 px-1.5 text-[10px]" disabled={busy} onClick={() => confirm.action === "overwrite" ? save(confirm.slot, true) : load(confirm.slot)}><Check />Yes</Button>
        <Button variant="outline" className="glow-button h-6 px-1.5 text-[10px]" onClick={() => setConfirm(null)}>Cancel</Button>
      </div>}
      {message && <p role="status" className="save-message">{message}</p>}
    </section>}
  </div>;
}
