import { describe, expect, it, mock, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * 🔴 **TASK-990 (D-164-2) — a pattern's make-up rows offer no planned absence at sale (TASK-989).** The failed-re-preview half is `weekly-pattern-sale-absence-error-task990.dom.test.tsx`.
 * 🔑 Counted: the «⋯» menus on the plan's rows and what each offers.
 */

const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({ ...realClient, useMockData: false, api: { ...realClient.api, get: async () => ({ data: {} }) } }));
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => true }));
const realHooks = await import("@/hooks/scheduler");
mock.module("@/hooks/scheduler", () => ({
  ...realHooks,
  useEntitlementPlan: () => ({ data: undefined, isLoading: false }),
  useTeachers: () => ({ data: [] }),
}));

const PlanModal = (await import("./PlanModal")).default;

const wrap = (el: unknown) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, el as never))) as never);
};
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

describe("🔴 TASK-990 — a pattern's make-up rows are not declarable at sale (TASK-989)", () => {
  const row = (i: number, makeup: boolean) => ({
    id: `new-${i}`,
    date: dayjs("2026-12-07").add(i, "week").format("YYYY-MM-DD"),
    startTime: "10:00:00",
    status: makeup ? "CONFIRMED" : "PENDING",
    isMakeup: makeup,
    bookingType: "COURSE_PACKAGE",
    teacher: { id: "t1", name: "ครู", nickname: "หนึ่ง" },
    subject: { id: "sub1", name: "เปียโน" },
  });
  // size 6 + 2 make-up rows = 8 rows (positions 7 and 8 are the make-ups)
  const plan = (slots: unknown) => ({
    kind: "course",
    id: "",
    student: { id: "s1", name: "น้องมิว", nickname: null },
    sessions: Array.from({ length: 8 }, (_, i) => row(i, i >= 6)),
    liveEndDate: null,
    summary: { kind: "course", size: 6, maxWeek: 6, owedCount: 0, expiryDate: "2027-06-01", slots },
  });
  const mount = (slots: unknown) => wrap(h(PlanModal, { opened: true, onClose: () => {}, mode: "create", initialPlan: plan(slots) as never, entitlementId: "", onToggleAbsent: () => {} }));

  it("🔑 WITH a pattern (slots set): rows 1–6 offer «Planned absence», rows 7 and 8 do not", async () => {
    mount([
      { weekday: 1, startTime: "10:00", teacherId: "t1" },
      { weekday: 4, startTime: "12:00", teacherId: "t1" },
    ]);
    const user = userEvent.setup();
    // rows 7 and 8 (the make-ups) have nothing actionable at all in create mode, so they draw no «⋯» menu: 6 menus, every one offering the absence
    await waitFor(() => expect(menus().length).toBe(6));
    const offers: boolean[] = [];
    for (let i = 0; i < 6; i++) offers.push(await offersAbsence(user, i));
    expect(offers).toEqual([true, true, true, true, true, true]);
  });

  it("🔑 WITHOUT slots (a one-slot sale): make-up rows keep their «Planned absence» too (TASK-362, unchanged) — all 8", async () => {
    mount(null);
    const user = userEvent.setup();
    await waitFor(() => expect(menus().length).toBe(8));
    const offers: boolean[] = [];
    for (let i = 0; i < 8; i++) offers.push(await offersAbsence(user, i));
    expect(offers).toEqual([true, true, true, true, true, true, true, true]);
  });
});
