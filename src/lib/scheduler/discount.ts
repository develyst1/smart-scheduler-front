/**
 * Client-side mirror of the backend's discount rules (SPEC-059 / REQ-063, `smart-scheduler-back/src/lib/
 * discount-plan.ts`). This exists ONLY to show staff the money before they commit and to refuse an obviously
 * bad value early — **the server re-validates and is the source of truth**; nothing here decides what is posted.
 *
 * The rounding is copied deliberately, not approximated: `Math.round((full * pct) / 100)` is the BE's
 * `percentOf`, so 10% of ฿79.05 reads 791 minor units on screen and 791 in the ledger. A near-enough mirror
 * would show one satang of drift on the summary and make staff distrust the number.
 */
export type DiscountKind = "PERCENT" | "BAHT";

export interface DiscountDraft {
  kind: DiscountKind;
  /** Empty string = the field is untouched, which is NOT an error — it means "no discount". */
  value: number | "";
  reason: string;
}

export const emptyDiscount = (): DiscountDraft => ({ kind: "PERCENT", value: "", reason: "" });

/** True once staff have typed anything that expresses an intent to discount. */
export const discountTouched = (d: DiscountDraft) => d.value !== "" || d.reason.trim() !== "";

/** The BE's `percentOf` — round half-up on minor units. */
export const percentOf = (fullMinor: number, pct: number) => Math.round((fullMinor * pct) / 100);

export interface DiscountEval {
  /** Minor units to take off. 0 when there is no valid discount. */
  discountMinor: number;
  /** i18n KEYS (not sentences) — the caller renders them, so both languages stay in `dictionaries.ts`. */
  problemKeys: string[];
  /** What the summary should show as payable. */
  netMinor: number;
  /** Staff expressed an intent to discount (so the form must validate it rather than ignore it). */
  touched: boolean;
}

/**
 * Evaluate a draft against the full price. Mirrors `planDiscount`'s *shape*: the amount checks run whether or not
 * the reason is present, so a form can tell staff everything wrong in one pass instead of one refusal at a time.
 */
export function evaluateDiscount(draft: DiscountDraft, fullMinor: number): DiscountEval {
  const touched = discountTouched(draft);
  if (!touched) return { discountMinor: 0, problemKeys: [], netMinor: fullMinor, touched };

  const problemKeys: string[] = [];
  if (!draft.reason.trim()) problemKeys.push("discount.errNoReason");

  const value = draft.value === "" ? NaN : Number(draft.value);
  let discountMinor = 0;

  if (!Number.isFinite(value)) {
    problemKeys.push("discount.errValue");
  } else if (draft.kind === "PERCENT") {
    if (!(value > 0 && value <= 100)) problemKeys.push("discount.errPercentRange");
    else discountMinor = percentOf(fullMinor, value);
  } else {
    if (!Number.isInteger(value) || value <= 0) problemKeys.push("discount.errBahtPositive");
    else discountMinor = value;
  }

  if (Number.isFinite(fullMinor) && fullMinor > 0 && discountMinor > 0) {
    // 🔴 Refuse, never clamp — the rule that stops a typo becoming a zero-baht sale (REQ-063).
    if (discountMinor > fullMinor) problemKeys.push("discount.errTooLarge");
  }

  const ok = problemKeys.length === 0;
  return {
    discountMinor: ok ? discountMinor : 0,
    problemKeys,
    netMinor: Math.max(0, fullMinor - (ok ? discountMinor : 0)),
    touched,
  };
}

/** The payload field — `undefined` when untouched, so a no-discount create is byte-identical to today (AC-7). */
export const discountPayload = (draft: DiscountDraft, fullMinor: number) => {
  const { touched, problemKeys } = evaluateDiscount(draft, fullMinor);
  if (!touched || problemKeys.length) return undefined;
  return { kind: draft.kind, value: Number(draft.value), reason: draft.reason.trim() };
};
