import type { CoursePackage, CoursePackageView } from "@/types/app/scheduler";
import { LEAVE_QUOTA_BY_SIZE, MAX_WEEK_BY_SIZE } from "@/types/app/scheduler";

/**
 * คำนวณสถานะโควตาการลาของคอร์ส
 *
 * กฎ (จาก Requirement.md):
 *  - คอร์ส 4 ชม. ลาได้ 1 ครั้ง (ขยายถึงสัปดาห์ที่ 5)
 *  - คอร์ส 6 ชม. ลาได้ 2 ครั้ง
 *  - คอร์ส 10 ชม. ลาได้ 3 ครั้ง (ขยายถึงสัปดาห์ที่ 13)
 *  - ลาเกินโควตา → ล็อกไม่ให้เลื่อนตารางเพิ่ม จนกว่าแอดมินจะปลดล็อก
 */
export function toCourseView(course: CoursePackage): CoursePackageView {
  const leaveQuota = LEAVE_QUOTA_BY_SIZE[course.size];
  const maxWeek = MAX_WEEK_BY_SIZE[course.size];
  const leaveRemaining = Math.max(0, leaveQuota - course.leaveUsed);
  const leaveLocked = course.leaveUsed >= leaveQuota && !course.adminUnlocked;

  // REQ-036 — normalise the ended fields so every view answers "is this course ended?" the same way, whether it
  // came from the API mapper or from an offline CoursePackage.
  return {
    ...course,
    leaveQuota,
    maxWeek,
    leaveRemaining,
    leaveLocked,
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

/** true = ยังลาเพิ่ม/เลื่อนตารางได้ */
export function canTakeLeave(course: CoursePackage): boolean {
  const view = toCourseView(course);
  return view.leaveRemaining > 0 || course.adminUnlocked;
}
