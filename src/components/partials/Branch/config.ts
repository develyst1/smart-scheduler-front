/**
 * TASK-898 (F1, SPEC-099 §9) SHIP GATE. `false` ⇒ the Branch field is INERT: no select anywhere, no `branch` on any request, nothing shown.
 * SB accepts a `branch` today but only STORES it after TASK-889 half 2 + its migration; until then a sent value is ignored and every DTO says
 * BRAVO, so a select that does nothing would mislead the admin. Flip this to `true` in one line with that deploy.
 */
export const BRANCH_LIVE = true;
