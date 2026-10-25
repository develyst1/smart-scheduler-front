import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { readFileSync } from "node:fs";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { SessionProvider } from "next-auth/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { defaultResumeDate, resumeDefaultTime } from "@/lib/scheduler/resume-defaults";

/**
 * 🔴 **TASK-838 (REQ-127) — "เปลี่ยนครู / เวลา ทั้งคอร์ส": ONE act that moves the rest of a course to a new teacher, day and time.**
 *
 * 🔑 Every assertion is a request or a string. What can go wrong without anyone seeing it: a `{n}` counted on the client (the server's dry run is the only number),
 * the teacher left OUT of the body when it is unchanged (the act exists to name who teaches the rest), a confirm that can be pressed before the server has answered,
 * a clash swallowed instead of shown in the server's own sentence, and the button offered to someone without `bookings.course-plan` (the back's routes require that key, NOT `course-edit`).
 */

const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
let previewAnswer: Record<string, unknown> = { n: 4, firstDate: "2026-11-03", lastDate: "2026-11-24" };
let actFails: { code: string; message: string; status: number } | null = null;
let actAnswer: Record<string, unknown> = { ok: true };
let closes = 0;
let held: ((v: unknown) => void) | null = null; // when set, the preview waits for the test to release it

/**
 * 🔑 The error class is OURS and is exported by OUR mock: `mock.module` is process-global, and another test file stubs this module with a different `ApiClientError`
 * (a constructor that does not take `(code, message, status)`), so throwing "the real one" meant a clash's sentence could arrive as its CODE when the whole suite runs.
 */
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
      if (url === "/me") return { data: { user: { id: "u1", username: "a", displayName: "A", isSuperAdmin: false, menus: ["menu:bookings"], actions: ACTIONS, roleName: null, teacherId: null } } };
      return { data: {} };
    },
    post: async (url: string, body: Record<string, unknown>) => {
      posts.push({ url, body });
      if (url.endsWith("/change-teacher-time/preview")) {
        if (held) await new Promise((r) => (held = r));
        return { data: previewAnswer };
      }
      if (actFails) throw new TestApiError(actFails.code, actFails.message, actFails.status);
      return { data: actAnswer };
    },
  },
}));

let ACTIONS: string[] = ["action:bookings.course-plan"];
const ChangeTeacherTimeDialog = (await import("./ChangeTeacherTimeDialog")).default;

const mount = (lang: "en" | "th" = "en") => {
  window.localStorage.setItem("t838-lang", lang);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const user = { id: "u1", username: "a", displayName: "A", isSuperAdmin: false, menus: ["menu:bookings"], actions: ACTIONS, role: "admin", teacherId: null };
  return render(
    h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, { storageKey: "t838-lang" }, h(SessionProvider, { session: { user, expires: "2999-01-01" } as never },
      h(ChangeTeacherTimeDialog, { opened: true, courseId: "c1", program: "Surfskate", student: "Beam", courseStartTime: "10:00:00", courseWeekday: 2, courseTeacherId: "t-kid", onClose: () => { closes++; } }),
    )))) as never,
  );
};
const btn = (text: string) => [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === text) as HTMLButtonElement | undefined;
const previews = () => posts.filter((p) => p.url.endsWith("/change-teacher-time/preview"));
const acts = () => posts.filter((p) => p.url.endsWith("/change-teacher-time"));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
beforeEach(() => {
  posts.length = 0;
  previewAnswer = { n: 4, firstDate: "2026-11-03", lastDate: "2026-11-24" };
  actFails = null;
  actAnswer = { ok: true };
  closes = 0;
  held = null;
  ACTIONS = ["action:bookings.course-plan"];
});

describe("🔑 the approved words, pinned exactly (owner 2026-10-25)", () => {
  it("EN + TH: the button (also the dialog's title) and the dialog's line", () => {
    expect(dictionaries.en.plan.changeRest).toBe("Change teacher / time for the rest");
    expect(dictionaries.en.plan.changeRestLine).toBe("The remaining {n} sessions move to the chosen teacher, on the new day and time. Sessions already taught don't change.");
    expect(dictionaries.th.plan.changeRest).toBe("เปลี่ยนครู / เวลา ทั้งคอร์ส");
    expect(dictionaries.th.plan.changeRestLine).toBe("คาบที่เหลือ {n} คาบจะย้ายไปเรียนกับครูที่เลือก ตามวันและเวลาใหม่ คาบที่เรียนไปแล้วไม่เปลี่ยน");
  });
  it("🚫 no «copy pending» and no word outside the two approved keys is added to the dialog", () => {
    const src = readFileSync("src/components/partials/Bookings/ChangeTeacherTimeDialog.tsx", "utf8");
    expect(src).not.toMatch(/copy pending/i);
    const keys = [...src.matchAll(/\bt\("([^"]+)"/g)].map((m) => m[1]).sort();
    expect([...new Set(keys)]).toEqual(["booking.teacher", "common.cancel", "common.close", "common.confirm", "course.firstDate", "course.pickTeacher", "course.time", "courseStart.reconfirmBody", "courseStart.reconfirmTitle", "plan.changeRest", "plan.changeRestLine", "plan.genericError"]);
  });
});

describe("🔴 the dialog", () => {
  it("🔑 asks the SERVER first (the dry run) with the course's own slot and teacher; the sentence's {n} is the server's — never counted here", async () => {
    mount();
    await waitFor(() => expect(document.body.textContent).toContain("The remaining 4 sessions move to the chosen teacher, on the new day and time. Sessions already taught don't change."));
    expect(document.body.textContent).toContain("Change teacher / time for the rest");
    expect(previews().length).toBeGreaterThan(0);
    const body = previews()[0].body;
    expect(previews()[0].url).toBe("/courses/c1/change-teacher-time/preview");
    expect(body.teacherId).toBe("t-kid");
    expect(body.startTime).toBe(resumeDefaultTime("10:00:00"));
    expect(body.startDate).toBe(defaultResumeDate(2));
    expect(acts().length).toBe(0); // the preview wrote nothing
  });

  it("🔑 a different n from the server is the n on screen", async () => {
    previewAnswer = { n: 9, firstDate: "2026-11-03", lastDate: "2027-01-05" };
    mount();
    await waitFor(() => expect(document.body.textContent).toContain("The remaining 9 sessions move"));
  });

  it("TH: the same sentence in her words", async () => {
    mount("th");
    await waitFor(() => expect(document.body.textContent).toContain("คาบที่เหลือ 4 คาบจะย้ายไปเรียนกับครูที่เลือก ตามวันและเวลาใหม่ คาบที่เรียนไปแล้วไม่เปลี่ยน"));
    expect(document.body.textContent).toContain("เปลี่ยนครู / เวลา ทั้งคอร์ส");
  });

  it("🔑 the confirm WAITS for the server's number: disabled while the dry run is pending, then enabled", async () => {
    held = () => {};
    mount();
    await waitFor(() => expect(previews().length).toBe(1));
    expect(btn("Confirm")!.disabled).toBe(true);
    expect(document.body.textContent).not.toContain("The remaining");
    held?.(null);
    await waitFor(() => expect(btn("Confirm")!.disabled).toBe(false));
  });

  it("🔑 Confirm sends the act with the teacher NAMED even though it is unchanged — startDate, startTime and teacherId, on the act's own route", async () => {
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(btn("Confirm")!.disabled).toBe(false));
    await user.click(btn("Confirm") as HTMLElement);
    await waitFor(() => expect(acts().length).toBe(1));
    expect(acts()[0].url).toBe("/courses/c1/change-teacher-time");
    expect(Object.keys(acts()[0].body).sort()).toEqual(["startDate", "startTime", "teacherId"]);
    expect(acts()[0].body.teacherId).toBe("t-kid");
  });

  it("🔴 needsReconfirm: 2 ⇒ the start-change screen's orange alert, with ITS approved strings and n = 2; the dialog stays open until Close", async () => {
    actAnswer = { moved: 4, needsReconfirm: 2 };
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(btn("Confirm")!.disabled).toBe(false));
    await user.click(btn("Confirm") as HTMLElement);
    await waitFor(() => expect(document.querySelector("[data-change-reconfirm]")).toBeTruthy());
    expect(document.querySelector("[data-change-reconfirm]")!.getAttribute("data-change-reconfirm")).toBe("2");
    expect(document.body.textContent).toContain("2 sessions need confirming again");
    expect(document.body.textContent).toContain(dictionaries.en.courseStart.reconfirmBody);
    expect(closes).toBe(0); // the admin must read it before the plan behind closes
    expect(btn("Confirm")).toBeUndefined(); // the act is done: nothing left to submit
    await user.click(btn("Close") as HTMLElement);
    expect(closes).toBe(1);
  });

  it("TH: the same alert in the approved Thai", async () => {
    actAnswer = { moved: 4, needsReconfirm: 3 };
    const user = userEvent.setup();
    mount("th");
    await waitFor(() => expect(document.body.textContent).toContain("คาบที่เหลือ 4 คาบ"));
    const confirmTh = [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === "ยืนยัน") as HTMLButtonElement;
    await waitFor(() => expect(confirmTh.disabled).toBe(false));
    await user.click(confirmTh);
    await waitFor(() => expect(document.body.textContent).toContain("3 คาบต้องยืนยันใหม่"));
    expect(document.body.textContent).toContain(dictionaries.th.courseStart.reconfirmBody);
  });

  it("needsReconfirm: 0 (or absent) ⇒ NO alert: the dialog closes onto the refreshed plan", async () => {
    for (const answerBody of [{ moved: 4, needsReconfirm: 0 }, { moved: 4 }]) {
      cleanup();
      closes = 0;
      actAnswer = answerBody;
      const user = userEvent.setup();
      mount();
      await waitFor(() => expect(btn("Confirm")!.disabled).toBe(false));
      await user.click(btn("Confirm") as HTMLElement);
      await waitFor(() => expect(closes).toBe(1));
      expect(document.querySelectorAll("[data-change-reconfirm]").length).toBe(0); // a count, not a node: a failing matcher would print the whole DOM (TASK-596)
    }
  });

  it("🔑 it is the start-change screen's keys, not copies (and the dictionary's approved text is what shows)", () => {
    const src = readFileSync("src/components/partials/Bookings/ChangeTeacherTimeDialog.tsx", "utf8");
    expect(src).toContain('title={t("courseStart.reconfirmTitle", { n: reconfirm })}');
    expect(src).toContain('{t("courseStart.reconfirmBody")}');
    expect(dictionaries.en.courseStart.reconfirmTitle).toBe("{n} sessions need confirming again");
    expect(dictionaries.th.courseStart.reconfirmTitle).toBe("{n} คาบต้องยืนยันใหม่");
  });

  it("🔑 a clash is the SERVER's sentence, shown; nothing else happens (no second request, the dialog stays)", async () => {
    actFails = { code: "SLOT_TAKEN", message: "The slot on 17 Nov 2026 at 10:00 is already taken.", status: 409 };
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(btn("Confirm")!.disabled).toBe(false));
    await user.click(btn("Confirm") as HTMLElement);
    await waitFor(() => expect(document.body.textContent).toContain("The slot on 17 Nov 2026 at 10:00 is already taken."));
    expect(acts().length).toBe(1);
    expect(btn("Confirm")).toBeTruthy(); // still open
  });

  it("🚫 the Confirm is the act, so it is hidden without `bookings.course-plan` (read on the source: `useCan` is stubbed process-wide by other files, so a rendered check would depend on file order)", () => {
    const src = readFileSync("src/components/partials/Bookings/ChangeTeacherTimeDialog.tsx", "utf8");
    expect(src).not.toContain("course-edit"); // 🔑 the wrong key (the task's first wording) must not come back
    expect(src).toMatch(/\{can\("action:bookings\.course-plan"\) && \(\s*<Button[\s\S]{0,500}?onClick=\{submit\}[\s\S]{0,200}?\{t\("common\.confirm"\)\}/);
  });
});

describe("the button in the plan modal", () => {
  const plan = readFileSync("src/components/partials/Bookings/PlanModal.tsx", "utf8");
  it("🔑 it is gated by `bookings.course-plan` (never `course-edit`), sits inside the WRITABLE-course block, and carries the approved label", () => {
    expect(plan).not.toContain("action:bookings.course-edit");
    expect(plan).toMatch(/can\("action:bookings\.course-plan"\) && \(\s*<Button[\s\S]{0,400}?\{t\("plan\.changeRest"\)\}/);
    const writable = plan.indexOf("isCourse && !isCreate && courseWritable && (");
    expect(writable).toBeGreaterThan(0);
    expect(plan.indexOf('t("plan.changeRest")')).toBeGreaterThan(writable);
  });
  it("the dialog is mounted only while open and reads the same slot / teacher facts as the pause dialog", () => {
    expect(plan).toContain("{changeRestOpen && (");
    expect(plan).toContain("<ChangeTeacherTimeDialog");
    expect(plan).toContain("courseTeacherId={courseLastRow?.teacher?.id ?? null}");
  });
});
