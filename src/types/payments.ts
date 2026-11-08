// Payment record contract (SPEC-099 §8.5). Mirrors the API field for field.
// Money is integer satang. Dates are `YYYY-MM-DD` (the Asia/Bangkok date the money came in).

/** Slice 2a: courses and vouchers only. (`BOOKING` / `CAMP` / `RENTAL` come in slice 2b.) */
export type PaymentRefType = "COURSE" | "VOUCHER";
export type PaymentMethod = "TRANSFER" | "CASH" | "CARD";

export const PAYMENT_METHODS: readonly PaymentMethod[] = ["TRANSFER", "CASH", "CARD"];
/** The method every payment has unless someone changes it (the sale's own row is born as this). */
export const DEFAULT_PAYMENT_METHOD: PaymentMethod = "TRANSFER";

export interface Payment {
  id: string;
  refType: PaymentRefType;
  refId: string;
  /** 1 = the sale's own payment; 2.. = installments. */
  n: number;
  paidOn: string;
  amountMinor: number;
  method: PaymentMethod;
  updatedAt: string;
}

export interface ListPaymentsParams {
  refType: PaymentRefType;
  refId: string;
}

/**
 * `GET` answer (SPEC-099 §8.9). Installments SPLIT the course fee: the API returns the fee, what has been paid
 * (= the sum of the rows) and what remains (= fee − paid). The screen shows these and sums nothing itself.
 * `feeMinor: null` = no fee (the sale's movements didn't post): rows only, and the API refuses a POST (409 `NO_FEE`).
 */
export interface PaymentsResult {
  payments: Payment[];
  feeMinor: number | null;
  paidMinor: number | null;
  remainingMinor: number | null;
}

export interface CreatePaymentInput {
  refType: PaymentRefType;
  refId: string;
  paidOn: string;
  amountMinor: number;
  method: PaymentMethod;
}

/**
 * Every row's amount is editable (row 1 included, SPEC-099 §8.9). The API enforces `sum(rows) ≤ fee` and answers
 * 400 `VALIDATION` ("the installments add up to more than the course fee"); the screen shows that message.
 */
export interface UpdatePaymentInput {
  method?: PaymentMethod;
  paidOn?: string;
  amountMinor?: number;
}
