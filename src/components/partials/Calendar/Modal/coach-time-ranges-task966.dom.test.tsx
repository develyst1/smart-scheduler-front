import { describe, expect, it, mock, beforeEach, afterEach, setSystemTime } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * 🔴 **TASK-966 (SPEC-108 §3.5 / §4, REQ-5015 AC1 + AC2) — the leave dialog: SEVERAL coaches at once, and a PART-DAY window.**
 *
 * 🔑 What can go wrong without anyone seeing it: a save that goes out for the first coach only (or for all at once, so one refusal races the rest), one coach's refusal that undoes or hides the
 * others, a window that goes out with one end missing or backwards, a window offered on today's leave (where classes are picked), a whole-day leave that suddenly carries times. Every assertion is a request
 * body, a count or a string — never an element (a failed `waitFor` would print the whole DOM).
 */

const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
let inFlight = 0;
let maxInFlight = 0;
let refuse: Record<string, string> = {}; // teacherId → the server's sentence

const CLOCK = "2026-10-12T09:00:00";
const iso = (offset: number) => dayjs(CLOCK).add(offset, "day").format("YYYY-MM-DD");
const TODAY = iso(0);
const FROM = iso(7);
const TO = iso(9);

const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async (url: string, cfg?: { params?: { date?: string } }) => {
      if (url === "/teachers/me/leave") return { data: { teacherId: "me", days: [], counts: { continues: 0, cancel: 0, toHandle: 0, cannot: 0 } } };
      return { data: { days: [{ date: cfg?.params?.date ?? TODAY, columns: [] }] } };
    },
    post: async (url: string, body: Record<string, unknown>) => {
      posts.push({ url, body });
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 15)); // long enough that two calls in parallel would overlap
      inFlight--;
      const sentence = refuse[body.teacherId as string];
      if (sentence) throw new realClient.ApiClientError("TEACHER_LEAVE_REFUSED", sentence, 400);
      return { data: { mode: "advance", cancelled: 0, bookingIds: [], familiesNotified: 0, alreadyRecorded: false, bookings: [], teacherNotified: 1 } };
    },
  },
}));
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => true }));
const realHooks = await import("@/hooks/scheduler");
const TEACHERS = [
  { id: "t-1", name: "ครูหนึ่ง", nickname: "หนึ่ง", active: true },
  { id: "t-2", name: "ครูสอง", nickname: "สอง", active: true },
  { id: "t-3", name: "ครูสาม", nickname: "สาม", active: true },
];
mock.module("@/hooks/scheduler", () => ({ ...realHooks, useTeachers: () => ({ data: TEACHERS }) }));

const ReportLeaveDialog = (await import("./ReportLeaveDialog")).default;

const mount = (initialDate: string, props: { subject?: { id: string; name: string }; pickTeacher?: boolean } = {}) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(ReportLeaveDialog, { opened: true, initialDate, onClose: () => {}, ...props })))) as never);
};
const q = (sel: string) => document.querySelectorAll(sel).length;
const text = () => document.body.textContent ?? "";
const submitBtn = () => document.querySelector("[data-leave-submit]") as HTMLButtonElement;
const leaves = () => posts.filter((r) => r.url === "/teacher-leave-days");
const typeReason = (user: ReturnType<typeof userEvent.setup>) => user.type(document.querySelector("textarea") as HTMLTextAreaElement, "ไปอบรม");
/** Open a Mantine select / multi-select by its data attribute and press the option with exactly this text. */
const pick = async (user: ReturnType<typeof userEvent.setup>, sel: string, label: string) => {
  const input = document.querySelector(sel) as HTMLElement;
  await user.click(input);
  // 🔑 the options of THIS select only (its listbox is named by `aria-controls`): two selects both offer «12:00», and a still-closing list must not be the one pressed
  const options = () => [...(document.getElementById(input.getAttribute("aria-controls") ?? "")?.querySelectorAll('[role="option"]') ?? [])];
  await waitFor(() => expect(options().length).toBeGreaterThan(0));
  await user.click(options().find((o) => o.textContent === label) as HTMLElement);
};

afterEach(cleanup);
beforeEach(() => {
  setSystemTime(new Date(CLOCK));
  posts.length = 0;
  inFlight = 0;
  maxInFlight = 0;
  refuse = {};
});
afterEach(() => setSystemTime());

describe("🔴 TASK-966 AC1 — several coaches, one POST each", () => {
  it("🔑 two coaches picked → TWO posts, one per coach, the SAME body (date + reason), in the order picked; never at the same time", async () => {
    const user = userEvent.setup();
    mount(FROM, { pickTeacher: true });
    await pick(user, "[data-leave-teacher-pick]", "หนึ่ง");
    await pick(user, "[data-leave-teacher-pick]", "สอง");
    await typeReason(user);
    await waitFor(() => expect(submitBtn().disabled).toBe(false));
    expect(submitBtn().textContent).toContain("หนึ่ง, สอง");
    await user.click(submitBtn());
    await waitFor(() => expect(q("[data-leave-multi]")).toBe(1));
    expect(leaves().map((p) => p.body)).toEqual([
      { teacherId: "t-1", date: FROM, reason: "ไปอบรม" },
      { teacherId: "t-2", date: FROM, reason: "ไปอบรม" },
    ]);
    expect(maxInFlight).toBe(1); // sequential: the second call starts after the first has answered
  });

  it("🔑 a result line per coach: «Saved» for each; the «nothing has been cancelled» sentence stays", async () => {
    const user = userEvent.setup();
    mount(FROM, { pickTeacher: true });
    await pick(user, "[data-leave-teacher-pick]", "หนึ่ง");
    await pick(user, "[data-leave-teacher-pick]", "สอง");
    await typeReason(user);
    await user.click(submitBtn());
    await waitFor(() => expect(q("[data-leave-multi-result]")).toBe(2));
    expect([...document.querySelectorAll("[data-leave-multi-result]")].map((e) => `${e.getAttribute("data-leave-multi-result")}:${e.getAttribute("data-leave-multi-ok")}`)).toEqual(["t-1:yes", "t-2:yes"]);
    expect(text()).toContain(dictionaries.en.teacherLeave.multiSaved);
    expect(q("[data-leave-nothing-cancelled]")).toBe(1);
  });

  it("🔑 ONE refusal does not undo or hide the others: the refused coach shows the server's own sentence, the rest are saved, and every coach was still tried", async () => {
    refuse = { "t-2": "ครูสอง มีวันลาวันนี้อยู่แล้ว" };
    const user = userEvent.setup();
    mount(FROM, { pickTeacher: true });
    await pick(user, "[data-leave-teacher-pick]", "หนึ่ง");
    await pick(user, "[data-leave-teacher-pick]", "สอง");
    await pick(user, "[data-leave-teacher-pick]", "สาม");
    await typeReason(user);
    await user.click(submitBtn());
    await waitFor(() => expect(q("[data-leave-multi-result]")).toBe(3));
    expect(leaves().map((p) => p.body.teacherId)).toEqual(["t-1", "t-2", "t-3"]); // the refusal did not stop the third
    expect([...document.querySelectorAll("[data-leave-multi-result]")].map((e) => e.getAttribute("data-leave-multi-ok"))).toEqual(["yes", "no", "yes"]);
    expect(document.querySelector('[data-leave-multi-result="t-2"]')?.textContent).toContain("ครูสอง มีวันลาวันนี้อยู่แล้ว");
    expect(document.querySelector('[data-leave-multi-result="t-1"]')?.textContent).toContain(dictionaries.en.teacherLeave.multiSaved);
    expect(document.querySelector('[data-leave-multi-result="t-3"]')?.textContent).toContain(dictionaries.en.teacherLeave.multiSaved);
  });

  it("🔑 when EVERY coach is refused there is no «nothing has been cancelled» claim — nothing was recorded", async () => {
    refuse = { "t-1": "ไม่ได้", "t-2": "ไม่ได้" };
    const user = userEvent.setup();
    mount(FROM, { pickTeacher: true });
    await pick(user, "[data-leave-teacher-pick]", "หนึ่ง");
    await pick(user, "[data-leave-teacher-pick]", "สอง");
    await typeReason(user);
    await user.click(submitBtn());
    await waitFor(() => expect(q("[data-leave-multi-result]")).toBe(2));
    expect(q("[data-leave-nothing-cancelled]")).toBe(0);
  });

  it("🔑 a range for several coaches: each call carries `from` / `to` (never `date`), once per coach", async () => {
    const user = userEvent.setup();
    mount(FROM, { pickTeacher: true });
    await pick(user, "[data-leave-teacher-pick]", "หนึ่ง");
    await pick(user, "[data-leave-teacher-pick]", "สอง");
    await typeReason(user);
    await user.click(document.querySelector("[data-leave-date-to]") as HTMLElement);
    await user.click(document.querySelector(`button[aria-label="${dayjs(TO).format("D MMMM YYYY")}"]`) as HTMLElement);
    await waitFor(() => expect(submitBtn().textContent).toContain("3"));
    await user.click(submitBtn());
    await waitFor(() => expect(q("[data-leave-multi]")).toBe(1));
    expect(leaves().map((p) => p.body)).toEqual([
      { teacherId: "t-1", from: FROM, to: TO, reason: "ไปอบรม" },
      { teacherId: "t-2", from: FROM, to: TO, reason: "ไปอบรม" },
    ]);
  });

  it("🔑 ONE coach keeps the single-coach screens (no per-coach list), and the same one POST", async () => {
    const user = userEvent.setup();
    mount(FROM, { pickTeacher: true });
    await pick(user, "[data-leave-teacher-pick]", "หนึ่ง");
    await typeReason(user);
    await user.click(submitBtn());
    await waitFor(() => expect(q("[data-leave-advance]")).toBe(1));
    expect(q("[data-leave-multi]")).toBe(0);
    expect(leaves().length).toBe(1);
  });
});

describe("🔴 TASK-966 AC2 — a part-day window", () => {
  const SUBJECT = { id: "t-77", name: "ครูเอ" };

  it("🔑 «All day» is ON by default and shows no time pickers; the whole-day body has NO time keys", async () => {
    const user = userEvent.setup();
    mount(FROM, { subject: SUBJECT });
    await waitFor(() => expect(q("[data-leave-all-day]")).toBe(1));
    expect((document.querySelector("[data-leave-all-day]") as HTMLInputElement).checked).toBe(true);
    expect(q("[data-leave-time-from]")).toBe(0);
    expect(q("[data-leave-time-to]")).toBe(0);
    await typeReason(user);
    await user.click(submitBtn());
    await waitFor(() => expect(leaves().length).toBe(1));
    expect(Object.keys(leaves()[0].body).sort()).toEqual(["date", "reason", "teacherId"]);
  });

  it("🔑 switching «All day» off shows From and To (half hours); Save waits until BOTH are set, then sends `startTime` / `endTime` `HH:MM`", async () => {
    const user = userEvent.setup();
    mount(FROM, { subject: SUBJECT });
    await user.click(document.querySelector("[data-leave-all-day]") as HTMLElement);
    await waitFor(() => expect(q("[data-leave-time-from]")).toBe(1));
    await typeReason(user);
    // nothing chosen yet: the button waits, with the reason in words
    expect(submitBtn().disabled).toBe(true);
    expect(document.querySelector("[data-leave-time-issue]")?.getAttribute("data-leave-time-issue")).toBe("partial");
    expect(text()).toContain(dictionaries.en.teacherLeave.timePartial);
    await pick(user, "[data-leave-time-from]", "10:00");
    expect(submitBtn().disabled).toBe(true); // one end only
    await pick(user, "[data-leave-time-to]", "12:00");
    await waitFor(() => expect(submitBtn().disabled).toBe(false));
    expect(q("[data-leave-time-issue]")).toBe(0);
    await user.click(submitBtn());
    await waitFor(() => expect(leaves().length).toBe(1));
    expect(leaves()[0].body).toEqual({ teacherId: "t-77", date: FROM, reason: "ไปอบรม", startTime: "10:00", endTime: "12:00" });
  });

  it("🔑 From not before To is refused on the screen, in words, and nothing is sent", async () => {
    const user = userEvent.setup();
    mount(FROM, { subject: SUBJECT });
    await user.click(document.querySelector("[data-leave-all-day]") as HTMLElement);
    await typeReason(user);
    await pick(user, "[data-leave-time-from]", "12:00");
    await pick(user, "[data-leave-time-to]", "10:00");
    await waitFor(() => expect(document.querySelector("[data-leave-time-issue]")?.getAttribute("data-leave-time-issue")).toBe("order"));
    expect(text()).toContain(dictionaries.en.teacherLeave.timeOrder);
    expect(submitBtn().disabled).toBe(true);
    await user.click(submitBtn());
    expect(leaves().length).toBe(0);
  });

  it("🔑 a RANGE with a window carries the same `startTime` / `endTime` with `from` / `to`", async () => {
    const user = userEvent.setup();
    mount(FROM, { subject: SUBJECT });
    await user.click(document.querySelector("[data-leave-all-day]") as HTMLElement);
    await pick(user, "[data-leave-time-from]", "13:30");
    await pick(user, "[data-leave-time-to]", "17:00");
    await user.click(document.querySelector("[data-leave-date-to]") as HTMLElement);
    await user.click(document.querySelector(`button[aria-label="${dayjs(TO).format("D MMMM YYYY")}"]`) as HTMLElement);
    await typeReason(user);
    await waitFor(() => expect(submitBtn().disabled).toBe(false));
    await user.click(submitBtn());
    await waitFor(() => expect(leaves().length).toBe(1));
    expect(leaves()[0].body).toEqual({ teacherId: "t-77", from: FROM, to: TO, reason: "ไปอบรม", startTime: "13:30", endTime: "17:00" });
  });

  it("🔑 when a window was chosen and the date then moves to today, nothing is offered and no time is sent (today's leave picks classes)", async () => {
    const user = userEvent.setup();
    mount(FROM, { subject: SUBJECT });
    await user.click(document.querySelector("[data-leave-all-day]") as HTMLElement);
    await pick(user, "[data-leave-time-from]", "10:00");
    await pick(user, "[data-leave-time-to]", "12:00");
    await user.click(document.querySelector("[data-leave-date-from]") as HTMLElement);
    await user.click(document.querySelector(`button[aria-label="${dayjs(TODAY).format("D MMMM YYYY")}"]`) as HTMLElement);
    await waitFor(() => expect(q("[data-leave-admin-refused]")).toBe(1));
    expect(q("[data-leave-window]")).toBe(0);
    expect(submitBtn().disabled).toBe(true); // the admin door refuses today (unchanged)
  });

  it("🔑 today's leave never offers a window (the admin's today screen, and the teacher's own door)", async () => {
    mount(TODAY, { subject: SUBJECT });
    await waitFor(() => expect(q("[data-leave-admin-refused]")).toBe(1));
    expect(q("[data-leave-window]")).toBe(0);
    cleanup();
    mount(FROM); // the teacher's OWN door (no subject, no picker) on a future date
    await waitFor(() => expect(q("[data-leave-advance-notice]")).toBe(1));
    expect(q("[data-leave-window]")).toBe(0);
  });
});

describe("✅ TASK-966 — the new words exist in both languages", () => {
  it("🔑 seven keys, TH and EN, none empty", () => {
    for (const k of ["allDay", "timeFrom", "timeTo", "timePartial", "timeOrder", "multiResultsTitle", "multiSaved"] as const) {
      expect(dictionaries.en.teacherLeave[k].length).toBeGreaterThan(2);
      expect(dictionaries.th.teacherLeave[k].length).toBeGreaterThan(2);
    }
    expect(dictionaries.th.teacherLeave.allDay).toBe("ทั้งวัน");
    expect(dictionaries.th.teacherLeave.multiSaved).toBe("บันทึกแล้ว");
  });
});
