/**
 * TASK-541 (Tanya, TEST-075 F2) — **what the leave dialog may CLAIM about this row.**
 *
 * 🔴 The defect: on a **1-HR** booking the dialog said *"this uses one of the course's leaves and adds a make-up session"*
 * and **neither happens** (`leaveRefunded: false`, `makeupCancelledId: null`). 🔑 **TASK-514's shape for the third time —
 * a dialog describing a DIFFERENT booking's behaviour** — and the damage is not cosmetic: **an admin who believes the
 * leave costs the family an entitlement avoids recording it**, so **the record ends up wrong in order to protect a family
 * from something that was never going to happen.**
 *
 * 🔑 **The deciding fact is NOT the booking type — it is whether the row is COURSE-BACKED.** The server's leave branch
 * (`scheduler.service.ts`, `action === "sick-leave"`) does the quota increment and the make-up insert inside one
 * condition, `current.courseId && current.course`; every other type falls straight through to the status write and the
 * notice. And the FE's own mapper sets `courseId: dto.course?.id`, so the row carries exactly that fact. ⇒ keying on
 * `bookingType` would have been wrong for the one case that matters most: **a GROUP row's SEATS are ordinary rows that
 * may each carry their own `courseId`**, so two seats in one group can honestly deserve different sentences.
 *
 * 🚫 **What this file refuses to claim.** Two sub-cases live INSIDE the course branch and are not decided here:
 * an **over-quota** course leave (`locked`) spends nothing and appends nothing, and a **`planned_at_creation`** row gets
 * its make-up while charging no quota. The first is knowable here but the course dialog is pinned byte-identical
 * (TASK-541 §2); the second **is not in the payload at all**. Both are reported to @Sober rather than guessed at —
 * ⚠️ *a dialog that omits a consequence is recoverable; one that invents a consequence changes what an admin decides.*
 */
import type { Booking } from "@/types/app/scheduler";

/** The words a course-backed row has had since REQ-073. 🚫 Byte-identical — TASK-541 §2 pins it. */
export const LEAVE_MSG_COURSE = "confirmAction.leaveMsg";
/** The words for every row with no course behind it: the leave is recorded, and **nothing is promised**. */
export const LEAVE_MSG_NO_COURSE = "confirmAction.leaveMsgNoCourse";
/**
 * 🔨 **The addendum (@Sober, 2026-09-28): an OVER-QUOTA course leave.** When the course has no leave left the server
 * writes the status, **spends no quota, appends no make-up** and answers `locked: true`. 🔑 **That is this task's own
 * defect sitting inside the sentence §2 froze** — the freeze existed to stop the course words drifting while the 1-HR
 * case changed, **not to preserve a falsehood.**
 *
 * 📌 **Corrected in TASK-543:** this first recomputed `!canTakeLeave` from `leaveRemaining` + `adminUnlocked`. The server
 * already sends that answer as `CourseSummary.leaveLocked` (`leaveUsed >= quota && !adminUnlocked` — the same condition,
 * negated), so **the FE now READS the fact instead of keeping a second copy of the rule.** 🚫 Two copies of one condition
 * is how a cancelled course kept a green `ปกติ` badge; a dialog is not a better place for that mistake than a badge was.
 */
export const LEAVE_MSG_COURSE_LOCKED = "confirmAction.leaveMsgCourseLocked";
/**
 * 🔨 **TASK-547 §1 (my held residual (2), now that TASK-542 sends the fact):** a leave **DECLARED when the course was
 * created** appends its make-up and **charges no quota** — the server's own condition is
 * `charges = courseId && course && canTakeLeave(course) && !plannedAtCreation`.
 * 🔑 So this is the mirror of the locked case: there the make-up is missing, here the quota spend is — and today's
 * sentence promised both in both.
 */
export const LEAVE_MSG_COURSE_DECLARED = "confirmAction.leaveMsgCourseDeclared";

/**
 * Which body this row's leave dialog gets. 🔑 One fact, read once: a course id means the server's course branch will
 * run, and nothing else does. An absent, empty or whitespace id is **no course** — the safest reading, because the
 * sentence that claims least is the one that cannot mislead an admin into not recording a leave at all.
 */
export const leaveClaimKey = (b: Pick<Booking, "courseId" | "courseLeaveLocked" | "plannedAtCreation">): string => {
  if (!(typeof b.courseId === "string" && b.courseId.trim().length > 0)) return LEAVE_MSG_NO_COURSE;
  // 🔑 The locked sentence is said only when the server SAYS locked. `null`/absent (an older payload) keeps today's course
  // words: it is not 'claiming least' to swap one pair of claims for another on a guess. 🚫 And `=== true` on purpose — a
  // missing fact must not read as a truth.
  if (b.courseLeaveLocked === true) return LEAVE_MSG_COURSE_LOCKED;
  // 🔑 LOCKED is checked FIRST because the server checks it first: over quota ⇒ neither quota nor make-up, whether or not
  // the leave was declared at creation (`canTakeLeave` gates the whole branch). 🚫 And `=== true` again — an older payload
  // without the fact keeps today's words rather than claiming a free absence nobody told us about.
  if (b.plannedAtCreation === true) return LEAVE_MSG_COURSE_DECLARED;
  return LEAVE_MSG_COURSE;
};
