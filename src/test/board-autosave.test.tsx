import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initialBoard } from "@/lib/board-state";
import { useBoardPersistence } from "@/hooks/use-board-persistence";

const api = vi.hoisted(() => ({ write: vi.fn(), read: vi.fn(), last: vi.fn(() => 1), remember: vi.fn() }));
vi.mock("@/lib/local-saves", () => ({ writeSave: api.write, readSave: api.read, lastSlot: api.last, rememberSlot: api.remember, slotVersion: async () => 0, SaveConflictError: class extends Error {} }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe("Opened-slot autosave", () => {
  it("opens the last-used slot and autosaves edits to it", async () => {
    vi.useFakeTimers(); api.last.mockReturnValueOnce(3);
    const saved = { ...initialBoard(), active: 2 };
    api.read.mockResolvedValue({ board: saved, version: 4 }); api.write.mockResolvedValue({ slot: 3, saved_at: "now", version: 5 });
    const restore = vi.fn();
    const { result, rerender } = renderHook(({ board }) => useBoardPersistence(board, restore), { initialProps: { board: initialBoard() } });
    await act(async () => {});
    expect(api.read).toHaveBeenCalledWith(3);
    expect(restore).toHaveBeenCalledWith(saved);
    expect(result.current.slot).toBe(3);
    const edited = { ...saved, active: 4 };
    rerender({ board: edited });
    expect(result.current.status).toBe("saving");
    await act(async () => { vi.advanceTimersByTime(700); });
    expect(api.write).toHaveBeenCalledWith(3, edited, true, 4);
    expect(result.current.status).toBe("saved");
  });
  it("starts an empty slot without writing until something changes", async () => {
    vi.useFakeTimers(); api.read.mockResolvedValue(null);
    const restore = vi.fn();
    const board = initialBoard();
    const { result } = renderHook(() => useBoardPersistence(board, restore));
    await act(async () => {});
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(restore).not.toHaveBeenCalled();
    expect(result.current.slot).toBe(1);
    expect(api.write).not.toHaveBeenCalled();
  });
  it("never autosaves over a slot that failed to open", async () => {
    vi.useFakeTimers(); api.read.mockRejectedValue(new Error("corrupt"));
    const { result, rerender } = renderHook(({ board }) => useBoardPersistence(board, vi.fn()), { initialProps: { board: initialBoard() } });
    await act(async () => {});
    expect(result.current.slot).toBeNull();
    expect(result.current.status).toBe("error");
    rerender({ board: { ...initialBoard(), active: 1 } });
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(api.write).not.toHaveBeenCalled();
  });
  it("queues writes so an older change cannot finish after a newer one", async () => {
    api.read.mockResolvedValue(null);
    const order: string[] = [];
    let release!: () => void;
    api.write.mockImplementationOnce(() => new Promise(resolve => { release = () => { order.push("first"); resolve({ slot: 1, saved_at: "a" }); }; }))
      .mockImplementationOnce(async () => { order.push("second"); return { slot: 1, saved_at: "b" }; });
    const { result } = renderHook(() => useBoardPersistence(initialBoard(), vi.fn()));
    await act(async () => {});
    const first = result.current.write({ slot: 1, snapshot: initialBoard(), overwrite: true });
    const second = result.current.write({ slot: 1, snapshot: initialBoard(), overwrite: true });
    await act(async () => {});
    await act(async () => { release(); await Promise.all([first, second]); });
    expect(order).toEqual(["first", "second"]);
  });
});
