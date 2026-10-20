import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { readFileSync } from "node:fs";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { SessionProvider } from "next-auth/react";
import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import type { LeaveDayRow, LeavePreview, LeavePreviewClass, LeavePreviewOutcome } from "@/types/api/contract";

/**
 * 🔴 **TASK-828 (REQ-125 ruling B) — the screens: P7's split counts · "Continues with {names}" rows · the D4 note · the strip counts only what is left to handle.**
 *
 * 🔑 **What can go wrong without anyone seeing it:** a co-taught class counted as one the teacher CANCELS (or one the admin must handle), a "continues" claim made from
 * `additionalTeachers` (whether another teacher REMAINS depends on THEIR leave — only the server knows), a continuing class offered an "Open" / treated as work, the D4 class
 * showing no reason, and a number said before the server has answered. Every assertion is a request, a count or a string — never an element.
 */

let allowed = true;
const gets: Array<{ url: string; params?: Record<string, unknown> }> = [];
const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
let answer: unknown = null;
let ownPreview: (() => LeavePreview) | null = null;
let adminPreview: (() => LeavePreview) | null = null;
let listItems: LeaveDayRow[] = [];

const iso = (n: number) => dayjs().add(n, "day").format("YYYY-MM-DD");
const TODAY = iso(0);
const FUTURE = iso(7);

const calendarFor = (date: string) => ({
  days: [
    {
      date,
      columns: [
        {
          teacherId: "me",
          slots: ["m1", "m2", "m3"].map((id, i) => ({
            startTime: `1${i}:00:00`,
            booking: {
              id,
              date,
              startTime: `1${i}:00:00`,
              endTime: `1${i}:45:00`,
              status: "CONFIRMED",
              displayName: `น้อง${i}`,
              bookingType: "COURSE_PACKAGE",
              teacher: { id: "me", name: "ฉัน", nickname: "ฉัน" },
              // 🔑 every class LOOKS co-taught here — the screen must still say only what the PREVIEW says
              additionalTeachers: [{ id: "x1", name: "ครูอื่น", nickname: "อื่น" }],
              student: { id: `s${i}`, name: `น้อง${i}`, nickname: null },
            },
          })),
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
    get: async (url: string, cfg?: { params?: Record<string, unknown> }) => {
      gets.push({ url, params: cfg?.params });
      if (url === "/me") return { data: { user: { id: "u1", username: "a", displayName: "A", isSuperAdmin: false, menus: ["menu:teachers"], actions: [], roleName: null, teacherId: null } } };
      if (url === "/teachers/me/leave") {
        if (!ownPreview) throw new Error("preview unavailable");
        return { data: ownPreview() };
      }
      if (url === "/teacher-leave-days/preview") {
        if (!adminPreview) throw new Error("preview unavailable");
        return { data: adminPreview() };
      }
      if (url === "/teacher-leave-days") return { data: { items: listItems } };
      return { data: calendarFor((cfg?.params?.date as string) ?? TODAY) };
    },
    post: async (url: string, body: Record<string, unknown>) => {
      posts.push({ url, body });
      return { data: answer };
    },
  },
}));
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => allowed }));

const ReportLeaveDialog = (await import("./ReportLeaveDialog")).default;
const { default: LeaveDayBanner } = await import("../LeaveDayBanner");
const { default: LeaveDayPanel } = await import("../LeaveDayPanel");

const SUBJECT = { id: "t-77", name: "ครูเอ" };
const en = dictionaries.en.teacherLeave;
const th = dictionaries.th.teacherLeave;
const EN_OWN = (n: number) => `${n} co-taught class(es) go on with the other teachers, without you.`;
const EN_ADMIN = (n: number, name: string) => `${n} co-taught class(es) will go on with the other teachers; ${name} is taken off them.`;

const cls = (bookingId: string, outcome: LeavePreviewOutcome, withNames: string[] = []): LeavePreviewClass => ({ bookingId, startTime: "10:00", outcome, with: withNames });
const previewOf = (date: string, classes: LeavePreviewClass[], teacherId = "me", mode: "same-day" | "advance" = date > TODAY ? "advance" : "same-day"): LeavePreview => {
  const counts = { continues: 0, cancel: 0, toHandle: 0, cannot: 0 };
  for (const c of classes) counts[c.outcome] += 1;
  return { teacherId, days: [{ date, mode, classes, counts }], counts };
};

const wrap = (el: ReturnType<typeof h>, lang: "en" | "th" = "en") => {
  window.localStorage.setItem("t828-lang", lang);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const user = { id: "u1", username: "a", displayName: "A", isSuperAdmin: false, menus: ["menu:teachers"], actions: [], roleName: null, teacherId: null };
  return render(
    h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, { storageKey: "t828-lang" }, h(SessionProvider, { session: { user, expires: "2999-01-01" } as never }, el)))) as never,
  );
};
const mount = (initial: string, props: { subject?: { id: string; name: string } } = {}, lang: "en" | "th" = "en") =>
  wrap(h(ReportLeaveDialog, { opened: true, initialDate: initial, onClose: () => {}, ...props }), lang);
const q = (sel: string) => document.querySelectorAll(sel).length;
const text = () => document.body.textContent ?? "";
const submitBtn = () => document.querySelector("[data-leave-submit]") as HTMLButtonElement;
const typeReason = (user: ReturnType<typeof userEvent.setup>) => user.type(document.querySelector("textarea") as HTMLTextAreaElement, "ไปอบรม");
const pickDay = async (user: ReturnType<typeof userEvent.setup>, field: "from" | "to", date: string) => {
  await user.keyboard("{Escape}");
  await user.click(document.querySelector(`[data-leave-date-${field}]`) as HTMLElement);
  const label = dayjs(date).format("D MMMM YYYY");
  const dayBtn = () => [...document.querySelectorAll("button")].filter((b) => b.getAttribute("aria-label") === label).at(-1) as HTMLElement | undefined;
  for (let i = 0; i < 3 && !dayBtn(); i++) {
    const next = [...document.querySelectorAll("button")].filter((b) => (b.getAttribute("class") ?? "").includes("calendarHeaderControl"))[1];
    await user.click(next as HTMLElement);
  }
  await user.click(dayBtn() as HTMLElement);
};
const previewReads = (url: string) => gets.filter((g) => g.url === url);

afterEach(cleanup);
beforeEach(() => {
  allowed = true;
  gets.length = 0;
  posts.length = 0;
  ownPreview = null;
  adminPreview = null;
  listItems = [];
  answer = { mode: "advance", cancelled: 0, bookingIds: [], familiesNotified: 0, teacherNotified: 1, leave: { date: FUTURE, reason: "x" }, alreadyRecorded: false, bookings: [] };
});

describe("🔴 TASK-828 P7 — the teacher's OWN door: split counts from the PREVIEW", () => {
  it("🔑 TODAY: 'cancels N' counts only the TICKED classes that do NOT continue; the approved co-taught line says how many go on without me", async () => {
    // m1, m2 are mine alone (cancel); m3 is co-taught with someone who remains (continues). Calendar default ticks all three.
    ownPreview = () => previewOf(TODAY, [cls("m1", "cancel"), cls("m2", "cancel"), cls("m3", "continues", ["อื่น"])]);
    mount(TODAY);
    await waitFor(() => expect(q('[data-leave-will="cancel"]')).toBe(1));
    expect(document.querySelector('[data-leave-will="cancel"]')?.textContent).toBe("Saving cancels 2 class(es) and tells their families.");
    expect(document.querySelector('[data-leave-co-taught="own"]')?.textContent).toBe(EN_OWN(1));
  });

  it("🔑 …and the Thai co-taught line is the approved Thai", async () => {
    ownPreview = () => previewOf(TODAY, [cls("m1", "cancel"), cls("m3", "continues", ["อื่น"])]);
    mount(TODAY, {}, "th");
    await waitFor(() => expect(q('[data-leave-co-taught="own"]')).toBe(1));
    expect(document.querySelector('[data-leave-co-taught="own"]')?.textContent).toBe("อีก 1 คาบที่สอนร่วมกับครูท่านอื่นจะยังเรียนตามปกติ โดยไม่มีคุณ");
  });

  it("🔑 when EVERY ticked class continues there is no 'cancels' line at all — only the co-taught one", async () => {
    ownPreview = () => previewOf(TODAY, [cls("m1", "continues", ["อื่น"]), cls("m2", "continues", ["อื่น"]), cls("m3", "continues", ["อื่น"])]);
    mount(TODAY);
    await waitFor(() => expect(q('[data-leave-co-taught="own"]')).toBe(1));
    expect(q("[data-leave-will]")).toBe(0);
    expect(document.querySelector('[data-leave-co-taught="own"]')?.textContent).toBe(EN_OWN(3));
  });

  it("🚫 NEVER from `additionalTeachers`: every class of the calendar read lists another teacher, but the PREVIEW says none continues ⇒ no co-taught line", async () => {
    ownPreview = () => previewOf(TODAY, [cls("m1", "cancel"), cls("m2", "cancel"), cls("m3", "cancel")]);
    mount(TODAY);
    await waitFor(() => expect(q('[data-leave-will="cancel"]')).toBe(1));
    expect(q("[data-leave-co-taught]")).toBe(0);
    expect(document.querySelector('[data-leave-will="cancel"]')?.textContent).toBe("Saving cancels 3 class(es) and tells their families.");
  });

  it("🚫 nothing is said until the server has ANSWERED, and nothing if it cannot (a count we cannot back is worse than none)", async () => {
    mount(TODAY); // ownPreview = null ⇒ the read fails
    await new Promise((r) => setTimeout(r, 250));
    expect(previewReads("/teachers/me/leave").length).toBeGreaterThan(0);
    expect(q("[data-leave-will]") + q("[data-leave-co-taught]")).toBe(0);
  });

  it("🔑 the read names the day asked about: `GET /teachers/me/leave?preview=<date>`", async () => {
    ownPreview = () => previewOf(TODAY, [cls("m1", "cancel")]);
    mount(TODAY);
    await waitFor(() => expect(previewReads("/teachers/me/leave").length).toBeGreaterThan(0));
    expect(previewReads("/teachers/me/leave")[0].params).toEqual({ preview: TODAY });
  });

  it("🔑 a FUTURE day: 'N class(es) stay' counts what is left to HANDLE (last-teacher + D4), never the ones that continue", async () => {
    ownPreview = () => previewOf(FUTURE, [cls("m1", "toHandle"), cls("m2", "cannot"), cls("m3", "continues", ["อื่น"])]);
    mount(FUTURE);
    await waitFor(() => expect(q('[data-leave-will="block"]')).toBe(1));
    expect(document.querySelector('[data-leave-will="block"]')?.textContent).toBe("Saving only blocks the day for new bookings. 2 class(es) stay on the schedule for an admin to handle.");
  });
});

describe("🔴 TASK-828 rework (TEST-111) — the own door's counts come ONLY from the preview's outcomes", () => {
  const D4 = (name: string, time: string) => `${name} can't be taken off the ${time} class: no other teacher of it is free at that time. Please handle this class in the calendar.`;

  it("🔑 F1: same-day with 1 sole + 1 D4 → 'cancels 1' (a D4 class is left as it is, no family told) + the approved D4 sentence — though all three are TICKED in the session list", async () => {
    // m1 = sole (cancel), m2 = D4 (cannot); m3 is ticked in the list but the preview does not name it a cancel
    ownPreview = () => previewOf(TODAY, [{ ...cls("m1", "cancel"), startTime: "10:00" }, { ...cls("m2", "cannot"), startTime: "11:00" }]);
    mount(TODAY);
    await waitFor(() => expect(q('[data-leave-will="cancel"]')).toBe(1));
    expect(document.querySelector('[data-leave-will="cancel"]')?.textContent).toBe("Saving cancels 1 class(es) and tells their families.");
    expect(q("[data-leave-d4]")).toBe(1);
    expect(document.querySelector("[data-leave-d4]")?.textContent).toBe(D4("ฉัน", "11:00"));
  });

  it("🔑 F1: when the ONLY class is a D4 one there is NO 'cancels' line at all — just the D4 sentence", async () => {
    ownPreview = () => previewOf(TODAY, [{ ...cls("m2", "cannot"), startTime: "11:00" }]);
    mount(TODAY);
    await waitFor(() => expect(q("[data-leave-d4]")).toBe(1));
    expect(q("[data-leave-will]")).toBe(0);
  });

  it("🔑 F1: the D4 sentence in Thai is the approved Thai, naming the teacher and the time", async () => {
    ownPreview = () => previewOf(TODAY, [{ ...cls("m2", "cannot"), startTime: "11:00" }]);
    mount(TODAY, {}, "th");
    await waitFor(() => expect(q("[data-leave-d4]")).toBe(1));
    expect(document.querySelector("[data-leave-d4]")?.textContent).toBe("ยังนำครู ฉัน ออกจากคาบ 11:00 ไม่ได้ เพราะครูท่านอื่นของคาบนี้ไม่ว่างในเวลานั้น — กรุณาจัดการคาบนี้ในปฏิทิน");
  });

  it("🔑 the D4 sentence appears ONLY under a 'cannot' class (a sole class that is cancelled, or one that continues, gets none)", async () => {
    ownPreview = () => previewOf(TODAY, [cls("m1", "cancel"), cls("m2", "continues", ["อื่น"]), cls("m3", "cannot")]);
    mount(TODAY);
    await waitFor(() => expect(q("[data-leave-will]")).toBe(1));
    expect(q("[data-leave-d4]")).toBe(1);
    expect(q('[data-leave-d4="m3"]')).toBe(1);
  });

  it("🚫 a D4 class that is not among the day's rows we hold names no one: no sentence rather than a guessed name", async () => {
    ownPreview = () => previewOf(TODAY, [cls("ghost", "cannot")]);
    mount(TODAY);
    await new Promise((r) => setTimeout(r, 250));
    expect(q("[data-leave-d4]")).toBe(0);
  });

  it("🔑 F2: a FUTURE day on the teacher's own door shows the approved co-taught line with the preview's count (3), beside 'N class(es) stay'", async () => {
    ownPreview = () => previewOf(FUTURE, [cls("m1", "continues", ["อื่น"]), cls("m2", "continues", ["อื่น"]), cls("m3", "continues", ["อื่น"])]);
    mount(FUTURE);
    await waitFor(() => expect(q('[data-leave-co-taught="own"]')).toBe(1));
    expect(document.querySelector('[data-leave-co-taught="own"]')?.textContent).toBe(EN_OWN(3));
    expect(document.querySelector('[data-leave-will="block"]')?.textContent).toBe("Saving only blocks the day for new bookings. 0 class(es) stay on the schedule for an admin to handle.");
  });

  it("🔑 F2 in Thai, and a FUTURE day with nothing co-taught has no co-taught line", async () => {
    ownPreview = () => previewOf(FUTURE, [cls("m1", "continues", ["อื่น"]), cls("m2", "toHandle")]);
    mount(FUTURE, {}, "th");
    await waitFor(() => expect(q('[data-leave-co-taught="own"]')).toBe(1));
    expect(document.querySelector('[data-leave-co-taught="own"]')?.textContent).toBe("อีก 1 คาบที่สอนร่วมกับครูท่านอื่นจะยังเรียนตามปกติ โดยไม่มีคุณ");
    cleanup();
    ownPreview = () => previewOf(FUTURE, [cls("m1", "toHandle")]);
    mount(FUTURE);
    await waitFor(() => expect(q('[data-leave-will="block"]')).toBe(1));
    expect(q("[data-leave-co-taught]")).toBe(0);
  });
});

describe("🔴 TASK-828 P7 — the ADMIN's door: the approved co-taught line, from the preview", () => {
  it("🔑 ONE future day: the preview is asked for THAT teacher and day, and the line says how many go on with the others and who is taken off", async () => {
    adminPreview = () => previewOf(FUTURE, [cls("m1", "continues", ["อื่น"]), cls("m2", "continues", ["อื่น"]), cls("m3", "toHandle")], "t-77");
    mount(FUTURE, { subject: SUBJECT });
    await waitFor(() => expect(q('[data-leave-co-taught="admin"]')).toBe(1));
    expect(document.querySelector('[data-leave-co-taught="admin"]')?.textContent).toBe(EN_ADMIN(2, "ครูเอ"));
    expect(previewReads("/teacher-leave-days/preview")[0].params).toEqual({ teacherId: "t-77", from: FUTURE });
  });

  it("🔑 a RANGE: asked with from AND to; the count is the span's total — in Thai the approved Thai", async () => {
    adminPreview = () => ({
      teacherId: "t-77",
      days: [],
      counts: { continues: 3, cancel: 0, toHandle: 1, cannot: 0 },
    });
    const user = userEvent.setup();
    mount(FUTURE, { subject: SUBJECT }, "th");
    await pickDay(user, "to", iso(9));
    await waitFor(() => expect(previewReads("/teacher-leave-days/preview").some((g) => g.params?.to === iso(9))).toBe(true));
    await waitFor(() => expect(q('[data-leave-co-taught="admin"]')).toBe(1));
    expect(previewReads("/teacher-leave-days/preview").find((g) => g.params?.to === iso(9))?.params).toEqual({ teacherId: "t-77", from: FUTURE, to: iso(9) });
    expect(document.querySelector('[data-leave-co-taught="admin"]')?.textContent).toBe("คาบที่สอนร่วมกับครูท่านอื่น 3 คาบ จะนำครู ครูเอ ออก และยังเรียนตามปกติ");
  });

  it("🔑 nothing co-taught ⇒ no line (the existing hint stands alone)", async () => {
    adminPreview = () => previewOf(FUTURE, [cls("m1", "toHandle")], "t-77");
    mount(FUTURE, { subject: SUBJECT });
    await waitFor(() => expect(previewReads("/teacher-leave-days/preview").length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 150));
    expect(q("[data-leave-co-taught]")).toBe(0);
  });

  it("🚫 not asked while it makes no sense: TODAY (the admin door refuses it), no date yet, no teacher chosen yet, or a refused range", async () => {
    mount(TODAY, { subject: SUBJECT });
    await new Promise((r) => setTimeout(r, 150));
    cleanup();
    mount("", { subject: SUBJECT });
    await new Promise((r) => setTimeout(r, 150));
    cleanup();
    wrap(h(ReportLeaveDialog, { opened: true, initialDate: FUTURE, onClose: () => {}, pickTeacher: true }));
    await new Promise((r) => setTimeout(r, 150));
    expect(previewReads("/teacher-leave-days/preview").length).toBe(0);
    // 🔑 and the admin door with NO teacher picked yet is not mistaken for the teacher's OWN door: no own preview either
    expect(previewReads("/teachers/me/leave").length).toBe(0);
  });
});

describe("🔴 TASK-828 — the record result: 'Continues with {names}', nothing to do, and the D4 note", () => {
  const record = async (lang: "en" | "th" = "en") => {
    const user = userEvent.setup();
    mount(FUTURE, { subject: SUBJECT }, lang);
    await typeReason(user);
    await user.click(submitBtn());
  };

  it("🔑 ONE day: continuing classes carry the approved tag with the teachers they have NOW (main first), no Open, no status — and 'Nothing is booked' is not said while classes continue", async () => {
    answer = {
      mode: "advance",
      cancelled: 0,
      bookingIds: [],
      familiesNotified: 0,
      teacherNotified: 1,
      leave: { date: FUTURE, reason: "x" },
      alreadyRecorded: false,
      bookings: [],
      continues: [
        { bookingId: "c1", startTime: "14:00", with: ["เอ", "บี"], promotedTo: "เอ" },
        { bookingId: "c2", startTime: "16:00", with: ["ซี"], promotedTo: null },
      ],
    };
    await record();
    await waitFor(() => expect(q("[data-leave-continues]")).toBe(2));
    expect(text()).toContain("Continues with เอ, บี");
    expect(text()).toContain("Continues with ซี");
    expect(text()).toContain("14:00");
    expect(q("[data-leave-class-open]")).toBe(0); // nothing to open: it is not a class to handle
    expect(text()).not.toContain("Nothing is booked with ครูเอ that day");
  });

  it("🔑 …in Thai the approved Thai tag", async () => {
    answer = { mode: "advance", cancelled: 0, bookingIds: [], familiesNotified: 0, teacherNotified: 1, leave: { date: FUTURE, reason: "x" }, alreadyRecorded: false, bookings: [], continues: [{ bookingId: "c1", startTime: "14:00", with: ["เอ", "บี"], promotedTo: null }] };
    await record("th");
    await waitFor(() => expect(q("[data-leave-continues]")).toBe(1));
    expect(text()).toContain("สอนต่อโดย เอ, บี");
  });

  it("🔑 a class LEFT as it is (D4) shows as today — with an Open — and the approved D4 sentence naming the teacher and the time", async () => {
    answer = {
      mode: "advance",
      cancelled: 0,
      bookingIds: [],
      familiesNotified: 0,
      teacherNotified: 1,
      leave: { date: FUTURE, reason: "x" },
      alreadyRecorded: false,
      bookings: [{ id: "d4", date: FUTURE, startTime: "15:00:00", endTime: "15:45:00", status: "CONFIRMED", bookingType: "OTHER", childName: null, childNickname: null, coChildName: null, coChildNickname: null, program: null, title: "ECA", inCourse: false }],
      toHandle: [{ bookingId: "d4", startTime: "15:00", reason: "no-eligible-main" }],
    };
    await record();
    await waitFor(() => expect(q("[data-leave-d4]")).toBe(1));
    expect(document.querySelector("[data-leave-d4]")?.textContent).toBe("ครูเอ can't be taken off the 15:00 class: no other teacher of it is free at that time. Please handle this class in the calendar.");
    expect(q("[data-leave-class-open]")).toBe(1);
  });

  it("🔑 a class that is NOT in `toHandle` gets no D4 sentence (it is simply the last teacher's, handled as before)", async () => {
    answer = {
      mode: "advance",
      cancelled: 0,
      bookingIds: [],
      familiesNotified: 0,
      teacherNotified: 1,
      leave: { date: FUTURE, reason: "x" },
      alreadyRecorded: false,
      bookings: [{ id: "solo", date: FUTURE, startTime: "15:00:00", endTime: "15:45:00", status: "CONFIRMED", bookingType: "COURSE_PACKAGE", childName: "น้องมิว", childNickname: "มิว", coChildName: null, coChildNickname: null, program: "เปียโน", title: null, inCourse: true }],
    };
    await record();
    await waitFor(() => expect(q("[data-leave-panel-class]")).toBe(1));
    expect(q("[data-leave-d4]")).toBe(0);
  });

  it("🔑 a RANGE: each day's continuing classes and D4 note sit under THAT day", async () => {
    answer = {
      mode: "advance-range",
      rangeId: "r-1",
      from: FUTURE,
      to: iso(8),
      recordedDays: 2,
      alreadyRecordedDays: 0,
      cancelled: 0,
      bookingIds: [],
      familiesNotified: 0,
      teacherNotified: 1,
      continuedClasses: 2,
      days: [
        { date: FUTURE, alreadyRecorded: false, bookings: [], continues: [{ bookingId: "c1", startTime: "14:00", with: ["เอ"], promotedTo: null }] },
        {
          date: iso(8),
          alreadyRecorded: false,
          bookings: [{ id: "d4", date: iso(8), startTime: "15:00:00", endTime: "15:45:00", status: "CONFIRMED", bookingType: "OTHER", childName: null, childNickname: null, coChildName: null, coChildNickname: null, program: null, title: "ECA", inCourse: false }],
          toHandle: [{ bookingId: "d4", startTime: "15:00", reason: "no-eligible-main" }],
          continues: [{ bookingId: "c2", startTime: "16:00", with: ["บี"], promotedTo: null }],
        },
      ],
    };
    const user = userEvent.setup();
    mount(FUTURE, { subject: SUBJECT });
    await pickDay(user, "to", iso(8));
    await typeReason(user);
    await user.click(submitBtn());
    await waitFor(() => expect(q("[data-leave-range]")).toBe(1));
    expect(q(`[data-leave-range-day="${FUTURE}"] [data-leave-continues]`)).toBe(1);
    expect(q(`[data-leave-range-day="${iso(8)}"] [data-leave-continues]`)).toBe(1);
    expect(q(`[data-leave-range-day="${iso(8)}"] [data-leave-d4]`)).toBe(1);
    expect(q(`[data-leave-range-day="${FUTURE}"] [data-leave-d4]`)).toBe(0);
  });
});

describe("🔴 TASK-828 — the leave panel and the calendar strip", () => {
  const row = (date: string, bookings: LeaveDayRow["bookings"], continues?: LeaveDayRow["continues"]): LeaveDayRow => ({
    teacherId: "t1",
    teacherName: "เอ",
    date,
    reason: "ไปอบรม",
    createdBy: null,
    rangeId: null,
    bookings,
    ...(continues ? { continues } : {}),
  });
  const handleClass = (id: string, date: string) => ({ id, date, startTime: "09:00:00", endTime: "09:45:00", status: "CONFIRMED" as const, bookingType: "COURSE_PACKAGE" });

  it("🔑 the PANEL shows each day's continuing classes with the approved tag and no Open, beside the to-handle ones; the day's count is the to-handle ones only", async () => {
    const r = row(FUTURE, [handleClass("h1", FUTURE)], [{ bookingId: "c1", startTime: "14:00", with: ["เอ", "บี"] }]);
    listItems = [r];
    wrap(h(LeaveDayPanel, { opened: true, onClose: () => {}, row: r, onOpenClass: () => {} }));
    await waitFor(() => expect(q("[data-leave-panel-continues]")).toBe(1));
    expect(q("[data-leave-continues]")).toBe(1);
    expect(text()).toContain("Continues with เอ, บี");
    expect(q("[data-leave-class-open]")).toBe(1); // the to-handle class only
    expect(text()).toContain("1 class(es) booked"); // to-handle, not 2
  });

  it("🔑 the STRIP counts ONLY what is left to handle: a day with one to-handle class and two continuing ones reads '1 class(es) to handle'", () => {
    const r = row(FUTURE, [handleClass("h1", FUTURE)], [{ bookingId: "c1", startTime: "14:00", with: ["เอ"] }, { bookingId: "c2", startTime: "15:00", with: ["บี"] }]);
    wrap(h(LeaveDayBanner, { rows: [r], dates: [FUTURE] }));
    expect(document.querySelector("[data-leave-marker]")?.getAttribute("data-leave-classes")).toBe("1");
    expect(text()).toContain("เอ is away — 1 class(es) to handle");
  });

  it("🔑 a day whose ONLY classes continue has NOTHING to handle: count 0, no 'to handle' claim", () => {
    const r = row(FUTURE, [], [{ bookingId: "c1", startTime: "14:00", with: ["เอ"] }]);
    wrap(h(LeaveDayBanner, { rows: [r], dates: [FUTURE] }));
    expect(document.querySelector("[data-leave-marker]")?.getAttribute("data-leave-classes")).toBe("0");
    expect(text()).not.toContain("to handle");
  });
});

describe("✅ TASK-828 — the four approved strings, verbatim, both languages", () => {
  it("🔒 English and Thai exactly as the owner approved them (REQ-125 ruling B, COPY-REVIEW 2026-10-20)", () => {
    expect([en.coTaughtOwn, en.coTaughtAdmin, en.continuesWith, en.cannotTakeOff]).toEqual([
      "{n} co-taught class(es) go on with the other teachers, without you.",
      "{n} co-taught class(es) will go on with the other teachers; {name} is taken off them.",
      "Continues with {names}",
      "{name} can't be taken off the {time} class: no other teacher of it is free at that time. Please handle this class in the calendar.",
    ]);
    expect([th.coTaughtOwn, th.coTaughtAdmin, th.continuesWith, th.cannotTakeOff]).toEqual([
      "อีก {n} คาบที่สอนร่วมกับครูท่านอื่นจะยังเรียนตามปกติ โดยไม่มีคุณ",
      "คาบที่สอนร่วมกับครูท่านอื่น {n} คาบ จะนำครู {name} ออก และยังเรียนตามปกติ",
      "สอนต่อโดย {names}",
      "ยังนำครู {name} ออกจากคาบ {time} ไม่ได้ เพราะครูท่านอื่นของคาบนี้ไม่ว่างในเวลานั้น — กรุณาจัดการคาบนี้ในปฏิทิน",
    ]);
  });

  it("🔒 marked APPROVED once per language", () => {
    const src = readFileSync("src/lib/i18n/dictionaries.ts", "utf8");
    expect(src.split("APPROVED by the owner 2026-10-20 (REQ-125 ruling B)").length - 1).toBe(1);
    expect(src.split("อนุมัติโดยเจ้าของ 2026-10-20 (REQ-125 ruling B)").length - 1).toBe(1);
  });
});

describe("🔴 TASK-828 — wiring pins", () => {
  const code = (p: string) =>
    readFileSync(p, "utf8")
      .replace(/\r\n/g, "\n")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  const C = "src/components/partials/Calendar/";

  it("🚫 NO count or 'continues' claim is derived from `additionalTeachers` anywhere in the leave screens", () => {
    for (const f of ["Modal/LeaveWillDo.tsx", "Modal/ReportLeaveDialog.tsx", "LeaveClassRow.tsx", "LeaveDayPanel.tsx", "LeaveDayBanner.tsx"]) expect(code(C + f)).not.toContain("additionalTeachers");
  });

  it("🔑 the preview is read in its own component, so the dialog file holds no new data hook (TASK-406's pin)", () => {
    expect(code(C + "Modal/LeaveWillDo.tsx")).toContain("useLeavePreview(");
    expect(code(C + "Modal/ReportLeaveDialog.tsx")).not.toContain("useLeavePreview");
  });

  it("🔑 the strip counts the answer's `bookings` (= what is left to handle) and never adds `continues`", () => {
    expect(code("src/lib/scheduler/teacher-scope.ts")).toContain("classes: (r.bookings ?? []).length");
    expect(code(C + "LeaveDayBanner.tsx")).not.toContain("continues");
  });
});
