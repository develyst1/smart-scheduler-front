import { describe, expect, it } from "bun:test";
import { changedDayPatches, dayPatch, teacherEntry, type CampDayFacts } from "./grid";

/**
 * 🔴 **TASK-707 (REQ-116) — saving a camp day sends each coach's hours WHOLE.**
 *
 * The server replaces a coach row WHOLE: times omitted ⇒ NULL ⇒ "the day's window", and ONE time without the other ⇒ 400. The old
 * `teacherEntry` sent only the half that differed from what the server sent, so (1) adding a coach reset every OWN-hours coach to the day's
 * window — a false clash naming another coach, or, with no clash, a silent widening — and (2) a start changed with an unchanged end went
 * out as a half and was refused with "set both times". 🔑 Every assertion is by VALUE: the body that would be sent.
 */

const day = (over: Partial<CampDayFacts>): CampDayFacts => ({
  date: "2026-10-12",
  campWeekDayId: "d1",
  teacherIds: ["bank", "toth"],
  startTime: "10:00",
  endTime: "15:00",
  editedAt: null,
  // Bank has his OWN hours (10–12); Toth is on the day's default (the server resolves him to 10–15)
  teachers: [
    { teacherId: "bank", startTime: "10:00", endTime: "12:00" },
    { teacherId: "toth", startTime: "10:00", endTime: "15:00" },
  ],
  ...over,
});
const win = (id: string, startTime: string, endTime: string) => ({ teacherId: id, startTime, endTime });

describe("🔴 TASK-707 — adding a coach must not reset the coaches who already have their own hours", () => {
  it("🔑 add Kowjoe: Bank rides with BOTH his own times, Toth (on the default) and Kowjoe with NONE", () => {
    const o = day({});
    const e = day({ teacherIds: ["bank", "toth", "kowjoe"] });
    expect(dayPatch(o, e)).toEqual({
      teachers: [{ teacherId: "bank", startTime: "10:00", endTime: "12:00" }, { teacherId: "toth" }, { teacherId: "kowjoe" }],
    });
  });

  it("🔑 the same when the admin's view of Bank is absent from the edited list (never touched ⇒ what the server sent)", () => {
    const o = day({});
    const e = day({ teacherIds: ["bank", "toth", "kowjoe"], teachers: [] });
    expect(dayPatch(o, e)?.teachers?.[0]).toEqual({ teacherId: "bank", startTime: "10:00", endTime: "12:00" });
  });

  it("⚠️ times arriving as HH:mm:ss are sent as HH:mm", () => {
    const o = day({ teachers: [{ teacherId: "bank", startTime: "10:00:00", endTime: "12:00:00" }, { teacherId: "toth", startTime: "10:00:00", endTime: "15:00:00" }] });
    expect(dayPatch(o, { ...o, teacherIds: ["bank", "toth", "k"] })?.teachers?.[0]).toEqual({ teacherId: "bank", startTime: "10:00", endTime: "12:00" });
  });
});

describe("🔴 TASK-707 — a changed window always rides as a PAIR", () => {
  it("🔑 Toth from the day's 10–15 to 13–15 ⇒ BOTH times (the end equals the server's, and used to be dropped — the 'set both times' 400)", () => {
    const o = day({});
    const e = day({ teachers: [win("bank", "10:00", "12:00"), win("toth", "13:00", "15:00")] });
    expect(dayPatch(o, e)).toEqual({ teachers: [{ teacherId: "bank", startTime: "10:00", endTime: "12:00" }, { teacherId: "toth", startTime: "13:00", endTime: "15:00" }] });
  });

  it("🔑 only the END changed ⇒ still both", () => {
    const o = day({});
    const e = day({ teachers: [win("bank", "10:00", "12:00"), win("toth", "10:00", "14:00")] });
    expect(dayPatch(o, e)?.teachers?.[1]).toEqual({ teacherId: "toth", startTime: "10:00", endTime: "14:00" });
  });

  it("🔑 Bank (own hours) moved to 11–12 ⇒ both; the roster is whole", () => {
    const o = day({});
    const e = day({ teachers: [win("bank", "11:00", "12:00"), win("toth", "10:00", "15:00")] });
    expect(dayPatch(o, e)).toEqual({ teachers: [{ teacherId: "bank", startTime: "11:00", endTime: "12:00" }, { teacherId: "toth" }] });
  });
});

describe("🔴 TASK-707 — back to exactly the day's window ⇒ NEITHER (he follows the day again)", () => {
  it("🔑 Bank from his own 10–12 back to the day's 10–15 ⇒ no times", () => {
    const o = day({});
    const e = day({ teachers: [win("bank", "10:00", "15:00"), win("toth", "10:00", "15:00")] });
    expect(dayPatch(o, e)).toEqual({ teachers: [{ teacherId: "bank" }, { teacherId: "toth" }] });
  });

  it("✅ a cleared window (both boxes blank) ⇒ neither — back to the day's", () => {
    const o = day({});
    const e = day({ teachers: [win("bank", "", ""), win("toth", "10:00", "15:00")] });
    expect(dayPatch(o, e)).toEqual({ teachers: [{ teacherId: "bank" }, { teacherId: "toth" }] });
  });
});

describe("🔴 TASK-707 — changing the DAY's window (compared with the EDITED day, not the server's)", () => {
  it("🔑 a coach on the default follows the day: NEITHER; a coach with own hours keeps them: BOTH", () => {
    const o = day({});
    const edited = { startTime: "11:00", endTime: "16:00" };
    expect(teacherEntry(o, { teacherId: "toth" }, edited)).toEqual({ teacherId: "toth" });
    expect(teacherEntry(o, { teacherId: "bank" }, edited)).toEqual({ teacherId: "bank", startTime: "10:00", endTime: "12:00" });
  });

  it("🔑 the day's hours changed and NOTHING else: only the day's times ride (no teachers[] — today's behaviour)", () => {
    const o = day({});
    expect(dayPatch(o, day({ startTime: "11:00", endTime: "16:00" }))).toEqual({ startTime: "11:00", endTime: "16:00" });
  });

  it("🔑 the day's hours AND a coach's changed in one save: the coach is compared with the EDITED day", () => {
    const o = day({});
    // Toth typed 11–16 while the day moves to 11–16 ⇒ equals the EDITED day ⇒ he stays on the default and FOLLOWS it: only the day's times ride.
    // (Compared with the server's 10–15 he would have been frozen at 11–16 with times of his own.)
    const same = day({ startTime: "11:00", endTime: "16:00", teachers: [win("bank", "10:00", "12:00"), win("toth", "11:00", "16:00")] });
    expect(dayPatch(o, same)).toEqual({ startTime: "11:00", endTime: "16:00" });
    // Toth typed 12–16 (NOT the edited day's) ⇒ his own hours ⇒ BOTH, and the unchanged own-hours coach rides whole beside him
    const own = day({ startTime: "11:00", endTime: "16:00", teachers: [win("bank", "10:00", "12:00"), win("toth", "12:00", "16:00")] });
    expect(dayPatch(o, own)).toEqual({
      teachers: [{ teacherId: "bank", startTime: "10:00", endTime: "12:00" }, { teacherId: "toth", startTime: "12:00", endTime: "16:00" }],
      startTime: "11:00",
      endTime: "16:00",
    });
  });
});

describe("🔴 TASK-707 — what is NOT changed", () => {
  it("🚫 a genuinely half-typed window keeps today's behaviour: sent as typed, no invented half", () => {
    const o = day({});
    const e = day({ teachers: [win("bank", "10:00", "12:00"), win("toth", "13:00", "")] });
    expect(dayPatch(o, e)?.teachers?.[1]).toEqual({ teacherId: "toth", startTime: "13:00" });
  });

  it("🚫 an UNTOUCHED day sends no PATCH at all — even though an own-hours coach would ride whole if anything else changed", () => {
    const o = day({});
    expect(dayPatch(o, day({}))).toBeNull();
    expect(changedDayPatches([o], [day({})])).toEqual([]);
  });

  it("✅ rates are untouched by this: a changed rate still rides, and an unchanged own-hours coach still rides whole beside it", () => {
    const o = day({ teacherRates: { bank: 0, toth: 0 } });
    const e = { ...o, teacherRates: { bank: 0, toth: 70000 } };
    expect(dayPatch(o, e)).toEqual({ teachers: [{ teacherId: "bank", startTime: "10:00", endTime: "12:00" }, { teacherId: "toth", rateMinor: 70000 }] });
  });
});
