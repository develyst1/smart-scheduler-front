import { describe, expect, it, mock, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { cleanup, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import type { Booking, TeacherView } from "@/types/app/scheduler";

/**
 * 🔴 **TASK-722 (REQ-115, Team B's half) — the make-up mark on the GRID reads the MARKER (`isMakeup`), not the status.**
 *
 * A make-up is born CONFIRMED now (TASK-702). Before this, the cell was coloured by status alone and EXTENDED was the purple, so
 * **status and "make-up" were one fact**; once the server splits them, a confirmed make-up's cell turns the CONFIRMED colour and the
 * make-up VANISHES from the grid. 🔑 Each case is asserted on what the cell SHOWS: its real status fill (a make-up is confirmed, that
 * is the point of N1) AND the purple badge, counted — present exactly once for a make-up, absent for an ordinary class.
 *
 * Declared: the badge is TASK-703's `MakeupChip` (the one way to draw it, the approved `bookingStatus.EXTENDED` label), on its own
 * line inside the cell so it never squeezes the name.
 */

const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => true }));

const CalendarGrid = (await import("./CalendarGrid")).default;
const CalendarWeekGrid = (await import("./CalendarWeekGrid")).default;

const LABELS = [dictionaries.en.bookingStatus.EXTENDED, dictionaries.th.bookingStatus.EXTENDED];
const DAY = "2026-10-06";
const WEEK = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];
const TEACHERS: TeacherView[] = [
  { id: "t1", name: "ครูเอ", nickname: "เอ", type: "FULL_TIME", subjects: [], active: true, monthlyHours: 0, monthlyIncome: 0, overLimit: false, bookable: true },
];

const mk = (id: string, name: string, time: string, status: Booking["status"], isMakeup: boolean | undefined): Booking => ({
  id,
  displayName: name,
  studentName: name,
  teacherId: "t1",
  teachers: [{ id: "t1", name: "ครูเอ", nickname: "เอ", type: "FULL_TIME" }],
  subject: null,
  date: DAY,
  startTime: time,
  endTime: `${Number(time.slice(0, 2)) + 1}:00`,
  bookingType: "COURSE_PACKAGE",
  status,
  isMakeup,
});
// the five cases that matter, one per name
const CONFIRMED_MAKEUP = mk("b1", "ก-ยืนยันเสริม", "09:00", "CONFIRMED", true);
const ORDINARY = mk("b2", "ข-ปกติ", "10:00", "CONFIRMED", false);
const UNMARKED = mk("b3", "ค-ไม่มีฟิลด์", "11:00", "CONFIRMED", undefined);
const LEGACY_EXTENDED = mk("b4", "ง-เก่า", "12:00", "EXTENDED", true);
const EXTENDED_NOT_MARKED = mk("b5", "จ-ม่วงไม่มีป้าย", "13:00", "EXTENDED", false);
const ALL = [CONFIRMED_MAKEUP, ORDINARY, UNMARKED, LEGACY_EXTENDED, EXTENDED_NOT_MARKED];

const wrap = (el: ReturnType<typeof h>) => render(h(MantineProvider, null, h(I18nProvider, null, el)));
const cellOf = (name: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(name)) as HTMLElement;
const badgesIn = (el: Element) => el.querySelectorAll("[data-makeup-badge]");
const labelCount = (el: Element) => LABELS.reduce((n, l) => n + ((el.textContent ?? "").split(l).length - 1), 0);

afterEach(cleanup);

const mountDay = (onSelect: (b: Booking) => void = () => {}) =>
  wrap(h(CalendarGrid, { teachers: TEACHERS, bookings: ALL, onSelectBooking: onSelect, onCreate: () => {}, date: DAY }));
const mountWeek = (onSelect: (b: Booking) => void = () => {}) =>
  wrap(h(CalendarWeekGrid, { teachers: TEACHERS, weekDays: WEEK, bookings: ALL, onSelectBooking: onSelect, onCreate: () => {} }));

for (const [view, mount] of [
  ["DAY grid", mountDay],
  ["WEEK grid", mountWeek],
] as const) {
  describe(`🔴 TASK-722 — ${view}`, () => {
    it("🔑 a CONFIRMED make-up keeps its CONFIRMED colour AND shows the badge, once", () => {
      mount();
      const cell = cellOf("ก-ยืนยันเสริม");
      expect(cell.className).toContain("bg-cal-conf/");
      expect(cell.className).not.toContain("bg-cal-ext/");
      expect(badgesIn(cell).length).toBe(1);
      expect(labelCount(cell)).toBe(1);
    });

    it("an ordinary CONFIRMED class (marker false, or no marker at all) shows NO badge", () => {
      mount();
      for (const name of ["ข-ปกติ", "ค-ไม่มีฟิลด์"]) {
        const cell = cellOf(name);
        expect(cell.className).toContain("bg-cal-conf/");
        expect(badgesIn(cell).length).toBe(0);
        expect(labelCount(cell)).toBe(0);
      }
    });

    it("🔑 a LEGACY EXTENDED make-up keeps its purple fill and carries the badge EXACTLY ONCE (never twice)", () => {
      mount();
      const cell = cellOf("ง-เก่า");
      expect(cell.className).toContain("bg-cal-ext/");
      expect(badgesIn(cell).length).toBe(1);
      expect(labelCount(cell)).toBe(1);
    });

    it("🔑 the mark reads the MARKER, never the status: a purple (EXTENDED) cell whose marker is false has no badge", () => {
      mount();
      const cell = cellOf("จ-ม่วงไม่มีป้าย");
      expect(cell.className).toContain("bg-cal-ext/");
      expect(badgesIn(cell).length).toBe(0);
    });

    it("the badge adds a line, it does not turn the cell into something else: a marked class still OPENS on click", async () => {
      const opened: string[] = [];
      mount((b) => opened.push(b.id));
      await userEvent.setup().click(cellOf("ก-ยืนยันเสริม"));
      expect(opened).toEqual(["b1"]);
    });
  });
}
