import type { CoursePackage, CoursePackageView } from "@/types/app/scheduler";
import { EXTRA_WEEKS_BY_SIZE, MAX_WEEK_BY_SIZE } from "@/types/app/scheduler";

/**
 * 🔴 TASK-658 (REQ-112) — the course view, **without any leave arithmetic**.
 *
 * This used to compute a leave QUOTA, what was LEFT of it and whether the course was LOCKED. None of those exist now:
 * there is no allowance, nothing is locked, and `canTakeLeave` is gone with them. 🔑 What stays is the course's own
 * ceiling (`maxWeek`, the base window — the server owns the real expiry) and the lifecycle word.
 * `leaveUsed` is a plain COUNT of leaves taken; nothing gates on it.
 */
export function toCourseView(course: CoursePackage): CoursePackageView {
  const leaveQuota = EXTRA_WEEKS_BY_SIZE[course.size]; // the wire name `leaveQuota` is unchanged; the value is the base window
  const maxWeek = MAX_WEEK_BY_SIZE[course.size];

  // REQ-036 — normalise the ended fields so every view answers "is this course ended?" the same way, whether it
  // came from the API mapper or from an offline CoursePackage.
  return {
    ...course,
    leaveQuota,
    maxWeek,
    endedAt: course.endedAt ?? null,
    endReason: course.endReason ?? null,
    // TASK-189 — lifecycle is the SERVER's word. Offline (no server) the only honest local answer is the one fact
    // this shape actually carries: cancelled or not. Never re-derive COMPLETED/EXPIRED here — that second
    // computation is the bug this task removes.
    // Precedence mirrors the server's (CANCELLED → DROPPED → …). Offline still does NOT guess
    // COMPLETED/EXPIRED — those need the clock and real usage, and inventing them here is the
    // re-derivation TASK-189 removed.
    status: course.endedAt
      ? "CANCELLED"
      : course.droppedAt
        ? "DROPPED"
        : "ACTIVE",
  };
}
