import { describe, expect, it, mock, afterEach, afterAll, beforeEach } from "bun:test";
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
 * 🔴 **TASK-990 (D-164-2) — Create plan: a failed re-preview says why.** The plan-modal half of the TASK is `create-plan-absence-task990.dom.test.tsx`.
 * 🔑 Counted, not looked at: the `data-plan-error` line and its sentence. 🔑 This file stubs the student picker and the sale hooks (`mock.module` is process-global), so it is named to sort AFTER `parent-phone-task662` / `voucher-note-task733`, as `weekly-pattern-sale-task970` is.
 */

const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
const START = dayjs().add(7, "day").format("YYYY-MM-DD");
const DATES = ["2026-12-07", "2026-12-14", "2026-12-21", "2026-12-28", "2027-01-04", "2027-01-11"];
let failSecondPreview = true;

const realClient = await import("@/lib/api/client");
// 🔑 the REAL `ApiClientError` (not a stand-in): `mock.module` is process-global, so replacing it here broke other files' `instanceof` checks
const TestApiError = realClient.ApiClientError;
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async () => ({ data: {} }),
    post: async (url: string, body: Record<string, unknown>) => {
      posts.push({ url, body: JSON.parse(JSON.stringify(body)) });
      if (url === "/courses/preview") {
        if (failSecondPreview && posts.filter((p) => p.url === "/courses/preview").length >= 2) throw new TestApiError("ABSENCE_REFUSED", "นี่คือประโยคของเซิร์ฟเวอร์", 409);
        const sessions = DATES.map((d) => ({ date: d, startTime: "10:00:00", teacher: { id: "t1", name: "ครูหนึ่ง", nickname: "หนึ่ง" }, subject: { id: "sub1", name: "เปียโน" } }));
        return { data: { size: 6, startDate: START, startTime: "10:00", expiryDate: "2027-06-01", liveCount: 6, endDate: DATES[5], sessions } };
      }
      return { data: {} };
    },
  },
}));
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => true }));
const realHooks = await import("@/hooks/scheduler");
const TEACHERS = [{ id: "t1", name: "ครูหนึ่ง", nickname: "หนึ่ง", type: "FULL_TIME", subjects: ["เปียโน"], subjectOptions: [{ id: "sub1", name: "เปียโน", kind: "PRIVATE" }], active: true, bookable: true, workDays: [0, 1, 2, 3, 4, 5, 6] }];
const CARD = { packages: [{ size: 6, priceGroup: "PRIVATE", priceMinor: 600000, subjects: [{ id: "sub1", name: "เปียโน" }] }], unpricedSubjects: [], voucherAllowedGroups: [] };
const svc = await import("@/services/scheduler.service");
mock.module("@/hooks/scheduler", () => ({
  ...realHooks,
  useTeachers: () => ({ data: TEACHERS }),
  useSellablePackages: () => ({ data: CARD }),
  usePreviewCourse: () => useMutation({ mutationFn: svc.previewCoursePackage }),
  useCreateCoursePackage: () => useMutation({ mutationFn: svc.createCoursePackage }),
}));
const realStudentSelect = await import("@/components/common/StudentSelect");
mock.module("@/components/common/StudentSelect", () => ({
  default: ({ onChange }: { onChange: (v: unknown) => void }) => h("button", { type: "button", "data-student-pick": true, onClick: () => onChange({ id: "s1", name: "น้องมิว", phone: "0812345678" }) }, "pick student"),
}));

const CreatePlanFlow = (await import("./CreatePlanFlow")).default;

const meUser = () => ({ id: "u1", username: "a", displayName: "A", isSuperAdmin: false, menus: [], actions: [], roleName: null, teacherId: null });
const wrap = (node: unknown) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(SessionProvider, { session: { user: meUser(), expires: "2999-01-01" } as never }, node as never)))) as never);
};
const q = (sel: string) => document.querySelectorAll(sel).length;
const generateBtn = () => [...document.querySelectorAll("button")].find((b) => b.textContent === dictionaries.en.plan.generate) as HTMLButtonElement;
/** each row's «⋯» menu (aria-label = plan.actionsMenu); a row with nothing actionable has none */
const menus = () => [...document.querySelectorAll("button")].filter((b) => b.getAttribute("aria-label") === dictionaries.en.plan.actionsMenu);
const itemsOf = () => [...document.querySelectorAll('[role="menuitem"]')].filter((i) => i.textContent === dictionaries.en.plan.plannedAbsence);
/** opens row `i`'s menu; true if it offers «Planned absence» (the menu is closed again) */
const offersAbsence = async (user: ReturnType<typeof userEvent.setup>, i: number) => {
  await user.click(menus()[i]);
  await waitFor(() => expect(document.querySelectorAll('[role="menu"]').length).toBeGreaterThan(0));
  const yes = itemsOf().length > 0;
  await user.keyboard("{Escape}");
  await waitFor(() => expect(document.querySelectorAll('[role="menu"]').length).toBe(0));
  return yes;
};

afterEach(cleanup);
// 🔑 `mock.module` is process-global and this file sorts BEFORE `parent-phone-task662` / `voucher-note-task733`: hand the real modules back, or their real StudentSelect / hooks are gone
afterAll(() => {
  mock.module("@/components/common/StudentSelect", () => realStudentSelect);
  mock.module("@/hooks/scheduler", () => realHooks);
});
beforeEach(() => {
  posts.length = 0;
  failSecondPreview = true;
});

describe("🔴 TASK-990 — a failed re-preview says why", () => {
  it("🔑 ticking a planned absence whose preview the server refuses shows the server's sentence on the plan (`data-plan-error`)", async () => {
    const user = userEvent.setup();
    wrap(h(CreatePlanFlow, { opened: true, onClose: () => {} }));
    await user.click(document.querySelector("[data-student-pick]") as HTMLElement);
    const coach = [...document.querySelectorAll("input")].find((i) => i.getAttribute("aria-haspopup") === "listbox" && i.closest("[class*='Select']")?.textContent?.includes(dictionaries.en.course.teacher)) as HTMLElement;
    await user.click(coach);
    await waitFor(() => expect(q('[role="option"]')).toBeGreaterThan(0));
    await user.click([...document.querySelectorAll('[role="option"]')].find((o) => o.textContent?.includes("หนึ่ง")) as HTMLElement);
    await waitFor(() => expect(generateBtn().disabled).toBe(false));
    await user.click(generateBtn());
    await waitFor(() => expect(menus().length).toBeGreaterThan(0)); // the plan phase
    expect(q("[data-plan-error]")).toBe(0);
    await user.click(menus()[0]);
    await waitFor(() => expect(itemsOf().length).toBe(1));
    await user.click(itemsOf()[0]);
    await waitFor(() => expect(q("[data-plan-error]")).toBe(1));
    expect(document.querySelector("[data-plan-error]")?.textContent).toContain("นี่คือประโยคของเซิร์ฟเวอร์");
    expect(posts.filter((p) => p.url === "/courses/preview").length).toBe(2);
  });
});

