import { describe, expect, it, mock, afterEach, beforeEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import type { Booking, TeacherView } from "@/types/app/scheduler";

/**
 * 🔴 **TASK-634 — WITHOUT `action:bookings.coach-rate` (key 59): the field is ABSENT, and the swap still works.**
 *
 * 🔑 *A disabled control tells someone they are missing something; a hidden one tells them nothing, which is correct,
 * because it is not theirs.* ⚠️ **And the second half matters as much: an admin without the key can still do an
 * ORDINARY swap.** The field is the answer to a refusal, 🚫 not a new toll on the act.
 *
 * 📌 **Its own file**, because `mock.module` is global to the process ⇒ 🔑 *a test whose identity depends on execution
 * order is not a test of an identity* (TASK-592). **And the identity is NARROW: only key 59 is denied**, so the dialog's
 * own `booking-edit` world is untouched and the absence below means *this field is not theirs*.
 */

const DENIED = "action:bookings.coach-rate";
const patches: Array<{ url: string; body: Record<string, unknown> }> = [];

const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => (key: string) => key !== DENIED }));

const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async () => ({ data: { days: [] } }),
    patch: async (url: string, body: Record<string, unknown>) => {
      patches.push({ url, body });
      return { data: { moved: 1 } };
    },
  },
}));

const GroupSwapDialog = (await import("./GroupSwapDialog")).default;

const TEACHERS: TeacherView[] = [
  { id: "t-out", name: "ครูเก่า", nickname: "เก่า", bookable: true, workDays: [0, 1, 2, 3, 4, 5, 6] } as unknown as TeacherView,
  { id: "t-in", name: "ครูใหม่", nickname: "ใหม่", bookable: true, workDays: [0, 1, 2, 3, 4, 5, 6] } as unknown as TeacherView,
];
const BOOKING = { id: "bk-1", date: "2026-10-20", teacherId: "t-out", displayName: "กลุ่มเช้า", group: { name: "กลุ่มเช้า" } } as unknown as Booking;

const mount = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    h(
      QueryClientProvider,
      { client: qc },
      h(MantineProvider, null, h(I18nProvider, null, h(GroupSwapDialog, { booking: BOOKING, teachers: TEACHERS, opened: true, onClose: () => {} }))),
    ) as never,
  );
};

afterEach(cleanup);
beforeEach(() => {
  patches.length = 0;
});

describe("🔴 TASK-634 — without key 59", () => {
  it("🚫 the rate field is ABSENT — not greyed — and nothing says a permission is missing", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(document.querySelector("input[role='combobox']") as HTMLElement);
    await user.click(await screen.findByText("ใหม่"));

    expect(document.querySelectorAll("[data-group-swap-rate]").length).toBe(0);
    expect(document.querySelectorAll("input[inputmode='numeric']").length).toBe(0);
    // 🚫 no greyed field, and no sentence about what they lack: it is simply not their control
    expect(document.body.textContent).not.toMatch(/rate for this group/i);
    expect(document.body.textContent).not.toContain("ค่าสอนของ");
    expect(document.body.textContent).not.toMatch(/permission|สิทธิ์/i);
  });

  it("✅ the ORDINARY swap still works, and no `rateMinor` can ride", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(document.querySelector("input[role='combobox']") as HTMLElement);
    await user.click(await screen.findByText("ใหม่"));
    await user.click([...document.querySelectorAll("button")].find((b) => /swap/i.test(b.textContent ?? "")) as HTMLElement);

    await waitFor(() => expect(patches.length).toBe(1));
    const body = patches[0].body;
    // 🔑 the act this admin could always do is unchanged — the field added no toll
    expect(Object.keys(body).sort()).toEqual(["fromHereOn", "teacherId"]);
    expect("rateMinor" in body).toBe(false);
  });
});
