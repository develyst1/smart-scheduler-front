import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { groupSeriesDoors, kindLabelKey, pendingSeats, seatCascade, seriesDoors, seriesPath, swapBody } from "./other-series";

/**
 * REQ-104 §2 items 1–3 / TASK-441/442 — the ONE series modal's GROUP face: the ref picks the wire (`/group-series`), the
 * group doors (confirm-whole-group = course-confirm + a PENDING row OR seat; cancel-all = key 58 + a live row), the seats
 * per row, the cascade line COUNTED from the DTO (the families number is the server's), the swap body `{ to }`, the
 * header PATCH without a kind, the two entry points (a GROUP row's block · `Series in range`). 🚫 No client cascade logic.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const page = codeOf("src/components/partials/OtherSeries/OtherSeriesModal.tsx");
const dialogs = codeOf("src/components/partials/OtherSeries/OtherSeriesDialogs.tsx");
const modal = codeOf("src/components/partials/Calendar/Modal/BookingModal.tsx");
const strip = codeOf("src/components/partials/Calendar/SeriesInRange.tsx");
const svc = codeOf("src/services/other-series.service.ts");
const lib = codeOf("src/lib/scheduler/other-series.ts");

type Seat = { studentId: string | null; status: string };
const row = (status: string, seats: Seat[] = [], i = 0) => ({ bookingId: `g${i}`, date: `2026-10-0${i + 1}`, status, teacherId: "t1", additionalTeacherIds: [], seats });
const all = { status: true, cancelAll: true, edit: true, series: true };
const none = { status: false, cancelAll: false, edit: false, series: false };

describe("§1 — the pure group rules, by value", () => {
  it("seriesPath / kindLabelKey / swapBody: the ref's kind picks the prefix, the chip family and the swap shape (GROUP: `{ to }`, no `from`)", () => {
    expect(seriesPath({ kind: "other", key: "os 1" })).toBe("/other-series/os%201");
    expect(seriesPath({ kind: "group", key: "gs-1" }, "/cancel-all")).toBe("/group-series/gs-1/cancel-all");
    expect(kindLabelKey({ kind: "other" }, "ECA")).toBe("booking.otherKind_ECA");
    expect(kindLabelKey({ kind: "group" }, "DUO")).toBe("booking.groupKind_DUO");
    expect(kindLabelKey({ kind: "group" }, null)).toBeNull();
    expect(swapBody({ kind: "other" }, "t1", "t2")).toEqual({ from: "t1", to: "t2" });
    expect(swapBody({ kind: "group" }, "t1", "t2")).toEqual({ to: "t2" });
  });
  it("seatCascade counts the LIVE seats on the LIVE rows and their distinct students — never a family; pendingSeats counts the PENDING seats on the live rows", () => {
    const rows = [
      row("PENDING", [{ studentId: "a", status: "PENDING" }, { studentId: "b", status: "CANCELLED" }], 0),
      row("CONFIRMED", [{ studentId: "a", status: "CONFIRMED" }, { studentId: "c", status: "PENDING" }], 1),
      row("ATTENDED", [{ studentId: "d", status: "ATTENDED" }, { studentId: "e", status: "PENDING" }], 2), // an attended row: its seats stay
      row("CANCELLED", [{ studentId: "f", status: "PENDING" }], 3), // a cancelled row: nothing more to cancel
    ];
    expect(seatCascade(rows)).toEqual({ seats: 3, students: 2 });
    expect(seatCascade([row("PENDING", [], 0)])).toEqual({ seats: 0, students: 0 });
    expect(seatCascade([{ status: "PENDING" }])).toEqual({ seats: 0, students: 0 }); // an OTHER row has no seats
    expect(pendingSeats(rows)).toBe(2); // the server confirms the live seats on the LIVE rows — an attended/cancelled row's seats are not offered
    expect(lib).not.toMatch(/famil/i); // no families number computed in the lib
  });
  it("groupSeriesDoors: confirm-all needs course-confirm AND (a PENDING row OR a PENDING seat); cancel-all = key 58 + a live row; the rest as OTHER", () => {
    const confirmedRowsPendingSeat = { rows: [row("CONFIRMED", [{ studentId: "a", status: "PENDING" }], 0)] };
    expect(groupSeriesDoors(all, confirmedRowsPendingSeat).confirmAll).toBe(true);
    expect(seriesDoors(all, confirmedRowsPendingSeat).confirmAll).toBe(false); // the OTHER rule would not offer it
    expect(groupSeriesDoors({ ...none, status: true }, confirmedRowsPendingSeat).confirmAll).toBe(true);
    expect(groupSeriesDoors({ ...none, cancelAll: true }, confirmedRowsPendingSeat)).toMatchObject({ confirmAll: false, cancelAll: true });
    expect(groupSeriesDoors(all, { rows: [row("CONFIRMED", [{ studentId: "a", status: "CONFIRMED" }], 0)] }).confirmAll).toBe(false);
    expect(groupSeriesDoors(all, { rows: [row("ATTENDED", [{ studentId: "a", status: "PENDING" }], 0)] }).cancelAll).toBe(false);
    expect(groupSeriesDoors(all, null)).toEqual({ confirmAll: false, cancelAll: false, addTeacher: true, removeTeacher: true, swapPrimary: true, addDates: true, editHeader: true });
  });
});

describe("§2 — the ONE modal's two faces, the wire, the entry points", () => {
  it("the modal takes a `SeriesRef`; the GROUP face asks course-confirm + group-series, shows the kind chip via `kindLabelKey`, the seats per row (a cancelled seat greyed), `Confirm whole group` with rows + seats, the cascade to the dialog", () => {
    expect(page).toContain("export default function OtherSeriesModal({ series: ref, opened, onClose, onOpenBooking }: { series: SeriesRef;");
    expect(page).toContain('? groupSeriesDoors({ status: can("action:bookings.course-confirm"), cancelAll: can("action:calendar.other-cancel-all"), edit: can("action:calendar.booking-edit"), series: can("action:calendar.group-series") }, series)');
    expect(page).toContain("const cascade = isGroup ? seatCascade(series?.rows ?? []) : undefined;");
    expect(page).toContain("const kindKey = kindLabelKey(ref, series?.kind ?? null);");
    expect(page).toContain('{isGroup ? t("otherSeries.confirmGroup", { n: counts.pending + pendingSeats(series.rows) }) : t("otherSeries.confirmAll", { n: counts.pending })}');
    expect(page).toContain('t("otherSeries.confirmedGroup", { confirmed: r.confirmed, courses: r.courses ?? 0, skipped: r.skipped })');
    expect(page).toContain('className={`inline-flex items-center gap-1 ${s.status === "CANCELLED" ? "opacity-50" : ""}`} data-seat={s.bookingId}');
    expect(page).toContain("<CancelAllDialog series={ref} attended={counts.attended} live={counts.live} cascade={cascade}");
    expect(page).not.toMatch(/disabled=\{[^}]*(can\(|doors\.)/); // hidden, never disabled — both faces
  });
  it("the cancel-all dialog: the GROUP line from the DTO count; the toast prints the SERVER's `seatsCancelled` / `householdsTold` (TASK-445: distinct families; `familiesTold` gone); the header PATCH never carries a kind on a group; the swap body via `swapBody`", () => {
    expect(dialogs).toContain('ref.kind === "group" && cascade ? t("otherSeries.cancelAllGroupBody", { live, kept: attended, seats: cascade.seats, students: cascade.students })');
    expect(dialogs).toContain('t("otherSeries.cancelledGroup", { n: r.cancelled, seats: r.seatsCancelled ?? 0, families: r.householdsTold ?? 0, notices: r.familyNotices ?? 0 })');
    expect(dialogs).not.toMatch(/families:\s*(cascade|new Set|\w+\.length)/); // never a client families number
    expect(dialogs).toContain('const isGroup = seriesRef.kind === "group";');
    expect(dialogs).toContain("...(!isGroup && draft.kind && draft.kind !== series.kind ? { otherKind: draft.kind } : {}),");
    expect(dialogs).toContain("kindRequired={!isGroup} hideKind={isGroup}");
    expect(dialogs).toContain("withFromDate(swapBody(seriesRef, series.teacherId, to), fromDate)");
    expect(svc).toContain("swapOtherSeriesTeacher = async (ref: SeriesRef, body: { from?: string; to: string; fromDate?: string })");
    expect(svc).toContain("seatsCancelled?: number;");
  });
  it("entry points: a GROUP row's block offers `Manage plan` (key AND host; closes first) with `{ kind: 'group' }`; `Series in range` lists groups with the group chip and opens the same modal by ref", () => {
    expect(modal).toContain("{booking.group.key && onManagePlan && (");
    expect(modal).toMatch(/onClose\(\);\s*onManagePlan\(\{ kind: "group", key: booking\.group\?\.key as string \}\);/);
    expect(modal).toContain("onManagePlan?: (series: SeriesRef) => void;");
    expect(strip).toContain('useOtherSeriesList("group", from, to, open)');
    expect(strip).toContain('...groups.map((item) => ({ ref: { kind: "group" as const, key: item.key }, item })),');
    expect(strip).toContain("const kindKey = kindLabelKey(ref, s.kind);");
    expect(strip).toContain("onClick={() => onOpen(ref)}");
    expect(strip).not.toMatch(/href=/);
  });
  it("copy: the four group keys in both languages, with their placeholders", () => {
    for (const lang of ["en", "th"] as const) {
      const o = dictionaries[lang].otherSeries as Record<string, string>;
      expect(o.confirmGroup).toContain("{n}");
      for (const k of ["{confirmed}", "{courses}", "{skipped}"]) expect(o.confirmedGroup).toContain(k);
      for (const k of ["{live}", "{kept}", "{seats}", "{students}"]) expect(o.cancelAllGroupBody).toContain(k);
      for (const k of ["{n}", "{seats}", "{families}", "{notices}"]) expect(o.cancelledGroup).toContain(k);
    }
    expect(dictionaries.en.otherSeries.inRangeEmpty).toBe("No series this week."); // groups are listed now
  });
});
