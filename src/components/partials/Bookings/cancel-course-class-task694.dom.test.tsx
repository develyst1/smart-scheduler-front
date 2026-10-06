import { describe, expect, it, mock, afterEach, beforeEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import type { PlanSession } from "@/types/app/scheduler";

/**
 * 🔴 **TASK-694 (QA F1) — an admin can cancel a COURSE class with `ปัญหาจากทางเรา` ON A SCREEN.**
 *
 * @Tanya's FAIL: the only screen that offered the reason was the booking modal's 4-reason dialog, which opens for single / voucher / trial / OTHER rows —
 * **no course, so it earned no week** — while a COURSE class is cancelled from the PLAN modal, which offered no reason at all. So her "15" and every
 * +1-week school cancel existed only through the API. 🔑 **Every assertion is about the REQUEST and the OFFER**, because the dangerous failures are
 * invisible on screen: **a week given by accident** (a pre-ticked box) and **a ticked box that sends nothing** (the family is not given the week and nobody
 * is told). The request is asserted on the wire, not on the checkbox.
 */

const calls: Array<{ method: string; url: string; body: Record<string, unknown> }> = [];

const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => true }));

const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async () => ({ data: {} }),
    patch: async (url: string, body: Record<string, unknown>) => {
      calls.push({ method: "PATCH", url, body });
      return { data: { booking: { id: "s1", status: "CANCELLED", date: "2026-10-20", startTime: "10:00:00", endTime: "11:00:00", bookingType: "COURSE_PACKAGE", student: { name: "x" }, teacher: { id: "t", name: "t" } } } };
    },
    post: async (url: string, body: Record<string, unknown>) => {
      calls.push({ method: "POST", url, body });
      return { data: { cancelled: 3, seatsCancelled: 6, householdsTold: 4, familyNotices: 4 } };
    },
  },
}));

const { CancelSessionDialog } = await import("./PlanModal");
const { CancelAllDialog } = await import("@/components/partials/OtherSeries/OtherSeriesDialogs");

const session = (status: string) =>
  ({ id: "s1", date: "2026-10-20", startTime: "10:00:00", status, teacher: { id: "t", name: "ครู", nickname: "เอ" }, subject: { id: "sub", name: "เปียโน" } }) as unknown as PlanSession;

const wrap = (el: unknown) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, el as never))) as never);
};
const box = () => document.querySelector("[data-our-side-cancel]") as HTMLInputElement | null;
const confirm = () => [...document.querySelectorAll("button")].find((b) => /^(cancel session|cancel this session|yes, cancel the series)$/i.test((b.textContent ?? "").trim())) as HTMLButtonElement;
const sent = (method: string) => calls.filter((c) => c.method === method);

afterEach(cleanup);
beforeEach(() => {
  calls.length = 0;
});

describe("🔴 TASK-694 §1 — the plan modal's COURSE-class cancel", () => {
  it("🔑 offers ONE choice — the approved words — and it is OFF by default", async () => {
    wrap(h(CancelSessionDialog, { session: session("CONFIRMED"), onClose: () => {}, onError: () => {} }));
    await waitFor(() => expect(box()).toBeTruthy());
    expect(box()!.checked).toBe(false);
    expect(screen.queryAllByText("A problem on our side").length).toBe(1);
    expect(screen.queryAllByText(/the course is extended by one week/i).length).toBe(1);
    // 🚫 a CHECKBOX, not a list: on a course class the server ignores every other reason, so a list would offer choices that do nothing
    expect(document.querySelectorAll('input[type="radio"]').length).toBe(0);
    expect(document.querySelectorAll('input[type="checkbox"]').length).toBe(1);
  });

  it("🔴 UNTICKED ⇒ the request is EXACTLY today's — no `reasonCode` key at all", async () => {
    const user = userEvent.setup();
    wrap(h(CancelSessionDialog, { session: session("CONFIRMED"), onClose: () => {}, onError: () => {} }));
    await waitFor(() => expect(box()).toBeTruthy());
    await user.click(confirm());
    await waitFor(() => expect(sent("PATCH").length).toBe(1));
    expect(sent("PATCH")[0].url).toBe("/bookings/s1/status");
    expect(sent("PATCH")[0].body).toEqual({ action: "cancel" });
    expect("reasonCode" in sent("PATCH")[0].body).toBe(false);
  });

  it("🔴 TICKED ⇒ the request carries `reasonCode: SCHOOL_ISSUE` — the week is earned on the wire, not on the checkbox", async () => {
    const user = userEvent.setup();
    wrap(h(CancelSessionDialog, { session: session("CONFIRMED"), onClose: () => {}, onError: () => {} }));
    await waitFor(() => expect(box()).toBeTruthy());
    await user.click(box() as HTMLElement);
    expect(box()!.checked).toBe(true);
    await user.click(confirm());
    await waitFor(() => expect(sent("PATCH").length).toBe(1));
    expect(sent("PATCH")[0].body).toEqual({ action: "cancel", reasonCode: "SCHOOL_ISSUE" });
  });

  it("✅ a DELIVERED (attended) class gets the choice too — and still needs its typed reason, which rides beside the code", async () => {
    const user = userEvent.setup();
    wrap(h(CancelSessionDialog, { session: session("ATTENDED"), onClose: () => {}, onError: () => {} }));
    await waitFor(() => expect(box()).toBeTruthy());
    // the existing rule: a delivered row cannot be cancelled without a reason — nothing is sent until it is typed
    await user.click(box() as HTMLElement);
    await user.click(confirm());
    expect(sent("PATCH").length).toBe(0);
    await user.type(document.querySelector("textarea") as HTMLTextAreaElement, "ระบบขัดข้อง");
    await user.click(confirm());
    await waitFor(() => expect(sent("PATCH").length).toBe(1));
    expect(sent("PATCH")[0].body).toEqual({ action: "cancel", reasonCode: "SCHOOL_ISSUE", reason: "ระบบขัดข้อง" });
  });
});

describe("🔴 TASK-694 §2 — the GROUP series cancel-all (its seats are course classes)", () => {
  it("🔑 a GROUP series offers the same single choice, off by default, beside the three reasons", async () => {
    wrap(h(CancelAllDialog, { series: { kind: "group", key: "g-1" }, attended: 1, live: 3, cascade: { seats: 6, students: 4 }, onClose: () => {} }));
    await waitFor(() => expect(box()).toBeTruthy());
    expect(box()!.checked).toBe(false);
    expect(document.querySelectorAll('input[type="radio"]').length).toBe(3);
    expect(screen.queryAllByText(/the course is extended by one week/i).length).toBe(1);
  });

  it("🚫 an OTHER series has NO course behind it — no choice, no hint (it would be false)", async () => {
    wrap(h(CancelAllDialog, { series: { kind: "other", key: "o-1" }, attended: 0, live: 2, onClose: () => {} }));
    await waitFor(() => expect(document.querySelectorAll('input[type="radio"]').length).toBe(3));
    expect(document.querySelectorAll("[data-our-side-cancel]").length).toBe(0);
    expect(screen.queryAllByText(/extended by one week/i).length).toBe(0);
  });

  it("🔴 ticked ⇒ cancel-all carries `SCHOOL_ISSUE` and the three reasons are NOT asked; unticked + a reason ⇒ exactly today's body", async () => {
    const user = userEvent.setup();
    wrap(h(CancelAllDialog, { series: { kind: "group", key: "g-1" }, attended: 1, live: 3, cascade: { seats: 6, students: 4 }, onClose: () => {} }));
    await waitFor(() => expect(box()).toBeTruthy());
    expect(confirm().disabled).toBe(true); // nothing chosen ⇒ shut
    await user.click(box() as HTMLElement);
    await waitFor(() => expect(confirm().disabled).toBe(false)); // the box IS the reason
    await user.click(confirm());
    await waitFor(() => expect(sent("POST").length).toBe(1));
    expect(sent("POST")[0].url).toBe("/group-series/g-1/cancel-all");
    expect(sent("POST")[0].body).toEqual({ reasonCode: "SCHOOL_ISSUE" });

    cleanup();
    calls.length = 0;
    wrap(h(CancelAllDialog, { series: { kind: "group", key: "g-1" }, attended: 1, live: 3, cascade: { seats: 6, students: 4 }, onClose: () => {} }));
    await waitFor(() => expect(document.querySelectorAll('input[type="radio"]').length).toBe(3));
    await user.click(document.querySelector('input[value="ADMIN_ERROR"]') as HTMLElement);
    await user.click(confirm());
    await waitFor(() => expect(sent("POST").length).toBe(1));
    expect(sent("POST")[0].body).toEqual({ reasonCode: "ADMIN_ERROR" });
  });
});

describe("🔴 TASK-695 — ticking the box turns the reason radios VISIBLY OFF (a screen that lets you choose what will be ignored tells you something false)", () => {
  const radios = () => [...document.querySelectorAll('input[type="radio"]')] as HTMLInputElement[];
  const mount = () => wrap(h(CancelAllDialog, { series: { kind: "group", key: "g-1" }, attended: 1, live: 3, cascade: { seats: 6, students: 4 }, onClose: () => {} }));

  it("🔑 ticked ⇒ ALL three radios are disabled and none is checked — even if one was chosen BEFORE; the request carries ONLY SCHOOL_ISSUE", async () => {
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(radios().length).toBe(3));
    expect(radios().filter((r) => r.disabled).length).toBe(0);
    await user.click(radios().find((r) => r.value === "ADMIN_ERROR") as HTMLElement); // an EARLIER choice
    expect(radios().filter((r) => r.checked).length).toBe(1);
    await user.click(box() as HTMLElement);
    await waitFor(() => expect(radios().filter((r) => r.disabled).length).toBe(3));
    expect(radios().filter((r) => r.checked).length).toBe(0);
    await user.click(confirm());
    await waitFor(() => expect(sent("POST").length).toBe(1));
    expect(sent("POST")[0].body).toEqual({ reasonCode: "SCHOOL_ISSUE" });
  });

  it("✅ UNTICK ⇒ radios enabled again, nothing chosen, Confirm shut until one is picked", async () => {
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(radios().length).toBe(3));
    await user.click(radios().find((r) => r.value === "ADMIN_ERROR") as HTMLElement);
    await user.click(box() as HTMLElement);
    await user.click(box() as HTMLElement);
    await waitFor(() => expect(radios().filter((r) => r.disabled).length).toBe(0));
    expect(radios().filter((r) => r.checked).length).toBe(0); // the earlier choice was cleared, not silently revived
    expect(confirm().disabled).toBe(true);
    await user.click(radios().find((r) => r.value === "CUSTOMER_CANCELLED") as HTMLElement);
    await waitFor(() => expect(confirm().disabled).toBe(false));
  });
});
