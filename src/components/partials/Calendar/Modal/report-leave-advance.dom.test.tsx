import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";

/**
 * 🔴 **REQ-110 item 2 (TASK-582 BE → TASK-588 FE) — one dialog, two acts, clicked.**
 *
 * **A FUTURE date is the ADVANCE act:** the day is recorded, its classes are LISTED, 🚫 **nothing is cancelled and nobody is
 * told.** **Today and the past are the old cancel, unchanged.**
 * 🔑 **Every assertion is about the REQUEST or the words on screen**, because the two dangerous failures are invisible to a
 * render test: **`sessionIds` riding on a future date** (the server 400s it — *they pick classes to CANCEL*) and **a result
 * that lets a teacher believe their classes were cancelled.** *A teacher who believes that will not turn up.*
 */

const sent: Array<{ url: string; body: Record<string, unknown> }> = [];
let answer: unknown = null;

const day = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const TODAY = day(0);
const FUTURE = day(7);

/**
 * Two of my classes on whichever day is asked for — 🔑 **the scoped calendar's REAL shape: `days[].columns[].slots[].booking`.**
 * *A hand-made shape that merely looks plausible made the component throw, which is its own small lesson about fixtures.*
 */
const cls = (id: string, date: string, startTime: string, endTime: string, status: string, displayName: string) => ({
  id,
  date,
  startTime,
  endTime,
  status,
  displayName,
  bookingType: "COURSE_PACKAGE",
  teacher: { id: "t1", name: "ครูเอ", nickname: "เอ" },
  student: { id: "s1", name: displayName, nickname: null },
  additionalTeachers: [],
});
const calendarFor = (date: string) => ({
  days: [
    {
      date,
      columns: [
        {
          teacherId: "t1",
          slots: [
            { startTime: "10:00:00", booking: cls("bk-1", date, "10:00:00", "11:00:00", "CONFIRMED", "น้องบีม") },
            { startTime: "13:00:00", booking: cls("bk-2", date, "13:00:00", "14:00:00", "PENDING", "น้องบูม") },
          ],
        },
      ],
    },
  ],
});

const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async (url: string, cfg?: { params?: { date?: string } }) => ({ data: calendarFor(cfg?.params?.date ?? TODAY) }),
    post: async (url: string, body: Record<string, unknown>) => {
      sent.push({ url, body });
      return { data: answer };
    },
  },
}));

const ReportLeaveDialog = (await import("./ReportLeaveDialog")).default;

const mount = (initialDate: string) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(ReportLeaveDialog, { opened: true, initialDate, onClose: () => {} })))) as never,
  );
};
/**
 * 🔴 **TASK-595 — every "it is not there" assertion in this file reads a COUNT, never the node.** `expect(node).toBeNull()`
 * makes the runner print the RECEIVED value on failure, and a happy-dom element serializes its whole document graph:
 * **my first run of W1/W2 produced ~307 MB and was KILLED at the time limit ⇒ NO RESULT, not a verdict.**
 * 🔑 *An assertion whose failure message cannot be read is an assertion that cannot report.* A count prints `1` vs `0`.
 */
const submitBtn = () => document.querySelector("[data-leave-submit]") as HTMLButtonElement;
const leaves = () => sent.filter((r) => r.url === "/teachers/me/leave");
const typeReason = async (user: ReturnType<typeof userEvent.setup>) => {
  // 🔑 By element, not by label: the dialog's language is the provider's, and this file is about the REQUEST, not the words.
  await user.type(document.querySelector("textarea") as HTMLTextAreaElement, "ไปหาหมอ");
};

afterEach(cleanup);
beforeEach(() => {
  sent.length = 0;
  answer = { mode: "advance", cancelled: 0, bookingIds: [], familiesNotified: 0, leave: { date: FUTURE, reason: "ไปหาหมอ" }, alreadyRecorded: false, bookings: [{ id: "bk-9", date: FUTURE, startTime: "09:00:00", endTime: "09:45:00", status: "CONFIRMED", bookingType: "COURSE_PACKAGE" }] };
});

describe("🔴 TASK-588 — a FUTURE date is the advance act, clicked", () => {
  it("🔴 no chooser at all — ABSENT, not disabled", async () => {
    mount(FUTURE);
    await waitFor(() => {
      expect(document.querySelector("[data-leave-advance-notice]")).toBeTruthy();
    });
    // 🚫 not one checkbox, disabled or otherwise: a tick would mean "cancel this one", and nothing is cancelled
    expect(document.querySelectorAll('input[type="checkbox"]').length).toBe(0);
    expect(document.querySelectorAll("[data-leave-rows]").length).toBe(0);
  });

  /**
   * 🔴 **TASK-595 — the same-day warning is ABSENT on a future date.** It says *the ticked sessions' families will be told
   * and the make-ups are added*; on this path 🚫 **nothing is cancelled, nobody is told and no make-up is owed** ⇒ it
   * described an act that was not happening, **directly under a blue hint saying nothing is cancelled.**
   * 🔑 **Pinned BOTH ways** — absent here, **present on today** in the second half of this file — because *half a rule is
   * not a rule*, and today's path must not lose a warning it genuinely needs.
   */
  it("🔴 TASK-595 — no same-day warning on a future date, and no cancel words anywhere on the screen", async () => {
    mount(FUTURE);
    await waitFor(() => expect(document.querySelector("[data-leave-advance-notice]")).toBeTruthy());

    // 🚫 the element is GONE, not emptied
    expect(document.querySelectorAll("[data-leave-cancel-warning]").length).toBe(0);
    // 🔑 and read the WORDS too, in case the sentence reappears somewhere else on the dialog: nothing here promises a
    // family will be told or a make-up added. (The blue hint's own "not cancelled" is the opposite claim and stays.)
    const screenText = document.body.textContent ?? "";
    expect(screenText).not.toMatch(/families of the ticked/i);
    expect(screenText).not.toMatch(/make-up/i);
    expect(screenText).toMatch(/not cancelled/i);
  });

  it("🔑 the body carries NO `sessionIds` — the server 400s them on a future date", async () => {
    const user = userEvent.setup();
    mount(FUTURE);
    await waitFor(() => expect(document.querySelector("[data-leave-advance-notice]")).toBeTruthy());

    await typeReason(user);
    await user.click(submitBtn());

    await waitFor(() => expect(leaves().length).toBe(1));
    expect(Object.keys(leaves()[0].body).sort()).toEqual(["date", "reason"]);
    expect(leaves()[0].body.date).toBe(FUTURE);
    expect(leaves()[0].body.sessionIds).toBeUndefined();
  });

  it("🔴 the result says NOTHING HAS BEEN CANCELLED, and lists what an admin must handle", async () => {
    const user = userEvent.setup();
    mount(FUTURE);
    await waitFor(() => expect(document.querySelector("[data-leave-advance-notice]")).toBeTruthy());
    await typeReason(user);
    await user.click(submitBtn());

    const box = await waitFor(() => {
      const el = document.querySelector("[data-leave-nothing-cancelled]") as HTMLElement | null;
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    expect(box.textContent).toMatch(/nothing has been cancelled/i);
    // the day is blocked, the classes are listed from the SERVER's own list, and the time is on screen
    const result = document.querySelector("[data-leave-advance]") as HTMLElement;
    expect(result.getAttribute("data-leave-advance")).toBe("1");
    // 🔑 The ANSWER's list, not the page's calendar: the server said 09:00 and the calendar this dialog loaded holds
    // 10:00 and 13:00. **A test whose two sources agree cannot tell which one was read** — so here they disagree.
    expect(result.textContent).toContain("09:00");
    expect(result.textContent).not.toContain("13:00");
    // 🚫 and it never claims a cancellation count
    expect(result.textContent).not.toMatch(/cancelled \d|\d cancelled/i);
  });

  it("⚠️ recording the same day twice says the first entry stands — and still cancels nothing", async () => {
    answer = { mode: "advance", cancelled: 0, bookingIds: [], familiesNotified: 0, leave: { date: FUTURE, reason: "ไปหาหมอ" }, alreadyRecorded: true, bookings: [] };
    const user = userEvent.setup();
    mount(FUTURE);
    await waitFor(() => expect(document.querySelector("[data-leave-advance-notice]")).toBeTruthy());
    await typeReason(user);
    await user.click(submitBtn());

    await waitFor(() => expect(document.querySelector("[data-leave-already]")).toBeTruthy());
    expect(document.querySelector("[data-leave-nothing-cancelled]")).toBeTruthy();
    expect(leaves().length).toBe(1);
  });
});

describe("✅ TASK-588 — TODAY is the old act, untouched", () => {
  it("🔑 the chooser is there, the ticks are the default set, and the body is the old shape", async () => {
    answer = { cancelled: 2, bookingIds: ["bk-1", "bk-2"], familiesNotified: 2 };
    const user = userEvent.setup();
    mount(TODAY);

    // the rows and their ticks are back — this path did not change
    await waitFor(() => expect(document.querySelector("[data-leave-rows]")).toBeTruthy());
    const boxes = [...document.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    expect(boxes.length).toBe(2);
    expect(boxes.every((b) => b.checked)).toBe(true);
    expect(document.querySelectorAll("[data-leave-advance-notice]").length).toBe(0);

    // untick one ⇒ the subset rides, exactly as before
    await user.click(boxes[1]);
    await typeReason(user);
    await user.click(submitBtn());

    await waitFor(() => expect(leaves().length).toBe(1));
    expect(leaves()[0].body.date).toBe(TODAY);
    expect(leaves()[0].body.sessionIds).toEqual(["bk-1"]);
    // 🚫 and the advance words never appear on this path
    expect(document.querySelectorAll("[data-leave-nothing-cancelled]").length).toBe(0);
  });

  /** 🔴 **TASK-595's other half** — today's path KEEPS the warning, word for word. 🔑 *Half a rule is not a rule:* a fix
   *  that silenced the sentence everywhere would have removed the one place a teacher must read it. */
  it("🔴 TASK-595 — the same-day warning is PRESENT on today, and still says families are told", async () => {
    mount(TODAY);
    await waitFor(() => expect(document.querySelector("[data-leave-rows]")).toBeTruthy());

    const warn = document.querySelector("[data-leave-cancel-warning]") as HTMLElement | null;
    expect(warn).toBeTruthy();
    expect((warn as HTMLElement).textContent).toMatch(/families of the ticked/i);
    expect((warn as HTMLElement).textContent).toMatch(/make-up/i);
  });

  it("🚫 every class ticked ⇒ still no `sessionIds` (the whole day is the server's own set) — unchanged", async () => {
    answer = { cancelled: 2, bookingIds: ["bk-1", "bk-2"], familiesNotified: 2 };
    const user = userEvent.setup();
    mount(TODAY);
    await waitFor(() => expect(document.querySelector("[data-leave-rows]")).toBeTruthy());

    await typeReason(user);
    await user.click(submitBtn());

    await waitFor(() => expect(leaves().length).toBe(1));
    expect(Object.keys(leaves()[0].body).sort()).toEqual(["date", "reason"]);
  });
});
