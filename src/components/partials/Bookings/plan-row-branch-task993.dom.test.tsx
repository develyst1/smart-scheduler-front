import { describe, expect, it, mock, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * 🔴 **TASK-993 (ขวัญ 14/11) — every manage-plan class row says where it happens.** Rendered the way `makeup-badge-task703` renders the plan modal:
 * three rows — BRAVO, OTHER, and one with no `branch` (an older server). 🔑 The badge is on EVERY row that has a value (Bravo included), and a row
 * with none claims nothing — never a guessed Bravo.
 */

const rows = [
  { id: "a", date: "2026-10-20", branch: "BRAVO" },
  { id: "b", date: "2026-10-27", branch: "OTHER" },
  { id: "c", date: "2026-11-03", branch: undefined },
].map((r) => ({
  ...r,
  startTime: "10:00:00",
  status: "CONFIRMED",
  isMakeup: false,
  bookingType: "COURSE_PACKAGE",
  teacher: { id: "t", name: "ครู", nickname: "เอ" },
  subject: { id: "sub", name: "เปียโน" },
}));
const plan = () => ({
  kind: "course",
  id: "c1",
  student: { id: "s1", name: "น้องมิว", nickname: null },
  sessions: rows,
  liveEndDate: null,
  summary: { kind: "course", size: 6, leaveUsed: 0, leaveQuota: 2, maxWeek: 6, owedCount: 0, expiryDate: "2026-12-31", status: "ACTIVE" },
});

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
const tableRows = () => [...document.querySelectorAll("tbody tr")].filter((tr) => tr.querySelector("td"));
const badgeOf = (tr: Element) => tr.querySelector("[data-row-branch]");

afterEach(cleanup);

describe("🔴 TASK-993 — each plan row shows its branch", () => {
  it("🔑 BRAVO row: «Bravo» · OTHER row: «Other» · a row with no `branch`: no badge at all", async () => {
    wrap(h(PlanModal, { opened: true, onClose: () => {}, entitlementId: "c1" }));
    await waitFor(() => expect(tableRows().length).toBe(3));
    const [a, b, c] = tableRows();
    expect(badgeOf(a)?.getAttribute("data-row-branch")).toBe("BRAVO");
    expect(badgeOf(a)?.textContent).toBe(dictionaries.en.branch.BRAVO);
    expect(badgeOf(b)?.getAttribute("data-row-branch")).toBe("OTHER");
    expect(badgeOf(b)?.textContent).toBe(dictionaries.en.branch.OTHER);
    expect(badgeOf(c)).toBeNull();
    expect(document.querySelectorAll("[data-row-branch]").length).toBe(2);
  });

  it("the Thai word for OTHER is «อื่นๆ» and Bravo stays «Bravo» (dictionary values)", () => {
    expect(dictionaries.th.branch.OTHER).toBe("อื่นๆ");
    expect(dictionaries.th.branch.BRAVO).toBe("Bravo");
    expect(dictionaries.en.branch.OTHER).toBe("Other");
  });
});
