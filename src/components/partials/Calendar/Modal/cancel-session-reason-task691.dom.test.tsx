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
 * 🔻 **TASK-694 (QA F1) — THIS FILE WAS TASK-691's, AND ITS CLAIM WAS RE-AIMED, NOT DELETED.** 691 put `ปัญหาจากทางเรา` on THIS dialog as a 4th
 * reason and these tests pinned four radios and a hint. **That was the wrong screen:** this dialog cancels a single / voucher / trial / OTHER booking —
 * **no course behind it, so the reason adds NO week**, and its approved hint (*"the course is extended by one week"*) would be FALSE here. A
 * COURSE class is cancelled from the plan modal, where the one choice now lives (`cancel-course-class-task694.dom.test.tsx`).
 * ✅ What these tests protect is unchanged in spirit: **what this dialog OFFERS and what LEAVES** — the radios, nothing pre-selected, the PATCH body.
 * They now assert the three reasons it always had, **and that the our-side reason and its hint are ABSENT**.
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

describe("🔴 TASK-694 — the NON-course Cancel dialog offers THREE reasons, and not the our-side one", () => {
  it("🔑 THREE radios, the three it always had, in order — `A problem on our side` is NOT among them", async () => {
    mount();
    await waitFor(() => expect(radios().length).toBe(3));
    expect(radios().map((r) => r.value)).toEqual(["PROGRAM_CHANGED", "CUSTOMER_CANCELLED", "ADMIN_ERROR"]);
    expect(screen.queryAllByText("A problem on our side").length).toBe(0);
  });

  it("⚠️ NO hint: *the course is extended by one week* would be FALSE on a booking with no course", async () => {
    mount();
    await waitFor(() => expect(radios().length).toBe(3));
    expect(screen.queryAllByText(/extended by one week/i).length).toBe(0);
    expect(document.querySelectorAll("[data-session-only-reason]").length).toBe(0);
  });

  it("🚫 NOTHING is pre-selected, and Confirm stays shut until a reason is picked — pressed anyway ⇒ nothing is sent", async () => {
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(radios().length).toBe(3));
    expect(radios().filter((r) => r.checked).length).toBe(0);
    expect(confirmBtn().disabled).toBe(true);
    await user.click(confirmBtn());
    expect(cancels().length).toBe(0);
  });

  it("🔴 choosing a reason SENDS exactly what it always sent — and `SCHOOL_ISSUE` is not reachable from here", async () => {
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(radios().length).toBe(3));
    await user.click(radios().find((r) => r.value === "ADMIN_ERROR") as HTMLElement);
    await waitFor(() => expect(confirmBtn().disabled).toBe(false));
    await user.click(confirmBtn());
    await waitFor(() => expect(cancels().length).toBe(1));
    expect(cancels()[0].body).toEqual({ action: "cancel", reasonCode: "ADMIN_ERROR" });
    expect(JSON.stringify(cancels()[0].body).includes("SCHOOL_ISSUE")).toBe(false);
  });
});

describe("📋 TASK-691/694 — the words, BOTH languages counted, and the approved ones verbatim", () => {
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
    expect(th.endCourse.SCHOOL_ISSUE).not.toBe(en.endCourse.SCHOOL_ISSUE);
  });
});
