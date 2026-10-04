import { describe, expect, it, mock, afterEach, beforeEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import type { Booking, TeacherView } from "@/types/app/scheduler";

/**
 * 🔴 **TASK-634 — the key is checked AGAIN in the body builder, and this file is why.**
 *
 * **A mutation deleting `canRate &&` from the body builder SURVIVED**, because a hidden field can never be filled, so
 * `rateBaht` is always empty when the key is absent. ⇒ 🔑 **the guard was real but nothing was asking about it** — the
 * same shape as TASK-605's `a guard with no fixture is a guard nothing is asking about`, and the choice was to delete the
 * guard as dead or to write the case where it is live. **It is live in exactly one case, and that case is not exotic:**
 * **the grant is revoked while the dialog is open.** `useCan` reads live data, so the field disappears — and **the number
 * already typed is still in React state.** Without the second check it would ride into a body the server now refuses.
 *
 * 📌 **The identity CHANGES here, and that is the subject of the test rather than an accident of ordering** — which is
 * why it has its own file (TASK-592's rule) and why the flip is explicit in the body of the test.
 */

const DENIED = "action:bookings.coach-rate";
/** 🔑 The live answer, flipped inside the test — the transition IS what this file is about. */
let hasRateKey = true;
const patches: Array<{ url: string; body: Record<string, unknown> }> = [];

const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({
  ...realMe,
  useCan: () => (key: string) => (key === DENIED ? hasRateKey : true),
}));

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
  hasRateKey = true;
  patches.length = 0;
});

describe("🔴 TASK-634 — the grant is revoked while the dialog is open", () => {
  it("🔴 a rate typed BEFORE the revoke does NOT ride afterwards", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(document.querySelector("input[role='combobox']") as HTMLElement);
    await user.click(await screen.findByText("ใหม่"));

    // with the key: the field is there and it takes a number
    const box = document.querySelector("[data-group-swap-rate]") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "330" } });
    await waitFor(() => expect(box.getAttribute("data-group-swap-rate")).toBe("33000"));

    // 🔴 …and now it is taken away. The re-render is caused by an ordinary interaction, as it would be in a browser.
    hasRateKey = false;
    await user.click(document.querySelector("input[type='checkbox']") as HTMLElement);
    await waitFor(() => expect(document.querySelectorAll("[data-group-swap-rate]").length).toBe(0));

    await user.click([...document.querySelectorAll("button")].find((b) => /swap/i.test(b.textContent ?? "")) as HTMLElement);

    await waitFor(() => expect(patches.length).toBe(1));
    const body = patches[0].body;
    // 🔑 the typed number is still in state, and it must not leave: the server would refuse this body (403), and a
    // refusal the screen could have prevented is the dead end this whole round was spent removing.
    expect("rateMinor" in body).toBe(false);
    expect(Object.keys(body).sort()).toEqual(["fromHereOn", "teacherId"]);
    // ✅ and the swap itself still went — losing the key costs the rate, not the act
    expect(body.teacherId).toBe("t-in");
    expect(body.fromHereOn).toBe(true);
  });
});
