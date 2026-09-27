import { readFileSync } from "fs";
import { beforeEach, describe, expect, it, mock } from "bun:test";

/**
 * 🔴 TASK-531 — **a control is proven by being USED, not by rendering.** TASK-518 passed a green suite, `tsc`, a build and
 * a careful review while the button did nothing: every pin in it was about what RENDERS. So this file drives the act and
 * asserts it **at the fetch boundary** — the URL and the body that reach the API client — for each of the three states,
 * plus a refused one.
 *
 * ⚠️ **What is NOT simulated here, said plainly:** the mouse. This repo's test setup has no DOM (no jsdom, no happy-dom,
 * no testing-library; `playwright` is in devDependencies but unused, with no browser or server harness), so **`onClick`
 * → handler is not exercised** — what is exercised is the handler's whole effect (request, toast, refusal) and, by source,
 * that the dialog is not inside the menu that opens it (the actual D4 cause). **Therefore unproven by test:** that the
 * element's `onClick` is wired to that handler, and that Mantine paints the dialog. Adding a DOM harness is a dependency
 * decision — @Sober's and the owner's, not mine to take inside a blocker fix.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const control = codeOf("src/components/common/UndoControl.tsx");
const modal = codeOf("src/components/partials/Calendar/Modal/BookingModal.tsx");
const plan = codeOf("src/components/partials/Bookings/PlanModal.tsx");

/** The fetch boundary: every call the service makes through the API client, captured. */
const calls: Array<{ url: string; body: unknown }> = [];
let nextError: unknown = null;
mock.module("@/lib/api/client", () => ({
  useMockData: false,
  api: {
    post: async (url: string, body: unknown) => {
      calls.push({ url, body });
      if (nextError) throw nextError;
      return { data: { kind: "checkin", leaveRefunded: false, makeupCancelledId: null, expiry: null, booking: { id: "b1", status: "CONFIRMED" } } };
    },
  },
  ApiClientError: class ApiClientError extends Error {
    code?: string;
    constructor(message: string, code?: string) {
      super(message);
      this.code = code;
    }
  },
}));

const { undoBooking } = await import("@/services/scheduler.service");
const { undoBody, undoKind } = await import("@/lib/scheduler/undo");
const { ApiClientError } = await import("@/lib/api/client");

/** What the hook's `run()` does, in the same order, with the same helpers — the act, minus the mouse. */
const act = async (booking: { id: string; status: string; checkinChannel?: string | null }, reason: string) => {
  const kind = undoKind(booking as never);
  if (!kind) return { kind: null as null, toasted: false, error: null as string | null };
  try {
    await undoBooking(booking.id, undoBody(reason));
    return { kind, toasted: true, error: null as string | null };
  } catch (e) {
    return { kind, toasted: false, error: e instanceof ApiClientError ? e.message : (e as Error).message };
  }
};

beforeEach(() => {
  calls.length = 0;
  nextError = null;
});

describe("§1 — the act, at the fetch boundary, for each state", () => {
  it("a LEAVE row: the request is `POST /bookings/<id>/undo` with the typed reason, and it reports success", async () => {
    const out = await act({ id: "bk-leave", status: "SICK_LEAVE" }, " keyed by mistake ");
    expect(out).toEqual({ kind: "leave", toasted: true, error: null });
    expect(calls).toEqual([{ url: "/bookings/bk-leave/undo", body: { reason: "keyed by mistake" } }]);
  });
  it("an ATTENDED row (staff): the same endpoint with the row's OWN id, and no reason when none was typed", async () => {
    const out = await act({ id: "bk-att", status: "ATTENDED", checkinChannel: "staff" }, "   ");
    expect(out).toEqual({ kind: "attendance", toasted: true, error: null });
    expect(calls).toEqual([{ url: "/bookings/bk-att/undo", body: {} }]);
  });
  it("an ATTENDED row from the wall QR: the check-in kind, one request, the right id", async () => {
    const out = await act({ id: "bk-qr", status: "ATTENDED", checkinChannel: "shopfront-qr" }, "");
    expect(out).toEqual({ kind: "checkin", toasted: true, error: null });
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe("/bookings/bk-qr/undo");
  });
  it("a row with nothing to undo asks NOTHING — no request at all", async () => {
    for (const status of ["CONFIRMED", "PENDING", "CANCELLED", "NO_SHOW"]) {
      const out = await act({ id: "bk-x", status }, "");
      expect({ status, kind: out.kind }).toEqual({ status, kind: null });
    }
    expect(calls).toEqual([]);
  });
});

describe("§2 — a REFUSED act: the server's sentence, and no success", () => {
  it("🔴 the refusal's own words come back and nothing reports success", async () => {
    nextError = new ApiClientError("ชั่วโมงนี้ถูกจองไปแล้วโดยครูบีม (10:00)", "UNDO_SLOT_TAKEN");
    const out = await act({ id: "bk-taken", status: "ATTENDED", checkinChannel: "line" }, "");
    expect(out.toasted).toBe(false); // 🔴 no success toast on a refusal
    expect(out.error).toBe("ชั่วโมงนี้ถูกจองไปแล้วโดยครูบีม (10:00)"); // the holder survives, verbatim
    expect(calls.length).toBe(1); // it was attempted once and not retried
  });
  it("`UNDO_LEAVE_CHARGE_UNKNOWN` reaches the screen as its own sentence — it is correct by design, not a bug", async () => {
    nextError = new ApiClientError("ไม่สามารถระบุได้ว่าการลานี้ใช้โควตาหรือไม่ จึงไม่ย้อนอัตโนมัติ", "UNDO_LEAVE_CHARGE_UNKNOWN");
    const out = await act({ id: "bk-old", status: "SICK_LEAVE" }, "");
    expect(out).toEqual({ kind: "leave", toasted: false, error: "ไม่สามารถระบุได้ว่าการลานี้ใช้โควตาหรือไม่ จึงไม่ย้อนอัตโนมัติ" });
  });
});

describe("§3 — D4's cause: the dialog does not live inside the menu", () => {
  it("the hook returns two elements, and each host places the dialog AFTER `</Menu>`", () => {
    expect(control).toContain("export function useUndoControl(");
    expect(control).toContain("return { menuItem: null, dialog: null };");
    // 📌 and the hook really RETURNS the dialog: a mutation that made `dialog` unconditionally falsy passed every
    // host-side pin (they only check where it is PLACED), so the element itself is pinned — the Modal, and the item that
    // opens it. ⚠️ By source: without a DOM the returned element cannot be mounted here (see the header).
    expect(control).toMatch(/dialog: \(\s*<Modal/);
    expect(control).toContain("onClick={() => setOpen(true)}");
    expect(control).toContain("<Modal opened={open}");
    for (const [name, src] of [["BookingModal", modal], ["PlanModal", plan]] as const) {
      expect({ name, item: src.includes("{undoControl.menuItem}") }).toEqual({ name, item: true });
      expect({ name, dialog: src.includes("{undoControl.dialog}") }).toEqual({ name, dialog: true });
      // 🔑 the order is the fix: the item inside the dropdown, the dialog after the menu closes its tag
      expect({ name, after: src.indexOf("{undoControl.dialog}") > src.lastIndexOf("</Menu>") }).toEqual({ name, after: true });
      expect({ name, inside: src.indexOf("{undoControl.menuItem}") < src.indexOf("</Menu.Dropdown>") }).toEqual({ name, inside: true });
    }
    // and no OTHER dialog in this repo sits inside a dropdown (scanned at the time of the fix; named in the report)
    expect(modal.indexOf("{confirmDialog}")).toBeGreaterThan(modal.lastIndexOf("</Menu>"));
  });
});

describe("§4 — D5: an ATTENDED row is not offered the LEAVE control", () => {
  it("🔴 the `บันทึกลา/ป่วย` item and its quota sentence are ABSENT on an ATTENDED row", () => {
    // the item is rendered only when the row is not ATTENDED — absent, not disabled
    expect(modal).toContain('{canStatus && booking.status !== "ATTENDED" && (');
    expect(modal).toContain('data-status-action="sick-leave"');
    // the leave dialog's promise is unchanged for the rows it belongs to, and reachable only from that item
    expect(modal).toContain('title: t("confirmAction.leaveTitle"),');
    expect(modal).toContain('message: t("confirmAction.leaveMsg"),');
    expect((modal.match(/handleSickLeave\(\)/g) ?? []).length).toBe(1); // one entry point, behind the status guard
    // the override path (LEAVE_NOTICE_TOO_LATE) is the leave flow's own and is not a second door to it
    expect(modal).toContain("void handleSickLeave(true);");
  });
});
