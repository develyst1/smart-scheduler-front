import { describe, expect, it, mock, afterEach, beforeEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider, useMutation } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { SessionProvider } from "next-auth/react";
import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * 🔴 **TASK-970 (REQ-5016 F1, SPEC-109 §3.1 / §3.6) — the course SALE with a weekly pattern, clicked on the real form.** The server is a fake at the api boundary; what is under test is what the form SENDS.
 *
 * 🔑 What can go wrong without anyone seeing it: a pattern that goes to the preview but not to the sale (so the admin saves something other than what was previewed), a sale that sends `pattern` AND `sessions`
 * (the server refuses both), a one-row editor that changes the old body, a half-filled row that still lets Generate run, a pattern editor inside a group sale, and a pattern the plan does not read back.
 * Every assertion is a request body, a count or a string — never an element.
 */

const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
const START = dayjs().add(7, "day").format("YYYY-MM-DD");
// the server's expansion of Mon 10:00, Mon 11:00, Thu 12:00 over three weeks, 6 classes — faked here, so the preview rows below are "the server's"
const EXPANDED = ["2026-12-07 10:00", "2026-12-07 11:00", "2026-12-10 12:00", "2026-12-14 10:00", "2026-12-14 11:00", "2026-12-17 12:00"];

const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async () => ({ data: {} }),
    post: async (url: string, body: Record<string, unknown>) => {
      // what reaches the WIRE: a key holding `undefined` is not sent (JSON drops it), so the body is read after a JSON round trip
      posts.push({ url, body: JSON.parse(JSON.stringify(body)) });
      if (url === "/courses/preview") {
        const sessions = EXPANDED.map((d) => ({ date: d.slice(0, 10), startTime: `${d.slice(11)}:00`, teacher: { id: "t1", name: "ครูหนึ่ง", nickname: "หนึ่ง" }, subject: { id: "sub1", name: "เปียโน" } }));
        return { data: { size: 6, startDate: START, startTime: "10:00", expiryDate: "2027-06-01", liveCount: 6, endDate: "2026-12-17", sessions } };
      }
      if (url === "/courses") return { data: { course: { id: "c9" }, bookings: EXPANDED.map((_, i) => ({ id: `b${i}` })) } };
      return { data: {} };
    },
  },
}));
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => true }));
const realHooks = await import("@/hooks/scheduler");
const TEACHERS = [
  { id: "t1", name: "ครูหนึ่ง", nickname: "หนึ่ง", type: "FULL_TIME", subjects: ["เปียโน"], subjectOptions: [{ id: "sub1", name: "เปียโน", kind: "PRIVATE" }], active: true, bookable: true, workDays: [0, 1, 2, 3, 4, 5, 6] },
  { id: "t2", name: "ครูสอง", nickname: "สอง", type: "FULL_TIME", subjects: ["เปียโน"], subjectOptions: [{ id: "sub1", name: "เปียโน", kind: "PRIVATE" }], active: true, bookable: true, workDays: [0, 1, 2, 3, 4, 5, 6] },
];
const CARD = { packages: [{ size: 6, priceGroup: "PRIVATE", priceMinor: 600000, subjects: [{ id: "sub1", name: "เปียโน" }] }], unpricedSubjects: [], voucherAllowedGroups: [] };
// 🔑 `mock.module` is process-global: another file stubs `useCreateCoursePackage` (to record its input) and that stub reaches this one when the files run together. So the two sale hooks are built HERE
// from the REAL service functions (`previewCoursePackage` / `createCoursePackage`), which post to the faked api above — what is asserted is what the service puts on the wire.
const svc = await import("@/services/scheduler.service");
mock.module("@/hooks/scheduler", () => ({
  ...realHooks,
  useTeachers: () => ({ data: TEACHERS }),
  useSellablePackages: () => ({ data: CARD }),
  usePreviewCourse: () => useMutation({ mutationFn: svc.previewCoursePackage }),
  useCreateCoursePackage: () => useMutation({ mutationFn: svc.createCoursePackage }),
}));
mock.module("@/components/common/StudentSelect", () => ({
  default: ({ onChange }: { onChange: (v: unknown) => void }) => h("button", { type: "button", "data-student-pick": true, onClick: () => onChange({ id: "s1", name: "น้องมิว", phone: "0812345678" }) }, "pick student"),
}));

const CreatePlanFlow = (await import("./CreatePlanFlow")).default;

const meUser = () => ({ id: "u1", username: "a", displayName: "A", isSuperAdmin: false, menus: [], actions: [], roleName: null, teacherId: null });
const mount = (group?: { groupKey: string; name: string; teacherId: string; startDate: string; startTime: string; priceGroup: string | null }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(SessionProvider, { session: { user: meUser(), expires: "2999-01-01" } as never }, h(CreatePlanFlow, { opened: true, onClose: () => {}, group }))))) as never,
  );
};
const q = (sel: string) => document.querySelectorAll(sel).length;
const text = () => document.body.textContent ?? "";
const click = (el: Element | null) => userEvent.setup().click(el as HTMLElement);
const pick = async (user: ReturnType<typeof userEvent.setup>, sel: string, label: string) => {
  const input = document.querySelector(sel) as HTMLElement;
  await user.click(input);
  const options = () => [...(document.getElementById(input.getAttribute("aria-controls") ?? "")?.querySelectorAll('[role="option"]') ?? [])];
  await waitFor(() => expect(options().length).toBeGreaterThan(0));
  await user.click(options().find((o) => o.textContent === label) as HTMLElement);
};
const generateBtn = () => [...document.querySelectorAll("button")].find((b) => b.textContent === dictionaries.en.plan.generate) as HTMLButtonElement;
/** the form's own first fields: student, coach (the combobox labelled «Teacher»), then the program comes by itself (one program) */
const fillBasics = async (user: ReturnType<typeof userEvent.setup>) => {
  await click(document.querySelector("[data-student-pick]"));
  const coach = [...document.querySelectorAll("input")].find((i) => i.getAttribute("aria-haspopup") === "listbox" && i.closest("[class*='Select']")?.textContent?.includes(dictionaries.en.course.teacher)) as HTMLElement;
  await user.click(coach);
  await waitFor(() => expect(q('[role="option"]')).toBeGreaterThan(0));
  await user.click([...document.querySelectorAll('[role="option"]')].find((o) => o.textContent?.includes("หนึ่ง")) as HTMLElement);
  await waitFor(() => expect(generateBtn().disabled).toBe(false));
};
const previews = () => posts.filter((p) => p.url === "/courses/preview");
const sales = () => posts.filter((p) => p.url === "/courses");

afterEach(cleanup);
beforeEach(() => {
  posts.length = 0;
});

describe("🔴 TASK-970 — the editor's door on the sale form", () => {
  it("🔑 «Several days a week» is OFF by default (no editor, the single Time field is there); ticking it opens the editor with row 1 on the course's day, time and coach, and a second empty row", async () => {
    mount();
    expect(q("[data-pattern-editor]")).toBe(0);
    expect(q("[data-pattern-toggle]")).toBe(1);
    // the single Time field = a time input that is NOT one of the editor's (its value is the default 10:00)
    const singleTime = () => [...document.querySelectorAll("input")].filter((i) => i.type !== "hidden" && i.value === "10:00" && !i.hasAttribute("data-pattern-time")).length;
    expect(singleTime()).toBe(1);
    await click(document.querySelector("[data-pattern-toggle]"));
    await waitFor(() => expect(q("[data-pattern-editor]")).toBe(1));
    expect(q("[data-pattern-row]")).toBe(2);
    expect(singleTime()).toBe(0); // the single Time field steps aside: every row has its own time
    expect((document.querySelector('[data-pattern-time="0"]') as HTMLInputElement).value).toBe("10:00"); // row 1 opened on the course's time
  });

  it("🚫 a GROUP sale has no pattern editor and no toggle (SPEC-109 §3.6: a group has its own schedule)", () => {
    mount({ groupKey: "g1", name: "กลุ่มเอ", teacherId: "t1", startDate: START, startTime: "10:00", priceGroup: "PRIVATE" });
    expect(q("[data-pattern-toggle]")).toBe(0);
    expect(q("[data-pattern-editor]")).toBe(0);
  });
});

describe("🔴 TASK-970 — a pattern goes to the preview AND the sale, and the plan reads it back", () => {
  it("🔑 two rows → the preview carries `pattern` (and the start time of the course), the plan shows the SERVER's dates and «Weekly: …»; the sale then sends the SAME `pattern` and NO `sessions`", async () => {
    const user = userEvent.setup();
    mount();
    await fillBasics(user);
    await click(document.querySelector("[data-pattern-toggle]"));
    await waitFor(() => expect(q("[data-pattern-row]")).toBe(2));
    // row 1 is seeded (the start date's weekday · 10:00 · หนึ่ง); make it Monday, and fill row 2 as Thursday 12:00 with the other coach
    await pick(user, '[data-pattern-day="0"]', "Mon");
    await pick(user, '[data-pattern-day="1"]', "Thu");
    await pick(user, '[data-pattern-time="1"]', "12:00");
    await pick(user, '[data-pattern-coach="1"]', "สอง");
    await waitFor(() => expect(q("[data-pattern-issue]")).toBe(0));
    await user.click(generateBtn());
    await waitFor(() => expect(previews().length).toBe(1));
    const sent = previews()[0].body.pattern;
    expect(sent).toEqual([
      { weekday: 1, startTime: "10:00", teacherId: "t1" },
      { weekday: 4, startTime: "12:00", teacherId: "t2" },
    ]);
    // the plan (phase 2) is drawn from the server's expansion, and reads the pattern aloud
    await waitFor(() => expect(q("[data-pattern-label]")).toBe(1));
    expect(document.querySelector("[data-pattern-label]")?.textContent).toBe("Weekly: Mon 10:00 · Thu 12:00");
    // confirm the sale
    const confirm = [...document.querySelectorAll("button")].find((b) => /create|confirm|save/i.test(b.textContent ?? "") && !b.disabled) as HTMLElement | undefined;
    expect(confirm === undefined).toBe(false);
    await user.click(confirm as HTMLElement);
    await waitFor(() => expect(sales().length).toBe(1));
    expect(sales()[0].body.pattern).toEqual(sent);
    expect(Object.keys(sales()[0].body)).not.toContain("sessions");
  });

  it("🔑 ONE row is today's sale: no `pattern` key on the preview, and the time is the row's", async () => {
    const user = userEvent.setup();
    mount();
    await fillBasics(user);
    await click(document.querySelector("[data-pattern-toggle]"));
    await waitFor(() => expect(q("[data-pattern-row]")).toBe(2));
    await user.click(document.querySelector('[data-pattern-remove="1"]') as HTMLElement);
    await pick(user, '[data-pattern-time="0"]', "11:30");
    await user.click(generateBtn());
    await waitFor(() => expect(previews().length).toBe(1));
    expect(Object.keys(previews()[0].body)).not.toContain("pattern");
    expect(previews()[0].body.startTime).toBe("11:30");
  });

  it("🔑 a half-filled row blocks Generate and nothing is sent", async () => {
    const user = userEvent.setup();
    mount();
    await fillBasics(user);
    await click(document.querySelector("[data-pattern-toggle]"));
    await waitFor(() => expect(q("[data-pattern-row]")).toBe(2));
    // row 2 is still empty
    expect(q('[data-pattern-issue="incomplete"]')).toBe(1);
    expect(generateBtn().disabled).toBe(true);
    await user.click(generateBtn());
    expect(posts.length).toBe(0);
  });

  it("🔑 the pattern editor OFF sends the old body: `startTime` and no `pattern`", async () => {
    const user = userEvent.setup();
    mount();
    await fillBasics(user);
    await user.click(generateBtn());
    await waitFor(() => expect(previews().length).toBe(1));
    expect(Object.keys(previews()[0].body)).not.toContain("pattern");
    expect(previews()[0].body.startTime).toBe("10:00");
  });
});
