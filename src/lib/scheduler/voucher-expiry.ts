/**
 * 🔴 TASK-568 (BE) → TASK-572 (REQ-110 item 3) — **extending a voucher's expiry**, as pure rules.
 *
 * The screen's shape is the course expiry edit's, deliberately: **warn, and still save.** What is new here is that this
 * entitlement can REFUSE, and 🔑 **both refusals arrive at the PREVIEW** — the server runs one `voucherExpiryDecision` for
 * the preview and the save, so the admin learns *why not* before touching anything.
 *
 * 🚫 **Neither refusal is re-implemented here, and one of them CANNOT be.** ENDED is a status the payload carries; NOT
 * STARTED means *no live booking exists yet*, and a voucher summary has no field that says so — `usedHours: 0` is equally
 * true of one with a PENDING booking. ⇒ **The door opens on what is knowable, and the server answers the rest.** *A second
 * copy of that rule would be the two-copies defect on the rule that decides whether a date may move at all.*
 */
import type { VoucherStatus } from "@/types/api/contract";

export interface VoucherExtendGrants {
  /** `can("action:bookings.course-expiry")` — the COURSE's key, reused, exactly as the BE's route table reuses it. */
  expiry: boolean;
}

export interface VoucherExtendLike {
  status?: VoucherStatus | null;
}

/**
 * Whether the row offers the control: the key, and not ENDED. **Hidden, never disabled** (REQ-092 Stage 3's rule).
 *
 * ✅ **EXPIRED is offered on purpose — that is what the feature is for.** 🚫 EXHAUSTED is offered too: a voucher with no
 * hours left has nothing to extend *into*, but that is the server's judgement to make, not this screen's, and the BE does
 * not refuse it.
 */
export const canOfferExtend = (grants: VoucherExtendGrants, v: VoucherExtendLike): boolean =>
  grants.expiry && v.status !== "ENDED";

/** One body, one question — the same shape for the preview and the save, so the two cannot be asked different things. */
export const voucherExpiryBody = (expiryDate: string): { expiryDate: string } => ({ expiryDate });

/**
 * 🔑 What to do INSTEAD, for the two refusals this screen has words for.
 *
 * 🚫 **This never replaces the server's sentence** — the refusal is shown verbatim and this is an addition under it. And an
 * unrecognised code answers `null` on purpose: **a suggestion invented for a refusal we do not understand is worse than no
 * suggestion**, because the admin would act on it.
 */
export const REFUSAL_ANSWER_KEYS = {
  VOUCHER_ENDED: "voucherExpiry.answerEnded",
  VOUCHER_NOT_STARTED: "voucherExpiry.answerNotStarted",
} as const;

export const refusalAnswerKey = (code: string | null | undefined): string | null =>
  (code && REFUSAL_ANSWER_KEYS[code as keyof typeof REFUSAL_ANSWER_KEYS]) || null;

/**
 * ⚠️ An "extension" that moves the date EARLIER is not one, and the word on the button would be a lie for that save.
 * 🚫 Not a gate — the control is the expiry EDIT and the admin may shorten it; the screen just has to say which it is.
 */
export const movesEarlier = (current: string | null | undefined, next: string | null | undefined): boolean =>
  Boolean(current && next && next < current);

/** Nothing to ask and nothing to save: the same date is not a change (the server records no row for it either). */
export const isSameDate = (current: string | null | undefined, next: string | null | undefined): boolean =>
  Boolean(current && next && current === next);
