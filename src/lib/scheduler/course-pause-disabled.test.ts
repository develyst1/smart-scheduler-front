import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { canPauseBooking, canResumeBooking } from "./pause-booking";
import { canPauseCourse, canResumeCourse } from "./course-lifecycle";

/**
 * 🔴 TASK-285 (2026-09-08) — the COURSE pause/resume control is off for tonight's release (DEF-2: resume
 * relocates a course into the wrong week). **TASK-282 fixes it and turns this back on.**
 *
 * ⚠️ **This file is TEMPORARY and dies with the flag.** It exists because "the button is hidden" is an absence,
 * and an absence cannot be asserted by calling anything — the same shape TASK-261 used for AC-8.
 *
 * 🔑 **The last block is the one that matters tonight**: the BOOKING pause tray (REQ-076) is a different
 * feature that ships in this same release, and the two share a word and nothing else.
 */

const PLAN_MODAL = "src/components/partials/Bookings/PlanModal.tsx";
const read = (p: string) => readFileSync(p, "utf8");

describe("🔴 BOTH halves of the COURSE pause are hidden — not one", () => {
  const src = read(PLAN_MODAL);

  it("the flag is off", () => {
    expect(src).toContain("const COURSE_PAUSE_RESUME_ENABLED = false;");
  });

  it("the pause button is behind it", () => {
    // `endCourse.drop` is พักคอร์ส. Hiding this alone would be fine; hiding only the OTHER one would not.
    const gate = src.slice(0, src.indexOf('{t("endCourse.drop")}'));
    expect(gate.lastIndexOf("COURSE_PAUSE_RESUME_ENABLED &&")).toBeGreaterThan(
      gate.lastIndexOf("<Group gap=\"xs\">"),
    );
  });

  it("the resume button is behind it too", () => {
    const gate = src.slice(0, src.indexOf('{t("endCourse.resume")}'));
    expect(gate.lastIndexOf("COURSE_PAUSE_RESUME_ENABLED &&")).toBeGreaterThan(-1);
  });

  it("🔴 hiding only ONE half would strand a paused course — so both gates exist", () => {
    // The failure this guards: an admin pauses a course, then finds no control that touches it.
    const gates = src.match(/COURSE_PAUSE_RESUME_ENABLED &&/g) ?? [];
    expect(gates.length).toBe(2);
  });

  it("the gate is on the BUTTONS, never on `courseDropped`", () => {
    // Gating the flag itself would make a paused course compute as *ended* and claim "this course has ended",
    // which is a different and wrong statement to put on screen.
    expect(src).toContain("const courseDropped = canResumeCourse(courseStatus);");
    expect(src).not.toMatch(/courseDropped\s*=\s*COURSE_PAUSE_RESUME_ENABLED/);
  });
});

describe("🚫 nothing was deleted — it goes back with one line", () => {
  const src = read(PLAN_MODAL);

  it("the dialog is still mounted and still imported", () => {
    expect(src).toContain("import DropResumeDialog");
    expect(src).toContain("<DropResumeDialog");
  });

  it("REQ-084's guard rides dormant — it is not ripped out on deploy night", () => {
    expect(src).toContain("canResumeCourse(courseStatus)");
    expect(canPauseCourse("DROPPED")).toBe(false);
    expect(canResumeCourse("DROPPED")).toBe(true);
  });
});

describe("🔑 the BOOKING pause tray (REQ-076) is UNTOUCHED — it ships tonight", () => {
  it("its predicate is a different function and still says yes", () => {
    // ⚠️ The two features share the word "pause" and nothing else: different requirement, different predicate
    // file, different components. This is the one thing that must not break tonight.
    expect(canPauseBooking({ bookingType: "SINGLE_SESSION", status: "CONFIRMED" })).toBe(true);
    expect(canResumeBooking({ status: "PAUSED" })).toBe(true);
  });

  it("no booking-side file mentions the course flag", () => {
    for (const file of [
      "src/components/partials/Calendar/PausedTray.tsx",
      "src/components/partials/Calendar/CalendarContent.tsx",
      "src/components/partials/Calendar/Modal/BookingModal.tsx",
      "src/lib/scheduler/pause-booking.ts",
    ]) {
      expect(read(file)).not.toContain("COURSE_PAUSE_RESUME_ENABLED");
    }
  });

  it("the tray and the booking pause/resume controls are still rendered", () => {
    expect(read("src/components/partials/Calendar/CalendarContent.tsx")).toContain("<PausedTray");
    const modal = read("src/components/partials/Calendar/Modal/BookingModal.tsx");
    expect(modal).toContain("canPauseBooking(booking)");
    expect(modal).toContain("canResumeBooking(booking)");
  });
});

describe("REQ-082's expiry control is unaffected — it never went through this dialog", () => {
  it("still mounted, and still not gated by the course flag", () => {
    const panel = read("src/components/partials/Bookings/CoursePackagePanel.tsx");
    expect(panel).toContain("<EditExpiryDialog");
    expect(panel).not.toContain("COURSE_PAUSE_RESUME_ENABLED");
    expect(read("src/components/partials/Bookings/EditExpiryDialog.tsx")).toContain("<ExpiryWarningAlert");
  });
});
