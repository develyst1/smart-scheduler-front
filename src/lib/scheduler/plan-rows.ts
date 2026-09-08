import type { PlanSession } from "@/types/app/scheduler";

/**
 * 🔴 TASK-289 — **which sessions the PLAN view shows.**
 *
 * A re-planned course showed **eight rows for four sessions**: its new plan beside the sessions the pause had
 * cancelled. Nothing underneath was wrong — the counts, the money and the plan itself were all correct — but
 * no admin can read that, and *"no admin can unpick 14 rows into 6"* was @Porter's first sentence about it.
 *
 * @Sober's ruling: **the plan shows the LIVE plan; a pause-cancelled session is HISTORY.** It is not hidden —
 * `CourseHistoryModal` already answers *"what happened to this course"*, and `BookingsTable` still lists the
 * rows, correctly. **The row does not move; the VIEW does.**
 *
 * 🚫 **`cancelledByPause` and nothing else.** It is derived server-side (TASK-290) so the Thai pause note never
 * crosses the wire, and it is **narrow on purpose**: three other paths also leave a `CANCELLED` row carrying
 * text — the reconciler's trim, an early course ending, and a hand cancel with the admin's own reason — and the
 * backend asserts `false` for them. **Read it; do not widen it, and do not add a second condition beside it.**
 *
 * ⚠️ **A HAND-cancelled session has it `false` and MUST still show.** Hiding every cancelled row was the
 * shortcut that was explicitly not taken: a session an admin cancelled is a different fact from one a pause
 * swept, and that case has not been ruled on.
 *
 * ⚠️ **Absent means "not a pause".** On a payload that predates the field, showing a row we cannot classify is
 * the safe direction — hiding one would lose information against an older server.
 */
export const visiblePlanRows = (sessions: readonly PlanSession[]): PlanSession[] =>
  sessions.filter((s) => !s.cancelledByPause);
