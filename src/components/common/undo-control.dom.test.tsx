import { describe, expect, it, mock } from "bun:test";
import { createElement as h, type ReactNode } from "react";
import { MantineProvider, Menu } from "@mantine/core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import type { Booking } from "@/types/app/scheduler";

/**
 * 🔑 TASK-532 — **the clicked proof.** TASK-531 set the rule *"a control is proven by clicking it"* and could not fully
 * meet it: this repo had no DOM, so the Undo shipped twice unusable with a green suite both times, and the only thing
 * between *"it renders"* and *"it works"* was Tanya.
 *
 * This file closes exactly the gap TASK-531 named as unproven: **the `onClick` wiring and the dialog's paint.** It mounts
 * the real hook inside a real Mantine `Menu`, **clicks the menu item with a real pointer**, waits for the dialog to
 * appear, **clicks confirm**, and asserts the request that reaches the API client.
 *
 * 🚫 **This is the only kind of thing that belongs in a `.dom.test.tsx`:** a CONTROL — something a person presses that
 * then does something irreversible or expensive. Labels, layout and pure rules stay in the fast tests (see
 * `test/dom-preload.ts`).
 */

/** The fetch boundary. */
const calls: Array<{ url: string; body: unknown }> = [];
let refuseWith: Error | null = null;
class FakeApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}
/**
 * 📌 Every mock SPREADS the real module and replaces one member. `mock.module` is global to the test PROCESS, so a mock
 * that returns only the members this file needs silently deletes the rest for every other file in the run — I shipped
 * that for a minute and two unrelated suites failed with *"Export named ... not found"*. Spreading keeps the blast
 * radius to the member being faked.
 */
const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    post: async (url: string, body: unknown) => {
      calls.push({ url, body });
      if (refuseWith) throw refuseWith;
      return { data: { kind: "checkin", leaveRefunded: false, makeupCancelledId: null, expiry: null, booking: { id: "bk-1", status: "CONFIRMED" } } };
    },
  },
  ApiClientError: FakeApiError,
}));
/** The 60th key is granted in this harness; the door's own key-gating is pinned in the fast tests. */
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => () => true }));
/** react-query would need a provider and a client; the act is what this file is about, so the mutation is the service call. */
const realHooks = await import("@/hooks/scheduler");
mock.module("@/hooks/scheduler", () => ({
  ...realHooks,
  useUndoBooking: () => ({
    isPending: false,
    mutateAsync: async ({ bookingId, reason }: { bookingId: string; reason: string }) => {
      const { undoBooking } = await import("@/services/scheduler.service");
      const { undoBody } = await import("@/lib/scheduler/undo");
      return undoBooking(bookingId, undoBody(reason));
    },
  }),
}));

const { useUndoControl } = await import("./UndoControl");

/** A host shaped exactly like the real ones: the item inside the dropdown, the dialog OUTSIDE the menu. */
function Host({ booking }: { booking: Booking }) {
  const undo = useUndoControl(booking);
  return h(
    "div",
    null,
    h(Menu, { opened: true }, h(Menu.Target, null, h("button", { type: "button" }, "menu")), h(Menu.Dropdown, null, undo.menuItem as ReactNode)),
    undo.dialog as ReactNode,
  );
}
const mount = (booking: Booking) =>
  render(h(MantineProvider, null, h(I18nProvider, null, h(Host, { booking }))) as never);
const row = (over: Partial<Booking>) => ({ id: "bk-1", status: "ATTENDED", checkinChannel: "shopfront-qr", ...over }) as Booking;

describe("🔑 TASK-532 — the Undo control, actually clicked", () => {
  it("click the item ⇒ the dialog APPEARS ⇒ click confirm ⇒ `POST /bookings/<id>/undo` goes", async () => {
    calls.length = 0;
    refuseWith = null;
    const user = userEvent.setup();
    mount(row({ id: "bk-qr" }));

    // the item is there, and the dialog is NOT — this is the state D4 never got past
    const item = await screen.findByText("Undo check-in");
    expect(screen.queryByText("Undo this check-in?")).toBeNull();

    await user.click(item);

    // 🔴 the paint TASK-531 could not prove: the dialog exists after the click that closes the menu
    const title = await screen.findByText("Undo this check-in?");
    expect(title).toBeTruthy();
    expect(screen.getByText(/nobody is told/i)).toBeTruthy();
    expect(calls).toEqual([]); // nothing has been asked yet — no optimistic request

    await user.click(screen.getByText("Undo it"));
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0]).toEqual({ url: "/bookings/bk-qr/undo", body: {} });
  });

  it("a LEAVE row: the leave label and body, and the reason typed by hand reaches the request", async () => {
    calls.length = 0;
    refuseWith = null;
    const user = userEvent.setup();
    mount(row({ id: "bk-leave", status: "SICK_LEAVE", checkinChannel: null }));

    await user.click(await screen.findByText("Undo leave"));
    expect(await screen.findByText("Undo this leave?")).toBeTruthy();
    // 🔴 the leave body says the coach IS told — the fact that must not be wrong on this row
    expect(screen.getByText(/coach is told/i)).toBeTruthy();

    await user.type(screen.getByRole("textbox"), "keyed by mistake");
    await user.click(screen.getByText("Undo it"));
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0]).toEqual({ url: "/bookings/bk-leave/undo", body: { reason: "keyed by mistake" } });
  });

  it("🔴 a REFUSED act: the server's sentence appears, the dialog STAYS, and no success is claimed", async () => {
    calls.length = 0;
    refuseWith = new FakeApiError("ชั่วโมงนี้ถูกจองไปแล้วโดยครูบีม (10:00)", "UNDO_SLOT_TAKEN");
    const user = userEvent.setup();
    mount(row({ id: "bk-taken" }));

    await user.click(await screen.findByText("Undo check-in"));
    await user.click(await screen.findByText("Undo it"));

    // the holder survives, verbatim, on the screen
    expect(await screen.findByText("ชั่วโมงนี้ถูกจองไปแล้วโดยครูบีม (10:00)")).toBeTruthy();
    // the dialog is still open (nothing was closed as if it had worked) and the act was attempted exactly once
    expect(screen.getByText("Undo this check-in?")).toBeTruthy();
    expect(calls.length).toBe(1);
  });

  it("a row with nothing to undo renders NO control — nothing to click", async () => {
    calls.length = 0;
    mount(row({ id: "bk-plain", status: "CONFIRMED", checkinChannel: null }));
    expect(screen.queryByText("Undo attendance")).toBeNull();
    expect(screen.queryByText("Undo check-in")).toBeNull();
    expect(screen.queryByText("Undo leave")).toBeNull();
    expect(calls).toEqual([]);
  });
});
