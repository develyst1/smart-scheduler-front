import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { canPauseCourse, canResumeCourse, isCourseWritable } from "./course-lifecycle";
import { COURSE_STATUSES } from "@/types/app/scheduler";

/**
 * REQ-084 / TASK-262 — the defect half: a `DROPPED` course must stop offering `พักคอร์ส`.
 *
 * 🔴 **The last block is the one that matters**, because the condition in `PlanModal` was already correct and
 * the bug was that its INPUT never arrived. A test of the predicate alone would have passed on the broken
 * build — so the wiring is asserted too.
 */

describe("AC-A — a DROPPED course does not offer พักคอร์ส", () => {
  it("refuses pause when the course is paused", () => {
    expect(canPauseCourse("DROPPED")).toBe(false);
  });

  it("offers resume instead — one control, two states", () => {
    expect(canResumeCourse("DROPPED")).toBe(true);
    expect(canPauseCourse("DROPPED")).toBe(false);
  });
});

describe("AC-B — a course that is NOT dropped is unchanged", () => {
  // ⚠️ The regression that matters: every course in the product is in this state; the paused one is rare.
  it("offers พักคอร์ส on an ACTIVE course, and not resume", () => {
    expect(canPauseCourse("ACTIVE")).toBe(true);
    expect(canResumeCourse("ACTIVE")).toBe(false);
    expect(isCourseWritable("ACTIVE")).toBe(true);
  });

  it("offers neither on a course that is over", () => {
    for (const status of ["COMPLETED", "EXPIRED", "CANCELLED"] as const) {
      expect(canPauseCourse(status)).toBe(false);
      expect(canResumeCourse(status)).toBe(false);
      expect(isCourseWritable(status)).toBe(false);
    }
  });

  it("covers every status the product has — a new one cannot land unconsidered", () => {
    for (const status of COURSE_STATUSES) {
      // Pause and resume are mutually exclusive in every state, so no status can offer both.
      expect(canPauseCourse(status) && canResumeCourse(status)).toBe(false);
    }
  });
});

describe("🔴 an UNKNOWN status must not silently mean 'writable' — that was the defect", () => {
  it("offers nothing when the status could not be resolved", () => {
    // The old code read a field the payload never sent, got `undefined`, and treated it as writable — which is
    // how a paused course kept its pause button. Whatever a caller fails to supply, it must not re-open that.
    expect(canPauseCourse(undefined)).toBe(false);
    expect(canResumeCourse(undefined)).toBe(false);
    expect(isCourseWritable(undefined)).toBe(false);
  });
});

describe("the wiring — a predicate is only as good as what is fed to it", () => {
  const planModal = readFileSync("src/components/partials/Bookings/PlanModal.tsx", "utf8");

  it("PlanModal decides through the predicates, not through a local comparison", () => {
    expect(planModal).toContain("canResumeCourse(courseStatus)");
    expect(planModal).toContain("isCourseWritable(courseStatus)");
    // The literal the predicates replaced must not linger beside them — that is how a second rule is reborn.
    expect(planModal).not.toContain('courseStatus === "DROPPED"');
  });

  it("PlanModal reads the status from the PAYLOAD — the field TASK-263 restored", () => {
    // 🔴 The root cause, still pinned but at its real source. TASK-262 hand-delivered this through a prop
    // because the payload omitted it; TASK-263 put it back on the summary, so TASK-265 deleted the stand-in.
    // If the field ever goes missing again, `courseStatus` is `undefined` on every course and AC-A silently
    // stops holding — with every unit test above still green. That is why this assertion exists.
    expect(planModal).toContain("plan.summary.status");
  });

  it("the TASK-262 stand-in prop and its hand-down path are GONE (TASK-265 §4)", () => {
    expect(planModal).not.toContain("courseStatusProp");
    expect(planModal).not.toContain("courseStatus?: CourseStatus");
    expect(readFileSync("src/components/partials/Bookings/BookingsContent.tsx", "utf8")).not.toContain(
      "courseStatus",
    );
    expect(readFileSync("src/components/partials/Bookings/CoursePackagePanel.tsx", "utf8")).not.toContain(
      "onManage(c.id, c.status)",
    );
  });

  it("AC-C — the course card's unlock/relock is gated on lifecycle too, not on leave state alone", () => {
    // 🔴 The second surface the sweep found: these were gated on `leaveLocked`/`adminUnlocked` only, so a
    // DROPPED course still offered ปลดล็อก — and `updateCourse` refuses it through `assertCourseWritable`.
    // Same predicate as the plan modal's, so a future change cannot fix one and leave the other.
    expect(readFileSync("src/components/partials/Bookings/CoursePackagePanel.tsx", "utf8")).toContain(
      "isCourseWritable(c.status) &&",
    );
  });
});
