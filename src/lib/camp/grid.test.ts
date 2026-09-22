import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { ACTION_KEYS_SNAPSHOT } from "@/lib/rbac/actions";
import { OTHER_KINDS } from "@/lib/scheduler/other-schedule";
import CampBlockCell from "@/components/partials/Calendar/CampBlockCell";
import type { Booking } from "@/types/app/scheduler";
import { CAMP_HOURS, CAMP_WINDOW_DEFAULT, changedDayPatches, dayPatch, isCampRow, mergeCampCells, replaceTeacher, type CampDayFacts } from "./grid";

/**
 * REQ-095 §11 / SPEC-085 / TASK-418/419 — camp ON the teacher grid: contiguous CAMP hours of one teacher-day fold
 * into ONE block (render-only — the rows stay per hour), the block opens a camp PANEL (never the booking modal — a
 * CAMP row is the week's, `409 CAMP_ROW_OWNED`), `Swap teacher` by `camp.week-open` ⇒ the per-day PATCH, the week
 * editor's window + per-day table saving only the CHANGED days, the `CAMP` tag + legend. No key.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const dayGrid = codeOf("src/components/partials/Calendar/CalendarGrid.tsx");
const weekGrid = codeOf("src/components/partials/Calendar/CalendarWeekGrid.tsx");
const content = codeOf("src/components/partials/Calendar/CalendarContent.tsx");
const panel = codeOf("src/components/partials/Calendar/Modal/CampBlockPanel.tsx");
const editor = codeOf("src/components/partials/Camp/OpenWeekDialog.tsx");
const svc = codeOf("src/services/camp.service.ts");
const legend = codeOf("src/components/partials/Calendar/CalendarLegendBar.tsx");
const render = (el: React.ReactElement) => renderToString(h(MantineProvider, null, h(I18nProvider, null, el)));

const row = (over: Partial<Booking>): Booking =>
  ({
    id: "c1",
    displayName: "Camp A",
    teacherId: "t1",
    teachers: [{ id: "t1", name: "T", nickname: "T", type: "FULL_TIME" }],
    subject: null,
    date: "2026-10-05",
    startTime: "10:00",
    endTime: "11:00",
    bookingType: "OTHER",
    status: "CONFIRMED",
    badges: [],
    attendeeNote: null,
    courseLast: false,
    cancelReason: null,
    rental: null,
    other: { kind: "CAMP", headCount: null, teacherRates: {}, ratePostedAt: null },
    group: null,
    groupId: null,
    groupName: null,
    campWeekDayId: "d1",
    campWeekId: "w1",
    ...over,
  }) as Booking;
const hour = (i: number, over: Partial<Booking> = {}) => row({ id: `c${i}`, startTime: `${String(10 + i).padStart(2, "0")}:00`, endTime: `${String(11 + i).padStart(2, "0")}:00`, ...over });

describe("§1 — mergeCampCells, by value", () => {
  it("10–15 ⇒ ONE block of 5 hours, the rows kept; a gap ⇒ two blocks; another day object ⇒ a new block", () => {
    const five = [0, 1, 2, 3, 4].map((i) => hour(i));
    const out = mergeCampCells(five);
    expect(out.length).toBe(1);
    expect(out[0].kind).toBe("camp");
    if (out[0].kind === "camp") {
      expect([out[0].startTime, out[0].endTime, out[0].hours, out[0].rows.length, out[0].title, out[0].id]).toEqual(["10:00", "15:00", 5, 5, "Camp A", "c0"]);
    }
    const gap = mergeCampCells([hour(0), hour(1), hour(3), hour(4)]);
    expect(gap.map((x) => (x.kind === "camp" ? `${x.startTime}-${x.endTime}/${x.hours}` : "b"))).toEqual(["10:00-12:00/2", "13:00-15:00/2"]);
    const other = mergeCampCells([hour(0), hour(1, { campWeekDayId: "d2" })]);
    expect(other.length).toBe(2);
  });
  it("a lesson between camp hours stays its own item; non-camp OTHER rows (ECA) never merge; seconds on the wire are fine", () => {
    const lesson = row({ id: "L", bookingType: "SINGLE_SESSION", other: null, campWeekDayId: null, campWeekId: null, startTime: "11:00", endTime: "12:00" });
    const out = mergeCampCells([hour(0), lesson, hour(2)]);
    expect(out.map((x) => x.kind)).toEqual(["camp", "booking", "camp"]);
    const eca = [row({ id: "e1", other: { kind: "ECA", headCount: 1, teacherRates: {}, ratePostedAt: null }, campWeekDayId: null }), row({ id: "e2", startTime: "11:00", endTime: "12:00", other: { kind: "ECA", headCount: 1, teacherRates: {}, ratePostedAt: null }, campWeekDayId: null })];
    expect(mergeCampCells(eca).map((x) => x.kind)).toEqual(["booking", "booking"]);
    expect(isCampRow(row({}))).toBe(true);
    expect(isCampRow(row({ campWeekDayId: null }))).toBe(false); // the kind alone is not the owner
    expect(isCampRow(row({ other: { kind: "ECA", headCount: null, teacherRates: {}, ratePostedAt: null } }))).toBe(false);
    const secs = mergeCampCells([hour(0, { endTime: "11:00:00" }), hour(1, { startTime: "11:00:00", endTime: "12:00:00" })]);
    expect(secs.length).toBe(1);
  });
});

describe("§2 — the per-day bodies and the swap, by value", () => {
  const d = (over: Partial<CampDayFacts>): CampDayFacts => ({ date: "2026-10-05", campWeekDayId: "d1", teacherIds: ["t1", "t2"], startTime: "10:00", endTime: "15:00", editedAt: null, ...over });
  it("dayPatch carries only what differs (teacher order ignored; times to HH:MM); unchanged ⇒ null", () => {
    expect(dayPatch(d({}), d({}))).toBeNull();
    expect(dayPatch(d({}), d({ teacherIds: ["t2", "t1"] }))).toBeNull();
    expect(dayPatch(d({}), d({ teacherIds: ["t1", "t3"] }))).toEqual({ teacherIds: ["t1", "t3"] });
    expect(dayPatch(d({ startTime: "10:00:00" }), d({ startTime: "11:00", endTime: "15:00:00" }))).toEqual({ startTime: "11:00" });
    expect(dayPatch(d({}), d({ endTime: "16:00" }))).toEqual({ endTime: "16:00" });
  });
  it("changedDayPatches: one entry per CHANGED day in date order, untouched days absent, an unknown edited date ignored", () => {
    const originals = [d({ date: "2026-10-05" }), d({ date: "2026-10-06", campWeekDayId: "d2" }), d({ date: "2026-10-07", campWeekDayId: "d3" })];
    const edited = [d({ date: "2026-10-07", campWeekDayId: "d3", endTime: "16:00" }), d({ date: "2026-10-05" }), d({ date: "2026-10-06", campWeekDayId: "d2", teacherIds: ["t9"] }), d({ date: "2026-10-09" })];
    expect(changedDayPatches(originals, edited)).toEqual([
      { date: "2026-10-06", body: { teacherIds: ["t9"] } },
      { date: "2026-10-07", body: { endTime: "16:00" } },
    ]);
    expect(changedDayPatches(originals, originals)).toEqual([]);
  });
  it("replaceTeacher keeps order and never doubles; the hour list is the server's 06:00–22:00, whole; the default window", () => {
    expect(replaceTeacher(["t1", "t2"], "t1", "t3")).toEqual(["t3", "t2"]);
    expect(replaceTeacher(["t1", "t2"], "t1", "t2")).toEqual(["t2"]);
    expect(replaceTeacher(["t1"], "zz", "t3")).toEqual(["t1"]);
    expect(CAMP_HOURS[0]).toBe("06:00");
    expect(CAMP_HOURS[CAMP_HOURS.length - 1]).toBe("22:00");
    expect(CAMP_HOURS.length).toBe(17);
    expect(CAMP_WINDOW_DEFAULT).toEqual({ start: "10:00", end: "15:00" });
  });
});

describe("§3 — the grids, the panel, the modal that never opens", () => {
  it("both grids fold through `mergeCampCells` and mount the SHARED block cell; the day grid spans the covered hours", () => {
    expect(dayGrid).toContain("for (const item of mergeCampCells(mine)) {");
    expect(dayGrid).toContain("if (camp?.covered) return null;");
    expect(dayGrid).toContain("style={{ gridRow: `span ${camp.start.hours}` }}");
    expect(dayGrid).toContain("<CampBlockCell block={camp.start} onSelect={(b) => onSelectCamp?.(b)} />");
    expect(weekGrid).toContain("const items = mergeCampCells(cellBookings(tc.id, day));");
    expect(weekGrid).toContain('if (item.kind === "camp") return <CampBlockCell key={item.id} block={item} size="sm" onSelect={(blk) => onSelectCamp?.(blk)} />;');
  });
  it("🔴 a CAMP row NEVER opens the booking modal: `openView` routes it to the panel; the grids hand blocks to `onSelectCamp`", () => {
    const view = content.slice(content.indexOf("const openView = (booking: Booking) => {"), content.indexOf("const openCreate = "));
    expect(view).toContain("if (isCampRow(booking)) {");
    expect(view).toContain("if (item?.kind === \"camp\") setCampBlock(item);");
    expect(view).toContain("return;");
    expect(view.indexOf("if (isCampRow(booking))")).toBeLessThan(view.indexOf("setSelected(booking);"));
    expect(content.match(/onSelectCamp=\{openCamp\}/g)?.length).toBe(2);
    expect(content).toContain("{campBlock && <CampBlockPanel block={campBlock} teachers={teachers} onClose={() => setCampBlock(null)} />}");
    expect(panel).not.toContain("BookingModal");
    expect(panel).not.toMatch(/action:calendar\./); // no booking doors on a camp cell
  });
  it("the panel: the day's teachers from the roster's day object; `Swap teacher` by `camp.week-open`, hidden not disabled ⇒ ONE per-day PATCH with the column's teacher replaced", () => {
    expect(panel).toContain("const { data, isLoading } = useCampWeekDays(block.campWeekId);");
    expect(panel).toContain("const day = data?.days.find((d) => d.date === block.date);");
    expect(panel).toContain('{can("action:camp.week-open") && !swapOpen && (');
    expect(panel).not.toMatch(/disabled=\{[^}]*week-open/);
    expect(panel).toContain("body: { teacherIds: replaceTeacher(dayTeacherIds, block.teacherId, to) }");
    expect(panel).toContain("setError(e instanceof ApiClientError ? e.message : (e as Error).message);");
    expect(panel).toContain('href="/scheduler/camp"');
    expect(svc).toContain("api.patch<CampWeekDayResult>(`/camp/weeks/${weekId}/days/${date}`, body)");
    expect(ACTION_KEYS_SNAPSHOT.length).toBe(59) /* TASK-427 + TASK-429 + TASK-432: budget-view, other-cancel-all, coach-rate */; // no key
  });
  it("rendered: the block cell reads the week's name, the CAMP tag, the span and the hours", () => {
    const [block] = mergeCampCells([0, 1, 2, 3, 4].map((i) => hour(i)));
    if (block.kind !== "camp") throw new Error("not a block");
    const html = render(h(CampBlockCell, { block, onSelect: () => {} }));
    expect(html).toContain('data-camp-block="d1"');
    expect(html).toContain('data-hours="5"');
    expect(html).toContain("Camp A");
    expect(html).toContain(">Camp<");
    expect(html.replace(/<!-- -->/g, "")).toContain("10:00–15:00 · 5 h");
  });
});

describe("§4 — the week editor and the tag/legend", () => {
  it("the window boxes ride on create/update by presence; the per-day table saves ONLY the changed days, one call each; the dates are immutable", () => {
    expect(svc).toContain("...(input.windowStart ? { windowStart: input.windowStart } : {}),");
    expect(svc).toContain("...(input.windowStart !== undefined ? { windowStart: input.windowStart } : {}),");
    expect(editor).toContain("const patches = days ? changedDayPatches(originals, days) : [];");
    expect(editor).toContain("for (const p of patches) await updateDay.mutateAsync({ weekId: week.id, date: p.date, body: withoutRates(p.body, canRate) });"); // TASK-444: the rates stripped without key 59
    expect(editor).toContain("if (Object.keys(weekBody).length) await update.mutateAsync({ id: week.id, input: weekBody });");
    expect(editor).toContain('disabled={!!week} required />'); // both date pickers locked on the edit face
    expect(editor.match(/disabled=\{!!week\}/g)?.length).toBe(2);
    expect(editor).toContain("const applyToEveryDay = () =>");
    // the window rule (whole hours, 06:00–22:00, start < end) is the server's — no comparison of the two times anywhere,
    // and the save gate is exactly name + dates (📌 a `<`/`>` on `windowStart`/`windowEnd` slipped a name-only pin)
    expect(editor).not.toMatch(/(startTime|windowStart)\s*[<>]=?\s*(endTime|windowEnd)|06:00|22:00/);
    expect(editor).toContain("const ready = !!name.trim() && !!startDate && !!endDate;");
  });
  it("the CAMP tag is the 4th kind on the cell tag and the legend; `OTHER_KINDS` stays three so the form never offers it", () => {
    expect([...OTHER_KINDS]).toEqual(["ECA", "FREE", "KOL"]);
    expect(legend).toContain('{[...OTHER_KINDS, "CAMP" as const].map((k) => (');
    expect(codeOf("src/components/partials/Calendar/Modal/OtherScheduleFields.tsx")).not.toContain("CAMP");
    for (const lang of ["en", "th"] as const) {
      expect((dictionaries[lang].calendar as Record<string, string>).otherKindTag_CAMP.length).toBeGreaterThan(0);
      expect((dictionaries[lang].booking as Record<string, string>).otherKind_CAMP.length).toBeGreaterThan(0);
      for (const k of ["campHours", "campTeachersToday", "campSwap", "campSwapTo", "campSwapConfirm", "campSwappedOk", "campOpenRoster"]) expect((dictionaries[lang].calendar as Record<string, string>)[k]?.length).toBeGreaterThan(0);
      for (const k of ["windowStart", "windowEnd", "datesImmutable", "weekLevelHint", "perDay", "applyToEveryDay", "dayEdited"]) expect((dictionaries[lang].camp as Record<string, string>)[k]?.length).toBeGreaterThan(0);
    }
  });
});
