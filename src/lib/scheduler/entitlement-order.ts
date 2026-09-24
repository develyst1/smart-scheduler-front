/**
 * REQ-105 §2 / SPEC-091 §2 (TASK-455) — a cancelled entitlement must not sit among the live ones: it goes to the
 * BOTTOM, faded, under a divider. ONE sorter for both panels (vouchers and courses) so the two cannot drift.
 *
 * 🚫 No client status derivation (REQ-103's rule): the SERVER's `status` decides. A row without one (an older
 * payload) counts as live — the only safe reading, since "dead" is the claim that hides a row at the bottom.
 * 🔑 Stable: each group keeps the order the server sent (the panels' own sort/pagination is untouched).
 */

/** The four the customer means by "cancelled": a voucher's ENDED/EXPIRED/EXHAUSTED and a course's CANCELLED/EXPIRED. */
export const DEAD_ENTITLEMENT_STATUSES = ["ENDED", "EXPIRED", "EXHAUSTED", "CANCELLED"] as const;

/** 🚫 `DROPPED` (paused) and `COMPLETED` are NOT dead: a paused course comes back, and a finished one is not cancelled. */
export const isDeadEntitlement = (status: string | null | undefined): boolean =>
  typeof status === "string" && (DEAD_ENTITLEMENT_STATUSES as readonly string[]).includes(status);

export interface SortedEntitlements<T> {
  /** The whole list in render order: live first, then the dead group. */
  rows: T[];
  live: T[];
  dead: T[];
  /** The divider belongs between two groups — never above an all-dead list (the Inactive tab) or a list with no dead row. */
  divider: boolean;
}

export const sortEntitlements = <T extends { status?: string | null }>(rows: readonly T[]): SortedEntitlements<T> => {
  const live = rows.filter((r) => !isDeadEntitlement(r.status));
  const dead = rows.filter((r) => isDeadEntitlement(r.status));
  return { rows: [...live, ...dead], live, dead, divider: live.length > 0 && dead.length > 0 };
};
