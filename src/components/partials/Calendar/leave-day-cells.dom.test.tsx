import { describe, expect, it, mock, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { cleanup, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import type { Booking, TeacherView } from "@/types/app/scheduler";
import { leaveDayIndex } from "@/lib/scheduler/teacher-scope";

/**
 * 🔴 **TASK-622 (REQ-111 D) — a coach's blocked day shows ON the grid cells, in both views.**
 *
 * The strip above the grid shipped first and the customer still read the day as free: the cells under it still offered `+`,
 * and the server's `TEACHER_ON_LEAVE` refusal was the first she heard of it. 🔑 **Clicked, not only rendered** — the class on
 * that day must still OPEN (a future leave cancels nothing), and only pressing it can show that.
 */

const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => true }));

const CalendarGrid = (await import("./CalendarGrid")).default;
const CalendarWeekGrid = (await import("./CalendarWeekGrid")).default;

const teacher = (id: string, nickname: string): TeacherView => ({
  id,
  name: `ครู${nickname}`,
  nickname,
  type: "FULL_TIME",
  subjects: [],
  active: true,
  monthlyHours: 0,
  monthlyIncome: 0,
  overLimit: false,
  bookable: true,
});
const TEACHERS = [teacher("t1", "เอ"), teacher("t2", "บี")];
const LEAVE = "2026-10-06";
const WEEK = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];

const CLASS_ON_LEAVE: Booking = {
  id: "bk-on-leave",
  displayName: "น้องบีม",
  studentName: "น้องบีม",
  teacherId: "t1",
  teachers: [{ id: "t1", name: "ครูเอ", nickname: "เอ", type: "FULL_TIME" }],
  subject: null,
  date: LEAVE,
  startTime: "10:00",
  endTime: "11:00",
  bookingType: "COURSE_PACKAGE",
  status: "CONFIRMED",
};
const leaveDays = leaveDayIndex([{ teacherId: "t1", teacherName: "เอ", date: LEAVE, bookings: [{ id: "bk-on-leave" }] }]);

const wrap = (el: ReturnType<typeof h>) => render(h(MantineProvider, null, h(I18nProvider, null, el)));
const addButtons = (cell: Element) => cell.querySelectorAll('button[aria-label]:not([data-leave-mark])');
const isGrey = (cell: Element) => cell.className.includes("bg-muted-50/80");

afterEach(cleanup);

describe("🔴 TASK-622 — WEEK view", () => {
  const mount = (onSelectBooking: (b: Booking) => void) =>
    wrap(
      h(CalendarWeekGrid, {
        teachers: TEACHERS,
        weekDays: WEEK,
        bookings: [CLASS_ON_LEAVE],
        onSelectBooking,
        onCreate: () => {},
        leaveDays,
      }),
    );
  // the cells in DOM order: teacher rows × the seven days
  const cell = (teacherIdx: number, dayIdx: number) => document.querySelectorAll(".min-h-24")[teacherIdx * 7 + dayIdx];

  it("the coach's blocked day is grey and offers no `+`; the same coach's next day and another coach's same day are untouched", () => {
    mount(() => {});
    const onLeave = cell(0, 1);
    expect(onLeave.getAttribute("data-leave-day")).toBe("yes");
    expect(isGrey(onLeave)).toBe(true);
    expect(addButtons(onLeave).length).toBe(0);

    for (const other of [cell(0, 2), cell(1, 1)]) {
      expect(other.getAttribute("data-leave-day")).toBeNull();
      expect(isGrey(other)).toBe(false);
      expect(addButtons(other).length).toBe(1);
    }
  });

  it("🔑 the class already on that day is drawn, MARKED, and still OPENS when clicked", async () => {
    const opened: string[] = [];
    mount((b) => opened.push(b.id));
    const onLeave = cell(0, 1);
    expect(onLeave.querySelector("[data-leave-mark]")).toBeTruthy();
    const btn = [...onLeave.querySelectorAll("button")].find((b) => b.textContent?.includes("น้องบีม")) as HTMLElement;
    await userEvent.setup().click(btn);
    expect(opened).toEqual(["bk-on-leave"]);
  });
});

describe("🔴 TASK-622 — DAY view keeps the coach's column, greyed", () => {
  const mount = (onSelectBooking: (b: Booking) => void) =>
    wrap(
      h(CalendarGrid, {
        teachers: TEACHERS,
        bookings: [CLASS_ON_LEAVE],
        onSelectBooking,
        onCreate: () => {},
        date: LEAVE,
        leaveDays,
      }),
    );
  // the cells in DOM order: time rows × the two coaches ⇒ even = เอ (on leave), odd = บี
  const cells = () => [...document.querySelectorAll(".min-h-20")];

  it("every cell of the coach's column is grey with no `+` — the column is KEPT, not dropped; the other coach is untouched", () => {
    mount(() => {});
    const all = cells();
    const mine = all.filter((_, i) => i % 2 === 0);
    const theirs = all.filter((_, i) => i % 2 === 1);
    expect(mine.length).toBeGreaterThan(1);
    expect(mine.every((c) => c.getAttribute("data-leave-day") === "yes" && isGrey(c))).toBe(true);
    expect(mine.reduce((n, c) => n + addButtons(c).length, 0)).toBe(0);
    expect(theirs.some((c) => c.getAttribute("data-leave-day") || isGrey(c))).toBe(false);
    expect(theirs.every((c) => addButtons(c).length === 1)).toBe(true);
  });

  it("🔑 the class already on that day is drawn, MARKED, and still OPENS when clicked", async () => {
    const opened: string[] = [];
    mount((b) => opened.push(b.id));
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("น้องบีม")) as HTMLElement;
    expect(btn.querySelector("[data-leave-mark]")).toBeTruthy();
    await userEvent.setup().click(btn);
    expect(opened).toEqual(["bk-on-leave"]);
  });

  it("a day that is NOT a blocked day draws the coach's column as before", () => {
    wrap(h(CalendarGrid, { teachers: TEACHERS, bookings: [], onSelectBooking: () => {}, onCreate: () => {}, date: "2026-10-07", leaveDays }));
    expect(cells().some((c) => c.getAttribute("data-leave-day") || isGrey(c))).toBe(false);
    expect(cells().every((c) => addButtons(c).length === 1)).toBe(true);
  });
});
