// Preview for the "already part-way through" form (SPEC-025 / TASK-080). Pure: the screen must be able to
// show the consequence of `used` BEFORE saving, because `sessions already used` is the one field with no
// everyday meaning and a wrong number is only obvious as a session count.
import dayjs from "dayjs";

/** Mirrors the server's `remainingSessions` (size − used, floored at 0). */
export const remainingSessions = (size: number, used: number): number =>
  Math.max(0, Math.floor(size || 0) - Math.max(0, Math.floor(used || 0)));

/**
 * The dates the remaining sessions will land on — weekly from `startDate`, matching `courseSessionDates`.
 * Already-taught sessions are deliberately never created, so this is the whole schedule that gets written.
 */
export const remainingDates = (startDate: string, remaining: number): string[] =>
  !startDate || remaining <= 0
    ? []
    : Array.from({ length: remaining }, (_, i) =>
        dayjs(startDate).add(i, "week").format("YYYY-MM-DD"),
      );

/** True when `used` exceeds `size` — nothing would be scheduled, so the form must not let it through. */
export const usedExceedsSize = (size: number, used: number): boolean =>
  Math.floor(used || 0) > Math.floor(size || 0);
