/**
 * REQ-084 / TASK-262 — **which lifecycle actions a course offers**, as one predicate.
 *
 * @Sober's question was *"is the pause control derived from one rule or written per surface?"* — the sweep
 * found **one** surface offering it (`PlanModal`), so there were no copies to unify. These exist anyway, for
 * the reason `canPauseBooking` exists in TASK-261: the gate was a chain of `&&` in JSX, and **a rule that only
 * lives in JSX cannot be tested** — which is exactly how it came to be wrong without anything failing.
 *
 * 🔴 **The defect was never the condition. It was the input.**
 * `PlanModal` read `plan.summary.status`, and the entitlement-plan payload **does not carry it**
 * (`scheduler.service.ts` builds the course summary as its own literal: `size · leaveUsed · leaveQuota ·
 * maxWeek · owedCount · expiryDate` — no `status`, no `endedAt`). So `courseStatus` was `undefined` on every
 * course, `courseDropped` was `false` on every course, and `courseWritable` was `true` on every course.
 *
 * **That one omission produced both halves of the owner's report:** `พักคอร์ส` stayed on a paused course
 * (AC-A), *and* the resume button — which has been in the code since `32474d7` — never rendered, because it is
 * gated on the same `DROPPED` that never arrived.
 */

import type { CourseStatus } from "@/types/app/scheduler";

/**
 * A status the caller could not resolve. 🔴 **Kept as an explicit case rather than folded into a default**,
 * because the two possible defaults are both wrong in opposite directions and the choice has to be visible:
 * treat unknown as writable and a paused course keeps offering พักคอร์ส (the defect); treat it as unwritable
 * and *every* course loses the button (AC-B, which is the far bigger regression — every course in the product
 * is not dropped).
 *
 * ⇒ Callers must supply the real status. `PlanModal` does, from the list row that already holds it.
 */
export type ResolvedCourseStatus = CourseStatus | undefined;

/** AC-A — พักคอร์ส is offered only while the course is genuinely running. */
export const canPauseCourse = (status: ResolvedCourseStatus): boolean => status === "ACTIVE";

/** REQ-084's feature half is the BUTTON's behaviour, not this: resume is offered exactly when it is paused. */
export const canResumeCourse = (status: ResolvedCourseStatus): boolean => status === "DROPPED";

/**
 * Everything that writes to the schedule. A `DROPPED` or ended course refuses these server-side
 * (`assertCourseWritable`), so offering them hands staff a button that 409s.
 */
export const isCourseWritable = (status: ResolvedCourseStatus): boolean => status === "ACTIVE";
