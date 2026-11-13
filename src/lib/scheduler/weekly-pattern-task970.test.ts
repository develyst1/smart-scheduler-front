import { describe, expect, it } from "bun:test";
import { PATTERN_MAX, emptyPatternRow, patternIssue, patternLabel, patternPayload, patternSlots, rowsFromSlots, type PatternRow } from "./weekly-pattern";

/**
 * 🔴 **TASK-970 (REQ-5016 F1, SPEC-109) — the pure rules under the weekly-pattern editor.** What can go wrong without anyone seeing it: a half-filled row that is silently dropped (the sale then has fewer
 * classes than the admin typed), two rows on one day and time, a one-row editor that suddenly sends `pattern` (the old body must stay the old body), a pattern read aloud in the wrong order or with the
 * day name repeated, or a one-slot course that claims to have a pattern.
 */
const row = (weekday: number | null, startTime: string | null, teacherId: string | null): PatternRow => ({ weekday, startTime, teacherId });

describe("🔴 TASK-970 — the rows", () => {
  it("🔑 a new row is empty in every field (nothing is assumed), unless seeded", () => {
    expect(emptyPatternRow()).toEqual({ weekday: null, startTime: null, teacherId: null });
    expect(emptyPatternRow({ teacherId: "t1" })).toEqual({ weekday: null, startTime: null, teacherId: "t1" });
  });

  it("🔑 `patternSlots` keeps the COMPLETE rows only, in the order entered, as the wire's `{ weekday, startTime, teacherId }`", () => {
    expect(patternSlots([row(1, "10:00", "a"), row(4, null, "b"), row(4, "12:00", "b")])).toEqual([
      { weekday: 1, startTime: "10:00", teacherId: "a" },
      { weekday: 4, startTime: "12:00", teacherId: "b" },
    ]);
  });

  it("🔑 a SUNDAY row (weekday 0) is a complete row — 0 is not 'empty'", () => {
    expect(patternSlots([row(0, "09:00", "a")])).toEqual([{ weekday: 0, startTime: "09:00", teacherId: "a" }]);
  });
});

describe("🔴 TASK-970 — what is wrong with the rows", () => {
  it("🔑 a half-filled row = `incomplete` (never dropped quietly); a clean list = null", () => {
    expect(patternIssue([row(1, "10:00", "a"), row(2, null, "a")])).toBe("incomplete");
    expect(patternIssue([row(null, "10:00", "a")])).toBe("incomplete");
    expect(patternIssue([row(1, "10:00", "a"), row(1, "11:00", "b")])).toBeNull();
  });

  it("🔑 the same day AND time twice = `duplicate`, whoever the coach; the same day at another time is fine", () => {
    expect(patternIssue([row(1, "10:00", "a"), row(1, "10:00", "b")])).toBe("duplicate");
    expect(patternIssue([row(1, "10:00", "a"), row(2, "10:00", "a")])).toBeNull();
  });

  it("🔑 more than 21 rows = `tooMany` (SPEC-109 §2's guard); 21 is allowed", () => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => row(i % 7, `${String(7 + Math.floor(i / 7)).padStart(2, "0")}:00`, "a"));
    expect(PATTERN_MAX).toBe(21);
    expect(patternIssue(rows(21))).toBeNull();
    expect(patternIssue(rows(22))).toBe("tooMany");
  });
});

describe("🔴 TASK-970 — what the sale sends", () => {
  it("🔑 editor OFF ⇒ `{}` — today's body, no `pattern` key", () => {
    expect(patternPayload(false, [row(1, "10:00", "a"), row(2, "10:00", "a")])).toEqual({});
  });

  it("🔑 ONE row ⇒ `{}` (today's fields): a one-row editor is exactly the sale it always was", () => {
    expect(patternPayload(true, [row(1, "10:00", "a")])).toEqual({});
  });

  it("🔑 TWO or more complete rows ⇒ `{ pattern }` with the slots in order", () => {
    expect(patternPayload(true, [row(1, "10:00", "a"), row(1, "11:00", "a"), row(4, "12:00", "b")])).toEqual({
      pattern: [
        { weekday: 1, startTime: "10:00", teacherId: "a" },
        { weekday: 1, startTime: "11:00", teacherId: "a" },
        { weekday: 4, startTime: "12:00", teacherId: "b" },
      ],
    });
  });

  it("🔑 an issue standing ⇒ `null`: NOTHING is sent (the caller disables Generate)", () => {
    expect(patternPayload(true, [row(1, "10:00", "a"), row(2, null, "a")])).toBeNull();
    expect(patternPayload(true, [row(1, "10:00", "a"), row(1, "10:00", "a")])).toBeNull();
  });
});

describe("🔴 TASK-970 — a pattern read aloud", () => {
  const slots = [
    { weekday: 1, startTime: "10:00" },
    { weekday: 1, startTime: "11:00" },
    { weekday: 4, startTime: "12:00" },
  ];

  it("🔑 «จ 10:00, 11:00 · พฤ 12:00» in Thai: consecutive slots of one day share the day name, days joined by « · », no dot after the day", () => {
    expect(patternLabel(slots, "th")).toBe("จ 10:00, 11:00 · พฤ 12:00");
  });

  it("🔑 the same in English", () => {
    expect(patternLabel(slots, "en")).toBe("Mon 10:00, 11:00 · Thu 12:00");
  });

  it("🔑 the server's ORDER is kept (a Thursday-start course lists Thu, then Sun, then Mon); seconds on a time are dropped", () => {
    expect(patternLabel([{ weekday: 4, startTime: "12:00:00" }, { weekday: 0, startTime: "09:00" }, { weekday: 1, startTime: "10:00" }], "en")).toBe("Thu 12:00 · Sun 09:00 · Mon 10:00");
  });

  it("🔑 a course with NO pattern — null, or one slot — reads as the empty string (the caller shows its usual line)", () => {
    expect(patternLabel(null, "th")).toBe("");
    expect(patternLabel(undefined, "th")).toBe("");
    expect(patternLabel([], "th")).toBe("");
    expect(patternLabel([{ weekday: 1, startTime: "10:00" }], "th")).toBe("");
  });

  it("🔑 `rowsFromSlots` turns a course's slots back into editor rows (HH:MM)", () => {
    expect(rowsFromSlots([{ weekday: 1, startTime: "10:00:00", teacherId: "a" }])).toEqual([{ weekday: 1, startTime: "10:00", teacherId: "a" }]);
    expect(rowsFromSlots(null)).toEqual([]);
  });
});
