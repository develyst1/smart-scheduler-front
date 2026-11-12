import { describe, expect, it, mock, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { cleanup, render } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import type { Booking, TeacherView } from "@/types/app/scheduler";
import { leaveBlocksSlot, leaveDayIndex } from "@/lib/scheduler/teacher-scope";

/**
 * 🔴 **TASK-966 (SPEC-108 §3.1 / §4a, REQ-5015 AC2) — a PART-DAY leave greys only the hours it overlaps on the calendar's cells; a whole-day leave greys the day as it always did.**
 *
 * 🔑 What can go wrong without anyone seeing it: a morning-only leave that greys the whole day (so the afternoon looks closed and nobody books it), one that greys no hour at all, a leave that
 * ends on the hour wrongly blocking the next hour's class, or a class outside the window marked as "away". The overlap rule is the server's: a class at `HH:MM` occupies `[HH:MM, HH:MM + 1 h)`.
 */

const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => true }));
const CalendarGrid = (await import("./CalendarGrid")).default;
const CalendarWeekGrid = (await import("./CalendarWeekGrid")).default;

const teacher = (id: string, nickname: string): TeacherView => ({ id, name: `ครู${nickname}`, nickname, type: "FULL_TIME", subjects: [], active: true, monthlyHours: 0, monthlyIncome: 0, overLimit: false, bookable: true });
const TEACHERS = [teacher("t1", "เอ"), teacher("t2", "บี")];
const DAY = "2026-10-06";
const WEEK = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];
const cls = (id: string, name: string, start: string, end: string): Booking => ({
  id,
  displayName: name,
  studentName: name,
  teacherId: "t1",
  teachers: [{ id: "t1", name: "ครูเอ", nickname: "เอ", type: "FULL_TIME" }],
  subject: null,
  date: DAY,
  startTime: start,
  endTime: end,
  bookingType: "COURSE_PACKAGE",
  status: "CONFIRMED",
});
const MORNING = cls("bk-10", "น้องสิบโมง", "10:00", "11:00"); // inside 09:00–12:00
const NOON = cls("bk-12", "น้องเที่ยง", "12:00", "13:00"); // starts exactly when the window ends: NOT blocked
const part = leaveDayIndex([{ teacherId: "t1", teacherName: "เอ", date: DAY, bookings: [{ id: "bk-10" }], startTime: "09:00:00", endTime: "12:00:00" }]);
const whole = leaveDayIndex([{ teacherId: "t1", teacherName: "เอ", date: DAY, bookings: [{ id: "bk-10" }] }]);

const wrap = (el: ReturnType<typeof h>) => render(h(MantineProvider, null, h(I18nProvider, null, el)));
const isGrey = (cell: Element) => cell.className.includes("bg-muted-50/80");
const cells = () => [...document.querySelectorAll(".min-h-20")];
const mineGrey = () => cells().filter((_, i) => i % 2 === 0).map((c) => isGrey(c));
const addCount = (cell: Element) => cell.querySelectorAll('button[aria-label]:not([data-leave-mark])').length;
const mount = (leaveDays: ReturnType<typeof leaveDayIndex>, bookings: Booking[] = []) =>
  wrap(h(CalendarGrid, { teachers: TEACHERS, bookings, onSelectBooking: () => {}, onCreate: () => {}, date: DAY, leaveDays }));

afterEach(cleanup);

describe("🔴 TASK-966 — the overlap rule (pure)", () => {
  it("🔑 no leave = not blocked; a whole-day leave blocks every slot; a window blocks the slots whose hour overlaps it", () => {
    expect(leaveBlocksSlot(undefined, "10:00")).toBe(false);
    expect(leaveBlocksSlot({}, "10:00")).toBe(true);
    expect(leaveBlocksSlot({ startTime: null, endTime: null }, "23:00")).toBe(true);
    const w = { startTime: "09:00:00", endTime: "12:00:00" };
    expect(["08:00", "09:00", "10:00", "11:00", "12:00", "13:00"].map((s) => leaveBlocksSlot(w, s))).toEqual([false, true, true, true, false, false]);
  });

  it("🔑 a half-hour window blocks BOTH hours it touches (12:30–13:30 → the 12:00 and the 13:00 classes)", () => {
    const w = { startTime: "12:30", endTime: "13:30" };
    expect(["11:00", "12:00", "13:00", "14:00"].map((s) => leaveBlocksSlot(w, s))).toEqual([false, true, true, false]);
  });

  it("🔑 `leaveDayIndex` carries the window (null for a whole-day row)", () => {
    expect(part.get(`t1|${DAY}`)).toMatchObject({ startTime: "09:00:00", endTime: "12:00:00" });
    expect(whole.get(`t1|${DAY}`)).toMatchObject({ startTime: null, endTime: null });
  });
});

describe("🔴 TASK-966 — DAY view", () => {
  it("🔑 a part-day leave greys ONLY the overlapped hours of the coach's column (09:00–12:00 → three rows), the rest keep their `+`; the other coach is untouched", () => {
    mount(part);
    const mine = cells().filter((_, i) => i % 2 === 0);
    const grey = mineGrey();
    expect(grey.filter(Boolean).length).toBe(3);
    expect(grey.some((g) => !g)).toBe(true); // the day is NOT wholly grey
    // greyed rows have no `+`, the free ones do
    expect(mine.filter((c) => isGrey(c)).every((c) => addCount(c) === 0)).toBe(true);
    expect(mine.filter((c) => !isGrey(c)).every((c) => addCount(c) === 1)).toBe(true);
    expect(cells().filter((_, i) => i % 2 === 1).some((c) => isGrey(c) || c.getAttribute("data-leave-day"))).toBe(false);
  });

  it("🔑 a WHOLE-day leave still greys every row (unchanged)", () => {
    mount(whole);
    expect(mineGrey().every(Boolean)).toBe(true);
  });

  it("🔑 only the class INSIDE the window carries the «away» mark; the one that starts when the window ends does not", () => {
    mount(part, [MORNING, NOON]);
    const btn = (name: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(name)) as HTMLElement;
    // booleans, never a node in a matcher (TASK-596: a failed matcher would print the whole DOM)
    const marks = (name: string) => btn(name).querySelectorAll("[data-leave-mark]").length;
    expect(marks("น้องสิบโมง")).toBe(1);
    expect(marks("น้องเที่ยง")).toBe(0);
  });
});

describe("🔴 TASK-966 — WEEK view", () => {
  const mountWeek = (leaveDays: ReturnType<typeof leaveDayIndex>) =>
    wrap(h(CalendarWeekGrid, { teachers: TEACHERS, weekDays: WEEK, bookings: [MORNING, NOON], onSelectBooking: () => {}, onCreate: () => {}, leaveDays }));
  const cell = (teacherIdx: number, dayIdx: number) => document.querySelectorAll(".min-h-24")[teacherIdx * 7 + dayIdx];

  it("🔑 a part-day leave does NOT grey the whole day cell (it holds every hour): the `+` stays, the cell says `part`, and only the overlapped class is marked", () => {
    mountWeek(part);
    const c = cell(0, 1);
    expect(c.getAttribute("data-leave-day")).toBe("part");
    expect(isGrey(c)).toBe(false);
    expect(c.querySelectorAll('button[aria-label]:not([data-leave-mark])').length).toBe(1);
    const marked = [...c.querySelectorAll("button")].filter((b) => b.querySelector("[data-leave-mark]")).map((b) => b.textContent);
    expect(marked.length).toBe(1);
    expect(marked[0]).toContain("น้องสิบโมง");
  });

  it("🔑 a WHOLE-day leave greys the cell with no `+`, as before", () => {
    mountWeek(whole);
    const c = cell(0, 1);
    expect(c.getAttribute("data-leave-day")).toBe("yes");
    expect(isGrey(c)).toBe(true);
    expect(c.querySelectorAll('button[aria-label]:not([data-leave-mark])').length).toBe(0);
  });
});
