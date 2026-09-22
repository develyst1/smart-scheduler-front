import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { ACTION_KEYS_SNAPSHOT } from "@/lib/rbac/actions";
import { dayPatch, dayRates } from "./grid";
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

const day = (o: Partial<{ teacherIds: string[]; startTime: string; endTime: string; teacherRates: Record<string, number> | null | undefined }>) => ({
  teacherIds: ["t1", "t2"],
  startTime: "10:00",
  endTime: "15:00",
  ...o,
});

describe("§1 — dayRates / dayPatch, by value", () => {
  it("dayRates: the day's coaches only, a missing rate = 0 (the server's default); masked (null) or absent ⇒ null", () => {
    expect(dayRates(day({ teacherRates: { t1: 50000, t9: 1 } }))).toEqual({ t1: 50000, t2: 0 });
    expect(dayRates(day({ teacherRates: {} }))).toEqual({ t1: 0, t2: 0 });
    expect(dayRates(day({ teacherRates: null }))).toBeNull();
    expect(dayRates(day({}))).toBeNull();
  });
  it("dayPatch: `teacherRates` rides only when a rate on the day's coaches changed; never when masked; the other fields as before", () => {
    const o = day({ teacherRates: { t1: 50000, t2: 0 } });
    expect(dayPatch(o, day({ teacherRates: { t1: 50000, t2: 0 } }))).toBeNull();
    expect(dayPatch(o, day({ teacherRates: { t1: 50000 } }))).toBeNull(); // a missing rate reads 0 — same as the server's 0
    expect(dayPatch(o, day({ teacherRates: { t1: 60000, t2: 0 } }))).toEqual({ teacherRates: { t1: 60000, t2: 0 } });
    // a coach removed from the day is not in the rates sent (the server's 400 for an off-day coach)
    expect(dayPatch(o, day({ teacherIds: ["t1"], teacherRates: { t1: 60000, t2: 0 } }))).toEqual({ teacherIds: ["t1"], teacherRates: { t1: 60000 } });
    // a coach added to the day with no rate typed ⇒ no rates field (the server defaults him to 0 by absence — nothing changed)
    expect(dayPatch(o, day({ teacherIds: ["t1", "t2", "t3"], teacherRates: { t1: 50000, t2: 0 } }))).toEqual({ teacherIds: ["t1", "t2", "t3"] });
    expect(dayPatch(o, day({ teacherIds: ["t1", "t2", "t3"], teacherRates: { t1: 50000, t2: 0, t3: 40000 } }))).toEqual({ teacherIds: ["t1", "t2", "t3"], teacherRates: { t1: 50000, t2: 0, t3: 40000 } });
    // masked (null) on both sides ⇒ no rates field, ever
    expect(dayPatch(day({ teacherRates: null }), day({ teacherRates: null, startTime: "11:00" }))).toEqual({ startTime: "11:00" });
    expect(dayPatch(day({ teacherRates: null }), day({ teacherRates: null }))).toBeNull();
    // older payload (absent) on the original, rates typed on the edit ⇒ they ride
    expect(dayPatch(day({}), day({ teacherRates: { t1: 100, t2: 0 } }))).toEqual({ teacherRates: { t1: 100, t2: 0 } });
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
  it("the day editor: the rate column only with key 59 AND unmasked rates; a box per coach ON the day prefilled from the server (0 ⇒ 0); every PATCH through `withoutRates`; the snapshot unchanged (59)", () => {
    expect(editor).toContain("const canRate = can(COACH_RATE_KEY);");
    expect(editor).toContain("const showRates = canRate && rows.some((d) => d.teacherRates !== null && d.teacherRates !== undefined);");
    expect(editor).toContain('{showRates && <Table.Th>{t("camp.rateCol")}</Table.Th>}');
    expect(editor).toContain("{dayRates(d) && (");
    expect(editor).toContain("{d.teacherIds.map((id) => (");
    expect(editor).toContain("value={(dayRates(d)?.[id] ?? 0) / 100}");
    expect(editor).toContain("body: withoutRates(p.body, canRate)");
    expect(editor).not.toMatch(/disabled=\{!canRate/); // hidden, never disabled
    expect(ACTION_KEYS_SNAPSHOT.length).toBe(59);
    expect(ACTION_KEYS_SNAPSHOT).toContain("action:bookings.coach-rate");
  });
});
