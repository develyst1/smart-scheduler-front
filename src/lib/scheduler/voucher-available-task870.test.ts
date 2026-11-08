import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { ApiClientError } from "@/lib/api/client";
import { attendRefusedToast, attendedToast } from "@/lib/scheduler/attend-outcome";
import { eligiblePickable, voucherAvailable } from "@/lib/scheduler/eligible";
import type { EligibleStudent, VoucherContext } from "@/types/app/scheduler";

/**
 * 🔴 **TASK-870 (REQ-5008) — a voucher counts the sessions already BOOKED; an attend on an empty voucher is REFUSED.** The FE half: the picker gates on the
 * server's `hoursAvailable` (never `remainingHours`), and the attend action prints the SERVER's sentence for both outcomes. 🔑 It cannot prove the server's
 * rule (Bob's tests) — only that this screen reads the right field and shows what comes back.
 */
const ctx = (over: Partial<VoucherContext> = {}): VoucherContext => ({ voucherId: "v1", totalHours: 10, usedHours: 7, remainingHours: 3, expiryDate: "2027-01-01", ...over });
const row = (c: VoucherContext): EligibleStudent => ({ id: "s1", name: "น้องมิว", nickname: null, context: c });
const t = (k: string) => `«${k}»`;

describe("the voucher picker's gate", () => {
  it("reads hoursAvailable: 3 left but all 3 already booked ⇒ NOT pickable", () => {
    expect(voucherAvailable(ctx({ hoursReserved: 3, hoursAvailable: 0 }))).toBe(0);
    expect(eligiblePickable(row(ctx({ hoursReserved: 3, hoursAvailable: 0 })), "VOUCHER")).toBe(false);
  });
  it("1 available ⇒ pickable; the card prints what a NEW session may take", () => {
    expect(eligiblePickable(row(ctx({ hoursReserved: 2, hoursAvailable: 1 })), "VOUCHER")).toBe(true);
    expect(voucherAvailable(ctx({ hoursReserved: 2, hoursAvailable: 1 }))).toBe(1);
  });
  it("an older payload without the field falls back to remainingHours (the old behaviour, nothing invented)", () => {
    expect(voucherAvailable(ctx())).toBe(3);
    expect(eligiblePickable(row(ctx({ remainingHours: 0 })), "VOUCHER")).toBe(false);
  });
  it("a course row is never gated here", () => {
    expect(eligiblePickable({ id: "s", name: "x", nickname: null, context: { courseId: "c", subject: null, size: 4, usedSessions: 4, remainingSessions: 0, leaveUsed: 0, leaveQuota: 1, expiryDate: "2027-01-01" } }, "COURSE_PACKAGE")).toBe(true);
  });
});

describe("the attend action's toast", () => {
  it("a 409 VOUCHER_EXHAUSTED shows the server's sentence unchanged, in the danger toast", () => {
    const e = new ApiClientError("VOUCHER_EXHAUSTED", "ชั่วโมงในวอยเชอร์หมดแล้ว", 409);
    e.message = "ชั่วโมงในวอยเชอร์หมดแล้ว"; // a test file elsewhere stubs the client module process-wide with another constructor shape; the sentence is what this pins
    expect(attendRefusedToast(e, t)).toEqual({ title: "«plan.genericError»", description: "ชั่วโมงในวอยเชอร์หมดแล้ว", color: "danger" });
  });
  it("a voucherWarning shows under the attended title, orange; none ⇒ the plain success toast", () => {
    expect(attendedToast({ voucherWarning: "ชั่วโมงในวอยเชอร์หมดแล้ว" }, t)).toEqual({ title: "«booking.attendedTitle»", description: "ชั่วโมงในวอยเชอร์หมดแล้ว", color: "warning" });
    expect(attendedToast({}, t)).toEqual({ title: "«booking.attendedTitle»", color: "success" });
  });
  it("the modal uses both, and stays open on a refusal (onClose only after a success)", () => {
    const src = readFileSync("src/components/partials/Calendar/Modal/BookingModal.tsx", "utf8");
    const attend = src.slice(src.indexOf("const handleAttended"), src.indexOf("// ── โหมดย้ายคาบด้วยมือ"));
    expect(attend).toContain("notify(attendedToast(res, t));");
    expect(attend).toContain("notify(attendRefusedToast(e, t));");
    expect(attend.indexOf("onClose();")).toBeLessThan(attend.indexOf("catch (e)")); // onClose is in the try, not the catch
    expect(attend.slice(attend.indexOf("catch (e)"))).not.toContain("onClose()");
  });
});
