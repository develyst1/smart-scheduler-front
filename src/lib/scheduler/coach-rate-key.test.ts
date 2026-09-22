import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { ACTION_KEYS_SNAPSHOT } from "@/lib/rbac/actions";
import { COACH_RATE_KEY, duoBody, duoReady, sessionRateChange, withoutRates } from "./duo";
import { otherSchedulePatch } from "./other-schedule";

/**
 * REQ-102 §6/§8 / TASK-431/434/432 — key 59 `action:bookings.coach-rate` gates EVERY rate on the FE: the session
 * box + tag + Clear, the course card's default line, the DUO create's rate field, the OTHER/Group per-teacher rate
 * inputs, the Manage-plan header/Add-teacher/Edit-header rates — ABSENT without it (not dashed). No body carries
 * `classRateMinor` / `teacherRates` / `rateMinor` without the key (ONE guard, `withoutRates`). The server nulls the
 * fields (read null as "no key", never ฿0). Independent of 57 (`teachers.budget-view`).
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const fields = codeOf("src/components/partials/Calendar/Modal/OtherScheduleFields.tsx");
const otherCreate = codeOf("src/components/partials/Calendar/Modal/OtherSeriesDialog.tsx");
const groupCreate = codeOf("src/components/partials/Calendar/Modal/GroupSeriesDialog.tsx");
const details = codeOf("src/components/partials/Calendar/Modal/OtherDetailsDialog.tsx");
const modal = codeOf("src/components/partials/Calendar/Modal/BookingModal.tsx");
const card = codeOf("src/components/partials/Bookings/CoursePackagePanel.tsx");
const flow = codeOf("src/components/partials/Bookings/CreatePlanFlow.tsx");
const series = codeOf("src/components/partials/OtherSeries/OtherSeriesDialogs.tsx");
const seriesPage = codeOf("src/components/partials/OtherSeries/OtherSeriesModal.tsx");
const budget = [codeOf("src/components/partials/Teachers/TeachersContent.tsx"), codeOf("src/components/partials/Calendar/FreelanceBudgetStrip.tsx"), codeOf("src/components/partials/Teachers/FreelanceBudgetControls.tsx")].join("\n");

describe("§1 — the guard and the bodies, by value", () => {
  it("withoutRates strips exactly the three rate fields when the key is absent and touches nothing with it", () => {
    const body = { title: "x", teacherRates: { t1: 100 }, rateMinor: 5, classRateMinor: 7, note: "n" };
    expect(withoutRates(body, false)).toEqual({ title: "x", note: "n" });
    expect(withoutRates(body, true)).toEqual(body);
    expect(withoutRates({}, false)).toEqual({});
    expect(withoutRates({ classRateMinor: null }, false)).toEqual({}); // a Clear is a rate body too
  });
  it("the DUO create: the door stays; the rate rides only with the key; ready without the rate when the field is absent", () => {
    const d = { on: true, coStudentId: "s2", rateBaht: 500 as number | "" };
    expect(duoBody(d, true)).toEqual({ coStudentId: "s2", classRateMinor: 50000 });
    expect(duoBody(d, false)).toEqual({ coStudentId: "s2" });
    expect(duoBody({ ...d, rateBaht: "" }, true)).toEqual({ coStudentId: "s2" }); // optional at create (§8)
    expect(duoReady({ ...d, rateBaht: "" }, "s1", false)).toBe(true);
    expect(duoReady({ ...d, rateBaht: "" }, "s1", true)).toBe(false);
    expect(withoutRates(sessionRateChange(600, { effectiveMinor: 50000, overrideMinor: null, defaultMinor: 50000 }, false) ?? {}, false)).toEqual({});
    // the OTHER edit: with `teacherRates: null` from the server (no key) and no inputs, no `teacherRates` in the patch
    expect(otherSchedulePatch({ kind: "ECA", headCount: 5, teacherRates: null as never, ratePostedAt: null }, { kind: "ECA", headCount: 5, ratesBaht: {} }, ["t1"])).toEqual({});
  });
  it("the 59th key sits after `teachers.budget-view` (the BE's slot); 57 and 59 are independent (neither side reads the other's key)", () => {
    expect(ACTION_KEYS_SNAPSHOT.indexOf(COACH_RATE_KEY)).toBe(ACTION_KEYS_SNAPSHOT.indexOf("action:teachers.budget-view") + 1);
    expect(ACTION_KEYS_SNAPSHOT.length).toBe(59);
    expect(budget).not.toContain("coach-rate");
    for (const src of [fields, otherCreate, groupCreate, details, modal, card, flow, series, seriesPage]) expect(src).not.toContain("budget-view");
  });
});

describe("§2 — every rate surface hidden by the key (absent, not dashed); every body through the ONE guard", () => {
  it("the shared per-teacher rate inputs, the Manage-plan rates, the session box, the course line, the DUO field — each behind `can(COACH_RATE_KEY)`", () => {
    expect(fields).toContain("const canRate = can(COACH_RATE_KEY);");
    expect(fields).toContain("{teacherIds.length > 0 && canRate && (");
    expect(series).toContain("{mode === \"add\" && canRate && <NumberInput");
    expect(seriesPage).toContain("const rate = (id: string) => (canRate && typeof series?.teacherRates?.[id] === \"number\"");
    expect(modal).toContain("const rate = canRate ? (booking.rate ?? null) : null;");
    expect(modal).toContain("{canRate && rate && (");
    expect(card).toContain('const canRate = can("action:bookings.coach-rate");');
    expect(card).toMatch(/\{canRate && \(\s*<DuoRateLine/);
    expect(flow).toContain("const canRate = can(COACH_RATE_KEY);");
    expect(flow).toMatch(/\{canRate && \(\s*<NumberInput\s+label=\{t\("course\.classRate"\)\}/);
    // absent, not dashed: no `—` fallback on any rate surface
    for (const src of [modal, card, flow, fields, series]) expect(src).not.toMatch(/rate[^\n]*"—"[^\n]*coach|coach[^\n]*"—"/);
    // the DUO create DOOR stays (§8): the toggle is not gated on the key
    expect(flow).toContain('value={duo.on ? "DUO" : "PRIVATE"}');
    expect(flow).not.toMatch(/canRate && \(\s*<SegmentedControl/);
  });
  it("the bodies: OTHER create · Group create · OTHER edit · Add-teacher · Edit-header · the move · the DUO create — each through `withoutRates` / `duoBody(…, canRate)`", () => {
    expect(otherCreate).toContain("await create.mutateAsync(withoutRates({");
    expect(otherCreate).toContain("}, canRate));");
    expect(groupCreate).toContain("await create.mutateAsync(withoutRates({");
    expect(groupCreate).toContain("}, canRate));");
    expect(details).toContain("const patch = withoutRates(otherSchedulePatch(facts, draft, teacherIds), canRate);");
    expect(series).toContain("body: withoutRates(withFromDate({ teacherId: to, ...(rateBaht !== \"\" ? { rateMinor: bahtToMinor(rateBaht) } : {}) }, fromDate), canRate)");
    expect(series).toContain("const patch = withoutRates(");
    expect(modal).toContain("Object.assign(patch, withoutRates(sessionRateChange(rateBaht, rate, rateClear) ?? {}, canRate));");
    expect(flow).toContain("duo: group ? undefined : duoBody(duo, canRate),");
    expect(flow).toContain("duoReady(duo, student?.id, canRate) &&");
  });
});
