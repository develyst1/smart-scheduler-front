import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";

/**
 * 🔴 **REQ-110 item 8 (TASK-581 BE → TASK-586 FE) — Close · Take bookings again · Delete, clicked.**
 *
 * 🔑 **Every assertion is about the REQUEST**, because all three acts are one call each and the screen can look right while
 * sending the wrong thing (TASK-564's lesson, and TASK-577's — a test that only proved a control renders is what let a dead
 * end reach Tanya).
 * 🔴 **And the delete refusal is shown VERBATIM**: the server's sentence already says how many bookings exist and to close
 * the week instead, so a generic message would throw away the only useful part of it.
 */

const sent: Array<{ method: string; url: string; body?: unknown }> = [];
let deleteError: Error | null = null;

class FakeApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const REFUSAL =
  'ลบสัปดาห์ Camp A ไม่ได้: มีการจองวันแคมป์ 3 รายการ — ใช้ "ปิดรับ" แทน เพื่อหยุดรับจองใหม่ (การจองเดิมยังอยู่)';

/**
 * 🔑 The page shows the CURRENT month and filters by it, so the fixture is built around today — a fixture pinned to a
 * fixed month renders an empty list and every assertion below would fail for the wrong reason.
 */
const day = (n: number) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCDate(n);
  return d.toISOString().slice(0, 10);
};
const WEEKS = [
  { id: "w-open", name: "Camp A", startDate: day(5), endDate: day(9), capacity: 12, status: "OPEN" as const, teacherIds: ["t1"], dayCounts: { [day(6)]: 3 }, windowStart: "10:00", windowEnd: "15:00" },
  { id: "w-shut", name: "Camp B", startDate: day(12), endDate: day(16), capacity: 12, status: "CLOSED" as const, teacherIds: ["t1"], dayCounts: {}, windowStart: "10:00", windowEnd: "15:00" },
];

const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async (url: string) => {
      sent.push({ method: "GET", url });
      return { data: { weeks: WEEKS } };
    },
    patch: async (url: string, body: unknown) => {
      sent.push({ method: "PATCH", url, body });
      return { data: { week: WEEKS[0] } };
    },
    delete: async (url: string) => {
      sent.push({ method: "DELETE", url });
      if (deleteError) throw deleteError;
      return { data: { deleted: true } };
    },
  },
  ApiClientError: FakeApiError,
}));
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => true }));
const realNotify = await import("@/lib/ui/notify");
const notices: unknown[] = [];
mock.module("@/lib/ui/notify", () => ({ ...realNotify, notify: (n: unknown) => void notices.push(n) }));

const CampContent = (await import("./CampContent")).default;

const mount = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(CampContent, null)))) as never);
};
const find = async (sel: string) =>
  waitFor(() => {
    const el = document.querySelector(sel) as HTMLElement | null;
    expect(el).toBeTruthy();
    return el as HTMLElement;
  });
const patches = (id: string) => sent.filter((r) => r.method === "PATCH" && r.url === `/camp/weeks/${id}`);
const deletes = (id: string) => sent.filter((r) => r.method === "DELETE" && r.url === `/camp/weeks/${id}`);

afterEach(cleanup);
beforeEach(() => {
  sent.length = 0;
  notices.length = 0;
  deleteError = null;
});

describe("🔴 TASK-586 — the camp week's Close / Open / Delete, clicked", () => {
  it("🔑 Close sends ONE status PATCH and nothing else", async () => {
    const user = userEvent.setup();
    mount();

    await user.click(await find("[data-week-close='w-open']"));
    await waitFor(() => expect(patches("w-open").length).toBe(1));
    expect(patches("w-open")[0].body).toEqual({ status: "CLOSED" });
    // 🚫 nothing was deleted and no other week was touched
    expect(sent.filter((r) => r.method === "DELETE")).toEqual([]);
    expect(patches("w-shut")).toEqual([]);
  });

  it("🔑 Take bookings again sends ONE status PATCH the other way — the way BACK exists", async () => {
    const user = userEvent.setup();
    mount();

    await user.click(await find("[data-week-open='w-shut']"));
    await waitFor(() => expect(patches("w-shut").length).toBe(1));
    expect(patches("w-shut")[0].body).toEqual({ status: "OPEN" });
    expect(sent.filter((r) => r.method === "DELETE")).toEqual([]);
  });

  it("⚠️ the open week's row offers Close, the closed one offers the way back — never both on one row", async () => {
    mount();
    await find("[data-week-close='w-open']");
    expect(document.querySelectorAll("[data-week-open='w-open']").length).toBe(0);
    expect(document.querySelectorAll("[data-week-close='w-shut']").length).toBe(0);
    expect(document.querySelector("[data-week-open='w-shut']")).toBeTruthy();
  });

  it("🔴 Delete is asked for, and a REFUSED delete shows the SERVER's sentence and leaves the week alone", async () => {
    deleteError = new FakeApiError("CAMP_WEEK_HAS_BOOKINGS", REFUSAL, 409);
    const user = userEvent.setup();
    mount();

    // the door is offered on the week with no children counted — a convenience, never the guard
    await user.click(await find("[data-week-delete='w-shut']"));
    await user.click(await find("[data-delete-confirm]"));

    await waitFor(() => expect(deletes("w-shut").length).toBe(1));
    const box = await find("[data-delete-refusal]");
    // verbatim: the count and the instruction are the useful part
    expect(box.textContent).toBe(REFUSAL);
    expect(box.textContent).toContain("3 รายการ");
    expect(box.textContent).toContain("ปิดรับ");
    // 🚫 nothing was retried, nothing was closed behind the admin's back, and no success was claimed
    expect(deletes("w-shut").length).toBe(1);
    expect(sent.filter((r) => r.method === "PATCH")).toEqual([]);
    expect(notices.length).toBe(0);
  });

  it("✅ an accepted delete sends ONE DELETE and says so", async () => {
    const user = userEvent.setup();
    mount();

    await user.click(await find("[data-week-delete='w-shut']"));
    await user.click(await find("[data-delete-confirm]"));

    await waitFor(() => expect(deletes("w-shut").length).toBe(1));
    expect(document.querySelectorAll("[data-delete-refusal]").length).toBe(0);
    expect(notices.length).toBe(1);
  });

  it("🚫 Delete is not offered on a week that has children counted — and the server is still the decider", async () => {
    mount();
    await find("[data-week-close='w-open']");
    // `w-open` has 3 kid-days, so the button is absent…
    expect(document.querySelectorAll("[data-week-delete='w-open']").length).toBe(0);
    // …and that is a CONVENIENCE: the refusal test above proves the guard is the server's, not this absence
    expect(document.querySelector("[data-week-delete='w-shut']")).toBeTruthy();
  });

  it("🔑 the words do not over-claim: 'closed' says it is about NEW bookings, and the rest carries on", async () => {
    mount();
    await find("[data-week-close='w-open']");
    // the status chip on the closed week, and the buttons that say what they do
    expect(screen.getByText(/closed to new bookings/i)).toBeTruthy();
    expect(screen.getByText(/stop new bookings/i)).toBeTruthy();
    expect(screen.getByText(/take bookings again/i)).toBeTruthy();
    // 🔻 The "does not read as cancel / hide / off" rule is pinned over BOTH LANGUAGES in `camp.test.ts` instead of here:
    // ⚠️ `document.body.textContent` includes Mantine's injected stylesheet, so `.mantine-hidden-from-xs` matched "hidden"
    // and the assertion passed judgement on a CSS class. *A pin that can be satisfied by a stylesheet is not a copy pin.*
  });
});
