/**
 * TASK-541 (Tanya, TEST-075 F2) — **what the leave dialog may CLAIM about this row.**
 *
 * 🔴 The defect: on a **1-HR** booking the dialog said *"this uses one of the course's leaves and adds a make-up session"*
 * and **neither happens**. 🔑 **TASK-514's shape for the third time — a dialog describing a DIFFERENT booking's
 * behaviour** — and the damage is not cosmetic: **an admin who believes the leave costs the family an entitlement avoids
 * recording it**, so **the record ends up wrong in order to protect a family from something that was never going to
 * happen.**
 *
 * 🔑 **The deciding fact is NOT the booking type — it is whether the row is COURSE-BACKED.** The server's leave branch
 * (`scheduler.service.ts`, `action === "sick-leave"`) appends the make-up inside one condition, `current.courseId &&
 * current.course`; every other type falls straight through to the status write and the notice. And the FE's own mapper
 * sets `courseId: dto.course?.id`, so the row carries exactly that fact. ⇒ keying on `bookingType` would have been wrong
 * for the one case that matters most: **a GROUP row's SEATS are ordinary rows that may each carry their own `courseId`.**
 *
 * 🔴 **TASK-658 (REQ-112) — THREE bodies now, not four.** There is **no leave allowance and nothing is ever locked**, so
 * the *over-allowance* body is GONE (and with it the row's lock flag, the mapper's copy of it and the constant that named
 * it). 🚫 This file must never learn the words for either again — a test pins that over the whole dictionary scope.
 *
 * 🚫 **What this file still refuses to claim.** Whether the make-up FITS is the server's to decide (a leave with no room
 * is REFUSED, and arrives as the server's own sentence) — ⚠️ *a dialog that omits a consequence is recoverable; one that
 * invents a consequence changes what an admin decides.*
 */
import type { Booking } from "@/types/app/scheduler";

/** A course-backed row: a make-up is added in the next free week, and the course's end date does not change. */
export const LEAVE_MSG_COURSE = "confirmAction.leaveMsg";
/** The words for every row with no course behind it: the leave is recorded, and **nothing is promised**. */
export const LEAVE_MSG_NO_COURSE = "confirmAction.leaveMsgNoCourse";
/**
 * 🔨 **TASK-547 §1:** a leave **DECLARED when the course was created** — one of the three cases that moves the end date
 * (one week later). 🔑 It is the only course-backed leave whose sentence differs.
 */
export const LEAVE_MSG_COURSE_DECLARED = "confirmAction.leaveMsgCourseDeclared";

/**
 * Which body this row's leave dialog gets. 🔑 One fact, read once: a course id means the server's course branch will
 * run, and nothing else does. An absent, empty or whitespace id is **no course** — the safest reading, because the
 * sentence that claims least is the one that cannot mislead an admin into not recording a leave at all.
 */
export const leaveClaimKey = (b: Pick<Booking, "courseId" | "plannedAtCreation">): string => {
  if (!(typeof b.courseId === "string" && b.courseId.trim().length > 0)) return LEAVE_MSG_NO_COURSE;
  // 🔑 `=== true` on purpose — an older payload without the fact keeps today's words rather than claiming a week the
  // server never said it would add.
  if (b.plannedAtCreation === true) return LEAVE_MSG_COURSE_DECLARED;
  return LEAVE_MSG_COURSE;
};
