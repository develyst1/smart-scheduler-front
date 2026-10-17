import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { readFileSync } from "node:fs";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * 🔴 **TASK-818 (REQ-123 P1; BE TASK-817) — the leave dialog: a DATE RANGE, a sensible default date, and "what saving will do".**
 *
 * 🔑 **The failures worth catching are on the WIRE and in WHO is told what:** a range that goes out as one day (or a single day that
 * suddenly carries `from`/`to`), a range answer misread as a cancel, a default date the admin never chose that can be saved by accident, a
 * "will cancel N" line that lies about which door this is. Every assertion is a request body, a count, or a boolean — never an element.
 * 📌 Day buttons are found by their `aria-label` ("9 October 2026"), because that is what a person (and a screen reader) reads.
 */

const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
let answer: unknown = null;
let allowed = true;

const iso = (offset: number) => dayjs().add(offset, "day").format("YYYY-MM-DD");
const TODAY = iso(0);
const FROM = iso(7);
const TO = iso(9);

const calendarFor = (date: string) => ({
  days: [
    {
      date,
      columns: [
        {
          teacherId: "me",
          slots: [
            {
              startTime: "10:00:00",
              booking: {
                id: "mine-1",
                date,
                startTime: "10:00:00",
                endTime: "11:00:00",
                status: "CONFIRMED",
                displayName: "น้องของฉัน",
                bookingType: "COURSE_PACKAGE",
                teacher: { id: "me", name: "ฉัน", nickname: "ฉัน" },
                student: { id: "s1", name: "น้องของฉัน", nickname: null },
                additionalTeachers: [],
              },
            },
            {
              startTime: "11:00:00",
              booking: {
                id: "mine-2",
                date,
                startTime: "11:00:00",
                endTime: "12:00:00",
                status: "ATTENDED",
                displayName: "น้องที่มาแล้ว",
                bookingType: "COURSE_PACKAGE",
                teacher: { id: "me", name: "ฉัน", nickname: "ฉัน" },
                student: { id: "s2", name: "น้องที่มาแล้ว", nickname: null },
                additionalTeachers: [],
              },
            },
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
    get: async (_url: string, cfg?: { params?: { date?: string } }) => ({ data: calendarFor(cfg?.params?.date ?? TODAY) }),
    post: async (url: string, body: Record<string, unknown>) => {
      posts.push({ url, body });
      return { data: answer };
    },
  },
}));
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => allowed }));
const realHooks = await import("@/hooks/scheduler");
const TEACHERS = [
  { id: "t-1", name: "ครูหนึ่ง", nickname: "หนึ่ง", active: true },
  { id: "t-2", name: "ครูสอง", nickname: "สอง", active: true },
  { id: "t-3", name: "ครูเก่า", nickname: "เก่า", active: false },
];
mock.module("@/hooks/scheduler", () => ({ ...realHooks, useTeachers: () => ({ data: TEACHERS }) }));

const ReportLeaveDialog = (await import("./ReportLeaveDialog")).default;
const CalendarHeader = (await import("../CalendarHeader")).default;

const SUBJECT = { id: "t-77", name: "ครูเอ" };
const wrap = (el: ReturnType<typeof h>) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, el))) as never);
};
const mount = (initialDate: string, props: { subject?: { id: string; name: string }; pickTeacher?: boolean } = {}) =>
  wrap(h(ReportLeaveDialog, { opened: true, initialDate, onClose: () => {}, ...props }));

const q = (sel: string) => document.querySelectorAll(sel).length;
const text = () => document.body.textContent ?? "";
const submitBtn = () => document.querySelector("[data-leave-submit]") as HTMLButtonElement;
const submitText = () => submitBtn()?.textContent ?? "";
const leaves = () => posts.filter((r) => r.url === "/teacher-leave-days");
const ownLeaves = () => posts.filter((r) => r.url === "/teachers/me/leave");
const typeReason = (user: ReturnType<typeof userEvent.setup>) => user.type(document.querySelector("textarea") as HTMLTextAreaElement, "ไปอบรม");

/** Open a date field and press the day whose label is `D MMMM YYYY`; pages forward to the right month first. */
const pickDay = async (user: ReturnType<typeof userEvent.setup>, field: "from" | "to", date: string) => {
  await user.keyboard("{Escape}"); // a popover left open by the previous pick would swallow this click
  await user.click(document.querySelector(`[data-leave-date-${field}]`) as HTMLElement);
  const label = dayjs(date).format("D MMMM YYYY");
  // the LAST match: a popover that is closing can still be in the DOM, and the one just opened is appended after it
  const dayBtn = () => [...document.querySelectorAll("button")].filter((b) => b.getAttribute("aria-label") === label).at(-1) as HTMLElement | undefined;
  for (let i = 0; i < 3 && !dayBtn(); i++) {
    const next = [...document.querySelectorAll("button")].filter((b) => (b.getAttribute("class") ?? "").includes("calendarHeaderControl"))[1];
    await user.click(next as HTMLElement);
  }
  await user.click(dayBtn() as HTMLElement);
};

afterEach(cleanup);
beforeEach(() => {
  posts.length = 0;
  allowed = true;
  answer = { mode: "advance", cancelled: 0, bookingIds: [], familiesNotified: 0, teacherNotified: 1, leave: { date: FROM, reason: "ไปอบรม" }, alreadyRecorded: false, bookings: [] };
});

describe("🔴 TASK-818 P2 — the admin door takes FROM – TO (one reason)", () => {
  it("🔑 a RANGE goes out as `{ teacherId, from, to, reason }` — no `date`, no `sessionIds` — and the teacher's own route is never touched", async () => {
    const user = userEvent.setup();
    mount(FROM, { subject: SUBJECT });
    await pickDay(user, "to", TO);
    await typeReason(user);
    await user.click(submitBtn());
    await waitFor(() => expect(leaves().length).toBe(1));
    const body = leaves()[0].body;
    expect(Object.keys(body).sort()).toEqual(["from", "reason", "teacherId", "to"]);
    expect([body.teacherId, body.from, body.to]).toEqual(["t-77", FROM, TO]);
    expect(ownLeaves().length).toBe(0);
  });

  it("🔑 an EMPTY To is still the ONE-DAY body, unchanged: `{ teacherId, date, reason }` — never `from`/`to`", async () => {
    const user = userEvent.setup();
    mount(FROM, { subject: SUBJECT });
    await typeReason(user);
    await user.click(submitBtn());
    await waitFor(() => expect(leaves().length).toBe(1));
    expect(Object.keys(leaves()[0].body).sort()).toEqual(["date", "reason", "teacherId"]);
    expect(leaves()[0].body.date).toBe(FROM);
  });

  it("🔑 the button and the hint NAME the number of days for a range (3), and say the single-day words for one day", async () => {
    const user = userEvent.setup();
    mount(FROM, { subject: SUBJECT });
    expect(submitText()).toBe("Block this day for ครูเอ");
    await pickDay(user, "to", TO);
    expect(submitText()).toBe("Block these 3 days for ครูเอ");
    expect(text()).toContain("blocks all 3 days for new bookings");
  });

  it("🚫 the end is only offered on the ADMIN door — the teacher's own door stays one day", () => {
    mount(FROM);
    expect(q("[data-leave-date-to]")).toBe(0);
    cleanup();
    mount(FROM, { subject: SUBJECT });
    expect(q("[data-leave-date-to]")).toBe(1);
  });

  // 🔻 TASK-822, declared: this test was "moving the START past the end DROPS the end". The end is no longer dropped silently (TEST-108 F1: a hidden change is worse than a shown one) —
  // it STAYS, the dialog refuses in words and the button waits. ✅ What it protects is kept: a backwards range is never sent, and moving the start back under the end gives the range again.
  it("🔑 moving the START past the end KEEPS the end and refuses it — a backwards range is never sent", async () => {
    const user = userEvent.setup();
    mount(FROM, { subject: SUBJECT });
    await pickDay(user, "to", TO);
    expect(submitText()).toContain("3 days");
    await pickDay(user, "from", iso(12));
    await waitFor(() => expect(q("[data-leave-range-refused]")).toBe(1));
    await typeReason(user);
    expect(submitBtn().disabled).toBe(true);
    await user.click(submitBtn());
    expect(leaves().length).toBe(0);
    // 🔑 and the end is really kept: moving the start back under it brings the range back
    await pickDay(user, "from", iso(8));
    await waitFor(() => expect(q("[data-leave-range-refused]")).toBe(0));
    expect(submitText()).toBe("Block these 2 days for ครูเอ");
  });

  it("🔑 the RANGE answer is shown PER DAY — new vs already on record, each day's classes — and it is NOT read as a cancel", async () => {
    answer = {
      mode: "advance-range",
      rangeId: "r-1",
      from: FROM,
      to: TO,
      recordedDays: 2,
      alreadyRecordedDays: 1,
      cancelled: 0,
      bookingIds: [],
      familiesNotified: 0,
      teacherNotified: 1,
      days: [
        { date: FROM, alreadyRecorded: false, bookings: [{ id: "b1", date: FROM, startTime: "09:00:00", endTime: "09:45:00", status: "CONFIRMED", bookingType: "COURSE_PACKAGE" }] },
        { date: iso(8), alreadyRecorded: true, bookings: [] },
        { date: TO, alreadyRecorded: false, bookings: [] },
      ],
    };
    const user = userEvent.setup();
    mount(FROM, { subject: SUBJECT });
    await pickDay(user, "to", TO);
    await typeReason(user);
    await user.click(submitBtn());
    await waitFor(() => expect(q("[data-leave-range]")).toBe(1));
    expect(q("[data-leave-range-day]")).toBe(3);
    expect(q('[data-leave-range-already="yes"]')).toBe(1);
    expect(q('[data-leave-range-already="no"]')).toBe(2);
    expect(text()).toContain("1 class(es) booked");
    // 🔑 counted, not just present: ONE day was already there, so the badge is on exactly ONE day (and "Recorded" on the other two)
    expect(text().split("Already on record — the first entry stands").length - 1).toBe(1);
    expect(text().split("Recorded").length - 1).toBe(2);
    // 🔴 the two sentences an admin must not get wrong are the APPROVED ones, in the admin's words
    expect(q("[data-leave-nothing-cancelled]")).toBe(1);
    expect(text()).toContain("NOTHING HAS BEEN CANCELLED");
    expect(q('[data-leave-teacher-told="yes"]')).toBe(1);
    // 🚫 and it never took the cancel path: no "sessions cancelled" text, none of the teacher-door sentences
    expect(text()).not.toContain("sessions cancelled");
    expect(text()).not.toContain("you are recorded as away");
  });

  it("🔑 a range whose teacher was NOT told says who must act; an answer with no count says nothing about it", async () => {
    const days = [{ date: FROM, alreadyRecorded: false, bookings: [] }];
    answer = { mode: "advance-range", rangeId: "r", from: FROM, to: TO, recordedDays: 1, alreadyRecordedDays: 0, cancelled: 0, bookingIds: [], familiesNotified: 0, teacherNotified: 0, days };
    const user = userEvent.setup();
    mount(FROM, { subject: SUBJECT });
    await pickDay(user, "to", TO);
    await typeReason(user);
    await user.click(submitBtn());
    await waitFor(() => expect(q('[data-leave-teacher-told="no"]')).toBe(1));
    cleanup();
    posts.length = 0;
    answer = { mode: "advance-range", rangeId: "r", from: FROM, to: TO, recordedDays: 1, alreadyRecordedDays: 0, cancelled: 0, bookingIds: [], familiesNotified: 0, days };
    mount(FROM, { subject: SUBJECT });
    await pickDay(user, "to", TO);
    await typeReason(user);
    await user.click(submitBtn());
    await waitFor(() => expect(q("[data-leave-range]")).toBe(1));
    expect(q("[data-leave-teacher-told]")).toBe(0);
  });
});

describe("🔴 TASK-818 P6 — the default date, and the calendar's entry", () => {
  it("🔑 an EMPTY date (the Teachers menu): nothing is refused, no hint yet, and the button WAITS — even with a reason typed", async () => {
    const user = userEvent.setup();
    mount("", { subject: SUBJECT });
    expect(q("[data-leave-admin-refused]")).toBe(0);
    expect(q("[data-leave-advance-notice]")).toBe(0);
    await typeReason(user);
    expect(submitBtn().disabled).toBe(true);
    await user.click(submitBtn());
    expect(leaves().length).toBe(0);
  });

  it("🔑 choosing a date wakes it up: a future date shows the approved hint and the button works", async () => {
    const user = userEvent.setup();
    mount("", { subject: SUBJECT });
    await pickDay(user, "from", FROM);
    await waitFor(() => expect(q("[data-leave-advance-notice]")).toBe(1));
    await typeReason(user);
    expect(submitBtn().disabled).toBe(false);
  });

  it("🔴 today and the past are still REFUSED with the alternative named (TASK-611, unchanged)", () => {
    mount(TODAY, { subject: SUBJECT });
    expect(q("[data-leave-admin-refused]")).toBe(1);
    expect(submitBtn().disabled).toBe(true);
  });

  it("🔑 the calendar's entry asks WHOSE leave first: no teacher ⇒ the button waits; a chosen teacher ⇒ the title names them and the request carries THEIR id", async () => {
    const user = userEvent.setup();
    mount(FROM, { pickTeacher: true });
    expect(q("[data-leave-teacher-pick]")).toBe(1);
    expect(q("[data-leave-advance-notice]")).toBe(0); // no hint before a teacher is chosen (it would say the wrong person)
    await typeReason(user);
    expect(submitBtn().disabled).toBe(true);
    await user.click(submitBtn());
    expect(leaves().length).toBe(0);
    // choose "สอง" (the second ACTIVE teacher — the inactive one is not offered)
    await user.click(document.querySelector("[data-leave-teacher-pick]") as HTMLElement);
    const opts = [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent);
    expect(opts).toEqual(["หนึ่ง", "สอง"]);
    await user.click([...document.querySelectorAll('[role="option"]')].find((o) => o.textContent === "สอง") as HTMLElement);
    await waitFor(() => expect(submitBtn().disabled).toBe(false));
    expect(text()).toContain("Record leave for สอง");
    await user.click(submitBtn());
    await waitFor(() => expect(leaves().length).toBe(1));
    expect(leaves()[0].body.teacherId).toBe("t-2");
    expect(JSON.stringify(leaves()[0].body)).not.toContain("สอง");
  });

  it("🔴 the calendar's entry with TODAY and no teacher picked yet shows NO cancel warning (it is the TEACHER's door's sentence; TASK-651 F5 again)", () => {
    mount(TODAY, { pickTeacher: true });
    expect(q("[data-leave-cancel-warning]")).toBe(0);
    expect(text()).not.toContain("Families of the ticked sessions will be told");
    cleanup();
    mount(TODAY); // ✅ and the teacher's OWN door on today still shows it
    expect(q("[data-leave-cancel-warning]")).toBe(1);
  });

  it("🔑 the header button: only with `action:calendar.status` and NOT for a linked account; it opens on THE DAY BEING VIEWED, not tomorrow", async () => {
    const props = { date: iso(5), onChangeDate: () => {}, view: "day" as const, onChangeView: () => {}, weekDays: [iso(5)] };
    wrap(h(CalendarHeader, { ...props, scoped: true }));
    expect(q("[data-record-teacher-leave]")).toBe(0);
    cleanup();
    allowed = false;
    wrap(h(CalendarHeader, props));
    expect(q("[data-record-teacher-leave]")).toBe(0);
    cleanup();
    allowed = true;
    wrap(h(CalendarHeader, props));
    expect(q("[data-record-teacher-leave]")).toBe(1);
    await userEvent.setup().click(document.querySelector("[data-record-teacher-leave]") as HTMLElement);
    await waitFor(() => expect(q("[data-leave-teacher-pick]")).toBe(1));
    expect((document.querySelector("[data-leave-date-from]") as HTMLElement).textContent).toBe(dayjs(iso(5)).format("D MMM YYYY"));
  });
});

describe("🔴 TASK-818 P7 — what saving will do, said BEFORE saving, from numbers the dialog already holds", () => {
  it("🔑 own door, a FUTURE day: 'only blocks … N class(es) stay' with N = the day's classes it loaded", async () => {
    mount(FROM);
    await waitFor(() => expect(q('[data-leave-will="block"]')).toBe(1));
    expect(document.querySelector("[data-leave-will]")?.textContent).toBe("Saving only blocks the day for new bookings. 2 class(es) stay on the schedule for an admin to handle.");
  });

  it("🔑 own door, TODAY: 'cancels N class(es)' with N = the TICKED ones — un-tick it and the line goes", async () => {
    const user = userEvent.setup();
    mount(TODAY);
    await waitFor(() => expect(q('[data-leave-will="cancel"]')).toBe(1));
    expect(document.querySelector("[data-leave-will]")?.textContent).toBe("Saving cancels 1 class(es) and tells their families.");
    await user.click(document.querySelector('input[type="checkbox"]') as HTMLElement);
    await waitFor(() => expect(q("[data-leave-will]")).toBe(0));
  });

  it("🚫 the ADMIN door states no count it does not hold — its own hint already says the list follows the save", async () => {
    mount(FROM, { subject: SUBJECT });
    await waitFor(() => expect(q("[data-leave-advance-notice]")).toBe(1));
    expect(q("[data-leave-will]")).toBe(0);
  });
});

describe("✅ TASK-818 — the new words are APPROVED (owner 2026-10-17), in both languages", () => {
  const keys = ["recordTeacherLeave", "dateTo", "adminRangeHint", "adminSubmitRange", "willBlock", "willCancel", "rangeDayNew", "rangeDayAlready", "rangeDayClasses", "rangeDayNone"];
  it("🔑 ten keys, each in EN and TH, and the file marks them APPROVED exactly once per language", () => {
    const en = dictionaries.en.teacherLeave as Record<string, string>;
    const th = dictionaries.th.teacherLeave as Record<string, string>;
    for (const k of keys) {
      expect(en[k]?.length).toBeGreaterThan(3);
      expect(th[k]?.length).toBeGreaterThan(3);
    }
    const src = readFileSync("src/lib/i18n/dictionaries.ts", "utf8");
    expect(src.split("APPROVED by the owner 2026-10-17 (REQ-123 Phase 1, TASK-818").length - 1).toBe(1);
    expect(src.split("อนุมัติโดยเจ้าของ 2026-10-17 (REQ-123 Phase 1, TASK-818").length - 1).toBe(1);
  });

  it("🔒 the approved strings 818 REUSES are untouched", () => {
    const en = dictionaries.en.teacherLeave as Record<string, string>;
    expect(en.adminNothingCancelled).toContain("NOTHING HAS BEEN CANCELLED");
    expect(en.adminAdvanceTitle).toBe("{date} — leave recorded for {name}");
    expect(en.adminSubmit).toBe("Block this day for {name}");
    expect(en.adminSubject).toBe("Whose leave this is");
  });
});

describe("🔴 TASK-818 — wiring pins (the clicked tests above prove what each does)", () => {
  const code = (p: string) =>
    readFileSync(p, "utf8")
      .replace(/\r\n/g, "\n")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  const dialog = code("src/components/partials/Calendar/Modal/ReportLeaveDialog.tsx");

  it("🔑 the Teachers menu opens with an EMPTY date — never 'tomorrow' again", () => {
    const row = code("src/components/partials/Teachers/TeacherRowActions.tsx");
    expect(row).toContain('initialDate=""');
    expect(row).not.toContain("add(1");
  });

  it("🔑 the leave strip is refreshed after an admin records a day or a range (its own key)", () => {
    const hooks = code("src/hooks/scheduler/useScheduler.ts");
    const start = hooks.indexOf("export const useReportTeacherLeave");
    const block = hooks.slice(start, hooks.indexOf("export const", start + 10));
    expect(block).toContain('qc.invalidateQueries({ queryKey: ["leave-days"] });');
  });

  it("🔑 the range answer is read from `mode`, before the single-day check — never re-derived from the dates we sent", () => {
    expect(dialog.indexOf('res.mode === "advance-range"')).toBeGreaterThan(0);
    expect(dialog.indexOf('res.mode === "advance-range"')).toBeLessThan(dialog.indexOf("isAdvanceResult(res)"));
  });

  it("🚫 the front copies NO range limit — the 31 days (and the sentence for it) are the server's", () => {
    expect(dialog).not.toMatch(/\b31\b/);
    expect(code("src/services/scheduler.service.ts")).not.toMatch(/MAX_LEAVE_RANGE/);
  });
});
