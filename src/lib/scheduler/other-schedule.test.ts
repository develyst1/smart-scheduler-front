import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { ACTION_KEYS_SNAPSHOT } from "@/lib/rbac/actions";
import { OTHER_KINDS, draftFromFacts, emptyOtherSchedule, otherScheduleFacts, otherSchedulePatch, teacherRatesMinor } from "./other-schedule";

/**
 * REQ-095 Stage 1 / SPEC-080 / TASK-395 — ECA · Free · KOL on the OTHER form: Kind / Head count / Rate per teacher
 * (stored, not posted — the hint says so), a `Create series` door with a multi-date picker (one call, all or
 * nothing, the 409 names the date and the ticks stay), the kind tag on the cell + legend, and a details editor
 * through its OWN route. 🚫 No client rule: the pure helpers only shape the wire; the server refuses.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const modal = codeOf("src/components/partials/Calendar/Modal/BookingModal.tsx");
const svc = codeOf("src/services/scheduler.service.ts");
const series = codeOf("src/components/partials/Calendar/Modal/OtherSeriesDialog.tsx");
const details = codeOf("src/components/partials/Calendar/Modal/OtherDetailsDialog.tsx");
const fields = codeOf("src/components/partials/Calendar/Modal/OtherScheduleFields.tsx");

describe("§1 — the pure helpers (value-tested)", () => {
  it("facts: each field only when set; the rates map in SATANG, only for teachers on the booking, only when at least one is typed", () => {
    expect(otherScheduleFacts(emptyOtherSchedule(), ["t1"])).toEqual({});
    expect(otherScheduleFacts({ kind: "ECA", headCount: "", ratesBaht: {} }, ["t1"])).toEqual({ otherKind: "ECA" });
    expect(otherScheduleFacts({ kind: null, headCount: 0, ratesBaht: {} }, ["t1"])).toEqual({ headCount: 0 }); // 0 is a value, not "untouched"
    expect(otherScheduleFacts({ kind: "KOL", headCount: 12, ratesBaht: { t1: 500, t2: "", t9: 100 } }, ["t1", "t2"])).toEqual({
      otherKind: "KOL",
      headCount: 12,
      teacherRates: { t1: 50000 }, // baht → satang once; t2 untouched; t9 not on the booking
    });
    expect(teacherRatesMinor({ t1: "" }, ["t1"])).toBeUndefined();
    expect(OTHER_KINDS).toEqual(["ECA", "FREE", "KOL"]);
  });

  it("the edit patch: ONLY what changed against the server's facts; the map replaces when any rate differs; nothing ⇒ {}", () => {
    const facts = { kind: "ECA" as const, headCount: 10, teacherRates: { t1: 50000 }, ratePostedAt: null };
    const same = draftFromFacts(facts, ["t1"]);
    expect(same).toEqual({ kind: "ECA", headCount: 10, ratesBaht: { t1: 500 } });
    expect(otherSchedulePatch(facts, same, ["t1"])).toEqual({});
    expect(otherSchedulePatch(facts, { ...same, kind: "FREE" }, ["t1"])).toEqual({ otherKind: "FREE" });
    expect(otherSchedulePatch(facts, { ...same, headCount: 11 }, ["t1"])).toEqual({ headCount: 11 });
    expect(otherSchedulePatch(facts, { ...same, ratesBaht: { t1: 600 } }, ["t1"])).toEqual({ teacherRates: { t1: 60000 } });
    // a second teacher gains a rate ⇒ the whole map rides (it REPLACES server-side)
    expect(otherSchedulePatch(facts, { ...same, ratesBaht: { t1: 500, t2: 300 } }, ["t1", "t2"])).toEqual({ teacherRates: { t1: 50000, t2: 30000 } });
    // no facts yet (an older row) ⇒ everything typed is a change
    expect(otherSchedulePatch(null, { kind: "KOL", headCount: 3, ratesBaht: {} }, ["t1"])).toEqual({ otherKind: "KOL", headCount: 3 });
    expect(draftFromFacts(null, ["t1", "t2"])).toEqual({ kind: null, headCount: "", ratesBaht: { t1: "", t2: "" } });
  });
});

describe("§2 — the form, the series, the editor", () => {
  it("the OTHER create form: the three fields after the title; the facts spread into the SAME payload literal; the service gates them on the type", () => {
    const other = modal.slice(modal.indexOf(") : isOther ? ("), modal.indexOf('label={t("booking.otherCharge")}'));
    expect(other).toContain("<OtherScheduleFields value={otherSched} onChange={setOtherSched} teacherIds={other.teacherIds} teachers={teachers} />");
    expect(other.indexOf("onChange={onOtherTitleChange(setOther)}")).toBeLessThan(other.indexOf("<OtherScheduleFields"));
    expect(modal).toContain("...otherScheduleFacts(otherSched, otherDraft.teacherIds),");
    expect(modal).toContain("setOtherSched(emptyOtherSchedule());"); // reset with the rest of the draft
    expect(svc).toContain("otherKind: isOther ? input.otherKind : undefined,");
    expect(svc).toContain("headCount: isOther ? input.headCount : undefined,");
    expect(svc).toContain("teacherRates: isOther ? input.teacherRates : undefined,");
    // the rate's hint says the truth, in both languages
    expect(fields).toContain('t("booking.otherRateHint")');
    expect(dictionaries.en.booking.otherRateHint).toBe("Stored for the backoffice; not posted here.");
    expect(dictionaries.th.booking.otherRateHint).toContain("ยังไม่ลงบัญชี");
    // ONE shared fields component, three mounts
    expect(series).toContain("<OtherScheduleFields");
    expect(details).toContain("<OtherScheduleFields");
  });

  it("the series: its own key on the door; ONE call with the confirmed body; the ticks stay on a 409; the count is shown", () => {
    expect(modal).toContain('{can("action:calendar.other-series") && (');
    expect(modal).toContain("onClick={() => setSeriesOpen(true)}");
    expect(ACTION_KEYS_SNAPSHOT).toContain("action:calendar.other-series");
    expect(svc).toContain('api.post<OtherSeriesResponse>("/bookings/other-series", {');
    for (const line of ["title: input.title,", "otherKind: input.otherKind,", "headCount: input.headCount,", "teacherId: input.teacherId,", "startTime: input.startTime,", "dates: input.dates,"]) expect(svc).toContain(line);
    expect(svc).toContain("...(input.teacherRates ? { teacherRates: input.teacherRates } : {}),");
    expect(svc).not.toMatch(/other-series[\s\S]{0,600}endTime/); // the server derives it
    // TASK-398 moved the picker into the SHARED `MultiDateField` (the DUO/Group series uses the same one)
    expect(codeOf("src/components/partials/Calendar/Modal/MultiDateField.tsx")).toMatch(/<DatePicker\s+type="multiple"/);
    expect(series).toContain("<MultiDateField value={dates} onChange={setDates} />");
    expect(codeOf("src/components/partials/Calendar/Modal/MultiDateField.tsx")).toContain('t("booking.otherSeriesCount", { n: String(value.length) })');
    expect(series).toContain("dates: [...dates].sort(),");
    // on a refusal the sentence is shown and NOTHING resets the ticks
    const catchBlock = series.slice(series.indexOf("} catch (e) {"), series.indexOf("return ("));
    expect(catchBlock).toContain("setError(e instanceof ApiClientError ? e.message : (e as Error).message);");
    expect(catchBlock).not.toContain("setDates");
    // TASK-429 — the toast now carries the Manage-plan link from the server's `seriesKey` (absent ⇒ no link)
    expect(series).toContain('notify({ title: t("booking.otherSeriesCreatedOk", { n: String(res.created) }), color: "success" });'); // TASK-435 — the page link is gone (the modal lives on the calendar)
    // 🚫 no client rule on the dates beyond "at least one is ticked" for the button
    expect(series).not.toMatch(/dates\.length\s*(<=?|>=?)\s*[1-9]\d*|max\(60/); // `> 0` (a tick exists) is the only comparison allowed
  });

  it("the editor: its OWN route (not the move), only changed fields, behind booking-edit; the view shows the facts from `other`", () => {
    expect(svc).toContain("api.patch<MoveBookingResponse>(`/bookings/${id}/other`, patch)");
    expect(details).toContain("const patch = withoutRates(otherSchedulePatch(facts, draft, teacherIds), canRate);"); // TASK-432 — never `teacherRates` without key 59 // TASK-398: `facts` = `other`, or a GROUP row's `group`
    expect(details).toContain("await update.mutateAsync({ id: booking.id, patch });");
    expect(details).toContain("disabled={!dirty}");
    expect(modal).toContain('{booking.bookingType === "OTHER" && booking.other && (');
    const facts = modal.slice(modal.indexOf('{booking.bookingType === "OTHER" && booking.other && ('), modal.indexOf("<OtherDetailsDialog"));
    expect(facts).toContain('{can("action:calendar.booking-edit") && (');
    expect(facts).toContain("onClick={() => setOtherDetailsOpen(true)}");
    expect(codeOf("src/lib/api/mappers.ts")).toContain("other: dto.other ?? null,");
  });

  it("the cell tag + the legend: from `other.kind` only; three kinds on the legend; the copy counted", () => {
    const cell = codeOf("src/components/common/BookingCellBody.tsx");
    expect(cell).toContain("export function OtherKindTag(");
    // TASK-398: the same tag serves a GROUP row (`group.kind`); a lesson booking still gets nothing
    expect(cell).toContain('const kind = isGroup ? booking.group?.kind : booking.bookingType === "OTHER" ? booking.other?.kind : null;');
    expect(cell).toContain("if (!kind) return null;");
    expect(codeOf("src/components/partials/Calendar/CalendarGrid.tsx")).toContain("<OtherKindTag booking={booking} />");
    expect(codeOf("src/components/partials/Calendar/CalendarWeekGrid.tsx")).toContain('<OtherKindTag booking={b} size="sm" />');
    const legend = codeOf("src/components/partials/Calendar/CalendarLegendBar.tsx");
    expect(legend).toContain('{[...OTHER_KINDS, "CAMP" as const].map((k) => ('); // TASK-419 — the 4th, CAMP, listed beside the form's three (never in OTHER_KINDS)
    expect(legend).toContain("t(`calendar.otherKindTag_${k}`)");
    for (const k of OTHER_KINDS) {
      expect((dictionaries.en.calendar as Record<string, string>)[`otherKindTag_${k}`]?.length).toBeGreaterThan(0);
      expect((dictionaries.th.calendar as Record<string, string>)[`otherKindTag_${k}`]?.length).toBeGreaterThan(0);
      expect((dictionaries.en.booking as Record<string, string>)[`otherKind_${k}`]?.length).toBeGreaterThan(0);
      expect((dictionaries.th.booking as Record<string, string>)[`otherKind_${k}`]?.length).toBeGreaterThan(0);
    }
    for (const k of ["otherKind", "otherKindPick", "otherHeadCount", "otherRate", "otherRateHint", "otherRatePrimary", "otherSeries", "otherSeriesTitle", "otherSeriesNote", "otherSeriesDates", "otherSeriesCount", "otherSeriesCreate", "otherSeriesCreatedOk", "otherEditDetails", "otherEditDetailsHint", "otherDetailsSavedOk"]) {
      expect((dictionaries.en.booking as Record<string, string>)[k]?.length).toBeGreaterThan(0);
      expect((dictionaries.th.booking as Record<string, string>)[k]?.length).toBeGreaterThan(0);
    }
  });
});
