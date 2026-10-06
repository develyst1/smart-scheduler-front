import { describe, expect, it, mock, afterEach, beforeEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";
import type { Booking } from "@/types/app/scheduler";

/**
 * 🔴 **TASK-691 (REQ-112) — the session Cancel dialog offers `ปัญหาจากทางเรา`, and ONLY the session Cancel dialog does.**
 *
 * Under REQ-112 this reason is what gives the family +1 week of validity, so an admin must be able to choose it — and must not choose it by
 * accident. 🔑 **Every assertion is about what the screen OFFERS and what LEAVES**: the radios, the hint under the new one, that nothing is
 * pre-selected, and the PATCH body (`reasonCode: "SCHOOL_ISSUE"`, or the old three byte-for-byte).
 */

const patches: Array<{ url: string; body: Record<string, unknown> }> = [];

const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => true }));

const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async () => ({ data: { posted: null } }),
    patch: async (url: string, body: Record<string, unknown>) => {
      patches.push({ url, body });
      return { data: { booking: { id: "b1", status: "CANCELLED", date: "2026-10-20", startTime: "10:00:00", endTime: "11:00:00", bookingType: "SINGLE_SESSION", student: { name: "x" }, teacher: { id: "t", name: "t" } } } };
    },
  },
}));

const CancelBookingDialog = (await import("./CancelBookingDialog")).default;

const BOOKING = { id: "b1", date: "2026-10-20", startTime: "10:00", displayName: "น้องบีม", studentName: "น้องบีม" } as unknown as Booking;

const mount = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(CancelBookingDialog, { opened: true, booking: BOOKING, onClose: () => {} })))) as never,
  );
};
const radios = () => [...document.querySelectorAll('input[type="radio"]')] as HTMLInputElement[];
const confirmBtn = () => [...document.querySelectorAll("button")].find((b) => /cancel booking/i.test(b.textContent ?? "") && !/^cancel$/i.test((b.textContent ?? "").trim())) as HTMLButtonElement;
const cancels = () => patches.filter((p) => p.url === "/bookings/b1/status");

afterEach(cleanup);
beforeEach(() => {
  patches.length = 0;
});

describe("🔴 TASK-691 — the session Cancel dialog", () => {
  it("🔑 offers FOUR reasons: the three it always had, in order, then `A problem on our side`", async () => {
    mount();
    await waitFor(() => expect(radios().length).toBe(4));
    expect(radios().map((r) => r.value)).toEqual(["PROGRAM_CHANGED", "CUSTOMER_CANCELLED", "ADMIN_ERROR", "SCHOOL_ISSUE"]);
    expect(screen.queryAllByText("A problem on our side").length).toBe(1);
  });

  it("⚠️ the one line under it says what the choice DOES — and it is under THAT option only", async () => {
    mount();
    await waitFor(() => expect(radios().length).toBe(4));
    const hints = screen.queryAllByText(/the course is extended by one week/i);
    expect(hints.length).toBe(1);
    // 🔑 the hint belongs to the new option: it is inside the same wrapper as the SCHOOL_ISSUE radio, not the others
    const schoolRadio = radios().find((r) => r.value === "SCHOOL_ISSUE") as HTMLInputElement;
    expect(schoolRadio.closest("[data-session-only-reason]") !== null || schoolRadio.hasAttribute("data-session-only-reason")).toBe(true);
    for (const r of radios().filter((x) => x.value !== "SCHOOL_ISSUE")) {
      expect(r.hasAttribute("data-session-only-reason")).toBe(false);
    }
  });

  it("🚫 NOTHING is pre-selected, and Confirm stays shut until a reason is picked — a week must never be given by accident", async () => {
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(radios().length).toBe(4));
    expect(radios().filter((r) => r.checked).length).toBe(0);
    expect(confirmBtn().disabled).toBe(true);
    await user.click(confirmBtn());
    expect(cancels().length).toBe(0); // 🔑 pressed anyway ⇒ nothing is sent
  });

  it("🔴 choosing it SENDS `reasonCode: SCHOOL_ISSUE` — and choosing an old one sends exactly what it always sent", async () => {
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(radios().length).toBe(4));
    await user.click(radios().find((r) => r.value === "SCHOOL_ISSUE") as HTMLElement);
    await waitFor(() => expect(confirmBtn().disabled).toBe(false));
    await user.click(confirmBtn());
    await waitFor(() => expect(cancels().length).toBe(1));
    expect(cancels()[0].body).toEqual({ action: "cancel", reasonCode: "SCHOOL_ISSUE" });

    cleanup();
    patches.length = 0;
    mount();
    await waitFor(() => expect(radios().length).toBe(4));
    await user.click(radios().find((r) => r.value === "ADMIN_ERROR") as HTMLElement);
    await user.click(confirmBtn());
    await waitFor(() => expect(cancels().length).toBe(1));
    expect(cancels()[0].body).toEqual({ action: "cancel", reasonCode: "ADMIN_ERROR" });
  });
});

describe("📋 TASK-691 — the words, BOTH languages counted, and the approved ones verbatim", () => {
  it("🔑 the label and the hint exist in Thai and English, and are the owner's (A5 / A6)", () => {
    const en = dictionaries.en as unknown as { endCourse: Record<string, string>; cancelBooking: Record<string, string> };
    const th = dictionaries.th as unknown as { endCourse: Record<string, string>; cancelBooking: Record<string, string> };
    let counted = 0;
    for (const [d, label, hint] of [
      [en, "A problem on our side", "Choose this when we cancelled the class — the course is extended by one week."],
      [th, "ปัญหาจากทางเรา", "เลือกข้อนี้เมื่อคาบถูกยกเลิกเพราะทางเรา — ระบบจะขยายอายุคอร์สให้ 1 สัปดาห์"],
    ] as const) {
      expect(d.endCourse.SCHOOL_ISSUE).toBe(label);
      expect(d.cancelBooking.schoolIssueHint).toBe(hint);
      counted += 2;
    }
    expect(counted).toBe(4);
    // the Thai label is the CUSTOMER's own words, and the two languages differ
    expect(th.endCourse.SCHOOL_ISSUE).not.toBe(en.endCourse.SCHOOL_ISSUE);
  });
});
