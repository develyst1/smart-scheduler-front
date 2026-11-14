import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import type { Booking } from "@/types/app/scheduler";

/**
 * 🔴 **TASK-972 (REQ-5016, SPEC-109 § 3.3) — «ลาทั้งวัน» in the booking modal's ⋯ menu** (+ TASK-962's «เปลี่ยนกิจกรรม» door on a live 1 HR / Trial, which had no modal-level test).
 *
 * 🔑 What can go wrong without anyone seeing it: the item offered on a one-slot day (nothing to add), counted from rows that are not live / not this course / not this date, the request sent WITHOUT
 * `wholeDay: true` (it would mark ONE hour and look like it worked), the confirm text not naming the date and every time, and the per-hour leave changing at all. Every assertion is a request, a count or a string.
 */

const patches: Array<{ url: string; body: Record<string, unknown> }> = [];
let closed = 0;
const toasts: Array<{ title?: string; color?: string }> = []; // TASK-983: what `notify` was asked to show
let refuse: { code: string; message: string; status: number } | null = null; // TASK-983: the server refuses the next status change

const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => true }));
const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async (url: string) => ({ data: url === "/badges" ? [] : {} }),
    patch: async (url: string, body: Record<string, unknown>) => {
      patches.push({ url, body });
      if (refuse) throw new realClient.ApiClientError(refuse.code, refuse.message, refuse.status);
      return { data: { booking: { ...DTO, status: "SICK_LEAVE" } } };
    },
  },
}));
const realNotify = await import("@/lib/ui/notify");
mock.module("@/lib/ui/notify", () => ({ ...realNotify, notify: (n: { title?: string; color?: string }) => { toasts.push(n); } }));

const BookingModal = (await import("./BookingModal")).default;

const DAY = "2026-11-17";
const DTO = {
  id: "r1",
  date: DAY,
  startTime: "10:00",
  endTime: "11:00",
  bookingType: "COURSE_PACKAGE",
  status: "CONFIRMED",
  note: null,
  student: null,
  teacher: { id: "t1", name: "ครูเอ", nickname: "เอ", type: "FULL_TIME" },
  subject: null,
  title: null,
  displayName: "Beam",
  teachers: [{ id: "t1", name: "ครูเอ", nickname: "เอ", type: "FULL_TIME" }],
  course: null,
  badges: [],
  discount: null,
  attendeeNote: null,
  pendingSlot: false,
  incomingBookingId: null,
  rescheduleTo: null,
};

const mk = (id: string, time: string, over: Partial<Booking> = {}): Booking => ({
  id,
  displayName: "Beam",
  studentName: "Beam",
  teacherId: "t1",
  teachers: [{ id: "t1", name: "ครูเอ", nickname: "เอ", type: "FULL_TIME" }],
  subject: "Surfskate",
  date: DAY,
  startTime: time,
  endTime: `${Number(time.slice(0, 2)) + 1}:00`,
  bookingType: "COURSE_PACKAGE",
  status: "CONFIRMED",
  courseId: "c1",
  ...over,
});

const mount = (booking: Booking, bookings: Booking[]) => {
  window.localStorage.setItem("t972-lang", "en");
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, { storageKey: "t972-lang" },
      h(BookingModal, { isOpen: true, onClose: () => { closed++; }, booking, teachers: [], bookings, onOverbook: () => {}, onWalkIn: () => {} } as never),
    ))) as never,
  );
};
const openMenu = async () => {
  const user = userEvent.setup();
  await user.click(document.querySelector(`[aria-label="${dictionaries.en.booking.moreActions}"]`) as HTMLElement);
  await waitFor(() => expect(document.querySelectorAll('[role="menuitem"]').length).toBeGreaterThan(0));
  return user;
};
const item = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const btn = (text: string) => [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === text) as HTMLButtonElement | undefined;

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
beforeEach(() => {
  patches.length = 0;
  closed = 0;
  toasts.length = 0;
  refuse = null;
});

describe("🔴 TASK-972 — «ลาทั้งวัน»", () => {
  const R1 = mk("r1", "10:00");
  const R2 = mk("r2", "11:00");

  it("🔑 2 live rows of the course on this date ⇒ the item is offered, beside the per-hour leave", async () => {
    mount(R1, [R1, R2]);
    await openMenu();
    expect(item('[data-status-action="sick-leave-whole-day"]')).toBeTruthy();
    expect(item('[data-status-action="sick-leave"]')).toBeTruthy();
    expect(item('[data-status-action="sick-leave-whole-day"]')!.textContent).toBe("Leave all day");
  });

  it("🔑 the confirm names the DATE and EVERY time, and the request carries `wholeDay: true`", async () => {
    mount(R1, [R1, R2]);
    const user = await openMenu();
    await user.click(item('[data-status-action="sick-leave-whole-day"]')!);
    await waitFor(() => expect(document.body.textContent).toContain("Mark every class of this course on"));
    const text = document.body.textContent ?? "";
    expect(text).toContain("17/Nov/26");
    expect(text).toContain("10:00, 11:00");
    // O-159-1: the TITLE is the whole-day one, not the per-hour «Record leave for this session?»
    expect(text).toContain("Record leave for the whole day?");
    expect(text.includes(dictionaries.en.confirmAction.leaveTitle)).toBe(false);
    await user.click(btn("Leave all day") as HTMLElement);
    await waitFor(() => expect(patches.length).toBe(1));
    expect(patches[0].url).toBe("/bookings/r1/status");
    expect(patches[0].body).toEqual({ action: "sick-leave", wholeDay: true });
    await waitFor(() => expect(closed).toBe(1));
  });

  it("🔑 the per-hour leave is UNCHANGED: no `wholeDay` key in its body", async () => {
    mount(R1, [R1, R2]);
    const user = await openMenu();
    await user.click(item('[data-status-action="sick-leave"]')!);
    await waitFor(() => expect(btn("Sick leave") ?? btn(dictionaries.en.booking.sickLeaveBtn)).toBeTruthy());
    // O-159-1: the per-hour confirm keeps its own title
    expect(document.body.textContent).toContain(dictionaries.en.confirmAction.leaveTitle);
    expect(document.body.textContent).not.toContain("Record leave for the whole day?");
    await user.click((btn(dictionaries.en.booking.sickLeaveBtn) ?? btn("Sick leave")) as HTMLElement);
    await waitFor(() => expect(patches.length).toBe(1));
    expect(patches[0].body).toEqual({ action: "sick-leave" });
  });

  it("🔑 ONE live row that day (a one-slot course) ⇒ no item", async () => {
    mount(R1, [R1]);
    await openMenu();
    expect(item('[data-status-action="sick-leave-whole-day"]')).toBeNull();
    expect(item('[data-status-action="sick-leave"]')).toBeTruthy();
  });

  it("rows that do not count: another course, another date, a row already on leave", async () => {
    mount(R1, [R1, mk("x1", "11:00", { courseId: "c2" }), mk("x2", "12:00", { date: "2026-11-18" }), mk("x3", "13:00", { status: "SICK_LEAVE" })]);
    await openMenu();
    expect(item('[data-status-action="sick-leave-whole-day"]')).toBeNull();
  });

  it("not on a 1 HR / Trial even with two rows on the day", async () => {
    const S1 = mk("s1", "10:00", { bookingType: "SINGLE_SESSION", courseId: "c1" });
    mount(S1, [S1, mk("s2", "11:00", { bookingType: "SINGLE_SESSION", courseId: "c1" })]);
    await openMenu();
    expect(item('[data-status-action="sick-leave-whole-day"]')).toBeNull();
  });
});

describe("🔴 TASK-962 — «เปลี่ยนกิจกรรม» door on a 1 HR / Trial", () => {
  const open = (b: Booking) => {
    mount(b, [b]);
    return openMenu();
  };
  it("a live 1 HR and a live Trial ⇒ the item; a course row, an ATTENDED row, a CANCELLED row ⇒ none", async () => {
    for (const [type, status, expected] of [
      ["SINGLE_SESSION", "CONFIRMED", true],
      ["FIRST_TRIAL", "PENDING", true],
      ["COURSE_PACKAGE", "CONFIRMED", false],
      ["SINGLE_SESSION", "ATTENDED", false],
      ["SINGLE_SESSION", "CANCELLED", false],
    ] as const) {
      const b = mk("one", "10:00", { bookingType: type, status, courseId: undefined });
      mount(b, [b]);
      if (document.querySelector(`[aria-label="${dictionaries.en.booking.moreActions}"]`)) {
        await openMenu();
        expect(document.querySelectorAll("[data-change-activity-open]").length).toBe(expected ? 1 : 0);
      } else {
        expect(expected).toBe(false); // no menu at all ⇒ no door
      }
      cleanup();
    }
    void open;
  });
});

// 🔴 TASK-983 — a refused leave shows the server's sentence (it used to be rethrown and shown NOTHING); LEAVE_NOTICE_TOO_LATE keeps its override path.
describe("🔴 TASK-983 — a refused leave is SHOWN", () => {
  const R1 = mk("r1", "10:00");
  const R2 = mk("r2", "11:00");
  const SENTENCE = "อายุคอร์สไม่พอสำหรับคาบชดเชย — ขยายวันหมดอายุก่อน แล้วค่อยบันทึกลา";

  it("(a) per-hour leave: 409 LEAVE_NO_VALIDITY ⇒ the server's sentence is the toast title, and the modal stays open", async () => {
    refuse = { code: "LEAVE_NO_VALIDITY", message: SENTENCE, status: 409 };
    mount(R1, [R1, R2]);
    const user = await openMenu();
    await user.click(item('[data-status-action="sick-leave"]')!);
    await waitFor(() => expect(btn(dictionaries.en.booking.sickLeaveBtn)).toBeTruthy());
    await user.click(btn(dictionaries.en.booking.sickLeaveBtn) as HTMLElement);
    await waitFor(() => expect(patches.length).toBe(1));
    expect(patches[0].body).toEqual({ action: "sick-leave" });
    await waitFor(() => expect(toasts.some((n) => n.title === SENTENCE && n.color === "danger")).toBe(true));
    expect(closed).toBe(0);
  });

  it("(b) «ลาทั้งวัน»: the same sentence, the same toast, and the modal stays open", async () => {
    refuse = { code: "LEAVE_NO_VALIDITY", message: SENTENCE, status: 409 };
    mount(R1, [R1, R2]);
    const user = await openMenu();
    await user.click(item('[data-status-action="sick-leave-whole-day"]')!);
    await waitFor(() => expect(btn("Leave all day")).toBeTruthy());
    await user.click(btn("Leave all day") as HTMLElement);
    await waitFor(() => expect(patches.length).toBe(1));
    expect(patches[0].body).toEqual({ action: "sick-leave", wholeDay: true });
    await waitFor(() => expect(toasts.some((n) => n.title === SENTENCE && n.color === "danger")).toBe(true));
    expect(closed).toBe(0);
  });

  it("(c) LEAVE_NOTICE_TOO_LATE still takes the override path: the sentence is inline, NOT a toast", async () => {
    const LATE = "Too late to take leave for this teacher type";
    refuse = { code: "LEAVE_NOTICE_TOO_LATE", message: LATE, status: 409 };
    mount(R1, [R1, R2]);
    const user = await openMenu();
    await user.click(item('[data-status-action="sick-leave"]')!);
    await waitFor(() => expect(btn(dictionaries.en.booking.sickLeaveBtn)).toBeTruthy());
    await user.click(btn(dictionaries.en.booking.sickLeaveBtn) as HTMLElement);
    await waitFor(() => expect(document.body.textContent).toContain(LATE));
    expect(toasts.length).toBe(0);
    expect(closed).toBe(0);
  });
});
