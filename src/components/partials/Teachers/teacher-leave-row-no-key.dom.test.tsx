import { describe, expect, it, mock, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import type { Teacher } from "@/types/app/scheduler";

/**
 * 🔴 **TASK-611 — the admin WITHOUT `action:calendar.status`: the item is ABSENT, never greyed.**
 *
 * 🔑 *A disabled control tells someone they are missing something; a hidden one tells them nothing, which is correct,
 * because it is not theirs.*
 *
 * 📌 **This identity has its own FILE on purpose.** `mock.module` is global to the process, so an identity built from a
 * variable that other tests change is an identity whose answer depends on execution order ⇒ 🔑 *a test whose identity
 * depends on execution order is not a test of an identity* (TASK-592, and @Sober recorded it as a rule).
 * 🔑 **And the identity is NARROW on purpose: only `action:calendar.status` is denied.** The admin still holds
 * `teachers.edit` and `teachers.archive`, so **the menu still exists** — which is what makes the absence below mean
 * *this item is not theirs* rather than *the menu did not render*.
 */

const DENIED = "action:calendar.status";
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({
  ...realMe,
  useCan: () => (key: string) => key !== DENIED,
}));

const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: { ...realClient.api, get: async () => ({ data: { days: [] } }), post: async () => ({ data: null }) },
}));

const TeacherRowActions = (await import("./TeacherRowActions")).default;

const TEACHER: Teacher = {
  id: "t-77",
  name: "สมหญิง ใจดี",
  nickname: "ครูเอ",
  type: "FULL_TIME",
  subjects: ["เปียโน"],
  active: true,
};

const mount = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    h(
      QueryClientProvider,
      { client: qc },
      h(MantineProvider, null, h(I18nProvider, null, h(TeacherRowActions, { teacher: TEACHER, onEdit: () => {} }))),
    ) as never,
  );
};

afterEach(cleanup);

describe("🔴 TASK-611 — without `action:calendar.status`", () => {
  it("🚫 the leave item is ABSENT — and the menu is still there, so the absence means something", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(document.querySelector("button[aria-label]") as HTMLElement);

    // the menu opened — the other items prove it
    await waitFor(() => expect((document.body.textContent ?? "").match(/change type/i)).toBeTruthy());
    expect(document.body.textContent).toMatch(/archive/i);

    // 🔴 and the leave item does not exist: not disabled, not greyed, ABSENT
    expect(document.querySelectorAll("[data-teacher-leave-open]").length).toBe(0);
    expect(document.body.textContent).not.toMatch(/record leave in advance/i);
    expect(document.body.textContent).not.toContain("บันทึกวันลาล่วงหน้า");
    // 🚫 and nothing anywhere tells this admin they lack a permission
    expect(document.body.textContent).not.toMatch(/permission|สิทธิ์/i);
  });
});
