import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { readFileSync } from "node:fs";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import { I18nProvider } from "@/lib/i18n";

/**
 * 🔴 **TASK-829 (REQ-125 K1) — after a teacher's own SAME-DAY leave: show what happened.** TEST-111: a class the leave could not hand over (D4) was left as it is and surfaced to nobody, because the
 * dialog only toasted and closed. 🔑 The wrong results here are silent: a left-as-is class that is NOT shown, a continuing class counted as cancelled, a sole-teacher day that changes from today's
 * toast + close, a result built from the preview instead of the act's answer. Every assertion is a request, a count or a string — never an element.
 */

const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
const toasts: string[] = [];
let closed = 0;
let answer: unknown = null;

const TODAY = dayjs().format("YYYY-MM-DD");
const calendarFor = (date: string) => ({
  days: [
    {
      date,
      columns: [
        {
          teacherId: "me",
          slots: [
            ["m1", "10:00", "น้องหนึ่ง"],
            ["m2", "11:00", "ค่ายฤดูร้อน"],
            ["m3", "12:00", "ECA เสาร์"],
          ].map(([id, hh, name]) => ({
            startTime: `${hh}:00`,
            booking: {
              id,
              date,
              startTime: `${hh}:00`,
              endTime: `${hh}:45:00`,
              status: "CONFIRMED",
              displayName: name,
              bookingType: "COURSE_PACKAGE",
              teacher: { id: "me", name: "ฉัน", nickname: "ฉัน" },
              additionalTeachers: [],
              student: { id: `s-${id}`, name, nickname: null },
            },
          })),
        },
      ],
    },
  ],
});

const realNotify = await import("@/lib/ui/notify");
mock.module("@/lib/ui/notify", () => ({ ...realNotify, notify: (o: { title: string }) => void toasts.push(o.title) }));
const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async (url: string, cfg?: { params?: { date?: string } }) => {
      if (url === "/teachers/me/leave") throw new Error("no preview in this test");
      return { data: calendarFor(cfg?.params?.date ?? TODAY) };
    },
    post: async (url: string, body: Record<string, unknown>) => {
      posts.push({ url, body });
      return { data: answer };
    },
  },
}));
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => true }));

const ReportLeaveDialog = (await import("./ReportLeaveDialog")).default;

const wrap = (lang: "en" | "th" = "en") => {
  window.localStorage.setItem("t829-lang", lang);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, { storageKey: "t829-lang" }, h(ReportLeaveDialog, { opened: true, initialDate: TODAY, onClose: () => void closed++ })))) as never,
  );
};
const q = (sel: string) => document.querySelectorAll(sel).length;
const text = () => document.body.textContent ?? "";
const save = async () => {
  const user = userEvent.setup();
  await waitFor(() => expect(q('input[type="checkbox"]')).toBeGreaterThan(0)); // the day's classes are loaded (the own door)
  await user.type(document.querySelector("textarea") as HTMLTextAreaElement, "ไม่สบาย");
  await user.click(document.querySelector("[data-leave-submit]") as HTMLElement);
};
const D4 = (time: string) => `ฉัน can't be taken off the ${time} class: no other teacher of it is free at that time. Please handle this class in the calendar.`;

afterEach(cleanup);
beforeEach(() => {
  posts.length = 0;
  toasts.length = 0;
  closed = 0;
  answer = null;
});

describe("🔴 TASK-829 — the three outcomes, from the act's ANSWER", () => {
  const co = () => ({
    cancelled: 1,
    bookingIds: ["m1"],
    familiesNotified: 2,
    continues: [{ bookingId: "m3", startTime: "12:00", with: ["เอ", "บี"], promotedTo: "เอ" }],
    toHandle: [{ bookingId: "m2", startTime: "11:00", reason: "no-eligible-main" }],
  });

  it("🔑 cancelled · continues · LEFT AS IT IS are all on screen, the dialog stays open, and no toast replaces them", async () => {
    answer = co();
    wrap();
    await save();
    await waitFor(() => expect(q("[data-leave-same-day]")).toBe(1));
    expect(text()).toContain("1 sessions cancelled · 2 families told"); // the approved headline: counts ONLY the really-cancelled class
    expect(document.querySelector("[data-leave-same-day-cancelled]")?.textContent).toContain("น้องหนึ่ง"); // m1, by its row
    expect(text()).toContain("Continues with เอ, บี"); // m3
    expect(document.querySelector("[data-leave-same-day-left] [data-leave-d4]")?.textContent).toBe(D4("11:00")); // m2, the approved D4 sentence, the teacher's own name
    expect(closed).toBe(0);
    expect(toasts).toEqual([]);
  });

  it("🔑 the left-as-is class is NEVER among the cancelled, and the continuing one is not either", async () => {
    answer = co();
    wrap();
    await save();
    await waitFor(() => expect(q("[data-leave-same-day]")).toBe(1));
    const cancelled = document.querySelector("[data-leave-same-day-cancelled]")?.textContent ?? "";
    expect(cancelled).not.toContain("ค่ายฤดูร้อน"); // m2 (D4)
    expect(cancelled).not.toContain("ECA เสาร์"); // m3 (continues)
    expect(q("[data-leave-same-day-cancelled]")).toBe(1);
  });

  it("🔑 ONLY a left-as-is class (nothing cancelled, nothing continuing): the result is still shown, with the D4 sentence — the very case TEST-111 found hidden", async () => {
    answer = { cancelled: 0, bookingIds: [], familiesNotified: 0, toHandle: [{ bookingId: "m2", startTime: "11:00", reason: "no-eligible-main" }] };
    wrap();
    await save();
    await waitFor(() => expect(q("[data-leave-same-day]")).toBe(1));
    expect(text()).toContain("0 sessions cancelled · 0 families told");
    expect(document.querySelector("[data-leave-d4]")?.textContent).toBe(D4("11:00"));
    expect(q("[data-leave-same-day-cancelled]")).toBe(0);
    expect(toasts).toEqual([]);
  });

  it("🔑 ONLY continuing classes: shown with the tag, nothing cancelled, no D4", async () => {
    answer = { cancelled: 0, bookingIds: [], familiesNotified: 0, continues: [{ bookingId: "m3", startTime: "12:00", with: ["เอ"], promotedTo: null }] };
    wrap();
    await save();
    await waitFor(() => expect(q("[data-leave-same-day]")).toBe(1));
    expect(text()).toContain("Continues with เอ");
    expect(q("[data-leave-d4]")).toBe(0);
  });

  it("🔑 in Thai: the approved headline, tag and D4 sentence", async () => {
    answer = co();
    wrap("th");
    await save();
    await waitFor(() => expect(q("[data-leave-same-day]")).toBe(1));
    expect(text()).toContain("สอนต่อโดย เอ, บี");
    expect(document.querySelector("[data-leave-d4]")?.textContent).toBe("ยังนำครู ฉัน ออกจากคาบ 11:00 ไม่ได้ เพราะครูท่านอื่นของคาบนี้ไม่ว่างในเวลานั้น — กรุณาจัดการคาบนี้ในปฏิทิน");
  });

  it("🚫 a left-as-is class that is not among the rows we hold names no one: its time only, never a guessed name", async () => {
    answer = { cancelled: 0, bookingIds: [], familiesNotified: 0, toHandle: [{ bookingId: "ghost", startTime: "15:00", reason: "no-eligible-main" }] };
    wrap();
    await save();
    await waitFor(() => expect(q("[data-leave-d4]")).toBe(1));
    expect(document.querySelector("[data-leave-d4]")?.textContent).toBe("15:00");
  });

  it("🔑 Close closes the dialog (it does not close by itself)", async () => {
    answer = co();
    wrap();
    await save();
    await waitFor(() => expect(q("[data-leave-same-day]")).toBe(1));
    expect(closed).toBe(0);
    await userEvent.setup().click([...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Close") as HTMLElement);
    expect(closed).toBe(1);
  });
});

describe("🔴 TASK-829 — \"an admin has been told\": said only when the back says an admin WAS alerted (adminsAlerted > 0)", () => {
  const left = (extra: Record<string, unknown>) => ({ cancelled: 0, bookingIds: [], familiesNotified: 0, toHandle: [{ bookingId: "m2", startTime: "11:00", reason: "no-eligible-main" }], ...extra });

  it("🔑 adminsAlerted 2 ⇒ the line is shown, in English and in Thai — the APPROVED words, verbatim", async () => {
    answer = left({ adminsAlerted: 2 });
    wrap();
    await save();
    await waitFor(() => expect(q("[data-leave-admin-told]")).toBe(1));
    expect(document.querySelector("[data-leave-admin-told]")?.textContent).toBe("The admins have been told about the class(es) left as they are.");
    cleanup();
    wrap("th");
    await save();
    await waitFor(() => expect(q("[data-leave-admin-told]")).toBe(1));
    expect(document.querySelector("[data-leave-admin-told]")?.textContent).toBe("แจ้งแอดมินแล้วเรื่องคาบที่ยังไม่มีครูรับแทน");
  });

  it("🔑 adminsAlerted 0 ⇒ NO line (nobody was told — e.g. no linked admin): the D4 sentence still shows, the claim does not", async () => {
    answer = left({ adminsAlerted: 0 });
    wrap();
    await save();
    await waitFor(() => expect(q("[data-leave-d4]")).toBe(1));
    expect(q("[data-leave-admin-told]")).toBe(0);
  });

  it("🔑 adminsAlerted ABSENT (a back that does not send it) ⇒ NO line — never inferred from toHandle", async () => {
    answer = left({});
    wrap();
    await save();
    await waitFor(() => expect(q("[data-leave-d4]")).toBe(1));
    expect(q("[data-leave-admin-told]")).toBe(0);
  });

  it("🔒 the key is the APPROVED text in both languages (no «copy pending» left) and marked APPROVED once per language", async () => {
    const { dictionaries } = await import("@/lib/i18n/dictionaries");
    expect(dictionaries.en.leaveDays.adminToldLeftAsIs).toBe("The admins have been told about the class(es) left as they are.");
    expect(dictionaries.th.leaveDays.adminToldLeftAsIs).toBe("แจ้งแอดมินแล้วเรื่องคาบที่ยังไม่มีครูรับแทน");
    const src = readFileSync("src/lib/i18n/dictionaries.ts", "utf8");
    expect(src.split("APPROVED by the owner 2026-10-21 (REQ-125 K1, TASK-829)").length - 1).toBe(1);
    expect(src.split("อนุมัติโดยเจ้าของ 2026-10-21 (REQ-125 K1, TASK-829)").length - 1).toBe(1);
    expect(src).not.toContain("«copy pending»");
  });
});

describe("🔴 TASK-829 — a SOLE-teacher day looks exactly as TODAY: a toast, and the dialog closes", () => {
  it("🔑 an answer with no `continues` / `toHandle`: the old approved toast, onClose, and NO result view", async () => {
    answer = { cancelled: 2, bookingIds: ["m1", "m2"], familiesNotified: 3 };
    wrap();
    await save();
    await waitFor(() => expect(closed).toBe(1));
    expect(toasts).toEqual(["2 sessions cancelled · 3 families told"]);
    expect(q("[data-leave-same-day]")).toBe(0);
  });

  it("🔑 empty `continues` / `toHandle` arrays are the same as absent (nothing co-taught was involved)", async () => {
    answer = { cancelled: 1, bookingIds: ["m1"], familiesNotified: 1, continues: [], toHandle: [] };
    wrap();
    await save();
    await waitFor(() => expect(closed).toBe(1));
    expect(q("[data-leave-same-day]")).toBe(0);
  });

  it("🔑 the request itself is unchanged by all of this: the teacher's own route, the day, the ticks' ids, the reason", async () => {
    answer = { cancelled: 1, bookingIds: ["m1"], familiesNotified: 1 };
    wrap();
    await save();
    await waitFor(() => expect(posts.length).toBe(1));
    expect(posts[0].url).toBe("/teachers/me/leave");
    expect(posts[0].body.date).toBe(TODAY);
    expect(posts[0].body.reason).toBe("ไม่สบาย");
  });
});

describe("🔴 TASK-829 — wiring pins", () => {
  const code = (p: string) =>
    readFileSync(p, "utf8")
      .replace(/\r\n/g, "\n")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  const C = "src/components/partials/Calendar/Modal/";

  it("🔑 the dialog shows the result ONLY when the answer carries the split keys, and never from the preview", () => {
    const d = code(C + "ReportLeaveDialog.tsx");
    expect(d).toContain("if (!isAdvanceResult(res) && ((res.continues?.length ?? 0) > 0 || (res.toHandle?.length ?? 0) > 0)) {");
    expect(code(C + "LeaveSameDayResult.tsx")).not.toContain("useLeavePreview");
  });

  it("🔑 the sole-teacher path keeps the approved toast line verbatim", () => {
    expect(code(C + "ReportLeaveDialog.tsx")).toContain('t("teacherLeave.done", { n: res.cancelled, families: res.familiesNotified })');
  });

  it("🚫 the result counts nothing from the rows: the headline is the answer's own numbers", () => {
    const r = code(C + "LeaveSameDayResult.tsx");
    expect(r).toContain('t("teacherLeave.done", { n: res.cancelled, families: res.familiesNotified })');
    expect(r).not.toContain("additionalTeachers");
  });
});
