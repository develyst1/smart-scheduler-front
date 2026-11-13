import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { SessionProvider } from "next-auth/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * 🔴 **TASK-972 (REQ-5016, SPEC-109 § 3.4) — «เปลี่ยนตารางเรียนรายสัปดาห์»: the untaught rest of a course is re-placed onto a new weekly pattern.**
 *
 * 🔑 What can go wrong without anyone seeing it: **a preview that loops** (D-157-1: an answer that feeds the next request — the old tests passed against a loop, so these count the calls over time),
 * a dialog opened on the PLAN'S FIRST ROW's pattern instead of the course's own (D-157-2), a confirm pressed before the server answered for THESE inputs, an invalid pattern sent anyway, and a refusal swallowed.
 */

const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
let previewAnswer: Record<string, unknown> = {};
let actFails: { code: string; message: string; status: number } | null = null;
let previewFails: { code: string; message: string; status: number } | null = null;
let closes = 0;
let dones = 0;

class TestApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  ApiClientError: TestApiError,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async (url: string) => {
      if (url === "/me") return { data: { user: { id: "u1", username: "a", displayName: "A", isSuperAdmin: false, menus: ["menu:bookings"], actions: [], roleName: null, teacherId: null } } };
      return { data: {} };
    },
    post: async (url: string, body: Record<string, unknown>) => {
      posts.push({ url, body });
      if (url.endsWith("/preview")) {
        if (previewFails) throw new TestApiError(previewFails.code, previewFails.message, previewFails.status);
        return { data: previewAnswer };
      }
      if (actFails) throw new TestApiError(actFails.code, actFails.message, actFails.status);
      return { data: previewAnswer };
    },
  },
}));
const realNotify = await import("@/lib/ui/notify");
mock.module("@/lib/ui/notify", () => ({ ...realNotify, notify: () => {} }));

const ChangePatternDialog = (await import("./ChangePatternDialog")).default;
const { nextUntaughtRow, openingRows } = await import("./ChangePatternDialog");

const row = (id: string, date: string, startTime: string, teacher: string) => ({
  id,
  date,
  startTime: `${startTime}:00`,
  endTime: `${startTime}:00`,
  status: "CONFIRMED",
  bookingType: "COURSE_PACKAGE",
  teacher: { id: teacher, name: `ครู${teacher}`, nickname: teacher },
});
const SLOTS = [
  { weekday: 1, startTime: "10:00", teacherId: "t-a" },
  { weekday: 4, startTime: "12:00", teacherId: "t-b" },
];
const answerOf = (moved: number) => ({ moved, rows: [row("m1", "2026-11-17", "10:00", "t-a"), row("m2", "2026-11-20", "12:00", "t-b")].slice(0, moved), notices: {} });

const mount = (over: Record<string, unknown> = {}, lang: "en" | "th" = "en") => {
  window.localStorage.setItem("t972-lang", lang);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const user = { id: "u1", username: "a", displayName: "A", isSuperAdmin: false, menus: ["menu:bookings"], actions: [], role: "admin", teacherId: null };
  return render(
    h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, { storageKey: "t972-lang" }, h(SessionProvider, { session: { user, expires: "2999-01-01" } as never },
      h(ChangePatternDialog, {
        opened: true,
        courseId: "c1",
        slots: SLOTS,
        oneSlot: { weekday: 2, startTime: "09:00", teacherId: "t-solo" },
        defaultFromDate: "2026-11-17",
        program: "Surfskate",
        student: "Beam",
        onClose: () => { closes++; },
        onDone: () => { dones++; },
        ...over,
      } as never),
    )))) as never,
  );
};
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const count = (sel: string) => document.querySelectorAll(sel).length;
const btn = (text: string) => [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === text) as HTMLButtonElement | undefined;
const previews = () => posts.filter((p) => p.url.endsWith("/change-pattern/preview"));
const acts = () => posts.filter((p) => p.url.endsWith("/change-pattern"));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pickTime = async (i: number, time: string) => {
  const user = userEvent.setup();
  await user.click(q(`[data-pattern-time="${i}"]`)!);
  await waitFor(() => expect(count('[role="option"]')).toBeGreaterThan(0));
  await user.click([...document.querySelectorAll('[role="option"]')].find((o) => (o.textContent ?? "").trim() === time) as HTMLElement);
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
beforeEach(() => {
  posts.length = 0;
  previewAnswer = answerOf(2);
  actFails = null;
  previewFails = null;
  closes = 0;
  dones = 0;
});

describe("🔴 what the dialog opens on (D-157-2's lesson: the course's own pattern, never the plan's first row)", () => {
  it("🔑 a course WITH slots ⇒ one editor row per slot, filled from them", async () => {
    mount();
    expect(count("[data-pattern-row]")).toBe(2);
    expect((q('[data-pattern-time="0"]') as HTMLInputElement).value).toBe("10:00");
    expect((q('[data-pattern-time="1"]') as HTMLInputElement).value).toBe("12:00");
  });
  it("🔑 a one-slot course (slots null) ⇒ ONE row from the course's weekly class", async () => {
    mount({ slots: null });
    expect(count("[data-pattern-row]")).toBe(1);
    expect((q('[data-pattern-time="0"]') as HTMLInputElement).value).toBe("09:00");
  });
  it("openingRows / nextUntaughtRow: the next UNTAUGHT row decides, an attended first row never does", () => {
    expect(openingRows(null, { weekday: 2, startTime: "09:00:00", teacherId: "t-solo" })).toEqual([{ weekday: 2, startTime: "09:00", teacherId: "t-solo" }]);
    expect(openingRows(undefined, null)).toEqual([{ weekday: null, startTime: null, teacherId: null }]);
    const sessions = [
      { date: "2026-10-20", status: "ATTENDED", bookingType: "COURSE_PACKAGE", startTime: "10:00", teacher: { id: "old" } },
      { date: "2026-11-18", status: "CONFIRMED", bookingType: "COURSE_PACKAGE", startTime: "14:00", teacher: { id: "new" } },
      { date: "2026-11-19", status: "CONFIRMED", bookingType: "SINGLE_SESSION", startTime: "08:00", teacher: { id: "extra" } },
    ];
    expect(nextUntaughtRow(sessions, "2026-11-13")!.teacher!.id).toBe("new");
    expect(nextUntaughtRow(sessions.slice(0, 1), "2026-11-13")!.teacher!.id).toBe("old"); // nothing left ⇒ the last course row
    expect(nextUntaughtRow([], "2026-11-13")).toBeNull();
  });
});

describe("🔴 the preview: ONE request per edit (D-157-1's lesson)", () => {
  it("🔑 on open: exactly ONE call, even a long while later; its body is the date and the pattern as the wire's slots", async () => {
    mount();
    await waitFor(() => expect(previews().length).toBe(1), { timeout: 3000 });
    await sleep(1200); // well past the debounce: a loop would have fired again by now
    expect(previews().length).toBe(1);
    expect(previews()[0].url).toBe("/courses/c1/change-pattern/preview");
    expect(previews()[0].body).toEqual({ fromDate: "2026-11-17", pattern: SLOTS });
    expect(acts().length).toBe(0); // the preview wrote nothing
  });

  it("🔑 ONE edit ⇒ exactly ONE more call (the answer never triggers one); it carries the edit", async () => {
    mount();
    await waitFor(() => expect(previews().length).toBe(1), { timeout: 3000 });
    await pickTime(0, "11:00");
    await waitFor(() => expect(previews().length).toBe(2), { timeout: 3000 });
    await sleep(1200);
    expect(previews().length).toBe(2);
    expect((previews()[1].body.pattern as Array<{ startTime: string }>)[0].startTime).toBe("11:00");
  });

  it("the answer is shown as the SERVER sent it: «Move 2 classes from …» and each moved row's date · time · coach", async () => {
    mount();
    await waitFor(() => expect(q("[data-change-line]")).toBeTruthy());
    expect(q("[data-change-line]")!.textContent).toBe("Move 2 classes from 17/Nov/26");
    expect([...document.querySelectorAll("[data-change-pattern-row]")].map((e) => e.textContent)).toEqual(["17/Nov/26 · 10:00 · t-a", "20/Nov/26 · 12:00 · t-b"]);
  });

  it("TH: the same sentence in her words", async () => {
    mount({}, "th");
    await waitFor(() => expect(q("[data-change-line]")).toBeTruthy());
    expect(q("[data-change-line]")!.textContent).toBe("ย้าย 2 คาบ ตั้งแต่ 17/Nov/26");
  });

  it("1 class ⇒ «class» (EN)", async () => {
    previewAnswer = answerOf(1);
    mount();
    await waitFor(() => expect(q("[data-change-line]")).toBeTruthy());
    expect(q("[data-change-line]")!.textContent).toBe("Move 1 class from 17/Nov/26");
  });

  it("🔑 the confirm WAITS for the answer to THESE inputs (disabled until it arrives, and again after an edit)", async () => {
    mount();
    expect(btn("Confirm")!.disabled).toBe(true);
    await waitFor(() => expect(btn("Confirm")!.disabled).toBe(false), { timeout: 3000 });
    await pickTime(0, "11:00");
    expect(btn("Confirm")!.disabled).toBe(true); // the answer on screen is for the OLD inputs
    await waitFor(() => expect(btn("Confirm")!.disabled).toBe(false), { timeout: 3000 });
  });

  it("an invalid pattern (two rows on the same day and time) is NOT sent, and the confirm stays off", async () => {
    const same = { weekday: 1, startTime: "10:00", teacherId: "t-a" };
    mount({ slots: [same, same] });
    await waitFor(() => expect(count("[data-pattern-issue]")).toBe(1));
    await sleep(900); // past the debounce
    expect(previews().length).toBe(0); // nothing is sent for it
    expect(btn("Confirm")!.disabled).toBe(true);
  });
});

describe("🔴 the act", () => {
  it("🔑 Confirm sends the act on its own route with the date and the pattern, then closes and says it is done", async () => {
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(btn("Confirm")!.disabled).toBe(false), { timeout: 3000 });
    await user.click(btn("Confirm") as HTMLElement);
    await waitFor(() => expect(acts().length).toBe(1));
    expect(acts()[0].url).toBe("/courses/c1/change-pattern");
    expect(acts()[0].body).toEqual({ fromDate: "2026-11-17", pattern: SLOTS });
    await waitFor(() => expect(closes).toBe(1));
    expect(dones).toBe(1);
  });
});

describe("🔴 every refusal has its sentence; an unknown code shows the server's own message", () => {
  const CODES = ["SLOT_TAKEN", "DAY_CLOSED", "TEACHER_ON_LEAVE"] as const;
  for (const code of CODES) {
    it(`${code}: the act's refusal shows its sentence (th) with the server's detail, and the dialog stays open`, async () => {
      actFails = { code, message: "Tue 17 Nov 10:00", status: 409 };
      const user = userEvent.setup();
      mount({}, "th");
      await waitFor(() => expect(btn("ยืนยัน")!.disabled).toBe(false), { timeout: 3000 });
      await user.click(btn("ยืนยัน") as HTMLElement);
      await waitFor(() => expect(q("[data-change-pattern-error]")).toBeTruthy());
      expect(q("[data-change-pattern-error]")!.textContent).toBe(dictionaries.th.changePattern.err[code].replace("{detail}", "Tue 17 Nov 10:00"));
      expect(closes).toBe(0);
    });
  }
  it("a refusal on the PREVIEW is shown the same way, and there is no confirm", async () => {
    previewFails = { code: "SLOT_TAKEN", message: "Mon 17 Nov", status: 409 };
    mount({}, "th");
    await waitFor(() => expect(q("[data-change-pattern-error]")).toBeTruthy(), { timeout: 3000 });
    expect(q("[data-change-pattern-error]")!.textContent).toBe(dictionaries.th.changePattern.err.SLOT_TAKEN.replace("{detail}", "Mon 17 Nov"));
    expect(btn("ยืนยัน")!.disabled).toBe(true);
  });
  it("🔴 a 400 VALIDATION (SB's hours refusal) shows the server's OWN Thai sentence as is — no «ตารางไม่ถูกต้อง» prefix, no key of ours", async () => {
    const sentence = "ครูเอ ไม่ทำงานวันพฤหัสบดี เวลา 12:00";
    actFails = { code: "VALIDATION", message: sentence, status: 400 };
    const user = userEvent.setup();
    mount({}, "th");
    await waitFor(() => expect(btn("ยืนยัน")!.disabled).toBe(false), { timeout: 3000 });
    await user.click(btn("ยืนยัน") as HTMLElement);
    await waitFor(() => expect(q("[data-change-pattern-error]")).toBeTruthy());
    expect(q("[data-change-pattern-error]")!.textContent).toBe(sentence);
    expect(Object.keys(dictionaries.th.changePattern.err)).not.toContain("VALIDATION");
    expect(Object.keys(dictionaries.th.changePattern.err)).not.toContain("OUTSIDE_WORK_HOURS");
  });
  it("an UNKNOWN code shows the server's message, never a bare code", async () => {
    actFails = { code: "SOMETHING_NEW", message: "ข้อความจากเซิร์ฟเวอร์", status: 409 };
    const user = userEvent.setup();
    mount({}, "th");
    await waitFor(() => expect(btn("ยืนยัน")!.disabled).toBe(false), { timeout: 3000 });
    await user.click(btn("ยืนยัน") as HTMLElement);
    await waitFor(() => expect(q("[data-change-pattern-error]")).toBeTruthy());
    expect(q("[data-change-pattern-error]")!.textContent).toBe("ข้อความจากเซิร์ฟเวอร์");
  });
  it("EN and TH carry the same codes", () => {
    expect(Object.keys(dictionaries.en.changePattern.err).sort()).toEqual([...CODES].sort());
    expect(Object.keys(dictionaries.th.changePattern.err).sort()).toEqual([...CODES].sort());
  });
});
