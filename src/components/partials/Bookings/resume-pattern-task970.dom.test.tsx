import { describe, expect, it, mock, afterEach, beforeEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider, useMutation } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { SessionProvider } from "next-auth/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * 🔴 **TASK-970 addendum A1 (SPEC-109 §3.4) — the resume dialog of a PATTERN course: no time or coach picker, one line naming the pattern, the first slot's time on the wire, no `teacherId`.**
 * The server re-plans a pattern course onto its slots and IGNORES `startTime` / `teacherId`, so a picker for either would promise something that does not happen.
 * 🔑 What can go wrong without anyone seeing it: the pickers still drawn (the admin changes a time that is thrown away), a coach key still sent, the time missing from the body (the server requires it), and a
 * ONE-slot course changed at all. Every assertion is a body, a count or a string — never an element.
 */

const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async () => ({ data: {} }),
    post: async (url: string, body: Record<string, unknown>) => {
      posts.push({ url, body: JSON.parse(JSON.stringify(body)) });
      return { data: { createdSessions: 4, lastSession: "2026-12-30", expiryDate: "2027-03-01", expiryExtended: false } };
    },
  },
}));
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => true }));
// 🔑 `mock.module` is process-global and other files stub these hooks: the two used here are built from the REAL service functions, so what is asserted is what the service puts on the wire.
const realHooks = await import("@/hooks/scheduler");
const svc = await import("@/services/scheduler.service");
const TEACHERS = [{ id: "t1", name: "ครูหนึ่ง", nickname: "หนึ่ง", type: "FULL_TIME", subjects: [], subjectOptions: [], active: true, bookable: true, workDays: [0, 1, 2, 3, 4, 5, 6] }];
mock.module("@/hooks/scheduler", () => ({
  ...realHooks,
  useTeachers: () => ({ data: TEACHERS }),
  useResumeCourse: () => useMutation({ mutationFn: ({ courseId, ...input }: { courseId: string; startDate: string; startTime: string; teacherId?: string }) => svc.resumeCourse(courseId, input) }),
  usePreviewEndCourse: () => useMutation({ mutationFn: async () => ({ removedSessions: 0 }) }),
  useDropCourse: () => useMutation({ mutationFn: async () => ({}) }),
}));

const DropResumeDialog = (await import("./DropResumeDialog")).default;

const SLOTS = [
  { weekday: 1, startTime: "10:00", teacherId: "t1" },
  { weekday: 1, startTime: "11:00", teacherId: "t1" },
  { weekday: 4, startTime: "12:30", teacherId: "t1" },
];
const meUser = () => ({ id: "u1", username: "a", displayName: "A", isSuperAdmin: false, menus: [], actions: [], roleName: null, teacherId: null });
const mount = (slots: typeof SLOTS | null | undefined) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(SessionProvider, { session: { user: meUser(), expires: "2999-01-01" } as never },
      h(DropResumeDialog, { opened: true, mode: "resume", courseId: "c1", program: "เปียโน", student: "น้องมิว", courseStartTime: "14:00", courseWeekday: 3, courseTeacherId: "t1", slots, onClose: () => {} }))))) as never,
  );
};
const q = (sel: string) => document.querySelectorAll(sel).length;
const text = () => document.body.textContent ?? "";
const confirmBtn = () => [...document.querySelectorAll("button")].find((b) => /confirm|resume/i.test(b.textContent ?? "") && !b.closest("[data-resume-pattern]")) as HTMLElement;
/** the dialog's own pickers: every combobox input (the time Select and the teacher Select) */
const pickers = () => [...document.querySelectorAll("input")].filter((i) => i.type !== "hidden" && i.getAttribute("aria-haspopup") === "listbox").length;

afterEach(cleanup);
beforeEach(() => {
  posts.length = 0;
});

describe("🔴 TASK-970 A1 — a PATTERN course resumes on its pattern", () => {
  it("🔑 no time picker and no coach picker; one line names the pattern; the date picker stays", () => {
    mount(SLOTS);
    expect(pickers()).toBe(0);
    expect(q("[data-resume-pattern]")).toBe(1);
    expect(document.querySelector("[data-resume-pattern]")?.textContent).toBe("Resumes on its weekly pattern: Mon 10:00, 11:00 · Thu 12:30");
    expect(text()).toContain(dictionaries.en.course.firstDate);
  });

  it("🔑 the body carries `startDate` and the FIRST slot's time, and NO `teacherId` key", async () => {
    mount(SLOTS);
    await userEvent.setup().click(confirmBtn());
    await waitFor(() => expect(posts.length).toBe(1));
    expect(posts[0].url).toBe("/courses/c1/resume");
    expect(Object.keys(posts[0].body).sort()).toEqual(["startDate", "startTime"]);
    expect(posts[0].body.startTime).toBe("10:00"); // not the course's own 14:00 default: the pattern's first slot
  });

  it("🔑 the TH line is Sector's own sentence", () => {
    expect(dictionaries.th.weeklyPattern.resumeLine).toBe("กลับมาเรียนตามตารางเดิม: {pattern}");
  });
});

describe("🔴 TASK-970 A1 — a ONE-slot course is exactly what it was", () => {
  it("🔑 `slots` null (or one slot): both pickers are there, no pattern line, and the body is today's (the course's own time)", async () => {
    mount(null);
    expect(pickers()).toBe(2); // the time Select and the teacher Select
    expect(q("[data-resume-pattern]")).toBe(0);
    await userEvent.setup().click(confirmBtn());
    await waitFor(() => expect(posts.length).toBe(1));
    expect(posts[0].body.startTime).toBe("14:00"); // the course's own slot, as before
    cleanup();
    posts.length = 0;
    mount([SLOTS[0]]);
    expect(pickers()).toBe(2);
    expect(q("[data-resume-pattern]")).toBe(0);
  });
});
