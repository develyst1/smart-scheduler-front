import { describe, expect, it } from "bun:test";
import { HALF_HOUR_TIMES, hhmm, hoursDraftFromSaved, hoursFromDraft, timeRangeIssue } from "./work-days";

/**
 * 🔴 **TASK-966 (SPEC-108, REQ-5015) — the pure rules under the part-day leave and the working hours.** What can go wrong without anyone seeing it: a time list that skips the half hours or runs
 * past the day, an end shown before the start, a day with one end only that is silently saved as the whole day, hours kept for a day that was unticked (the server refuses a key outside
 * `workDays`), or hours that never come back from the server as the editor's draft.
 */
describe("🔴 TASK-966 — the half-hour list", () => {
  it("🔑 48 times, 00:00 … 23:30, every half hour, in order, `HH:MM`", () => {
    expect(HALF_HOUR_TIMES.length).toBe(48);
    expect(HALF_HOUR_TIMES[0]).toBe("00:00");
    expect(HALF_HOUR_TIMES[1]).toBe("00:30");
    expect(HALF_HOUR_TIMES[19]).toBe("09:30");
    expect(HALF_HOUR_TIMES[47]).toBe("23:30");
    expect([...HALF_HOUR_TIMES].sort()).toEqual(HALF_HOUR_TIMES);
    expect(HALF_HOUR_TIMES.every((x) => /^\d{2}:(00|30)$/.test(x))).toBe(true);
  });

  it("🔑 `hhmm` drops the seconds a server time may carry, and never throws on nothing", () => {
    expect(hhmm("09:00:00")).toBe("09:00");
    expect(hhmm("13:30")).toBe("13:30");
    expect(hhmm(null)).toBe("");
    expect(hhmm(undefined)).toBe("");
  });
});

describe("🔴 TASK-966 — a from/to pair", () => {
  it("🔑 both empty = fine (the whole day); one end only = partial; From not before To = order; a good pair = fine", () => {
    expect(timeRangeIssue(null, null)).toBeNull();
    expect(timeRangeIssue("", "")).toBeNull();
    expect(timeRangeIssue("09:00", null)).toBe("partial");
    expect(timeRangeIssue(null, "12:00")).toBe("partial");
    expect(timeRangeIssue("12:00", "09:00")).toBe("order");
    expect(timeRangeIssue("09:00", "09:00")).toBe("order");
    expect(timeRangeIssue("09:00", "12:00")).toBeNull();
  });
});

describe("🔴 TASK-966 — what the working-hours draft saves", () => {
  it("🔑 saved hours (a server time may carry seconds) come back as the editor's draft, keyed by weekday number", () => {
    expect(hoursDraftFromSaved({ "6": ["13:00:00", "18:00"] })).toEqual({ 6: { from: "13:00", to: "18:00" } });
    expect(hoursDraftFromSaved(null)).toEqual({});
    expect(hoursDraftFromSaved(undefined)).toEqual({});
  });

  it("🔑 a key only for a TICKED day with a complete From–To; an empty day is simply absent (= the whole day)", () => {
    const r = hoursFromDraft([6, 0, 1], { 6: { from: "13:00", to: "18:00" }, 0: { from: null, to: null }, 1: { from: "09:00", to: "12:00" } });
    expect(r.hours).toEqual({ "6": ["13:00", "18:00"], "1": ["09:00", "12:00"] });
    expect(r.issue).toBeNull();
  });

  it("🔑 hours kept for an UNTICKED day are dropped (the server refuses a key outside `workDays`)", () => {
    const r = hoursFromDraft([6], { 6: { from: "13:00", to: "18:00" }, 0: { from: "09:00", to: "10:00" } });
    expect(r.hours).toEqual({ "6": ["13:00", "18:00"] });
    expect(r.issue).toBeNull();
  });

  it("🔑 a day with one end only, or From not before To, is an ISSUE (nothing is saved as the whole day by accident) — the first such day in Monday-first order", () => {
    expect(hoursFromDraft([6], { 6: { from: "13:00", to: null } }).issue).toEqual({ day: 6, kind: "partial" });
    expect(hoursFromDraft([6], { 6: { from: "18:00", to: "13:00" } }).issue).toEqual({ day: 6, kind: "order" });
    // Monday (1) comes before Sunday (0) in the calendar's week
    expect(hoursFromDraft([0, 1], { 0: { from: "09:00", to: null }, 1: { from: "12:00", to: "09:00" } }).issue).toEqual({ day: 1, kind: "order" });
  });

  it("🔑 no hours at all = an empty object (the caller sends `null` to clear, or nothing when nothing changed)", () => {
    expect(hoursFromDraft([1, 2, 3], {}).hours).toEqual({});
  });
});
