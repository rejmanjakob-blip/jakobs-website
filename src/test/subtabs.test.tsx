import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GlowBoard } from "@/components/glow-board";
import { addSubtab, initialBoard } from "@/lib/board-state";

afterEach(() => vi.useRealTimers());
describe("Dashboard subtabs", () => {
  it("allows seven subtabs per original parent, without nesting", () => {
    let board = { ...initialBoard(), active: 0 };
    for (let i = 0; i < 7; i++) board = addSubtab(board) as typeof board;
    expect(board.dashboards[0]?.subTabs).toHaveLength(7);
    expect(addSubtab(board)).toBe(board);
    const other = addSubtab({ ...board, active: 1 });
    expect(other.dashboards[1]?.subTabs).toHaveLength(1);
    expect(other.dashboards[0]?.subTabs).toHaveLength(7);
  });
  it("opens after a one-second hold and dismisses on outside press", () => {
    vi.useFakeTimers(); render(<GlowBoard />);
    fireEvent.click(screen.getByRole("tab", { name: "Dashboard 1: Title" }));
    fireEvent.pointerDown(within(screen.getByRole("tabpanel")).getByRole("main"), { button: 0 });
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("dialog")).toBeVisible();
    fireEvent.pointerUp(document.body);
    fireEvent.pointerDown(document.body, { button: 0 });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.pointerUp(document.body);
  });
  it("creates independent subtabs, preserving their notes across parent switching", () => {
    vi.useFakeTimers(); render(<GlowBoard />);
    const parent = screen.getByRole("tab", { name: "Dashboard 1: Title" });
    fireEvent.click(parent);
    fireEvent.change(within(screen.getByRole("tabpanel")).getByPlaceholderText("Title"), { target: { value: "Parent" } });
    fireEvent.pointerDown(within(screen.getByRole("tabpanel")).getByRole("main"), { button: 0 });
    act(() => vi.advanceTimersByTime(1001));
    fireEvent.pointerUp(document.body);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Yes" }), { button: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    const child = screen.getByRole("tabpanel");
    expect(within(child).getAllByRole("spinbutton")).toHaveLength(7);
    fireEvent.change(within(child).getByPlaceholderText("Title"), { target: { value: "Child" } });
    fireEvent.change(within(child).getByLabelText("note 1 paragraph"), { target: { value: "Child note" } });
    fireEvent.click(screen.getByRole("tab", { name: "Dashboard 1: Parent" }));
    expect(within(screen.getByRole("tabpanel")).getByLabelText("note 1 paragraph")).toHaveValue("");
    fireEvent.pointerLeave(parent.parentElement as HTMLElement);
    expect(screen.getByRole("tab", { name: /Subtab 1/ })).toBeVisible();
    fireEvent.pointerDown(document.body, { button: 0 });
    expect(screen.queryByRole("tab", { name: /Subtab 1/ })).toBeNull();
    fireEvent.pointerEnter(screen.getByRole("tab", { name: "Dashboard 1: Parent" }).parentElement as HTMLElement);
    fireEvent.click(screen.getByRole("tab", { name: "Subtab 1: Parent - Child" }));
    expect(within(screen.getByRole("tabpanel")).getByLabelText("note 1 paragraph")).toHaveValue("Child note");
  });
  it("does not open from holding controls, content boxes or areas outside the tab", () => {
    vi.useFakeTimers(); render(<GlowBoard />);
    fireEvent.click(screen.getByRole("tab", { name: "Dashboard 1: Title" }));
    const panel = screen.getByRole("tabpanel");
    const targets = [document.body, screen.getByRole("button", { name: /Save slots/ }),
      within(panel).getByRole("button", { name: "Insert pictures" }),
      within(panel).getByRole("group", { name: "Progress box 1" }),
      within(panel).getByRole("group", { name: "Paragraph box 1" }),
      within(panel).getByLabelText("note 1 paragraph")];
    for (const target of targets) {
      fireEvent.pointerDown(target, { button: 0 });
      act(() => vi.advanceTimersByTime(1500));
      expect(screen.queryByRole("dialog")).toBeNull();
      fireEvent.pointerUp(target);
    }
  });
});import { removeSubtab } from "@/lib/board-state";
describe("Subtab deletion", () => {
  it("removes only the chosen subtab and fixes the open one", () => {
    let board = { ...initialBoard(), active: 0 };
    for (let i = 0; i < 3; i++) board = addSubtab(board) as typeof board;
    const next = removeSubtab({ ...board, activeSubtab: 2 }, 0, 1);
    expect(next.dashboards[0]?.subTabs).toHaveLength(2);
    expect(next.activeSubtab).toBe(1);
    expect(removeSubtab({ ...board, activeSubtab: 1 }, 0, 1).activeSubtab).toBeNull();
  });
});
