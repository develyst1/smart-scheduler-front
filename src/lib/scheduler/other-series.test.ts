import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { ACTION_KEYS_SNAPSHOT } from "@/lib/rbac/actions";
import { navItemForPath } from "@/components/layout/AdminLayout/AdminLayout.config";
import { existsSync } from "fs";
import { cancelAllBody, fromDateDefault, seriesDoors, statusCounts, withFromDate } from "./other-series";

/**
 * REQ-101 / SPEC-088 Part A / TASK-428/429 — the ECA/Free/KOL Manage-plan page: which doors show (the grants + the
 * rows; key 58 ALONE gates cancel-all), the bodies, the `fromDate` default, the row → page link only with a key, the
 * series-in-range list, the 58th key. 🚫 No slot logic on the FE; every 409 is the server's sentence.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const page = codeOf("src/components/partials/OtherSeries/OtherSeriesModal.tsx");
const dialogs = codeOf("src/components/partials/OtherSeries/OtherSeriesDialogs.tsx");
const svc = codeOf("src/services/other-series.service.ts");
const modal = codeOf("src/components/partials/Calendar/Modal/BookingModal.tsx");
const createDlg = codeOf("src/components/partials/Calendar/Modal/OtherSeriesDialog.tsx");
const strip = codeOf("src/components/partials/Calendar/SeriesInRange.tsx");
const content = codeOf("src/components/partials/Calendar/CalendarContent.tsx");

const rows = (statuses: string[]) => ({ rows: statuses.map((status, i) => ({ bookingId: `b${i}`, date: `2026-10-0${i + 1}`, status, teacherId: "t1", additionalTeacherIds: [] })) });
const all = { status: true, cancelAll: true, edit: true, series: true };
const none = { status: false, cancelAll: false, edit: false, series: false };

describe("§1 — seriesDoors, by value", () => {
  it("each door by its own grant; key 58 ALONE gates cancel-all (status does not); confirm-all needs a PENDING row, cancel-all a LIVE row", () => {
    const s = rows(["PENDING", "CONFIRMED", "ATTENDED", "CANCELLED"]);
    expect(seriesDoors(all, s)).toEqual({ confirmAll: true, cancelAll: true, addTeacher: true, removeTeacher: true, swapPrimary: true, addDates: true, editHeader: true });
    expect(seriesDoors(none, s)).toEqual({ confirmAll: false, cancelAll: false, addTeacher: false, removeTeacher: false, swapPrimary: false, addDates: false, editHeader: false });
    expect(seriesDoors({ ...none, status: true }, s).cancelAll).toBe(false); // status alone never opens cancel-all
    expect(seriesDoors({ ...none, cancelAll: true }, s).cancelAll).toBe(true);
    expect(seriesDoors({ ...none, cancelAll: true }, s).confirmAll).toBe(false);
    expect(seriesDoors({ ...none, edit: true }, s)).toMatchObject({ addTeacher: true, removeTeacher: true, swapPrimary: true, editHeader: true, addDates: false });
    expect(seriesDoors({ ...none, series: true }, s)).toMatchObject({ addDates: true, editHeader: false });
    // nothing to act on ⇒ no door
    expect(seriesDoors(all, rows(["CONFIRMED", "ATTENDED"])).confirmAll).toBe(false);
    expect(seriesDoors(all, rows(["ATTENDED", "CANCELLED"])).cancelAll).toBe(false);
    expect(seriesDoors(all, null).cancelAll).toBe(false);
  });
  it("statusCounts: pending / live / attended / cancelled / total", () => {
    expect(statusCounts(rows(["PENDING", "PENDING", "CONFIRMED", "EXTENDED", "ATTENDED", "CANCELLED"]).rows)).toEqual({ pending: 2, live: 4, attended: 1, cancelled: 1, total: 6 });
    expect(statusCounts([])).toEqual({ pending: 0, live: 0, attended: 0, cancelled: 0, total: 0 });
  });
  it("the bodies: cancel-all carries the note only when typed; fromDate rides only when it differs from today; the link only with a key", () => {
    expect(cancelAllBody("ADMIN_ERROR", "  ")).toEqual({ reasonCode: "ADMIN_ERROR" });
    expect(cancelAllBody("PROGRAM_CHANGED", " moved venue ")).toEqual({ reasonCode: "PROGRAM_CHANGED", note: "moved venue" });
    expect(fromDateDefault(new Date(2026, 8, 21))).toBe("2026-09-21");
    expect(fromDateDefault(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(withFromDate({ teacherId: "t2" }, "2026-09-21", "2026-09-21")).toEqual({ teacherId: "t2" });
    expect(withFromDate({ teacherId: "t2" }, "2026-10-01", "2026-09-21")).toEqual({ teacherId: "t2", fromDate: "2026-10-01" });
    expect(withFromDate({ from: "t1", to: "t2" }, "", "2026-09-21")).toEqual({ from: "t1", to: "t2" });
  });
});

describe("§2 — the page, the wire, the links, the key", () => {
  it("the page asks its four grants at the site and the pure doors add the rows; a row opens the EXISTING modal by id; 409s are the server's sentence", () => {
    expect(page).toContain('seriesDoors({ status: can("action:calendar.status"), cancelAll: can("action:calendar.other-cancel-all"), edit: can("action:calendar.booking-edit"), series: can("action:calendar.other-series") }, series)');
    for (const d of ["confirmAll", "cancelAll", "addTeacher", "addDates", "editHeader", "swapPrimary", "removeTeacher"]) expect(page).toContain(`{doors.${d} && (`);
    expect(page).not.toMatch(/disabled=\{[^}]*(can\(|doors\.)/); // hidden, never disabled
    expect(page).toContain("const b = byId.get(r.bookingId);");
    // TASK-435 — a row hands the booking to the calendar's SINGLE BookingModal and closes this modal (no second instance)
    expect(page).toContain("onOpenBooking(b);");
    expect(page).not.toContain("<BookingModal");
    // 📌 the close must be THE row handler's own (an earlier `onClose();` elsewhere satisfied an indexOf pin)
    expect(page).toMatch(/if \(!b\) return;\s*onClose\(\);\s*onOpenBooking\(b\);/);
    expect(page).toContain('useAllBookings(series && first && last ? { type: "OTHER", teacherId: series.teacherId, from: first, to: last, limit: 200 } : { limit: 1 })');
    expect(dialogs.match(/setError\(errOf\(e\)\);/g)?.length).toBe(4); // every dialog shows the sentence and keeps the input
    expect(dialogs).not.toMatch(/SLOT_TAKEN|ALREADY_ON_ROW|PRIMARY_TEACHER|DATE_EXISTS/); // no code-switching: the sentence as given
  });
  it("the wire: the eight routes; cancel-all through `cancelAllBody`; teacher bodies through `withFromDate`; dates sorted; the header PATCH without startTime", () => {
    expect(svc).toContain("api.get<OtherSeries>(`/other-series/${encodeURIComponent(key)}`)");
    expect(svc).toContain('api.get<OtherSeriesListItem[]>("/other-series", { params: { from, to } })');
    expect(svc).toContain("`/other-series/${encodeURIComponent(key)}/confirm-all`, {}");
    expect(svc).toContain("`/other-series/${encodeURIComponent(key)}/cancel-all`, body");
    expect(svc).toContain("`/other-series/${encodeURIComponent(key)}/teachers`, body");
    expect(svc).toContain("api.delete<{ removed: number }>(`/other-series/${encodeURIComponent(key)}/teachers/${teacherId}`, { params: fromDate ? { fromDate } : {} })");
    expect(svc).toContain("api.patch<{ moved: number }>(`/other-series/${encodeURIComponent(key)}/teacher`, body)");
    expect(svc).toContain("`/other-series/${encodeURIComponent(key)}/dates`, { dates: [...dates].sort() }");
    expect(svc).toContain("api.patch<{ updated: number }>(`/other-series/${encodeURIComponent(key)}`, patch)");
    expect(svc).not.toContain("startTime"); // a time change is per-row moves
    expect(dialogs).toContain("body: cancelAllBody(reason, note)");
    expect(dialogs).toContain("body: withFromDate({ from: series.teacherId, to }, fromDate)"); // `from` is always the primary
    expect(dialogs).toContain("{END_COURSE_REASONS.map((r) => (");
    expect(dialogs).toContain("useState<string>(fromDateDefault())");
  });
  it("TASK-435 — ONE modal, two entry points: the OTHER block's button (only with a key AND a host) and a `Series in range` row; the page, `seriesHref`, the alias and the toast link are GONE", () => {
    // (1) the OTHER block's button: the key gates it (a legacy row shows nothing), it closes the booking modal and opens the series modal
    expect(modal).toContain("{booking.otherSeriesKey && onManagePlan && (");
    expect(modal).toContain("onManagePlan(booking.otherSeriesKey as string);");
    expect(modal).toMatch(/onClose\(\);\s*onManagePlan\(booking\.otherSeriesKey as string\);/); // closes the booking modal first — one instance
    expect(modal).toContain('{t("otherSeries.managePlan")}');
    expect(modal).not.toMatch(/component="a"[^\n]*manage-plan|seriesHref/);
    expect(codeOf("src/lib/api/mappers.ts")).toContain("otherSeriesKey: dto.otherSeriesKey ?? null,");
    // (2) a Series-in-range row is a BUTTON opening the same modal
    expect(strip).toContain("useOtherSeriesList(from, to, open)"); // fetched only while open
    expect(strip).toContain('<button key={s.key} type="button" onClick={() => onOpen(s.key)}');
    expect(strip).not.toMatch(/href=|seriesHref/);
    // the calendar owns the ONE instance and feeds both entry points
    expect(content).toContain("{!scoped && <SeriesInRange from={weekDays[0]} to={weekDays[6]} onOpen={setSeriesKey} />}");
    expect(content).toContain("{seriesKey && <OtherSeriesModal seriesKey={seriesKey} opened onClose={() => setSeriesKey(null)} onOpenBooking={openView} />}");
    expect(content).toContain("onManagePlan={setSeriesKey}");
    expect(content.match(/<BookingModal/g)?.length).toBe(1);
    // retired: the page, seriesHref, the alias, the toast link
    expect(existsSync("src/app/(admin)/scheduler/other")).toBe(false);
    expect(codeOf("src/lib/scheduler/other-series.ts")).not.toContain("seriesHref");
    expect(codeOf("src/components/layout/AdminLayout/AdminLayout.config.ts")).not.toContain("ROUTE_ALIASES");
    expect(navItemForPath("/scheduler/other/abc")).toBeUndefined(); // no page ⇒ nothing to guard
    expect(createDlg).not.toMatch(/seriesHref|link:/);
  });
  it("the 58th key sits after `group-series` (the BE's slot); copy counted both languages", () => {
    expect(ACTION_KEYS_SNAPSHOT.indexOf("action:calendar.other-cancel-all")).toBe(ACTION_KEYS_SNAPSHOT.indexOf("action:calendar.group-series") + 1);
    expect(ACTION_KEYS_SNAPSHOT.length).toBe(59); /* + TASK-432 coach-rate */
    const en = dictionaries.en.otherSeries as Record<string, string>;
    const th = dictionaries.th.otherSeries as Record<string, string>;
    expect(Object.keys(en).length).toBe(32);
    for (const k of Object.keys(en)) expect(th[k]?.length).toBeGreaterThan(0);
  });
});
