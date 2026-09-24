/**
 * REQ-105 / SPEC-091 (TASK-453/457) — a GROUP session whose hour was YIELDED to a Private, while the group still has
 * live seats, is **in clash**: two classes stand on one coach-hour until an admin resolves it.
 *
 * 🚫 The clash is the SERVER's word (`group.clash`, derived once in the BE's `lib/group-clash.ts`): nothing here
 * re-derives it from `yieldedAt` + the seats, because the two would disagree the moment the rule moves. This file
 * only: which tone a group block wears, who its PAIR is on the grid, the two resolution bodies, and the doors.
 */
import type { Booking } from "@/types/app/scheduler";

/** The server's flag, read — never `yieldedAt && seats.length > 0` computed here. */
export const isClash = (b: Pick<Booking, "group">): boolean => b.group?.clash === true;

/**
 * A group block's two colour states (REQ-105 §1): it has children, or it has none yet. A clash is a THIRD state that
 * outranks both — the thing to look at first. "Has students" counts the SERVER's live seats (a cancelled seat is not a
 * child in the room); a seat list that never arrived reads as empty, which is what an empty block looks like anyway.
 */
export type GroupTone = "clash" | "filled" | "empty";
export const LIVE_SEAT_EXCLUDED = ["CANCELLED"] as const;
export const liveSeats = (b: Pick<Booking, "group">) =>
  (b.group?.seats ?? []).filter((s) => !(LIVE_SEAT_EXCLUDED as readonly string[]).includes(s.status));
export const groupTone = (b: Pick<Booking, "group">): GroupTone => (isClash(b) ? "clash" : liveSeats(b).length > 0 ? "filled" : "empty");

/**
 * `n/cap`, or a bare `n` when the cap is **null = uncapped** (TASK-453). 🚫 No denominator invented: an uncapped group
 * has no "out of", and printing `n/∞` or `n/0` would both be claims the server never made.
 */
export const seatCountLabel = (b: Pick<Booking, "group">): string => {
  const n = liveSeats(b).length;
  const cap = b.group?.seatCap;
  return typeof cap === "number" ? `${n}/${cap}` : `${n}`;
};

/**
 * The PAIR on the grid: the clashing group block and the Private standing in its hour are the same coach, the same
 * date and the same start. Both wear the mark so a reader can see WHICH coach-hour is being fought over.
 * (Pure and render-only: the server decided there is a clash; this only answers "which other cell is it".)
 */
export const clashPartner = <T extends Pick<Booking, "id" | "teacherId" | "date" | "startTime" | "bookingType" | "group">>(
  clashing: Pick<Booking, "teacherId" | "date" | "startTime">,
  rows: readonly T[],
): T[] => rows.filter((r) => r.teacherId === clashing.teacherId && r.date === clashing.date && r.startTime === clashing.startTime);

/** Is THIS row one half of a clash pair? — a clashing GROUP block, or any row sharing its coach-hour. */
export const inClashPair = <T extends Pick<Booking, "id" | "teacherId" | "date" | "startTime" | "bookingType" | "group">>(
  row: T,
  rows: readonly T[],
): boolean => rows.some((r) => isClash(r) && r.teacherId === row.teacherId && r.date === row.date && r.startTime === row.startTime);

export interface ClashGrants {
  /** `action:calendar.booking-edit` — both resolutions sit behind it (hidden, never disabled). */
  edit: boolean;
}
/** ① *Move the private* is offered FIRST — the owner's default; ② *Swap the group's coach* is the alternative. */
export const clashDoors = (grants: ClashGrants, b: Pick<Booking, "group">) => ({
  movePrivate: grants.edit && isClash(b),
  swapCoach: grants.edit && isClash(b),
});

export interface MoveDraft {
  teacherId: string | null;
  date: string | null;
  startTime: string | null;
}
/**
 * `POST /bookings/:id/resolve-clash/move { teacherId?, date?, startTime? }` — at least ONE is required (the server's
 * rule); only what was chosen rides, so an unchanged field is never sent as if it had been picked.
 */
export const moveBody = (d: MoveDraft): { teacherId?: string; date?: string; startTime?: string } => ({
  ...(d.teacherId ? { teacherId: d.teacherId } : {}),
  ...(d.date ? { date: d.date } : {}),
  ...(d.startTime ? { startTime: d.startTime } : {}),
});
export const moveReady = (d: MoveDraft): boolean => Object.keys(moveBody(d)).length > 0;

/** `POST /bookings/:id/resolve-clash/swap-coach { teacherId }` — one field, required. */
export const swapCoachBody = (teacherId: string): { teacherId: string } => ({ teacherId });
