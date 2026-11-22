import { describe, expect, it } from "vitest";
import { initialBoard, mergeBoards, type BoardState } from "@/lib/board-state";

const clone = (b: BoardState): BoardState => JSON.parse(JSON.stringify(b));

describe("Merging edits from two browsers", () => {
  it("keeps edits to different notes on the same tab", () => {
    const base = initialBoard();
    const mine = clone(base); mine.dashboards[0]!.notes[0]!.text = "from laptop";
    const theirs = clone(base); theirs.dashboards[0]!.notes[1]!.text = "from phone";
    const merged = mergeBoards(base, mine, theirs);
    expect(merged.dashboards[0]!.notes[0]!.text).toBe("from laptop");
    expect(merged.dashboards[0]!.notes[1]!.text).toBe("from phone");
  });
  it("keeps edits on different tabs and the home screen", () => {
    const base = initialBoard();
    const mine = clone(base); mine.dashboards[2]!.title = "Money";
    const theirs = clone(base); theirs.dashboards[5]!.title = "Health";
    theirs.homePhotos.push({ id: "p1", src: "data:image/png;base64,x", x: 0, y: 0, width: 10, ratio: 1, rotation: 0, flipped: false });
    const merged = mergeBoards(base, mine, theirs);
    expect(merged.dashboards[2]!.title).toBe("Money");
    expect(merged.dashboards[5]!.title).toBe("Health");
    expect(merged.homePhotos.map(p => p.id)).toEqual(["p1"]);
  });
  it("lets this browser win when both changed the same note", () => {
    const base = initialBoard();
    const mine = clone(base); mine.dashboards[0]!.notes[0]!.text = "mine";
    const theirs = clone(base); theirs.dashboards[0]!.notes[0]!.text = "theirs";
    expect(mergeBoards(base, mine, theirs).dashboards[0]!.notes[0]!.text).toBe("mine");
  });
  it("respects deletions and additions from either side", () => {
    const base = initialBoard();
    const removedId = base.dashboards[0]!.notes[2]!.id;
    const mine = clone(base); mine.dashboards[0]!.notes = mine.dashboards[0]!.notes.filter(n => n.id !== removedId);
    const theirs = clone(base); theirs.dashboards[0]!.notes.push({ id: "new", label: "Note", text: "added on phone", x: 0, y: 0, width: 100, height: 100 });
    const ids = mergeBoards(base, mine, theirs).dashboards[0]!.notes.map(n => n.id);
    expect(ids).not.toContain(removedId);
    expect(ids).toContain("new");
  });
  it("keeps which tab is open per browser", () => {
    const base = initialBoard();
    const mine = { ...clone(base), active: 3 };
    const theirs = { ...clone(base), active: 7 };
    expect(mergeBoards(base, mine, theirs).active).toBe(3);
  });
});
