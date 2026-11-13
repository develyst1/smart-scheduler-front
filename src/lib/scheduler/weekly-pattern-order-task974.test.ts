import { describe, expect, it } from "bun:test";
import { orderPatternSlots, patternLabel } from "./weekly-pattern";

/** 🔴 TASK-974 (O-159-2) — the sale's weekly line reads in the server's pattern order, grouped by day. */
const s = (weekday: number, startTime: string) => ({ weekday, startTime, teacherId: "t1" });
const TYPED = [s(1, "10:00"), s(4, "12:00"), s(1, "11:00")]; // Mon 10 · Thu 12 · Mon 11
const MON = "2026-11-16"; // a Monday
const WED = "2026-11-18"; // a Wednesday

describe("🔴 TASK-974 — orderPatternSlots", () => {
  it("🔑 typed Mon 10 · Thu 12 · Mon 11, start on a Monday: the label groups Monday (TH and EN)", () => {
    const ordered = orderPatternSlots(MON, TYPED);
    expect(patternLabel(ordered, "th")).toBe("จ 10:00, 11:00 · พฤ 12:00");
    expect(patternLabel(ordered, "en")).toBe("Mon 10:00, 11:00 · Thu 12:00");
  });

  it("🔑 start on a Wednesday: Thursday comes before Monday", () => {
    const ordered = orderPatternSlots(WED, [s(1, "10:00"), s(4, "12:00")]);
    expect(ordered.map((x) => x.weekday)).toEqual([4, 1]);
  });

  it("🔑 the input array is not mutated", () => {
    const before = JSON.parse(JSON.stringify(TYPED));
    orderPatternSlots(MON, TYPED);
    expect(TYPED).toEqual(before);
  });
});
