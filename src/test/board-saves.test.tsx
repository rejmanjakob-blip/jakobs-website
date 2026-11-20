import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addSubtab, initialBoard, boardSchema, slotSchema } from "@/lib/board-state";
import { BoardSaveMenu } from "@/components/board-save-menu";
const api = vi.hoisted(() => ({ list: vi.fn(), write: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/local-saves", () => ({ listSaves: api.list, writeSave: api.write, readSave: api.read, saveLocation: async () => "folder",
  lastSlot: () => 1, rememberSlot: () => {}, slotVersion: async () => 0, SlotTakenError: class extends Error {}, SaveConflictError: class extends Error {} }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
describe("Whole-board saves", () => {
  it("retains subtab contents and selection in whole-board snapshots", () => {
    const snapshot = addSubtab({ ...initialBoard(), active: 2 });
    const child = snapshot.dashboards[2]?.subTabs[0];
    if (!child) throw new Error("Subtab missing");
    child.title = "Child goal";
    const note = child.items[0];
    if (!note) throw new Error("Note missing");
    note.value = 64; note.text = "■ Done";
    expect(boardSchema.parse(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
    expect(snapshot.activeSubtab).toBe(0);
  });
  it("restores earlier saves without subtabs", () => {
    const { activeSubtab, ...old } = initialBoard();
    const restored = boardSchema.parse({ ...old, dashboards: old.dashboards.map(({ subTabs, ...dashboard }) => dashboard) });
    expect(restored.activeSubtab).toBeNull();
    expect(restored.dashboards.every(dashboard => dashboard.subTabs.length === 0)).toBe(true);
  });
  it("allows exactly ten slots", () => {
    expect(slotSchema.parse(1)).toBe(1); expect(slotSchema.parse(10)).toBe(10);
    expect(slotSchema.safeParse(0).success).toBe(false); expect(slotSchema.safeParse(11).success).toBe(false);
  });
  it("retains every tab, note, bar and home photo in snapshots", () => {
    const snapshot = initialBoard();
    snapshot.active = 9;
    snapshot.dashboards.forEach((dashboard, index) => {
      dashboard.title = `Board ${index}`;
      const item = dashboard.items[0]; const mini = dashboard.notes[4];
      if (!item || !mini) throw new Error("Initial notes missing");
      item.value = index; mini.text = "■ Finished";
    });
    snapshot.homePhotos.push({ id: "photo", src: "data:image/png;base64,abc", x: 12, y: 15, width: 120, ratio: 2, rotation: 0, flipped: false });
    expect(boardSchema.parse(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
  });
  it("opens ten slots on click and dismisses outside", async () => {
    api.list.mockResolvedValue([]); api.read.mockResolvedValue(null);
    render(<BoardSaveMenu snapshot={initialBoard()} onRestore={vi.fn()} />);
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Save slots (Saved · slot 1)" })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Save slots/ })); });
    expect(screen.getByRole("region", { name: "Save slots" })).toBeTruthy();
    // Slot 1 is in use, so only the other nine offer "Save here".
    expect(screen.getAllByRole("button", { name: /Save to slot/ })).toHaveLength(9);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("region", { name: "Save slots" })).toBeNull();
  });
  it("requires confirmation before overwriting a saved slot", async () => {
    api.list.mockResolvedValue([{ slot: 2, saved_at: "2026-11-06T23:00:00Z" }]); api.read.mockResolvedValue(null);
    api.write.mockResolvedValue({ slot: 2, saved_at: "2026-11-06T23:01:00Z" });
    const snapshot = initialBoard();
    render(<BoardSaveMenu snapshot={snapshot} onRestore={vi.fn()} />);
    await act(async () => {});
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Save slots/ })); });
    fireEvent.click(screen.getByRole("button", { name: "Save to slot 2" }));
    expect(api.write).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Yes/ })); });
    expect(api.write).toHaveBeenCalledWith(2, snapshot, true, null);
  });
  it("opens another slot without re-saving an unchanged board", async () => {
    const other = { ...initialBoard(), active: 3 };
    api.list.mockResolvedValue([{ slot: 1, saved_at: "2026-11-06T23:00:00Z" }, { slot: 2, saved_at: "2026-11-06T23:00:00Z" }]);
    api.read.mockImplementation(async (slot: number) => slot === 2 ? { board: other, version: 0 } : null);
    api.write.mockResolvedValue({ slot: 1, saved_at: "2026-11-06T23:01:00Z", version: 0 });
    const snapshot = initialBoard(); const onRestore = vi.fn();
    render(<BoardSaveMenu snapshot={snapshot} onRestore={onRestore} />);
    await act(async () => {});
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Save slots/ })); });
    fireEvent.click(screen.getByRole("button", { name: "Open slot 2" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Yes/ })); });
    expect(api.write).not.toHaveBeenCalled();
    expect(onRestore).toHaveBeenLastCalledWith(other);
  });
});
