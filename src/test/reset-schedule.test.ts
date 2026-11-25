import { describe, expect, it } from "vitest";
import { isDue, lastOccurrence, nextOccurrence, uncheckText, type ResetSchedule } from "@/lib/reset-schedule";
import { applyResets, initialBoard } from "@/lib/board-state";

const d = (y: number, m: number, day: number, h = 0, min = 0) => new Date(y, m - 1, day, h, min);

describe("Reset schedules", () => {
  it("daily: resets once after the chosen time each day", () => {
    const s: ResetSchedule = { every: "day", time: "06:00", last: d(2026, 11, 24, 12).toISOString() };
    expect(isDue(s, d(2026, 11, 25, 5, 59))).toBe(false);
    expect(isDue(s, d(2026, 11, 25, 6, 0))).toBe(true);
    expect(lastOccurrence(s, d(2026, 11, 25, 5))).toEqual(d(2026, 11, 24, 6));
    expect(nextOccurrence(s, d(2026, 11, 25, 7))).toEqual(d(2026, 11, 26, 6));
  });
  it("every 7 days: on the chosen weekday and time", () => {
    // 2026-11-25 is a Wednesday; reset on Mondays (1) at 08:30.
    const s: ResetSchedule = { every: "week", weekday: 1, time: "08:30", last: d(2026, 11, 20).toISOString() };
    expect(lastOccurrence(s, d(2026, 11, 25, 12))).toEqual(d(2026, 11, 23, 8, 30));
    expect(isDue(s, d(2026, 11, 25, 12))).toBe(true);
    expect(nextOccurrence(s, d(2026, 11, 25, 12))).toEqual(d(2026, 11, 30, 8, 30));
  });
  it("every 30 days: counted from the chosen start date", () => {
    const s: ResetSchedule = { every: "30days", start: "2026-11-01", time: "00:00", last: d(2026, 11, 1, 1).toISOString() };
    expect(lastOccurrence(s, d(2026, 11, 25))).toEqual(d(2026, 11, 1));
    expect(isDue(s, d(2026, 11, 25))).toBe(false);
    expect(nextOccurrence(s, d(2026, 11, 25))).toEqual(d(2026, 12, 1));
    expect(isDue(s, d(2026, 12, 1, 0, 1))).toBe(true);
    expect(lastOccurrence({ ...s, start: "2026-12-10" }, d(2026, 11, 25))).toBeNull();
  });
  it("unchecks checklist lines only", () => {
    expect(uncheckText("■ done\n☐ todo\nplain ■ text\n☑ also done")).toBe("☐ done\n☐ todo\nplain ■ text\n☐ also done");
  });
  it("applies due resets to notes and checkbox boxes, including sub tabs", () => {
    const board = initialBoard();
    const past = d(2026, 11, 20).toISOString();
    board.dashboards[0]!.notes[0]!.text = "■ a\n■ b";
    board.dashboards[0]!.notes[0]!.reset = { every: "day", time: "06:00", last: past };
    board.dashboards[1]!.bars[0] = { ...board.dashboards[1]!.bars[0]!, boxMode: true, boxTotal: 3, boxFilled: [true, true, false], reset: { every: "day", time: "06:00", last: past } };
    const now = d(2026, 11, 25, 7);
    const after = applyResets(board, now)!;
    expect(after.dashboards[0]!.notes[0]!.text).toBe("☐ a\n☐ b");
    expect(after.dashboards[1]!.bars[0]!.boxFilled).toEqual([false, false, false]);
    expect(applyResets(after, now)).toBeNull(); // once per scheduled moment
  });
});
