import { describe, expect, it, mock, beforeEach, afterEach, setSystemTime } from "bun:test";
import { createElement as h } from "react";
import { readFileSync } from "node:fs";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import type { LeaveDayClass } from "@/types/api/contract";

/**
 * 🔴 **TASK-822 (TEST-108, REQ-123) — F1: the range's refusals reach the user, client-side first · F2: the record result names the child, the program and opens the class.**
 *
 * 🔑 **F1, what Tanya saw on sid:** 32 days gave the generic «ข้อมูลที่กรอกไม่ถูกต้อง…», the approved Thai sat only in the error `details`, English never showed, and the form did
 * not refuse first. So every assertion is about the REQUEST (none goes out for a refused range; the boundary 31 does go out) and about WHICH sentence is on screen, in BOTH languages.
 * 🔑 **F2:** the result rows are the panel's own row — child (DUO: both), program or title, status, and "Open" that reads THAT class's day. 📌 Helpers answer numbers, booleans or strings.
 */

const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
const gets: Array<{ url: string; params?: Record<string, unknown> }> = [];
let answer: unknown = null;
let postFails: (() => unknown) | null = null;

// 🔻 Clock fix (2026-10-25): "today + n" from the REAL clock broke whenever +7 days crossed a month end. The clock is pinned to a fixed mid-month day in `beforeEach`;
// every date below and the page's own "today" are then the same on any run day. Each test's point is unchanged.
const CLOCK = "2026-10-12T09:00:00";
const iso = (n: number) => dayjs(CLOCK).add(n, "day").format("YYYY-MM-DD");
const FROM = iso(7);

const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async (url: string, cfg?: { params?: Record<string, unknown> }) => {
      gets.push({ url, params: cfg?.params });
      return { data: { days: [] } }; // a day with nothing in it: "Open" finds no class and draws nothing
    },
    post: async (url: string, body: Record<string, unknown>) => {
      posts.push({ url, body });
      if (postFails) throw postFails();
      return { data: answer };
    },
  },
}));
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => true }));

const { ApiClientError } = realClient;
const ReportLeaveDialog = (await import("./ReportLeaveDialog")).default;
const { leaveRangeIssue, rangeIssueFromError, MAX_LEAVE_RANGE_DAYS } = await import("./leave-range");

const SUBJECT = { id: "t-77", name: "ครูเอ" };
const en = dictionaries.en.teacherLeave;
const th = dictionaries.th.teacherLeave;
const EN_BEFORE = "The end date can't be before the start date";
const EN_LONG = "A leave can cover at most 31 days at a time";
const TH_BEFORE = "วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม";
const TH_LONG = "ลาล่วงหน้าได้ไม่เกิน 31 วันต่อครั้ง";
const GENERIC = "ข้อมูลที่กรอกไม่ถูกต้อง";

const wrap = (el: ReturnType<typeof h>, lang: "en" | "th" = "en") => {
  window.localStorage.setItem("t822-lang", lang);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, { storageKey: "t822-lang" }, el))) as never);
};
const mount = (props: { subject?: { id: string; name: string } } = { subject: SUBJECT }, lang: "en" | "th" = "en", initial = FROM) =>
  wrap(h(ReportLeaveDialog, { opened: true, initialDate: initial, onClose: () => {}, ...props }), lang);
const q = (sel: string) => document.querySelectorAll(sel).length;
const text = () => document.body.textContent ?? "";
const submitBtn = () => document.querySelector("[data-leave-submit]") as HTMLButtonElement;
const leaves = () => posts.filter((r) => r.url === "/teacher-leave-days");
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

afterEach(() => {
  cleanup();
  setSystemTime(); // the real clock is back for every other file
});
beforeEach(() => {
  setSystemTime(new Date(CLOCK)); // 🔑 the page's own "today" is the same fixed day as the dates below
  posts.length = 0;
  gets.length = 0;
  postFails = null;
  answer = { mode: "advance", cancelled: 0, bookingIds: [], familiesNotified: 0, teacherNotified: 1, leave: { date: FROM, reason: "ไปอบรม" }, alreadyRecorded: false, bookings: [] };
});

describe("🔴 TASK-822 F1 — the pure rule (the server's own: inclusive days, > 31)", () => {
  it("🔑 31 days is allowed, 32 is not (inclusive count — the off-by-one that matters); equal dates are one day; empty is nothing", () => {
    expect(MAX_LEAVE_RANGE_DAYS).toBe(31);
    expect(leaveRangeIssue(FROM, iso(37))).toBeNull(); // 7 … 37 = 31 days
    expect(leaveRangeIssue(FROM, iso(38))).toBe("teacherLeave.rangeTooLong"); // 32 days
    expect(leaveRangeIssue(FROM, iso(7))).toBeNull();
    expect(leaveRangeIssue(FROM, iso(6))).toBe("teacherLeave.rangeEndBeforeStart");
    expect(leaveRangeIssue("", iso(9))).toBeNull();
    expect(leaveRangeIssue(FROM, "")).toBeNull();
  });

  it("🔑 the backstop reads the issue from the server's `details` (the `to` field, the server's own Thai sentence) — and from nothing else", () => {
    const err = (code: string, details: unknown) => new ApiClientError(code, GENERIC, 400, details);
    expect(rangeIssueFromError(err("VALIDATION", [{ path: ["to"], message: TH_LONG }]))).toBe("teacherLeave.rangeTooLong");
    expect(rangeIssueFromError(err("VALIDATION", [{ path: ["reason"], message: "x" }, { path: ["to"], message: TH_BEFORE }]))).toBe("teacherLeave.rangeEndBeforeStart");
    expect(rangeIssueFromError(err("VALIDATION", [{ path: ["to"], message: "something else" }]))).toBeNull();
    expect(rangeIssueFromError(err("VALIDATION", [{ path: ["reason"], message: TH_LONG }]))).toBeNull(); // the sentence on another field is not the range's
    expect(rangeIssueFromError(err("OTHER", [{ path: ["to"], message: TH_LONG }]))).toBeNull();
    expect(rangeIssueFromError(err("VALIDATION", undefined))).toBeNull();
    expect(rangeIssueFromError(new Error("x"))).toBeNull();
    expect(rangeIssueFromError(null)).toBeNull();
  });

  it("🔒 the two refusals are the APPROVED words, both languages, verbatim", () => {
    expect([en.rangeEndBeforeStart, en.rangeTooLong]).toEqual([EN_BEFORE, EN_LONG]);
    expect([th.rangeEndBeforeStart, th.rangeTooLong]).toEqual([TH_BEFORE, TH_LONG]);
  });
});

describe("🔴 TASK-822 F1 — the dialog refuses FIRST", () => {
  it("🔑 32 days: the approved ENGLISH sentence is on screen, the button waits, and NOTHING is sent", async () => {
    const user = userEvent.setup();
    mount();
    await pickDay(user, "to", iso(38));
    await waitFor(() => expect(q('[data-leave-range-refused="teacherLeave.rangeTooLong"]')).toBe(1));
    expect(text()).toContain(EN_LONG);
    expect(text()).not.toContain(GENERIC);
    await typeReason(user);
    expect(submitBtn().disabled).toBe(true);
    await user.click(submitBtn());
    expect(leaves().length).toBe(0);
  });

  it("🔑 32 days in THAI: the approved Thai sentence — and no English", async () => {
    const user = userEvent.setup();
    mount({ subject: SUBJECT }, "th");
    await pickDay(user, "to", iso(38));
    await waitFor(() => expect(q('[data-leave-range-refused="teacherLeave.rangeTooLong"]')).toBe(1));
    expect(text()).toContain(TH_LONG);
    expect(text()).not.toContain(EN_LONG);
  });

  it("🔑 exactly 31 days is NOT refused: no sentence, the button works, and the request goes out as a range", async () => {
    const user = userEvent.setup();
    mount();
    await pickDay(user, "to", iso(37));
    await typeReason(user);
    expect(q("[data-leave-range-refused]")).toBe(0);
    expect(submitBtn().disabled).toBe(false);
    await user.click(submitBtn());
    await waitFor(() => expect(leaves().length).toBe(1));
    expect([leaves()[0].body.from, leaves()[0].body.to]).toEqual([FROM, iso(37)]);
  });

  it("🔑 an end BEFORE the start (the start moved past the end): the approved sentence, English then Thai, the button waits, nothing is sent", async () => {
    const user = userEvent.setup();
    mount();
    await pickDay(user, "to", iso(9));
    await pickDay(user, "from", iso(12)); // the end (iso 9) is now before the start
    await waitFor(() => expect(q('[data-leave-range-refused="teacherLeave.rangeEndBeforeStart"]')).toBe(1));
    expect(text()).toContain(EN_BEFORE);
    await typeReason(user);
    expect(submitBtn().disabled).toBe(true);
    await user.click(submitBtn());
    expect(leaves().length).toBe(0);
    cleanup();
    const user2 = userEvent.setup();
    mount({ subject: SUBJECT }, "th");
    await pickDay(user2, "to", iso(9));
    await pickDay(user2, "from", iso(12));
    await waitFor(() => expect(q('[data-leave-range-refused="teacherLeave.rangeEndBeforeStart"]')).toBe(1));
    expect(text()).toContain(TH_BEFORE);
  });

  it("🔑 moving the start BACK under the end clears the refusal (nothing was dropped silently, so nothing needs re-entering)", async () => {
    const user = userEvent.setup();
    mount();
    await pickDay(user, "to", iso(9));
    await pickDay(user, "from", iso(12));
    await waitFor(() => expect(q("[data-leave-range-refused]")).toBe(1));
    await pickDay(user, "from", iso(8));
    await waitFor(() => expect(q("[data-leave-range-refused]")).toBe(0));
    expect(document.body.textContent).toContain("Block these 2 days");
  });

  it("🚫 the teacher's OWN door has no end date, so no range refusal can ever show there", () => {
    mount({});
    expect(q("[data-leave-date-to]")).toBe(0);
    expect(q("[data-leave-range-refused]")).toBe(0);
  });
});

describe("🔴 TASK-822 F1 — the BACKSTOP: the server still refuses", () => {
  const refuse = (message: string) => () => new ApiClientError("VALIDATION", GENERIC, 400, [{ path: ["to"], message }]);

  it("🔑 a server `VALIDATION` carrying the range sentence in `details` shows the approved text in the CURRENT language — never the generic line (English)", async () => {
    postFails = refuse(TH_LONG);
    const user = userEvent.setup();
    mount();
    await pickDay(user, "to", iso(9)); // a range the client accepts
    await typeReason(user);
    await user.click(submitBtn());
    await waitFor(() => expect(text()).toContain(EN_LONG));
    expect(text()).not.toContain(GENERIC);
    expect(text()).not.toContain(TH_LONG);
  });

  it("🔑 …and in Thai, the same approved sentence, not the generic one", async () => {
    postFails = refuse(TH_BEFORE);
    const user = userEvent.setup();
    mount({ subject: SUBJECT }, "th");
    await pickDay(user, "to", iso(9));
    await typeReason(user);
    await user.click(submitBtn());
    await waitFor(() => expect(text()).toContain(TH_BEFORE));
    expect(text()).not.toContain(GENERIC);
  });

  it("🚫 a `VALIDATION` that is NOT the range's keeps the server's own message (nothing is rewritten that we cannot name)", async () => {
    postFails = () => new ApiClientError("VALIDATION", "ข้อความอื่นของเซิร์ฟเวอร์", 400, [{ path: ["reason"], message: "too short" }]);
    const user = userEvent.setup();
    mount();
    await pickDay(user, "to", iso(9));
    await typeReason(user);
    await user.click(submitBtn());
    await waitFor(() => expect(text()).toContain("ข้อความอื่นของเซิร์ฟเวอร์"));
    expect(text()).not.toContain(EN_LONG);
  });
});

const cls = (id: string, date: string, extra: Partial<LeaveDayClass> = {}): LeaveDayClass => ({
  id,
  date,
  startTime: "09:00:00",
  endTime: "09:45:00",
  status: "CONFIRMED",
  bookingType: "COURSE_PACKAGE",
  childName: "น้องมิว",
  childNickname: "มิว",
  coChildName: null,
  coChildNickname: null,
  program: "เปียโน",
  title: null,
  inCourse: true,
  ...extra,
});
const DUO = cls("c2", FROM, { startTime: "10:00:00", endTime: "10:45:00", childNickname: "บอส", childName: "น้องบอส", coChildNickname: "แพร", coChildName: "น้องแพร", program: "DUO เปียโน", status: "PENDING" });

describe("🔴 TASK-822 F2 — the record result names the child and the program, and opens the class", () => {
  it("🔑 ONE day (admin): child, DUO co-child, program / title, status — and an Open on each row", async () => {
    answer = { mode: "advance", cancelled: 0, bookingIds: [], familiesNotified: 0, teacherNotified: 1, leave: { date: FROM, reason: "x" }, alreadyRecorded: false, bookings: [cls("c1", FROM), DUO, cls("c3", FROM, { program: null, title: "ค่ายฤดูร้อน" })] };
    const user = userEvent.setup();
    mount();
    await typeReason(user);
    await user.click(submitBtn());
    await waitFor(() => expect(q("[data-leave-panel-class]")).toBe(3));
    expect(text()).toContain("มิว · เปียโน");
    expect(text()).toContain("บอส + แพร · DUO เปียโน");
    expect(text()).toContain("ค่ายฤดูร้อน");
    expect(text()).toContain("Confirmed");
    expect(text()).toContain("Pending");
    expect(q("[data-leave-class-open]")).toBe(3);
  });

  it("🔑 a RANGE: every day's rows carry the same detail and the same Open", async () => {
    answer = {
      mode: "advance-range",
      rangeId: "r-1",
      from: FROM,
      to: iso(8),
      recordedDays: 2,
      alreadyRecordedDays: 0,
      cancelled: 0,
      bookingIds: [],
      familiesNotified: 0,
      teacherNotified: 1,
      days: [
        { date: FROM, alreadyRecorded: false, bookings: [cls("c1", FROM), DUO] },
        { date: iso(8), alreadyRecorded: false, bookings: [cls("c4", iso(8), { childNickname: "ฟ้า", childName: "น้องฟ้า", program: "กีตาร์" })] },
      ],
    };
    const user = userEvent.setup();
    mount();
    await pickDay(user, "to", iso(8));
    await typeReason(user);
    await user.click(submitBtn());
    await waitFor(() => expect(q("[data-leave-range]")).toBe(1));
    expect(q("[data-leave-panel-class]")).toBe(3);
    expect(text()).toContain("ฟ้า · กีตาร์");
    expect(text()).toContain("บอส + แพร · DUO เปียโน");
    expect(q("[data-leave-class-open]")).toBe(3);
  });

  it("🔑 `Open` reads THAT class's DAY (the booking modal's own source) and sends nothing", async () => {
    answer = { mode: "advance", cancelled: 0, bookingIds: [], familiesNotified: 0, teacherNotified: 1, leave: { date: FROM, reason: "x" }, alreadyRecorded: false, bookings: [cls("c1", iso(7))] };
    const user = userEvent.setup();
    mount();
    await typeReason(user);
    await user.click(submitBtn());
    await waitFor(() => expect(q('[data-leave-class-open="c1"]')).toBe(1));
    posts.length = 0;
    gets.length = 0;
    await user.click(document.querySelector('[data-leave-class-open="c1"]') as HTMLElement);
    await waitFor(() => expect(gets.some((g) => g.url === "/calendar" && g.params?.date === iso(7))).toBe(true));
    expect(posts).toEqual([]);
  });

  it("🔑 the TEACHER's own door: the rows show the detail but carry NO Open (a teacher is not handed the admin's booking modal)", async () => {
    answer = { mode: "advance", cancelled: 0, bookingIds: [], familiesNotified: 0, leave: { date: FROM, reason: "x" }, alreadyRecorded: false, bookings: [cls("c1", FROM)] };
    const user = userEvent.setup();
    mount({});
    await typeReason(user);
    await user.click(submitBtn());
    await waitFor(() => expect(q("[data-leave-panel-class]")).toBe(1));
    expect(text()).toContain("มิว · เปียโน");
    expect(q("[data-leave-class-open]")).toBe(0);
  });

  it("🔑 the old time-only line is gone: the time is still there, now inside the row", async () => {
    answer = { mode: "advance", cancelled: 0, bookingIds: [], familiesNotified: 0, teacherNotified: 1, leave: { date: FROM, reason: "x" }, alreadyRecorded: false, bookings: [cls("c1", FROM)] };
    const user = userEvent.setup();
    mount();
    await typeReason(user);
    await user.click(submitBtn());
    await waitFor(() => expect(q("[data-leave-panel-class]")).toBe(1));
    expect(text()).toContain("09:00 – 09:45");
  });
});

describe("🔴 TASK-822 — wiring pins", () => {
  const code = (p: string) =>
    readFileSync(p, "utf8")
      .replace(/\r\n/g, "\n")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  const C = "src/components/partials/Calendar/";

  it("🔑 the dialog and the panel share ONE row component, and the dialog hands Open to the same opener the panel uses", () => {
    expect(code(C + "Modal/ReportLeaveDialog.tsx")).toContain("<LeaveClassRow");
    expect(code(C + "LeaveDayPanel.tsx")).toContain("<LeaveClassRow");
    expect(code(C + "Modal/ReportLeaveDialog.tsx")).toContain("<LeaveClassOpener classId={openClass.id} date={openClass.date}");
  });

  it("🔑 the backstop is INSIDE the dialog: the shared client is untouched, and the dialog asks the helper before it falls back to the server's message", () => {
    const d = code(C + "Modal/ReportLeaveDialog.tsx");
    expect(d.indexOf("rangeIssueFromError(e)")).toBeGreaterThan(0);
    expect(d.indexOf("rangeIssueFromError(e)")).toBeLessThan(d.indexOf("e.message"));
    expect(code("src/lib/api/client.ts")).not.toContain("teacherLeave");
  });

  it("🔑 the dialog's own submit also checks the refusal (a pressed-anyway button sends nothing)", () => {
    expect(code(C + "Modal/ReportLeaveDialog.tsx")).toContain("if (noDate || choosing || rangeIssue) return;");
  });

  it("🔒 the two approved refusal keys carry the APPROVED marker in both languages, once each", () => {
    const src = readFileSync("src/lib/i18n/dictionaries.ts", "utf8");
    expect(src.split("APPROVED by the owner 2026-10-17 (REQ-123 Phase 1, TASK-817)").length - 1).toBe(1);
    expect(src.split("อนุมัติโดยเจ้าของ 2026-10-17 (REQ-123 Phase 1, TASK-817)").length - 1).toBe(1);
  });
});
