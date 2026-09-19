import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { CONFIRMABLE_STATUSES, canOfferConfirm } from "@/components/partials/Calendar/Modal/BookingModal";

/**
 * TASK-409 (REQ-094 reopen) — `Confirm + LINE` on the booking modal for an EXTENDED make-up as for a PENDING booking.
 * The door was `=== "PENDING"`, so the purple could never be confirmed on the single modal and the CONFIRMED-only
 * day-end never cut it. ONE list beside `MOVABLE_STATUSES`; the door reads it through a pure predicate; nothing else
 * (the Attended door, the hue, bulk-confirm, the day-end) is touched.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const modal = codeOf("src/components/partials/Calendar/Modal/BookingModal.tsx");

describe("TASK-409 — the confirm door, by value both ways", () => {
  it("EXTENDED ⇒ the door; PENDING ⇒ the door; CONFIRMED · ATTENDED · SICK_LEAVE · CANCELLED · PAUSED · NO_SHOW ⇒ no door", () => {
    expect([...CONFIRMABLE_STATUSES]).toEqual(["PENDING", "EXTENDED"]);
    expect(canOfferConfirm("EXTENDED")).toBe(true);
    expect(canOfferConfirm("PENDING")).toBe(true);
    for (const s of ["CONFIRMED", "ATTENDED", "SICK_LEAVE", "CANCELLED", "PAUSED", "NO_SHOW", "PENDING_RESCHEDULE"] as const) expect(canOfferConfirm(s)).toBe(false);
  });
  it("the JSX reads the predicate (no second `===`); the same handler and notice; the Attended door untouched", () => {
    expect(modal).toContain("{canOfferConfirm(booking.status) && canStatus && (");
    expect(modal).not.toMatch(/status === "PENDING" && canStatus/);
    expect(modal).not.toMatch(/status === "EXTENDED"/); // one list, not a second literal
    const door = modal.slice(modal.indexOf("{canOfferConfirm(booking.status) && canStatus && ("), modal.indexOf("{menuHasItems && ("));
    expect(door).toContain("onClick={handleConfirm}");
    expect(door).toContain('{t("booking.confirmBtn")}');
    expect(modal).toMatch(/\{canAttend && \(\s*<Button\s+variant="default"\s+leftSection=\{<BadgeCheck/);
  });
});
