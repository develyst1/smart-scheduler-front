import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { cancelReasonDisplay } from "./cancelled-tray";
import PausedTray from "@/components/partials/Calendar/PausedTray";
import { dtoToBooking } from "@/lib/api/mappers";
import type { Booking } from "@/types/app/scheduler";
import type { BookingDTO } from "@/types/api/contract";

/**
 * TASK-369 (`REQ-089 §5` / `§5.1`) — the `Show cancelled` toggle and the CANCELLED tray beside the paused one.
 *
 * Three things are pinned: the REQUEST (ON ⇒ `includeCancelled=true` and a distinct query key; OFF ⇒ no param),
 * the TRAY (a second instance of `PausedTray`, rows rendered with the reason — code label, else note), and the
 * GRID (untouched: `BookingCellBody` and both grids carry nothing of this).
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const booking = (over: Partial<Booking>): Booking =>
  ({
    id: "c1",
    displayName: "น้องส้ม",
    studentName: null,
    nickname: null,
    title: null,
    teacherId: "t1",
    teachers: [{ id: "t1", name: "Teacher One", nickname: "Coach A", type: "FULLTIME" }],
    subject: "Surfskate",
    date: "2026-09-20",
    startTime: "10:00:00",
    endTime: "11:00:00",
    bookingType: "COURSE_PACKAGE",
    status: "CANCELLED",
    badges: [],
    ...over,
  }) as unknown as Booking;

const renderTray = (bookings: Booking[], layout: "rail" | "strip" = "rail") =>
  renderToString(
    h(
      MantineProvider,
      null,
      h(I18nProvider, null, h(PausedTray, { variant: "cancelled", bookings, loading: false, onSelect: () => {}, layout })),
    ),
  );

describe("§1 — the request: ON ⇒ `includeCancelled=true` + its own key; OFF ⇒ the param is ABSENT", () => {
  const svc = codeOf("src/services/scheduler.service.ts");
  const hooks = codeOf("src/hooks/scheduler/useScheduler.ts");
  const page = codeOf("src/components/partials/Calendar/CalendarContent.tsx");

  it("the service spreads the param conditionally — never `includeCancelled: false`", () => {
    const fn = svc.slice(svc.indexOf("export async function getCalendar"), svc.indexOf("export function parseCalendarTeachers"));
    expect(fn).toContain('params: { date, view, ...(includeCancelled ? { includeCancelled: "true" } : {}) }');
    expect(fn).not.toMatch(/includeCancelled:\s*includeCancelled|String\(includeCancelled\)|"false"/);
  });

  it("the hook's key carries the flag, so ON and OFF are two cached answers", () => {
    const hook = hooks.slice(hooks.indexOf("export const useCalendar"), hooks.indexOf("export const useBookingsByDate"));
    expect(hook).toContain('queryKey: [...CALENDAR_KEY, date, view, includeCancelled ? "with-cancelled" : "live"]');
    expect(hook).toContain("queryFn: () => getCalendar(date, view, includeCancelled)");
  });

  it("the page passes the remembered toggle into the hook and reads `cancelled ?? []`", () => {
    expect(page).toContain("useCalendar(date, calView, showCancelled)");
    expect(page).toContain("const cancelledBookings = (calendar?.cancelled ?? []).map(dtoToBooking);");
  });

  it("the toggle sits in the cell-display menu BESIDE the five fields, not among them (its own store, a divider)", () => {
    const menu = codeOf("src/components/partials/Calendar/CellDisplayMenu.tsx");
    expect(menu).toContain("useShowCancelled");
    expect(menu).toContain("<Menu.Divider />");
    expect(menu).toContain('label={t("calendar.showCancelled")}');
    const cell = codeOf("src/lib/scheduler/cell-display.ts");
    expect(cell).toContain('export const CELL_FIELDS = ["type", "program", "badge", "note", "rental"] as const;');
    expect(cell).not.toContain("cancelled");
    // remembered like its siblings: a localStorage-backed external store with its own key
    const store = codeOf("src/lib/scheduler/cancelled-tray.ts");
    expect(store).toContain('boolStore("ss.showCancelled", false)');
    expect(store).toContain("useSyncExternalStore");
  });
});

describe("§4 — the tray: a second instance of PausedTray; rows carry name · date · time · coach · reason", () => {
  it("a code ⇒ the EXISTING `endCourse.<code>` label; no code ⇒ the note; neither ⇒ nothing", () => {
    expect(cancelReasonDisplay("PROGRAM_CHANGED", "ignored")).toEqual({ key: "endCourse.PROGRAM_CHANGED" });
    expect(cancelReasonDisplay(null, "  ป่วย  ")).toEqual({ text: "ป่วย" });
    expect(cancelReasonDisplay("SOMETHING_NEW", "fallback")).toEqual({ text: "fallback" }); // unknown code ⇒ note
    expect(cancelReasonDisplay(null, null)).toBeNull();
    expect(cancelReasonDisplay(null, "   ")).toBeNull();
  });

  it("rendered: the code label, the note fallback, the coach, the formatted date/time — and the tray's own title", () => {
    const html = renderTray([
      booking({ id: "c1", cancelReason: "CUSTOMER_CANCELLED", note: "ignored" }),
      booking({ id: "c2", displayName: "น้องมิลล่า", cancelReason: null, note: "ครูป่วย" }),
    ]);
    expect(html).toContain(dictionaries.en.endCourse.CUSTOMER_CANCELLED);
    expect(html).not.toContain("ignored");
    expect(html).toContain("ครูป่วย");
    expect(html).toContain("Coach A");
    expect(html).toContain("10:00"); // formatted through `formatTimeDisplay`, never `10:00:00`
    expect(html).not.toContain("10:00:00");
    expect(html).toContain(dictionaries.en.calendar.cancelledTray);
    expect(html).not.toContain(dictionaries.en.calendar.pausedTray);
    expect(html).not.toContain("Was:"); // the paused row's "original slot" line is not the cancelled row's
  });

  it("empty ⇒ the sentence, never a vanished tray; the strip layout renders too", () => {
    expect(renderTray([])).toContain(dictionaries.en.calendar.cancelledTrayEmpty);
    expect(renderTray([booking({ cancelReason: "ADMIN_ERROR" })], "strip")).toContain(dictionaries.en.endCourse.ADMIN_ERROR);
  });

  it("the page mounts it in BOTH layouts only while the toggle is ON, beside the paused tray; the rail width counts both", () => {
    const page = codeOf("src/components/partials/Calendar/CalendarContent.tsx");
    expect((page.match(/variant="cancelled"/g) ?? []).length).toBe(2);
    expect((page.match(/showCancelled && \(/g) ?? []).length).toBe(2);
    expect(page).toContain('trayCollapsed && (!showCancelled || cancelledTrayCollapsed) ? "w-10" : "w-[17rem]"');
    // the paused tray is still unconditional
    expect(page).not.toMatch(/pausedBookings\.length\s*>\s*0\s*&&\s*<PausedTray/);
  });

  it("the mapper carries `cancelReason` as sent (null when absent)", () => {
    const dto = {
      id: "b1", date: "2026-09-20", startTime: "10:00", endTime: "11:00", bookingType: "COURSE_PACKAGE", status: "CANCELLED",
      note: "n", student: null, teacher: { id: "t1", name: "T", nickname: "T", type: "FULLTIME" }, subject: null, title: null,
      displayName: "x", teachers: [{ id: "t1", name: "T", nickname: "T", type: "FULLTIME" }], course: null, discount: null,
      attendeeNote: null, pendingSlot: false, incomingBookingId: null, rescheduleTo: null,
    } as unknown as BookingDTO;
    expect(dtoToBooking(dto).cancelReason).toBeNull();
    expect(dtoToBooking({ ...dto, cancelReason: "ADMIN_ERROR" }).cancelReason).toBe("ADMIN_ERROR");
  });

  it("copy: six keys × 2, the row template carries all three slots", () => {
    for (const d of [dictionaries.en, dictionaries.th]) {
      for (const k of ["showCancelled", "cancelledTray", "cancelledTrayEmpty", "cancelledTrayCollapse", "cancelledTrayExpand", "cancelledRow"] as const) {
        expect(d.calendar[k].length).toBeGreaterThan(3);
      }
      expect(d.calendar.cancelledRow).toBe("{date} {time} · {coach}");
    }
    expect(dictionaries.th.calendar.showCancelled).toBe("แสดงคาบที่ยกเลิก");
  });
});

describe("🚫 the grid is untouched — no struck cell, no client filtering by reason", () => {
  it("BookingCellBody and both grids know nothing of cancelled/cancelReason; no reason filter anywhere on the page", () => {
    for (const f of [
      "src/components/common/BookingCellBody.tsx",
      "src/components/partials/Calendar/CalendarGrid.tsx",
      "src/components/partials/Calendar/CalendarWeekGrid.tsx",
    ]) {
      expect(codeOf(f)).not.toMatch(/cancelReason|line-through|CANCELLED|showCancelled/);
    }
    const page = codeOf("src/components/partials/Calendar/CalendarContent.tsx");
    expect(page).not.toMatch(/cancelledBookings\.filter|cancelReason ===/);
    const tray = codeOf("src/components/partials/Calendar/PausedTray.tsx");
    expect(tray).not.toMatch(/\.filter\(|line-through/);
  });
});
