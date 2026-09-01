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
