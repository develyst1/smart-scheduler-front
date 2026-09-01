/**
 * SPEC-070 / REQ-078 / TASK-226 — the rules of an **อื่นๆ** booking form, as a pure function.
 *
 * Same shape and the same reasons as `discount.ts`: the server re-validates and is the source of truth
 * (`validation.ts` `createBooking` refinements + the `booking_other_price_chk` CHECK behind them). This exists
 * so staff are told **what is wrong and why, before they commit** — a user who can submit an impossible
 * combination and receives a 400 has been told nothing useful. The message is the product here (AC-10/11/12).
 *
 * 🔴 The negatives ARE the requirement in REQ-078, so they are collected in **one pass** — every problem at
 * once, not one refusal at a time — and returned as i18n KEYS, never sentences: both languages stay in
 * `dictionaries.ts` and the caller renders them.
 */

import { bahtToMinor } from "./discount";

/**
 * Which of the two mutually-exclusive price sources the form is on.
 *
 * 🔴 AC-12 is satisfied **structurally**: this is one value, so "both set" is unrepresentable rather than
 * merely refused. The task offered a choice — prevent the combination, or say which one applies — and a state
 * that cannot exist beats a message explaining a state that can.
 */
export type OtherPriceSource = "AMOUNT" | "ITEM";

export interface OtherBookingDraft {
  /** The admin's words. Required only when there is no student (AC-10). */
  title: string;
  /** `คิดเงินรายการนี้` — off by default. */
  charge: boolean;
  priceSource: OtherPriceSource;
  /** Whole BAHT as typed — the HUMAN unit. Empty string = untouched, which is not the same as 0. */
  amountBaht: number | "";
  /** A `bo.item` id from `/catalog-items`. */
  itemId: string | null;
  /** `ตัดสิทธิ์จากคอร์ส / Voucher` — off by default. */
  consume: boolean;
  /** The chosen course/voucher key when `consume` is on. */
  entitlementId: string | null;
  /** Every assigned teacher, first one first. AC-19: at least one. */
  teacherIds: string[];
  /** Whether a student is selected — `consume` needs one, and a title is only mandatory without one. */
  hasStudent: boolean;
}

export interface OtherBookingEval {
  /** i18n keys, in the order staff should read them. Empty ⇒ the draft may be submitted. */
  problemKeys: string[];
  /** The payload fragment, filled only when there are no problems. */
  otherTitle?: string;
  otherPriceMinor?: number;
  otherPriceItemId?: string;
}

export const emptyOtherBooking = (teacherId: string): OtherBookingDraft => ({
  title: "",
  charge: false,
  priceSource: "AMOUNT",
  amountBaht: "",
  itemId: null,
  consume: false,
  entitlementId: null,
  // The column that was clicked is a fact, not a guess — the same reasoning the voucher branch uses for its
  // teacher. Staff may add more or swap it.
  teacherIds: teacherId ? [teacherId] : [],
  hasStudent: false,
});

// ─────────────────────────── TASK-237 (REQ-078 DEF-1 / DEF-5) ───────────────────────────
//
// 🔴 **Why these three one-line handlers are functions here instead of arrows in the JSX.**
//
// The อื่นๆ form killed the page with `TypeError: Cannot read properties of null (reading 'value')` while
// staff were editing it, losing everything they had typed. The cause was the shape of the handler, not the
// form:
//
//     onChange={(e) => setOther((p) => ({ ...p, title: e.currentTarget.value }))}   // ← the defect
//
// React nulls `event.currentTarget` **the moment the listener returns** (`executeDispatch` does it after every
// listener). A `setState` **updater** is a closure React calls **later**, during the render it schedules. So
// the read above happens after the event is dead — on `null`.
//
// ⚠️ **It is intermittent, and that is the part worth understanding**, because "it usually works" is why this
// shape survives review. `dispatchSetState` has an eager-evaluation fast path: when the hook has no pending
// update, React runs the updater **synchronously inside the handler** to see whether it can bail out — and
// there `currentTarget` is still alive, so it works. Take that path away — a second update already queued on
// the same hook (removing the last teacher chip does exactly that, through the MultiSelect) — and the updater
// is deferred to the render phase, where the event is null. Hence Tanya's precise 3-of-3 repro **and** DEF-5's
// two page deaths she could not reduce: same bug, different pending-update timing.
//
// 🔴 **The rule: read the event EAGERLY, in the handler body; pass a plain value into the updater.** Every
// other `currentTarget` read in this repo (20+ sites) already does — they hand the value straight to
// `setX(value)`. These three were the only lazy ones.
//
// 🚫 **`e.currentTarget?.value` is NOT the fix.** It would stop the crash and silently write `""` — a title
// that vanishes as you type is worse than a stack trace, because nobody reports it as a bug.
//
// They live here rather than inline so the rule is **testable**: `other-booking.test.ts` drives them exactly as
// React does — call the handler, null `currentTarget`, then run the updater — which fails on the lazy shape.

/** What `setOther` accepts: React's functional-updater form. */
type OtherSetter = (updater: (d: OtherBookingDraft) => OtherBookingDraft) => void;

/** The minimum of a change event these need — narrow, so the tests need no DOM. */
interface ValueEvent {
  currentTarget: { value: string } | null;
}
interface CheckedEvent {
  currentTarget: { checked: boolean } | null;
}

export const onOtherTitleChange = (set: OtherSetter) => (e: ValueEvent) => {
  // Read NOW, while the event is still alive. Everything below runs later.
  const title = e.currentTarget!.value;
  set((d) => ({ ...d, title }));
};

export const onOtherChargeToggle = (set: OtherSetter) => (e: CheckedEvent) => {
  const charge = e.currentTarget!.checked;
  set((d) => ({ ...d, charge }));
};

export const onOtherConsumeToggle = (set: OtherSetter) => (e: CheckedEvent) => {
  const consume = e.currentTarget!.checked;
  set((d) => ({ ...d, consume }));
};

export function evaluateOtherBooking(d: OtherBookingDraft): OtherBookingEval {
  const problemKeys: string[] = [];

  // AC-19 — "ทุกการจองต้องมีครู" (owner, 2026-08-31). At least one; several are allowed for อื่นๆ only.
  if (d.teacherIds.length === 0) problemKeys.push("booking.errOtherNoTeacher");

  // AC-10 — with no student the title is the ONLY thing left to name the booking with, and `displayName` must
  // never fall through to "" or to the word อื่นๆ. With a student, the title is optional.
  const title = d.title.trim();
  if (!d.hasStudent && !title) problemKeys.push("booking.errOtherNoTitle");

  let otherPriceMinor: number | undefined;
  let otherPriceItemId: string | undefined;

  if (d.charge) {
    if (d.priceSource === "AMOUNT") {
      // AC-11 — 0, negative, or not a number is REFUSED, never clamped and never quietly dropped to "free".
      const value = d.amountBaht === "" ? NaN : Number(d.amountBaht);
      if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
        problemKeys.push("booking.errOtherAmount");
      } else {
        // 🔴 The ONE baht→satang conversion on this path, reusing the helper that exists BECAUSE this repo
        // shipped a 100× error on exactly this boundary (TASK-169). Never a second `* 100` written by hand.
        otherPriceMinor = bahtToMinor(value);
      }
    } else if (!d.itemId) {
      problemKeys.push("booking.errOtherNoItem");
    } else {
      otherPriceItemId = d.itemId;
    }
  }

  // The consume toggle needs a student to have an entitlement at all, and a chosen one to deduct from.
  if (d.consume) {
    if (!d.hasStudent) problemKeys.push("booking.errOtherConsumeNoStudent");
    else if (!d.entitlementId) problemKeys.push("booking.errOtherNoEntitlement");
  }

  const ok = problemKeys.length === 0;
  return {
    problemKeys,
    otherTitle: ok && title ? title : undefined,
    otherPriceMinor: ok ? otherPriceMinor : undefined,
    otherPriceItemId: ok ? otherPriceItemId : undefined,
  };
}
