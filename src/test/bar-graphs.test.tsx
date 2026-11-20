import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { addBar, clampDenominator, graphPercentage, newBarGraph, removeLastBar } from "@/components/bar-graphs";
import { boardSchema, initialBoard } from "@/lib/board-state";
import { GlowBoard } from "@/components/glow-board";

describe("Bar graphs", () => {
  it("starts with exactly two bars at zero", () => {
    expect(newBarGraph().values).toEqual([0, 0]);
  });
  it("maps vertical dragging from 0 to 100 and clamps outside the graph", () => {
    expect(graphPercentage(200, 20, 180)).toBe(0);
    expect(graphPercentage(110, 20, 180)).toBe(50);
    expect(graphPercentage(20, 20, 180)).toBe(100);
    expect(graphPercentage(-10, 20, 180)).toBe(100);
    expect(graphPercentage(220, 20, 180)).toBe(0);
  });
  it("retains independent graph values and both axis titles after switching tabs", () => {
    render(<GlowBoard />);
    const tabs = screen.getAllByRole("tab");
    const first = tabs[0], second = tabs[1];
    if (!first || !second) throw new Error("Missing tabs");
    fireEvent.click(first);
    fireEvent.click(screen.getByRole("button", { name: "Insert bar graph" }));
    fireEvent.change(screen.getByLabelText("Graph 1 X axis title"), { target: { value: "Months" } });
    fireEvent.change(screen.getByLabelText("Graph 1 Y axis title"), { target: { value: "Completion" } });
    fireEvent.keyDown(screen.getByRole("slider", { name: "Graph 1 bar 1" }), { key: "End" });
    expect(screen.getByRole("slider", { name: "Graph 1 bar 2" })).toHaveAttribute("aria-valuenow", "0");
    fireEvent.click(second);
    expect(screen.queryByRole("slider", { name: /^Graph / })).toBeNull();
    fireEvent.click(first);
    expect(screen.getByLabelText("Graph 1 X axis title")).toHaveValue("Months");
    expect(screen.getByLabelText("Graph 1 Y axis title")).toHaveValue("Completion");
    expect(screen.getByRole("slider", { name: "Graph 1 bar 1" })).toHaveAttribute("aria-valuenow", "100");
  });
  it("includes graphs in snapshots and accepts older saves without graphs", () => {
    const board = initialBoard();
    const dashboard = board.dashboards[0];
    if (!dashboard) throw new Error("Missing dashboard");
    dashboard.graphs.push({ ...newBarGraph(), xTitle: "Time", yTitle: "Percent", values: [20, 100] });
    expect(boardSchema.parse(JSON.parse(JSON.stringify(board))).dashboards[0]?.graphs).toEqual(dashboard.graphs);
    const old = JSON.parse(JSON.stringify(board));
    old.dashboards.forEach((item: { graphs?: unknown }) => { delete item.graphs; });
    expect(boardSchema.parse(old).dashboards[0]?.graphs).toEqual([]);
  });
  it("adds a bar on the right and removes the furthest right bar, keeping at least one", () => {
    const g = { ...newBarGraph(), values: [10, 20] };
    expect(addBar(g).values).toEqual([10, 20, 0]);
    expect(removeLastBar(g).values).toEqual([10]);
    expect(removeLastBar({ ...g, values: [5] }).values).toEqual([5]);
  });
  it("limits fraction markers to between 1 and 25", () => {
    expect(clampDenominator(0)).toBe(1);
    expect(clampDenominator(30)).toBe(25);
    expect(clampDenominator(7)).toBe(7);
  });
  it("deletes a graph after four quick taps on its box", () => {
    render(<GlowBoard />);
    const first = screen.getAllByRole("tab")[0];
    if (!first) throw new Error("Missing tab");
    fireEvent.click(first);
    fireEvent.click(screen.getByRole("button", { name: "Insert bar graph" }));
    const box = screen.getByRole("group", { name: "Bar graph 1" });
    const tap = (type: string, time: number) => { const e = new Event(type, { bubbles: true }); Object.defineProperties(e, { button: { value: 0 }, pointerId: { value: 1 }, clientX: { value: 100 }, clientY: { value: 100 }, timeStamp: { value: time } }); fireEvent(box, e); };
    for (const t of [10, 300, 600]) { tap("pointerdown", t); tap("pointerup", t); }
    expect(screen.queryByRole("group", { name: "Bar graph 1" })).not.toBeNull();
    tap("pointerdown", 900); tap("pointerup", 900);
    expect(screen.queryByRole("group", { name: "Bar graph 1" })).toBeNull();
  });
});
