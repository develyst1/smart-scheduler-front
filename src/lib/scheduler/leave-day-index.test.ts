import { describe, expect, it } from "bun:test";
import { leaveDayIndex, leaveDayKey } from "./teacher-scope";

/** 🔴 TASK-622 — the blocked days, indexed for the grid cells: rows in, keys out. */
describe("🔴 TASK-622 — `leaveDayIndex`", () => {
  const row = (teacherId: string, date: string, bookings: { id: string }[] = []) => ({
    teacherId,
    teacherName: `ครู ${teacherId}`,
    date,
    bookings,
  });

  it("one key per coach AND date — the same coach on two days is two keys, two coaches on one day is two keys", () => {
    const idx = leaveDayIndex([row("t1", "2026-10-06", [{ id: "bk-1" }]), row("t1", "2026-10-08"), row("t2", "2026-10-06")]);
    expect([...idx.keys()]).toEqual(["t1|2026-10-06", "t1|2026-10-08", "t2|2026-10-06"]);
    expect(idx.has(leaveDayKey("t1", "2026-10-07"))).toBe(false);
  });

  it("each key carries what the strip's sentence needs — name and the server's class count", () => {
    const idx = leaveDayIndex([row("t1", "2026-10-06", [{ id: "bk-1" }, { id: "bk-2" }])]);
    expect(idx.get("t1|2026-10-06")).toEqual({ teacherId: "t1", teacherName: "ครู t1", date: "2026-10-06", classes: 2 });
  });

  it("an empty list and a not-yet-loaded (undefined) read are both an empty index", () => {
    expect(leaveDayIndex([]).size).toBe(0);
    expect(leaveDayIndex(undefined).size).toBe(0);
  });
});
