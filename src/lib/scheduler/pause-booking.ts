/**
 * SPEC-075 / REQ-076 / TASK-261 — the rules of **พัก** (pause a single booking), as pure functions.
 *
 * They live here, not inside `BookingModal`'s JSX, for the reason TASK-147 and TASK-237 both landed on: **a
 * rule that only exists in a JSX condition cannot be tested**, and these three are the ones the requirement is
 * actually made of. The server re-validates all of them and is the source of truth (TASK-260 §4).
 *
 * 🔴 **The owner's sentence, and everything here has to agree with it: *a hold, and nothing else.***
 */

import type { Booking, BookingStatus, BookingType } from "@/types/app/scheduler";

/**
 * AC-1 — พัก is offered for exactly these three types.
 *
 * 🚫 **AC-3 — `COURSE_PACKAGE` is deliberately absent.** REQ-071 already owns pausing a course, with its own
 * wording, its own consequences (owed sessions, expiry) and its own door on the plan modal. A second door here
 * would be a different behaviour wearing the same word.
 */
export const PAUSABLE_BOOKING_TYPES: readonly BookingType[] = [
  "SINGLE_SESSION",
  "VOUCHER",
  "FIRST_TRIAL",
];

/**
 * AC-2 — a booking that has already happened cannot be put on hold. `ATTENDED` is the one the requirement
 * names; the rest are here because "not yet attended" is the *intent*, and a cancelled or no-show booking is
 * no more pausable than an attended one.
 */
const UNPAUSABLE_STATUSES: readonly BookingStatus[] = [
  "ATTENDED",
  "NO_SHOW",
  "CANCELLED",
  "PAUSED", // already on hold — the control becomes Resume, not a second Pause
];

/** Is พัก offered for this booking? AC-1 + AC-2 + AC-3, in one place both the modal and its test read. */
export const canPauseBooking = (b: Pick<Booking, "bookingType" | "status">): boolean =>
  PAUSABLE_BOOKING_TYPES.includes(b.bookingType) && !UNPAUSABLE_STATUSES.includes(b.status);

/** Is นำกลับมาลงตาราง offered? Only for a booking that is actually on hold. */
export const canResumeBooking = (b: Pick<Booking, "status">): boolean => b.status === "PAUSED";

/**
 * AC-13 — resume takes **any** date and time, not only the original (*"ตอนไหนก็ได้"*), so the only thing to
 * check here is that both were chosen.
 *
 * 🚫 **AC-14 is NOT validated here.** A clash is the backend's answer and it already has the sentence for it
 * (`slotClashMessage`, naming the teacher and the clashing booking). Composing a second clash rule on this side
 * would be two rules in the product that can disagree — so this returns only "you have not finished choosing",
 * never "that slot is taken".
 */
export const canSubmitResume = (date: string | null, startTime: string | null): boolean =>
  !!date && !!startTime;
