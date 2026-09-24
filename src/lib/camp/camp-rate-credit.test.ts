import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { ACTION_KEYS_SNAPSHOT } from "@/lib/rbac/actions";
import { dayPatch, dayRates, type CampDayFacts } from "./grid";
import { remainingLine } from "./units";

/**
 * REQ-104 §2 items 4–5a / TASK-443/444 — the camp day editor's per-coach rate box (key 59 only; masked ⇒ nothing; `0`
 * prefilled as `0`; sent only when changed; stripped without the key) and the check-in page's ONE `Remaining` line from
 * the response (camp days · course sessions · voucher hours; none on `already`, none on a trial/single). No arithmetic.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const editor = codeOf("src/components/partials/Camp/OpenWeekDialog.tsx");
const checkin = codeOf("src/components/partials/Checkin/CheckinContent.tsx");
const units = codeOf("src/lib/camp/units.ts");

const day = (o: Partial<CampDayFacts>): CampDayFacts => ({
  date: "2026-10-05",
  campWeekDayId: "d1",
  teacherIds: ["t1", "t2"],
  startTime: "10:00",
  endTime: "15:00",
  editedAt: null,
  ...o,
});

describe("§1 — dayRates / dayPatch, by value", () => {
  it("dayRates: the day's coaches only, a missing rate = 0 (the server's default); masked (null) or absent ⇒ null", () => {
    expect(dayRates(day({ teacherRates: { t1: 50000, t9: 1 } }))).toEqual({ t1: 50000, t2: 0 });
    expect(dayRates(day({ teacherRates: {} }))).toEqual({ t1: 0, t2: 0 });
    expect(dayRates(day({ teacherRates: null }))).toBeNull();
    expect(dayRates(day({}))).toBeNull();
  });
  it("dayPatch (TASK-457's shape): the roster + each coach's CHANGED rate ride as `teachers[]`; a rate equal to the server's is omitted; masked ⇒ never", () => {
    const o = day({ teacherRates: { t1: 50000, t2: 0 }, teachers: [{ teacherId: "t1", startTime: "10:00", endTime: "15:00", rateMinor: 50000 }, { teacherId: "t2", startTime: "10:00", endTime: "15:00", rateMinor: 0 }] });
    expect(dayPatch(o, { ...o })).toBeNull();
    expect(dayPatch(o, { ...o, teacherRates: { t1: 50000 } })).toBeNull(); // a missing rate reads 0 — same as the server's 0 for t2
    expect(dayPatch(o, { ...o, teacherRates: { t1: 60000, t2: 0 } })).toEqual({ teachers: [{ teacherId: "t1", rateMinor: 60000 }, { teacherId: "t2" }] });
    // a coach removed from the day is not in the roster sent (the server's 400 for an off-day coach)
    expect(dayPatch(o, { ...o, teacherIds: ["t1"], teacherRates: { t1: 60000, t2: 0 } })).toEqual({ teachers: [{ teacherId: "t1", rateMinor: 60000 }] });
    // a coach added with nothing typed ⇒ he rides by id alone (the server defaults him: no window, no rate)
    expect(dayPatch(o, { ...o, teacherIds: ["t1", "t2", "t3"] })).toEqual({ teachers: [{ teacherId: "t1" }, { teacherId: "t2" }, { teacherId: "t3" }] });
    // masked (null) ⇒ no rate ever rides, whatever the box holds
    const masked = day({ teacherRates: null, teachers: [{ teacherId: "t1", startTime: "10:00", endTime: "15:00" }, { teacherId: "t2", startTime: "10:00", endTime: "15:00" }] });
    expect(dayPatch(masked, { ...masked, startTime: "11:00" })).toEqual({ startTime: "11:00" });
    expect(dayPatch(masked, { ...masked })).toBeNull();
    // even with a number in the box (the panel would not show one while masked), a masked day sends no rate
    expect(dayPatch(masked, { ...masked, teacherRates: { t1: 77000, t2: 0 } })).toBeNull();
  });
  it("TASK-457 — a coach's own window rides ONLY when changed: equal to the server's resolved hours ⇒ omitted (that is what NULL means)", () => {
    const o = day({ teachers: [{ teacherId: "t1", startTime: "10:00", endTime: "15:00" }, { teacherId: "t2", startTime: "10:00", endTime: "15:00" }], teacherRates: { t1: 0, t2: 0 } });
    // the admin re-picks the same hours the day already has ⇒ nothing rides (the coach stays on the day's default)
    expect(dayPatch(o, { ...o, teachers: [{ teacherId: "t1", startTime: "10:00", endTime: "15:00" }, { teacherId: "t2", startTime: "10:00", endTime: "15:00" }] })).toBeNull();
    // a real change ⇒ only that coach, only the field he changed
    expect(dayPatch(o, { ...o, teachers: [{ teacherId: "t1", startTime: "12:00", endTime: "15:00" }, { teacherId: "t2", startTime: "10:00", endTime: "15:00" }] })).toEqual({
      teachers: [{ teacherId: "t1", startTime: "12:00" }, { teacherId: "t2" }],
    });
    // cleared (blank) ⇒ omitted: back to the day's window, never a value nobody chose
    expect(dayPatch(o, { ...o, teachers: [{ teacherId: "t1", startTime: "", endTime: "" }, { teacherId: "t2", startTime: "10:00", endTime: "15:00" }] })).toBeNull();
    // a HALF-given window is sent as typed — the server's 400 is the answer, not a client-invented other half
    expect(dayPatch(o, { ...o, teachers: [{ teacherId: "t1", startTime: "12:00", endTime: "" }, { teacherId: "t2", startTime: "10:00", endTime: "15:00" }] })).toEqual({
      teachers: [{ teacherId: "t1", startTime: "12:00" }, { teacherId: "t2" }],
    });
  });
});

describe("§2 — remainingLine, by value; the two pages", () => {
  it("camp ⇒ `{remaining}/{total} days` (3.5 as sent); session ⇒ sessions | hours; null / absent ⇒ no line; no arithmetic", () => {
    expect(remainingLine({ kind: "camp", credit: { remainingDays: 3.5, totalDays: 10 } })).toEqual({ key: "checkin.remainingDays", args: { remaining: 3.5, total: 10 } });
    expect(remainingLine({ kind: "camp" })).toBeNull();
    expect(remainingLine({ kind: "camp", credit: null })).toBeNull();
    expect(remainingLine({ kind: "session", remaining: { used: 7, total: 10, unit: "sessions" } })).toEqual({ key: "checkin.remainingSessions", args: { used: 7, total: 10 } });
    expect(remainingLine({ kind: "session", remaining: { used: 4, total: 10, unit: "hours" } })).toEqual({ key: "checkin.remainingHours", args: { used: 4, total: 10 } });
    expect(remainingLine({ kind: "session", remaining: null })).toBeNull();
    expect(remainingLine({ kind: "session" })).toBeNull();
    expect(units).not.toMatch(/total\s*-\s*used|used\s*\/\s*total|remainingDays\s*[-+*\/]/); // the numbers are the server's
    for (const lang of ["en", "th"] as const) {
      const c = dictionaries[lang].checkin as Record<string, string>;
      expect(c.remainingDays).toContain("{remaining}");
      expect(c.remainingDays).toContain("{total}");
      expect(c.remainingSessions).toContain("{used}");
      expect(c.remainingHours).toContain("{total}");
      expect(typeof c.remaining).toBe("string");
      expect(typeof (dictionaries[lang].camp as Record<string, string>).rateCol).toBe("string");
    }
  });
  it("the check-in page: ONE line per kind, from the response, none on `already`", () => {
    expect(checkin).toContain('<RemainingLine line={result.already ? null : remainingLine({ kind: "session", remaining: result.remaining })} />');
    expect(checkin).toContain('<RemainingLine line={result.already ? null : remainingLine({ kind: "camp", credit: result.credit })} />');
    expect(checkin).toContain('{t("checkin.remaining")} : {t(line.key, line.args)}');
    expect(checkin).not.toMatch(/total\s*-\s*used|\.remainingDays\s*[-+*\/]/);
  });
  it("TASK-457 — the camp block prints the DAY’s kid count only when the server sent one (never an invented 0)", () => {
    const block = codeOf("src/components/partials/Calendar/CampBlockCell.tsx");
    expect(block).toContain(`typeof block.kidCount === "number" && <span data-camp-kids={block.kidCount}>`);
    expect(block).not.toMatch(/kidCount ?? 0/);
  });
  it("the day editor: the rate column only with key 59 AND unmasked rates; a box per coach ON the day prefilled from the server (0 ⇒ 0); every PATCH through `withoutRates`; the snapshot unchanged (59)", () => {
    expect(editor).toContain("const canRate = can(COACH_RATE_KEY);");
    expect(editor).toContain("const showRates = canRate && rows.some((d) => d.teacherRates !== null && d.teacherRates !== undefined);");
    expect(editor).toContain('{showRates && <Table.Th>{t("camp.rateCol")}</Table.Th>}');
    expect(editor).toContain("{dayRates(d) && (");
    expect(editor).toContain("{d.teacherIds.map((id) => (");
    expect(editor).toContain("value={(dayRates(d)?.[id] ?? 0) / 100}");
    expect(editor).toContain("body: withoutRates(p.body, canRate)"); // TASK-457: the guard stays on the new `teachers[]` body
    expect(editor).not.toMatch(/disabled=\{!canRate/); // hidden, never disabled
    expect(ACTION_KEYS_SNAPSHOT.length).toBe(59);
    expect(ACTION_KEYS_SNAPSHOT).toContain("action:bookings.coach-rate");
  });
});
