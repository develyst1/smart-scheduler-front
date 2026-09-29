/**
 * REQ-110 item 6 (TASK-570 BE → TASK-571 FE) — **moving a not-yet-started course's start date.**
 *
 * The server MOVES the sessions in place (nothing cancelled, nothing created), **refuses the whole move on a clash**,
 * **skips a week on a coach's advance leave and returns which**, recomputes the expiry with the ADMIN as actor, and —
 * 🔑 **sends NO notice at all.** Confirmed sessions drop back to `PENDING` with `needsReconfirm`, and the existing
 * Confirm-course flow later sends ONE new schedule per person.
 *
 * 🔴 **Which makes the window this file exists to name:** between the move and someone running Confirm-course, **the
 * family and the coach still hold the OLD dates.** Nothing tells them. That has to be said on the screen at the moment
 * of the move — *not in a toast that disappears* — together with what to do about it.
 *
 * 🚫 **Nothing here re-derives the server's rule.** "Not started" is `planCourseStartChange`'s definition (nothing taught
 * AND every non-cancelled session today or later), and re-implementing it would be a second copy of a rule that decides
 * money and schedules. **This file offers the DOOR and words the consequences; the server decides.**
 */
import type { CoursePackageView } from "@/types/app/scheduler";

/** What the server answers on a successful move. 🚫 `skippedForLeave` is rendered as sent, never computed here. */
export interface StartChangeResult {
  moved: number;
  startDate: string;
  expiryDate: string;
  previousExpiryDate: string;
  /** Sessions that were CONFIRMED and are now PENDING again — nobody has been told the new dates. */
  needsReconfirm: number;
  /** The dates the plan stepped over because the coach is on advance leave that week. */
  skippedForLeave: string[];
}

/**
 * 🔑 **The door, and deliberately a WEAK one.** A course with a taught session cannot be moved, and that we can see
 * (`usedSessions`); everything finer — a session yesterday, an imported-as-taught row — is the server's own definition and
 * its refusal arrives verbatim. ⇒ **hide the button only where it certainly cannot work**, and never pretend to know the
 * rest: *a second copy of "not started" is how the screen and the server come to disagree.*
 * 🚫 An ENDED or PAUSED course refuses at the server's own writable gate; the lifecycle is not re-checked here either.
 */
export const canOfferStartChange = (c: Pick<CoursePackageView, "usedSessions" | "status">): boolean =>
  c.usedSessions === 0 && c.status !== "CANCELLED" && c.status !== "COMPLETED";

/**
 * 🔻 TASK-573 (BE) → TASK-574 — **the FORECAST**: the act's own plan run read-only (`POST …/start-date/preview`).
 * ⚠️ **`forecast: true` is the point of the shape, not decoration.** The act re-checks a clash and each date's teacher
 * gate at commit time, **so a refusal AFTER a clean forecast is normal** — TASK-547's rule, and its vocabulary:
 * *the server checks again when you confirm, so it may still refuse.*
 */
export interface StartChangeForecast {
  moves: Array<{ id: string; from: string; to: string; status: string; toStatus: string }>;
  expiryDate: string;
  previousExpiryDate: string;
  needsReconfirm: number;
  skippedForLeave: string[];
  forecast: true;
}

/** The dates that actually MOVE, in the server's order. 🚫 Not computed: a row whose date is unchanged is not a move. */
export const forecastMoves = (f: StartChangeForecast | undefined): Array<{ from: string; to: string }> =>
  (f?.moves ?? []).filter((m) => m.from !== m.to).map((m) => ({ from: m.from, to: m.to }));

/** `POST /courses/:id/start-date` — one field, and it is the admin's answer, never a default. */
export const startChangeBody = (startDate: string): { startDate: string } => ({ startDate });

/**
 * 🔑 **Was this course's expiry set BY HAND?** Read from the expiry history: the system's own recomputes are recorded with
 * a **null actor** (*"the system moved it, not a person"*), so **a row with an actor is a person's deliberate date.**
 * ⇒ the move will replace it, and the admin must be told before committing — *replacing a colleague's deliberate date
 * without saying so is the silent-undo problem wearing different clothes.*
 * 📌 No BE change was needed for this: the fact was already on `GET /courses/:id/expiry-history`.
 */
export const expirySetByHand = (history: readonly { actor?: string | null }[] | undefined): boolean =>
  (history ?? []).some((r) => typeof r.actor === "string" && r.actor.trim().length > 0);

/**
 * The lines the confirm dialog must show, in order, as copy keys. 🔑 **The stale-schedule window is ALWAYS among them** —
 * it is true of every move, it is the thing an admin cannot see, and it is the one this task exists for.
 */
export const startChangeWarnings = (opts: { handSetExpiry: boolean }): string[] => [
  "courseStart.warnStale",
  "courseStart.warnExpiry",
  ...(opts.handSetExpiry ? ["courseStart.warnHandSetExpiry"] : []),
];
