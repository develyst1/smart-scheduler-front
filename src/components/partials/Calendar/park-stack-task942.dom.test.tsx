import { describe, expect, it, mock, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { cleanup, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import type { Booking, TeacherView } from "@/types/app/scheduler";

/**
 * 🔴 **TASK-942 — several park groups in ONE hour on the "No Teacher" (system) column.**
 *
 * The server now lets the system teacher hold N blocks in one hour (`slot_exempt`); a real coach still holds ONE. The day grid used to
 * draw the first match only, so the 2nd and 3rd park block would exist on the server and be invisible on the screen.
 * 🔑 Each case asserts what the cell SHOWS: N cards in one hour cell, the "+" still there, a real coach unchanged, other hours untouched.
 * No new wording: the "+" is the existing `calendar.addBooking` label.
 */

const realMe = await import("@/hooks/scheduler/useMe");
let canBook = true;
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => canBook }));

const CalendarGrid = (await import("./CalendarGrid")).default;

const DAY = "2026-11-14";
const COACH: TeacherView = { id: "t1", name: "ครูเอ", nickname: "เอ", type: "FULL_TIME", subjects: [], active: true, monthlyHours: 0, monthlyIncome: 0, overLimit: false, bookable: true };
const SYSTEM: TeacherView = { id: "sys", name: "No Teacher", nickname: "No Teacher", type: "FREELANCE", subjects: [], active: true, monthlyHours: 0, monthlyIncome: 0, overLimit: false, bookable: true, isSystem: true } as TeacherView;

const mk = (id: string, name: string, teacher: TeacherView, time: string): Booking => ({
  id,
  displayName: name,
  studentName: name,
  teacherId: teacher.id,
  teachers: [{ id: teacher.id, name: teacher.name, nickname: teacher.nickname, type: teacher.type }],
  subject: null,
  date: DAY,
  startTime: time,
  endTime: `${Number(time.slice(0, 2)) + 1}:00`,
  bookingType: "OTHER",
  status: "CONFIRMED",
});

const PARK_A = mk("p1", "บ้านเอ", SYSTEM, "10:00");
const PARK_B = mk("p2", "บ้านบี", SYSTEM, "10:00");
const PARK_C = mk("p3", "บ้านซี", SYSTEM, "10:00");
const PARK_LATER = mk("p4", "บ้านดี", SYSTEM, "11:00");
const COACH_1 = mk("c1", "นักเรียน-หนึ่ง", COACH, "10:00");
const COACH_2 = mk("c2", "นักเรียน-สอง", COACH, "10:00"); // an impossible pair on the server — pins that a real coach is still ONE card

const wrap = (el: ReturnType<typeof h>) => render(h(MantineProvider, null, h(I18nProvider, null, el)));
const mount = (bookings: Booking[], onCreate: (tid: string, time: string) => void = () => {}, onSelect: (b: Booking) => void = () => {}) =>
  wrap(h(CalendarGrid, { teachers: [COACH, SYSTEM], bookings, times: ["10:00", "11:00"], onSelectBooking: onSelect, onCreate, date: DAY }));
const card = (name: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(name)) as HTMLElement | undefined;
const addLabels = [dictionaries.th.calendar.addBooking, dictionaries.en.calendar.addBooking];
const addButtons = () => [...document.querySelectorAll("button[data-park-add]")] as HTMLElement[];

afterEach(() => {
  cleanup();
  canBook = true;
});

describe("🔴 TASK-942 — the day grid's No Teacher column", () => {
  it("🔑 three park blocks in one hour are ALL drawn, in ONE cell, in payload order", () => {
    mount([PARK_A, PARK_B, PARK_C]);
    for (const n of ["บ้านเอ", "บ้านบี", "บ้านซี"]) expect(card(n)).toBeDefined();
    const stack = document.querySelector("[data-park-stack]") as HTMLElement;
    expect(stack.getAttribute("data-park-stack")).toBe("3");
    const names = [...stack.querySelectorAll("button:not([data-park-add])")].map((b) => b.textContent ?? "");
    expect(names.length).toBe(3);
    expect(names[0]).toContain("บ้านเอ");
    expect(names[1]).toContain("บ้านบี");
    expect(names[2]).toContain("บ้านซี");
  });

  it("🔑 the add action stays on the cell that already holds blocks (another group may rent the park) and passes the SYSTEM teacher + that hour", async () => {
    const created: string[] = [];
    mount([PARK_A, PARK_B], (tid, time) => created.push(`${tid}@${time}`));
    expect(addButtons().length).toBe(1);
    expect(addButtons()[0].getAttribute("aria-label")).toBeTruthy();
    await userEvent.click(addButtons()[0]);
    expect(created).toEqual(["sys@10:00"]);
  });

  it("every block still OPENS its own booking on click", async () => {
    const opened: string[] = [];
    mount([PARK_A, PARK_B, PARK_C], () => {}, (b) => opened.push(b.id));
    await userEvent.click(card("บ้านบี")!);
    await userEvent.click(card("บ้านซี")!);
    expect(opened).toEqual(["p2", "p3"]);
  });

  it("a single park block still reads as before: one card, plus the add action under it", () => {
    mount([PARK_A]);
    expect(card("บ้านเอ")).toBeDefined();
    expect(document.querySelector("[data-park-stack]")?.getAttribute("data-park-stack")).toBe("1");
    expect(addButtons().length).toBe(1);
  });

  it("an hour with no park block keeps the plain empty-cell add (no stack, no second add)", () => {
    mount([PARK_A]); // 11:00 has none
    expect(document.querySelectorAll("[data-park-stack]").length).toBe(1);
    const plain = [...document.querySelectorAll("button[aria-label]")].filter((b) => addLabels.includes(b.getAttribute("aria-label") ?? "") && !b.hasAttribute("data-park-add"));
    // 10:00 coach has none either → the empty cells: coach 11:00 + system 11:00 (coach 10:00 has no booking in this mount, so also empty)
    expect(plain.length).toBeGreaterThanOrEqual(2);
  });

  it("🔑 a REAL coach is unchanged: two rows in one hour still draw ONE card, and no park stack", () => {
    mount([COACH_1, COACH_2]);
    expect(card("นักเรียน-หนึ่ง")).toBeDefined();
    expect(card("นักเรียน-สอง")).toBeUndefined();
    expect(document.querySelectorAll("[data-park-stack]").length).toBe(0); // a count, never a node in a matcher (TASK-596)
    expect(addButtons().length).toBe(0);
  });

  it("other hours are not mixed in: a block at 11:00 sits in its own cell", () => {
    mount([PARK_A, PARK_B, PARK_LATER]);
    const stacks = [...document.querySelectorAll("[data-park-stack]")].map((s) => s.getAttribute("data-park-stack"));
    expect(stacks).toEqual(["2", "1"]);
  });

  it("without the booking right, the stack still shows every block but offers no add", () => {
    canBook = false;
    mount([PARK_A, PARK_B]);
    expect(card("บ้านเอ")).toBeDefined();
    expect(card("บ้านบี")).toBeDefined();
    expect(addButtons().length).toBe(0);
  });
});

/**
 * 🔴 D-155-1 (Tanya, TEST-155) — the test above fed `bookings` straight to the grid, which is how a payload that carried ONE booking per hour slipped through.
 * 🔑 This one starts from the PAYLOAD: a `GET /calendar` response whose system-column slot has `booking` + `more` goes through the real mapper into the real grid.
 */
describe("🔴 D-155-1 — from the calendar PAYLOAD to the cell", () => {
  const { calendarDayBookings, calendarToBookings } = require("@/lib/api/mappers") as typeof import("@/lib/api/mappers");
  const dtoOf = (b: Booking) => ({
    id: b.id,
    date: b.date,
    startTime: b.startTime,
    endTime: b.endTime,
    bookingType: "OTHER",
    status: "CONFIRMED",
    note: null,
    student: null,
    teacher: { id: SYSTEM.id, name: SYSTEM.name, nickname: SYSTEM.nickname, type: SYSTEM.type },
    subject: null,
    title: b.displayName,
    displayName: b.displayName,
    teachers: [{ id: SYSTEM.id, name: SYSTEM.name, nickname: SYSTEM.nickname, type: SYSTEM.type }],
    course: null,
    badges: [],
    discount: null,
    attendeeNote: null,
    pendingSlot: false,
    incomingBookingId: null,
    rescheduleTo: null,
  });
  const payload = (more: Booking[] | undefined) =>
    ({
      days: [{ date: DAY, columns: [{ teacher: SYSTEM, slots: [{ time: "10:00", booking: dtoOf(PARK_A), ...(more ? { more: more.map(dtoOf) } : {}) }, { time: "11:00", booking: null }] }] }],
    }) as never;

  it("🔑 `booking` + `more` (2) ⇒ the No Teacher cell shows data-park-stack=3, all three names", () => {
    const flat = calendarDayBookings(payload([PARK_B, PARK_C]), DAY);
    expect(flat.map((b) => b.id)).toEqual(["p1", "p2", "p3"]);
    mount(flat);
    expect(document.querySelector("[data-park-stack]")!.getAttribute("data-park-stack")).toBe("3");
    for (const n of ["บ้านเอ", "บ้านบี", "บ้านซี"]) expect(card(n)).toBeDefined();
  });

  it("the week reader (calendarToBookings) carries `more` too", () => {
    expect(calendarToBookings(payload([PARK_B, PARK_C])).map((b) => b.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("no `more` key ⇒ exactly the old result (one booking per slot)", () => {
    expect(calendarDayBookings(payload(undefined), DAY).map((b) => b.id)).toEqual(["p1"]);
    expect(calendarToBookings(payload(undefined)).map((b) => b.id)).toEqual(["p1"]);
  });
});
