import { describe, expect, it, mock, afterEach } from "bun:test";
import { createElement as h } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";

/**
 * 🔴 **TASK-861 (REQ-120 F5) — "No Teacher" must not leak into a list.** `useTeachers()` is the one door every picker and
 * roster reads, so the rule lives there: **out by default**, in only for the two places that place a park-fee block —
 * the calendar and the OTHER forms (`{ withSystem: true }`). 🔑 This proves the rule at the door and at one real picker
 * per family; it cannot prove the server's half (the API sending `isSystem: true`) — that is Bob's and the live check.
 */
const T = (id: string, nickname: string, over: Record<string, unknown> = {}) => ({
  id, name: nickname, nickname, type: "FULL_TIME", subjects: [], subjectOptions: [], active: true, lineLinked: false, workDays: [],
  monthlyHours: 0, monthlyIncome: 0, overLimit: false, bookable: true, ...over,
});
const ROWS = [T("a", "เอ"), T("sys", "No Teacher", { type: "FREELANCE", isSystem: true }), T("b", "บี")];

const realService = await import("@/services/scheduler.service");
mock.module("@/services/scheduler.service", () => ({ ...realService, getTeachers: async () => ROWS }));
const { useTeachers } = await import("@/hooks/scheduler/useScheduler");
const { default: LeaveTeacherPick } = await import("@/components/partials/Calendar/Modal/LeaveTeacherPick");

afterEach(cleanup);

const wrap = (child: unknown) =>
  render(h(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, h(MantineProvider, null, h(I18nProvider, null, child as never))) as never);

function Probe({ withSystem }: { withSystem?: boolean }) {
  const { data = [] } = useTeachers(withSystem ? { withSystem } : undefined);
  return h("ul", { "data-probe": "" }, data.map((t) => h("li", { key: t.id }, t.nickname)));
}
const names = () => [...document.querySelectorAll("[data-probe] li")].map((li) => li.textContent);

describe("useTeachers — the door", () => {
  it("drops the system teacher by default", async () => {
    wrap(h(Probe, {}));
    await waitFor(() => expect(names()).toEqual(["เอ", "บี"]));
  });
  it("keeps it, in the API's order, when the calendar / an OTHER form asks", async () => {
    wrap(h(Probe, { withSystem: true }));
    await waitFor(() => expect(names()).toEqual(["เอ", "No Teacher", "บี"]));
  });
});

describe("a real picker (the leave teacher pick, a list family that reads the hook)", () => {
  it("does not offer 'No Teacher'", async () => {
    // 🔻 TASK-966, declared: the pick is a MULTI-select now (REQ-5015 AC1), so its `value` is the list picked so far — `[]`, not `null`. What this test protects (the system teacher is never offered) is unchanged.
    wrap(h(LeaveTeacherPick, { value: [], onPick: () => {} }));
    // The options mount when the list opens; open it once the teachers have landed.
    await waitFor(async () => {
      await userEvent.click(document.querySelector("[data-leave-teacher-pick]") as Element);
      expect(document.body.textContent).toContain("เอ");
    });
    expect(document.body.textContent).toContain("บี");
    expect(document.body.textContent).not.toContain("No Teacher");
  });
});
