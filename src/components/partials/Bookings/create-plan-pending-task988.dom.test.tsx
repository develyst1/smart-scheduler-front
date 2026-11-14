import { describe, expect, it, mock, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * 🔴 **TASK-988 (ขวัญ 14/11) — Create plan says it is updating while a planned-absence re-preview is in flight.**
 * She could not tell the screen was working: the rows only change when the server answers. 🔑 Counted, not looked at: the wrapper's `aria-busy` / `data-plan-pending`, and the line `data-plan-updating`.
 */

const sessions = [
  {
    id: "new-0",
    date: "2026-10-20",
    startTime: "10:00:00",
    status: "PENDING",
    isMakeup: false,
    bookingType: "COURSE_PACKAGE",
    teacher: { id: "t", name: "ครู", nickname: "เอ" },
    subject: { id: "sub", name: "เปียโน" },
  },
];
const summary = { kind: "course", size: 6, leaveUsed: 0, leaveQuota: 2, maxWeek: 6, owedCount: 0, expiryDate: "2026-12-31", status: "ACTIVE" };
const plan = () => ({ kind: "course", id: "c1", student: { id: "s1", name: "น้องมิว", nickname: null }, sessions, liveEndDate: null, summary });

const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({ ...realClient, useMockData: false, api: { ...realClient.api, get: async () => ({ data: {} }) } }));
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => true }));
const realHooks = await import("@/hooks/scheduler");
mock.module("@/hooks/scheduler", () => ({
  ...realHooks,
  useEntitlementPlan: () => ({ data: plan(), isLoading: false }),
  useTeachers: () => ({ data: [] }),
}));

const PlanModal = (await import("./PlanModal")).default;

const wrap = (el: unknown) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, el as never))) as never);
};
const create = (previewPending: boolean) => wrap(h(PlanModal, { opened: true, onClose: () => {}, mode: "create", initialPlan: plan() as never, entitlementId: "", previewPending }));
const q = (sel: string) => document.querySelectorAll(sel).length;
const busy = () => document.querySelector("[aria-busy]");

afterEach(cleanup);

describe("🔴 TASK-988 — Create plan, preview in flight", () => {
  it("🔑 pending: the rows' wrapper is busy and dimmed, and one «Updating the plan…» line shows", async () => {
    create(true);
    await waitFor(() => expect(q("[data-plan-updating]")).toBe(1));
    expect(document.querySelector("[data-plan-updating]")?.textContent).toBe(dictionaries.en.plan.updating);
    expect(busy()?.getAttribute("aria-busy")).toBe("true");
    expect(busy()?.hasAttribute("data-plan-pending")).toBe(true);
    expect(busy()?.className).toContain("opacity-50");
    expect(busy()?.className).toContain("pointer-events-none");
  });

  it("🔑 not pending: no updating line, the wrapper is `aria-busy=false`, not dimmed, no pending marker", async () => {
    create(false);
    await waitFor(() => expect(busy()).toBeTruthy());
    expect(q("[data-plan-updating]")).toBe(0);
    expect(busy()?.getAttribute("aria-busy")).toBe("false");
    expect(busy()?.hasAttribute("data-plan-pending")).toBe(false);
    expect(busy()?.className ?? "").not.toContain("opacity-50");
  });

  it("🔑 edit mode never renders the updating line (nor a busy wrapper), even if `previewPending` is passed", async () => {
    wrap(h(PlanModal, { opened: true, onClose: () => {}, entitlementId: "c1", previewPending: true }));
    await waitFor(() => expect(document.body.textContent).toContain("น้องมิว"));
    expect(q("[data-plan-updating]")).toBe(0);
    expect(q("[data-plan-pending]")).toBe(0);
    expect(q("[aria-busy]")).toBe(0);
  });

  it("the words: EN «Updating the plan…», TH «กำลังคำนวณแผนใหม่…»", () => {
    expect(dictionaries.en.plan.updating).toBe("Updating the plan…");
    expect(dictionaries.th.plan.updating).toBe("กำลังคำนวณแผนใหม่…");
  });
});
