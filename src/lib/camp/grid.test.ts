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
/** 🔴 TASK-593 nit 5 — the camp CELL, where the kid count is printed. */
const cell = codeOf("src/components/partials/Calendar/CampBlockCell.tsx");
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
  it("dayPatch carries only what differs (teacher order ignored; times to HH:MM); unchanged ⇒ null — TASK-457: the roster rides as `teachers[]`", () => {
    expect(dayPatch(d({}), d({}))).toBeNull();
    expect(dayPatch(d({}), d({ teacherIds: ["t2", "t1"] }))).toBeNull();
    expect(dayPatch(d({}), d({ teacherIds: ["t1", "t3"] }))).toEqual({ teachers: [{ teacherId: "t1" }, { teacherId: "t3" }] });
    expect(dayPatch(d({ startTime: "10:00:00" }), d({ startTime: "11:00", endTime: "15:00:00" }))).toEqual({ startTime: "11:00" });
    expect(dayPatch(d({}), d({ endTime: "16:00" }))).toEqual({ endTime: "16:00" });
  });
  it("changedDayPatches: one entry per CHANGED day in date order, untouched days absent, an unknown edited date ignored", () => {
    const originals = [d({ date: "2026-10-05" }), d({ date: "2026-10-06", campWeekDayId: "d2" }), d({ date: "2026-10-07", campWeekDayId: "d3" })];
    const edited = [d({ date: "2026-10-07", campWeekDayId: "d3", endTime: "16:00" }), d({ date: "2026-10-05" }), d({ date: "2026-10-06", campWeekDayId: "d2", teacherIds: ["t9"] }), d({ date: "2026-10-09" })];
    expect(changedDayPatches(originals, edited)).toEqual([
      { date: "2026-10-06", body: { teachers: [{ teacherId: "t9" }] } }, // TASK-457: the new roster shape
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
    // 🔻 TASK-593 nit 4, declared: both cells now receive `closed` — **a closed week's block is MARKED in the week view
    // too, which is my own TASK-586 rule** (*the marker is WHY showing a closed week is safe*). The banner carried it and
    // the cells did not. ✅ What this pin protects — ONE shared cell, folded through `mergeCampCells`, spanning in the day
    // grid — is unchanged.
    expect(dayGrid).toContain("<CampBlockCell block={camp.start} closed={closedWeeks?.has(camp.start.campWeekId) ?? false} onSelect={(b) => onSelectCamp?.(b)} />");
    expect(weekGrid).toContain("const items = mergeCampCells(cellBookings(tc.id, day));");
    expect(weekGrid).toContain('if (item.kind === "camp") return <CampBlockCell key={item.id} block={item} closed={closedWeeks?.has(item.campWeekId) ?? false} size="sm" onSelect={(blk) => onSelectCamp?.(blk)} />;');
    // 🔑 and ONE source for "which weeks are closed": the payload's own `status`, read once on the page
    expect(content).toContain("const closedWeeks = closedWeekIds(calendar?.campWeeks);");
  });

  /**
   * 🔴 **TASK-605 — the WIRING, link by link, because a dropped link passed 921 tests.**
   *
   * A `develop` merge kept Palm's `times` and dropped our `closedWeeks` from `CalendarGrid`'s destructure, **while the
   * prop type and the usage above both survived** ⇒ the build failed and **the suite did not**, because the test above
   * asserts how the set is DERIVED and the one below it asserts how the cell is CALLED — 🚫 **nothing asserted that the
   * grid is GIVEN the set.** 🔑 *The suite does not type-check the app; the build is a separate gate* — so the chain is
   * pinned here, where a missing link is a red test rather than a red build.
   * 📌 Same family as TASK-596: **a wiring with no fixture is a wiring nothing is asking about.**
   */
  it("🔴 TASK-605 — `closedWeeks` is wired END TO END: derived once, handed to BOTH grids, destructured by each, down to the cell", () => {
    // 1 — derived once, on the page (the same single source the test above protects)
    expect(content).toContain("const closedWeeks = closedWeekIds(calendar?.campWeeks);");
    // 2 — handed to BOTH grids. 🔑 The day view was the one that broke; the week view would have broken just as quietly.
    expect(content).toMatch(/<CalendarGrid[\s\S]{0,400}?closedWeeks=\{closedWeeks\}/);
    expect(content).toMatch(/<CalendarWeekGrid[\s\S]{0,400}?closedWeeks=\{closedWeeks\}/);
    // 3 — 🔴 THE DROPPED LINK: each grid must DESTRUCTURE it. Palm's `times` is in the same destructure and stays his.
    expect(dayGrid).toMatch(/export default function CalendarGrid\(\{[^}]*\bclosedWeeks\b[^}]*\}: Props\)/);
    expect(dayGrid).toMatch(/export default function CalendarGrid\(\{[^}]*\btimes\b[^}]*\}: Props\)/);
    expect(weekGrid).toMatch(/export default function CalendarWeekGrid\(\{[\s\S]*?\bclosedWeeks\b[\s\S]*?\}/);
    // 4 — the day grid passes it down one more level, and `Row` reaches it
    expect(dayGrid).toContain("closedWeeks={closedWeeks}");
    expect(dayGrid).toMatch(/function Row\(\{[\s\S]*?\bclosedWeeks\b[\s\S]*?\}/);
    // 5 — and the shared cell is what finally MARKS it: the attribute an admin's screen turns on
    expect(cell).toContain('data-camp-closed={closed ? "yes" : "no"}');
    expect(cell).toContain("data-camp-closed-tag");

    // ⚠️ **The derivation §2 asked for, and it found one more.** The props that can be dropped at a CALL SITE in
    // silence are the OPTIONAL ones: a required prop left out is a type error, so the build still shouts. In this file
    // those are `times?` (Palm's), `onSelectCamp?` and `closedWeeks?` — and 🔴 **`onSelectCamp` was wired at BOTH call
    // sites and pinned at NEITHER**, while the test below asserts only what the grids DO with it once they have it.
    // 🔑 *A dropped `onSelectCamp` is a camp block that opens nothing — a dead control, which is worse than a missing
    // marker.* ⇒ pinned here, in both views.
    expect(content.match(/onSelectCamp=\{openCamp\}/g)?.length).toBe(2);
    expect(content).toMatch(/<CalendarGrid[\s\S]{0,400}?onSelectCamp=\{openCamp\}/);
    expect(content).toMatch(/<CalendarWeekGrid[\s\S]{0,400}?onSelectCamp=\{openCamp\}/);
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
    expect(panel).toContain('{can("action:camp.week-open") && hasWeek && !swapOpen && ('); // TASK-450b: + the uuid guard on the write door
    expect(panel).not.toMatch(/disabled=\{[^}]*week-open/);
    expect(panel).toContain("body: { teacherIds: replaceTeacher(dayTeacherIds, block.teacherId, to) }");
    expect(panel).toContain("setError(e instanceof ApiClientError ? e.message : (e as Error).message);");
    expect(panel).toContain('href="/scheduler/camp"');
    expect(svc).toContain("api.patch<CampWeekDayResult>(`/camp/weeks/${weekId}/days/${date}`, body)");
    expect(ACTION_KEYS_SNAPSHOT.length).toBe(60) /* TASK-518: + the 60th, `calendar.undo` (SPEC-094) */ /* TASK-427 + TASK-429 + TASK-432: budget-view, other-cancel-all, coach-rate */; // no key
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

/**
 * 🔴 **TASK-593 nit 5 — "7 คน" on a 1-child week: WHICH SIDE IS WRONG?**
 *
 * ⚖️ **Attributed to the PAYLOAD, and these are the three facts that attribute it:**
 *  1. **the cell prints `block.kidCount` and nothing else** — no sum, no count of rows, no arithmetic at all;
 *  2. **`kidCount` is `b.campKidCount` copied straight off the booking** in `mergeCampCells`;
 *  3. **a block never spans two DAYS** — the merge continues only while `campWeekDayId` matches AND the hours are
 *     contiguous, so a week's cells cannot pool their counts into one number.
 * ⇒ 🔑 **Whatever number appears is the number the server sent for that booking**, and the FE cannot inflate it.
 * 🚫 **So the FE half is STOPPED** and the number is @Jason's to explain (the DAY-count ruling: `campKidCount` is the same
 * on every block of a date). 📌 *These assertions exist so the attribution is re-checkable rather than a claim in a report.*
 */
describe("🔴 TASK-593 nit 5 — the kid count is the SERVER's, and the FE cannot inflate it", () => {
  it("the cell renders `kidCount` verbatim — 🚫 no arithmetic anywhere near it", () => {
    expect(cell).toContain("{typeof block.kidCount === \"number\" && <span data-camp-kids={block.kidCount}>");
    // 🚫 nothing that could add, count or accumulate
    expect(cell).not.toMatch(/reduce|\.length|\+ 1|sum/);
  });

  it("`mergeCampCells` copies the payload's number and merges only WITHIN one day", () => {
    const grid = codeOf("src/lib/camp/grid.ts");
    expect(grid).toContain("kidCount: b.campKidCount ?? null,");
    expect(grid).toContain("last.campWeekDayId === b.campWeekDayId && hhmm(last.endTime) === hhmm(b.startTime)");
    // 🔑 and the merge never touches `kidCount` again — a merged block keeps the first row's server number
    const merge = grid.slice(grid.indexOf("export const mergeCampCells"), grid.indexOf("export const campDayFactsOf") + 1 || undefined);
    expect(merge).not.toMatch(/kidCount\s*[+*]/);
    expect(merge).not.toContain("last.kidCount");
  });

  it("🔑 value-tested: two contiguous hours of ONE day fold into one block carrying THAT day's number, unchanged", () => {
    const row = (id: string, date: string, startTime: string, endTime: string, kid: number, dayId: string) =>
      ({
        id,
        date,
        startTime,
        endTime,
        status: "CONFIRMED",
        bookingType: "OTHER",
        other: { kind: "CAMP" },
        displayName: "Camp A",
        teacherId: "t1",
        campWeekId: "w-1",
        campWeekDayId: dayId,
        campKidCount: kid,
      }) as never;
    const [one] = mergeCampCells([row("a", "2026-10-05", "10:00", "11:00", 1, "d-1"), row("b", "2026-10-05", "11:00", "12:00", 1, "d-1")]);
    expect(one.kind).toBe("camp");
    if (one.kind === "camp") {
      expect(one.hours).toBe(2);
      expect(one.kidCount).toBe(1); // 🚫 not 2 — the hours merged, the count did not
    }
    // two DAYS never merge, so each keeps its own day's number
    const two = mergeCampCells([row("a", "2026-10-05", "10:00", "11:00", 1, "d-1"), row("b", "2026-10-06", "10:00", "11:00", 7, "d-2")]);
    expect(two).toHaveLength(2);
    expect(two.map((i) => (i.kind === "camp" ? i.kidCount : null))).toEqual([1, 7]);
  });
});
