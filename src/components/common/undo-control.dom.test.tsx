import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h, type ReactNode } from "react";
import { MantineProvider, Menu } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import type { Booking } from "@/types/app/scheduler";

/**
 * 🔑 TASK-532 — **the clicked proof.** TASK-531 set the rule *"a control is proven by clicking it"* and could not fully
 * meet it: this repo had no DOM, so the Undo shipped twice unusable with a green suite both times, and the only thing
 * between *"it renders"* and *"it works"* was Tanya.
 *
 * 🔴 **TASK-547 made this file matter more, not less.** The dialog now depends on a FETCH (`GET …/undo-preview`), so the
 * control has states no source pin can prove: in flight, refused before the click, a failed check, and **a refusal after a
 * clean forecast** — the one the server reserves the right to give (`UNDO_PLAN_WOULD_CHANGE` is decided after its writes).
 * ⇒ the real react-query client runs here over a faked fetch boundary, because *a button whose enablement depends on a
 * request is exactly what a source pin cannot check.*
 *
 * 🚫 **Still not a licence to render everything:** labels, copy counts and pure rules stay in the fast tests.
 */

/** The fetch boundary. */
const calls: Array<{ url: string; body: unknown }> = [];
const gets: string[] = [];
let refuseWith: Error | null = null;
/** What the preview answers: a forecast, the act's refusal (`ok:false`), or a thrown failure. */
let previewAnswer: unknown = { ok: true, kind: "leave", leaveRefunded: true, makeupCancelled: { id: "bk-ext", date: "2026-11-04" }, expiry: null };
let previewThrows = false;
class FakeApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}
/**
 * 📌 Every mock SPREADS the real module. `mock.module` is global to the test PROCESS, so a mock that returns only the
 * members this file needs silently deletes the rest for every other file in the run — I shipped that for a minute and two
 * unrelated suites failed with *"Export named … not found"*.
 */
const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async (url: string) => {
      gets.push(url);
      if (previewThrows) throw new FakeApiError("network", "NETWORK");
      return { data: previewAnswer };
    },
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
const mount = (booking: Booking) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(Host, { booking })))) as never);
};
const row = (over: Partial<Booking>) => ({ id: "bk-1", status: "ATTENDED", checkinChannel: "shopfront-qr", ...over }) as Booking;
const confirmBtn = () => document.querySelector("[data-undo-confirm]") as HTMLButtonElement;
const previewBox = () => document.querySelector("[data-undo-preview]")?.getAttribute("data-undo-preview") ?? null;

// 📌 Bun has no auto-cleanup: without this every render leaks into the next test and a failure names the WRONG test.
afterEach(cleanup);
beforeEach(() => {
  calls.length = 0;
  gets.length = 0;
  refuseWith = null;
  previewThrows = false;
  previewAnswer = { ok: true, kind: "leave", leaveRefunded: true, makeupCancelled: { id: "bk-ext", date: "2026-11-04" }, expiry: null };
});

describe("🔑 TASK-532 — the Undo control, actually clicked", () => {
  it("click the item ⇒ the dialog APPEARS ⇒ click confirm ⇒ `POST /bookings/<id>/undo` goes", async () => {
    const user = userEvent.setup();
    mount(row({ id: "bk-qr" }));

    // the item is there, and the dialog is NOT — this is the state D4 never got past
    const item = await screen.findByText("Undo check-in");
    expect(screen.queryAllByText("Undo this check-in?").length).toBe(0);

    await user.click(item);

    // 🔴 the paint TASK-531 could not prove: the dialog exists after the click that closes the menu
    expect(await screen.findByText("Undo this check-in?")).toBeTruthy();
    expect(screen.getByText(/Nobody is told/i)).toBeTruthy();
    expect(calls).toEqual([]); // nothing has been asked yet — no optimistic request

    await waitFor(() => expect(previewBox()).toBe("ready"));
    await user.click(screen.getByText("Undo it"));
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0]).toEqual({ url: "/bookings/bk-qr/undo", body: {} });
  });

  it("a LEAVE row: the leave label and body, and the reason typed by hand reaches the request", async () => {
    const user = userEvent.setup();
    mount(row({ id: "bk-leave", status: "SICK_LEAVE", checkinChannel: null }));

    await user.click(await screen.findByText("Undo leave"));
    expect(await screen.findByText("Undo this leave?")).toBeTruthy();
    // 🔴 the leave body says the coach IS told — the fact that must not be wrong on this row
    expect(screen.getByText(/coach is told/i)).toBeTruthy();

    await waitFor(() => expect(previewBox()).toBe("ready"));
    await user.type(screen.getByRole("textbox"), "keyed by mistake");
    await user.click(screen.getByText("Undo it"));
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0]).toEqual({ url: "/bookings/bk-leave/undo", body: { reason: "keyed by mistake" } });
  });

  it("🔴 a REFUSED act: the server's sentence appears, the dialog STAYS, and no success is claimed", async () => {
    refuseWith = new FakeApiError("ชั่วโมงนี้ถูกจองไปแล้วโดยครูบีม (10:00)", "UNDO_SLOT_TAKEN");
    const user = userEvent.setup();
    mount(row({ id: "bk-taken" }));

    await user.click(await screen.findByText("Undo check-in"));
    await waitFor(() => expect(previewBox()).toBe("ready"));
    await user.click(await screen.findByText("Undo it"));

    // the holder survives, verbatim, on the screen
    expect(await screen.findByText("ชั่วโมงนี้ถูกจองไปแล้วโดยครูบีม (10:00)")).toBeTruthy();
    // the dialog is still open (nothing was closed as if it had worked) and the act was attempted exactly once
    expect(screen.getByText("Undo this check-in?")).toBeTruthy();
    expect(calls.length).toBe(1);
  });

  it("a row with nothing to undo renders NO control — nothing to click, and NO preview is asked", async () => {
    mount(row({ id: "bk-plain", status: "CONFIRMED", checkinChannel: null }));
    expect(screen.queryAllByText("Undo attendance").length).toBe(0);
    expect(screen.queryAllByText("Undo check-in").length).toBe(0);
    expect(screen.queryAllByText("Undo leave").length).toBe(0);
    expect(calls).toEqual([]);
    expect(gets).toEqual([]);
  });
});

describe("🔴 TASK-547 — the forecast, clicked", () => {
  it("the preview is asked ONLY when the dialog opens, and its lines are what the server said", async () => {
    previewAnswer = { ok: true, kind: "leave", leaveRefunded: true, makeupCancelled: { id: "x", date: "2026-11-04" }, expiry: { from: "2026-11-11", to: "2026-11-04" } };
    const user = userEvent.setup();
    mount(row({ id: "bk-leave", status: "SICK_LEAVE", checkinChannel: null }));

    // 🔑 nothing is asked while the row merely exists — a preview per row would be hundreds of privileged reads
    await screen.findByText("Undo leave");
    expect(gets).toEqual([]);

    await user.click(screen.getByText("Undo leave"));
    await waitFor(() => expect(gets).toEqual(["/bookings/bk-leave/undo-preview"]));

    // 🔻 TASK-658 (REQ-112), declared: the server STILL answers all three facts (`leaveRefunded: true`, a make-up, an `expiry`) — but only the
    // make-up is a sentence an admin needs. *"return the leave to the family's quota"* is gone (no quota) and *"move the course expiry back"* is
    // gone (the Undo NEVER moves the end date). ✅ What this clicked test protects — the lines are what the SERVER said, asked only when the
    // dialog opens — is unchanged, and the two dropped facts are asserted ABSENT by COUNT (a node would print the whole document on failure).
    expect(await screen.findByText("cancel the make-up session on 2026-11-04")).toBeTruthy();
    expect(screen.queryAllByText(/return the leave/i).length).toBe(0);
    expect(screen.queryAllByText(/course expiry/i).length).toBe(0);
    expect(screen.queryAllByText(/quota/i).length).toBe(0);
    // 🔑 and the sentence that makes a later refusal a normal outcome rather than a contradiction
    expect(screen.getByText(/may still refuse/i)).toBeTruthy();
  });

  it("🔑 a forecast with nothing to list SAYS so — an empty list is the silence this defect is made of", async () => {
    previewAnswer = { ok: true, kind: "attendance", leaveRefunded: false, makeupCancelled: null, expiry: null };
    const user = userEvent.setup();
    mount(row({ id: "bk-att", status: "ATTENDED", checkinChannel: null }));

    await user.click(await screen.findByText("Undo attendance"));
    expect(await screen.findByText(/Nothing else follows/i)).toBeTruthy();
    // 🚫 no invented quota or make-up line anywhere
    expect(screen.queryAllByText(/return the leave/i).length).toBe(0);
    expect(screen.queryAllByText(/make-up session on/i).length).toBe(0);
    // and it is still confirmable
    await waitFor(() => expect(confirmBtn().disabled).toBe(false));
  });

  it("🔴 the preview REFUSES: the server's own sentence, and the confirm is BLOCKED", async () => {
    previewAnswer = { ok: false, code: "UNDO_LEAVE_CHARGE_UNKNOWN", message: "ไม่ทราบว่าการลานี้ตัดโควตาหรือไม่" };
    const user = userEvent.setup();
    mount(row({ id: "bk-old", status: "SICK_LEAVE", checkinChannel: null }));

    await user.click(await screen.findByText("Undo leave"));
    await waitFor(() => expect(previewBox()).toBe("refused"));
    // verbatim, never re-worded
    expect(screen.getByText("ไม่ทราบว่าการลานี้ตัดโควตาหรือไม่")).toBeTruthy();
    expect(confirmBtn().disabled).toBe(true);

    // 🚫 and pressing it anyway sends nothing
    await user.click(confirmBtn());
    expect(calls).toEqual([]);
  });

  it("🔴 the preview FAILS: it says we could not check, shows NO body of its own, and still allows the act", async () => {
    previewThrows = true;
    const user = userEvent.setup();
    mount(row({ id: "bk-net", status: "SICK_LEAVE", checkinChannel: null }));

    await user.click(await screen.findByText("Undo leave"));
    await waitFor(() => expect(previewBox()).toBe("failed"));
    expect(screen.getByText(/could not check what this would change/i)).toBeTruthy();
    // 🚫 no confident forecast: not one line, and not the "nothing else follows" reassurance either
    expect(screen.queryAllByText(/If nothing changes before you confirm/i).length).toBe(0);
    expect(screen.queryAllByText(/Nothing else follows/i).length).toBe(0);
    // ✅ a preview outage must not stop a legitimate undo — the act is the authority
    expect(confirmBtn().disabled).toBe(false);
    await user.click(confirmBtn());
    await waitFor(() => expect(calls.length).toBe(1));
  });

  it("🔑 a refusal AFTER a clean forecast is not a contradiction — the failure path is never skipped", async () => {
    // the case TASK-546 §4 documented: the preview cannot see `UNDO_PLAN_WOULD_CHANGE`, decided after the act's writes
    refuseWith = new FakeApiError("แผนคอร์สเปลี่ยนไปแล้ว ย้อนรายการนี้ไม่ได้", "UNDO_PLAN_WOULD_CHANGE");
    const user = userEvent.setup();
    mount(row({ id: "bk-plan", status: "SICK_LEAVE", checkinChannel: null }));

    await user.click(await screen.findByText("Undo leave"));
    await waitFor(() => expect(previewBox()).toBe("ready"));
    expect(confirmBtn().disabled).toBe(false);

    await user.click(confirmBtn());
    // the act's sentence appears, the dialog stays, and the forecast is still on screen beside it — both are true
    expect(await screen.findByText("แผนคอร์สเปลี่ยนไปแล้ว ย้อนรายการนี้ไม่ได้")).toBeTruthy();
    expect(screen.getByText("Undo this leave?")).toBeTruthy();
    expect(screen.getByText(/may still refuse/i)).toBeTruthy();
    expect(calls.length).toBe(1);
  });
});
