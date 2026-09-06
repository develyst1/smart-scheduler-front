import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import {
  PAUSABLE_BOOKING_TYPES,
  canPauseBooking,
  canResumeBooking,
  canSubmitResume,
} from "./pause-booking";
import { OFF_CALENDAR_STATUSES } from "@/types/app/scheduler";
import { dictionaries } from "@/lib/i18n/dictionaries";
import type { BookingStatus, BookingType } from "@/types/app/scheduler";

/**
 * SPEC-075 / REQ-076 / TASK-261 — the พัก rules.
 *
 * 🔴 **In REQ-076 the absences ARE the requirement** (AC-2 · AC-3 · AC-8 · AC-10), so they are what is pinned
 * here, and each one is named by its AC number so a failure says which acceptance criterion broke rather than
 * which function did.
 */

const b = (bookingType: BookingType, status: BookingStatus) => ({ bookingType, status });

describe("AC-1 — พัก is offered for exactly three booking types", () => {
  it("offers it for 1HR, voucher and first trial", () => {
    for (const type of ["SINGLE_SESSION", "VOUCHER", "FIRST_TRIAL"] as const) {
      expect(canPauseBooking(b(type, "CONFIRMED"))).toBe(true);
    }
  });

  it("names exactly those three and nothing else", () => {
    expect([...PAUSABLE_BOOKING_TYPES].sort()).toEqual(["FIRST_TRIAL", "SINGLE_SESSION", "VOUCHER"]);
  });
});

describe("AC-3 — พัก is NEVER offered on a course booking, because REQ-071 already owns that", () => {
  it("refuses COURSE_PACKAGE in every status", () => {
    for (const status of ["PENDING", "CONFIRMED", "EXTENDED", "SICK_LEAVE"] as const) {
      expect(canPauseBooking(b("COURSE_PACKAGE", status))).toBe(false);
    }
  });

  it("does not carry COURSE_PACKAGE in the pausable list", () => {
    // A second door onto "pause a course" would be a different behaviour wearing the same word.
    expect(PAUSABLE_BOOKING_TYPES).not.toContain("COURSE_PACKAGE");
  });
});

describe("AC-2 — พัก is NEVER offered on a booking that has already happened", () => {
  it("refuses ATTENDED — the status the requirement names", () => {
    expect(canPauseBooking(b("SINGLE_SESSION", "ATTENDED"))).toBe(false);
  });

  it("refuses NO_SHOW and CANCELLED too — 'not yet attended' is the intent, not just the label", () => {
    expect(canPauseBooking(b("VOUCHER", "NO_SHOW"))).toBe(false);
    expect(canPauseBooking(b("FIRST_TRIAL", "CANCELLED"))).toBe(false);
  });

  it("refuses a booking that is already paused — the control there is Resume, not a second Pause", () => {
    expect(canPauseBooking(b("SINGLE_SESSION", "PAUSED"))).toBe(false);
    expect(canResumeBooking({ status: "PAUSED" })).toBe(true);
    expect(canResumeBooking({ status: "CONFIRMED" })).toBe(false);
  });
});

describe("AC-13 — resume accepts ANY date and time, so the only check is that both were chosen", () => {
  it("blocks submit until a date and a time are picked", () => {
    expect(canSubmitResume(null, null)).toBe(false);
    expect(canSubmitResume("2026-09-20", null)).toBe(false);
    expect(canSubmitResume(null, "10:00")).toBe(false);
  });

  it("accepts a slot that is nothing like the original — 'ตอนไหนก็ได้'", () => {
    expect(canSubmitResume("2026-12-31", "17:00")).toBe(true);
  });
});

describe("AC-10 — a paused booking is never drawn in the calendar grid", () => {
  it("is in the one off-calendar list both grids read", () => {
    expect(OFF_CALENDAR_STATUSES).toContain("PAUSED");
  });

  it("uses ONE literal, so the day view and the week view cannot come to disagree", () => {
    // TASK-239's lesson, applied on this side: two copies of "which statuses are off the calendar" is exactly
    // how one grid ends up rendering something the other hides.
    for (const file of [
      "src/components/partials/Calendar/CalendarGrid.tsx",
      "src/components/partials/Calendar/CalendarWeekGrid.tsx",
    ]) {
      const src = readFileSync(file, "utf8");
      expect(src).toContain("OFF_CALENDAR_STATUSES.includes(b.status)");
      // The literal it replaced must not linger beside it — that is how a second list is reborn.
      expect(src).not.toContain('b.status !== "CANCELLED"');
    }
  });
});

describe("🚫 AC-8 — offering a reason here would teach staff that พัก and ยกเลิก are the same act", () => {
  // The absence IS the requirement, so it is asserted at the two places a reason could get in: the call, and
  // the screen. REQ-009's list lives on `endCourse.*` and is what must NOT appear on this path.
  it("the pause call carries no reason — the service takes an id and the endpoint takes no body", () => {
    const src = readFileSync("src/services/scheduler.service.ts", "utf8");
    const fn = src.slice(src.indexOf("export const pauseBooking"), src.indexOf("export const resumeBooking"));
    expect(fn).toContain("/pause`");
    expect(fn).not.toContain("reason");
    expect(fn).not.toContain("reasonCode");
  });

  it("the pause flow renders no reason field and no reason picker", () => {
    const src = readFileSync("src/components/partials/Calendar/Modal/BookingModal.tsx", "utf8");
    const flow = src.slice(src.indexOf("const handlePause"), src.indexOf("const handleResume"));
    expect(flow).toContain("calendar.pauseTitle");
    expect(flow).not.toContain("reasonCode");
    expect(flow).not.toContain("END_COURSE_REASONS");
    expect(flow).not.toContain("endCourse.");
  });
});

describe("REQ-076 §3 — @Porter's copy, verbatim in Thai", () => {
  // 🚫 "พัก" is the customer's own word: never "ระงับ", never "Hold". A test rather than a comment, because a
  // later editor "improving" the wording is exactly how a customer's own term gets replaced by ours.
  it("uses the four agreed Thai strings", () => {
    expect(dictionaries.th.calendar.pausedTray).toBe("รายการที่พักไว้");
    expect(dictionaries.th.calendar.pausedTrayEmpty).toBe("ไม่มีรายการที่พักไว้");
    expect(dictionaries.th.calendar.pauseAction).toBe("พัก");
    expect(dictionaries.th.calendar.resumeAction).toBe("นำกลับมาลงตาราง");
    expect(dictionaries.th.bookingStatus.PAUSED).toBe("พัก");
  });

  it("never says ระงับ or Hold for this action", () => {
    expect(dictionaries.th.calendar.pauseAction).not.toContain("ระงับ");
    expect(dictionaries.th.calendar.pauseTitle).not.toContain("ระงับ");
  });
});

describe("AC-11 — the empty tray is a sentence, and it is rendered when the list is empty", () => {
  it("renders the empty line instead of returning null", () => {
    const src = readFileSync("src/components/partials/Calendar/PausedTray.tsx", "utf8");
    expect(src).toContain("calendar.pausedTrayEmpty");
    // 🔴 The failure this guards is a tray that disappears at zero. `bookings.length === 0` must select the
    // empty COPY, never an early return — a control that vanishes when empty teaches staff it is not there.
    expect(src).not.toMatch(/if \(!?bookings\.length\)\s*return null/);
  });

  it("is mounted by the calendar page unconditionally, not behind a non-empty check", () => {
    const src = readFileSync("src/components/partials/Calendar/CalendarContent.tsx", "utf8");
    expect(src).toContain("<PausedTray");
    expect(src).not.toMatch(/pausedBookings\.length\s*>\s*0\s*&&\s*<PausedTray/);
  });
});
