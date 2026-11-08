// Dev-only fake for SPEC-099 §8.5 + §8.9 (see config.ts). In-memory: a reload resets it. Loaded only when USE_FAKE_PAYMENTS is true.
// Ready-made refs let a screen be seen in each state without a back end. The fee is 9,500 ฿ for every ref that has one.
//   FAKE_REFS.withRows  — row 1 5,000 Transfer + row 2 3,000 Cash ⇒ 1,500 remaining (an installment can be added)
//   FAKE_REFS.settled   — 5,000 + 4,500 ⇒ 0 remaining (adding one more is refused with the API's 400)
//   FAKE_REFS.noRow     — sold before this shipped: the API answers an empty list
//   FAKE_REFS.noFee     — rows but `feeMinor: null`: no "Add an installment", no Course Fee / Remaining
//   FAKE_REFS.failing   — every call answers an error
//   FAKE_REFS.slow      — the list takes ~4 s (the loading state)
import { ApiClientError } from "@/lib/api/client";
import type { CreatePaymentInput, ListPaymentsParams, Payment, PaymentsResult, UpdatePaymentInput } from "@/types/payments";

export const FAKE_REFS = {
  withRows: "00000000-0000-4000-8000-0000000000a1",
  noRow: "00000000-0000-4000-8000-0000000000a2",
  failing: "00000000-0000-4000-8000-0000000000a3",
  slow: "00000000-0000-4000-8000-0000000000a4",
  settled: "00000000-0000-4000-8000-0000000000a5",
  noFee: "00000000-0000-4000-8000-0000000000a6",
} as const;

const FEE_MINOR = 950000;
const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));
let seq = 100;

const mk = (id: string, ref: string, n: number, paidOn: string, amountMinor: number, method: Payment["method"]): Payment => ({
  id, refType: "COURSE", refId: ref, n, paidOn, amountMinor, method, updatedAt: `${paidOn}T03:00:00.000Z`,
});
const rows: Payment[] = [
  mk("p-a1-1", FAKE_REFS.withRows, 1, "2026-10-16", 500000, "TRANSFER"),
  mk("p-a1-2", FAKE_REFS.withRows, 2, "2026-10-30", 300000, "CASH"),
  mk("p-a4-1", FAKE_REFS.slow, 1, "2026-10-16", 950000, "TRANSFER"),
  mk("p-a5-1", FAKE_REFS.settled, 1, "2026-10-16", 500000, "TRANSFER"),
  mk("p-a5-2", FAKE_REFS.settled, 2, "2026-10-30", 450000, "CASH"),
  mk("p-a6-1", FAKE_REFS.noFee, 1, "2026-10-16", 500000, "CARD"),
];

const KNOWN = new Set<string>(Object.values(FAKE_REFS));
const seeded = new Set<string>();
// Any id that is not one of the named refs (e.g. a mock course opened in the real plan modal) is shown as `withRows`.
const mine = (ref: string) => {
  if (!KNOWN.has(ref) && !seeded.has(ref)) {
    seeded.add(ref);
    rows.push(mk(`p-${ref}-1`, ref, 1, "2026-10-16", 500000, "TRANSFER"), mk(`p-${ref}-2`, ref, 2, "2026-10-30", 300000, "CASH"));
  }
  return rows.filter((r) => r.refId === ref);
};
const feeOf = (ref: string): number | null => (ref === FAKE_REFS.noFee ? null : FEE_MINOR);
const paidOf = (ref: string) => mine(ref).reduce((s, r) => s + r.amountMinor, 0);
const failing = (ref: string) => {
  if (ref === FAKE_REFS.failing) throw new ApiClientError("INTERNAL", "The payment service did not answer", 500);
};
// The API's rule (SPEC-099 §8.9): the rows may not add up to more than the fee.
const mustFit = (ref: string, sum: number) => {
  const fee = feeOf(ref);
  if (fee !== null && sum > fee) {
    throw new ApiClientError("VALIDATION", "The installments add up to more than the course fee", 400);
  }
};

export async function fakeListPayments(p: ListPaymentsParams): Promise<PaymentsResult> {
  await delay(p.refId === FAKE_REFS.slow ? 4000 : 300);
  failing(p.refId);
  const payments = mine(p.refId).sort((a, b) => a.n - b.n).map((r) => ({ ...r }));
  const fee = feeOf(p.refId);
  if (payments.length === 0) return { payments, feeMinor: fee, paidMinor: 0, remainingMinor: fee };
  const paid = paidOf(p.refId);
  return { payments, feeMinor: fee, paidMinor: fee === null ? null : paid, remainingMinor: fee === null ? null : fee - paid };
}

export async function fakeCreatePayment(input: CreatePaymentInput): Promise<Payment> {
  await delay();
  failing(input.refId);
  if (feeOf(input.refId) === null) throw new ApiClientError("NO_FEE", "This sale has no fee on record", 409);
  if (!(Number.isInteger(input.amountMinor) && input.amountMinor > 0)) {
    throw new ApiClientError("VALIDATION", "amountMinor must be a positive integer", 400);
  }
  mustFit(input.refId, paidOf(input.refId) + input.amountMinor);
  const made = mk(`p-new-${seq++}`, input.refId, mine(input.refId).reduce((m, r) => Math.max(m, r.n), 0) + 1, input.paidOn, input.amountMinor, input.method);
  rows.push(made);
  return { ...made };
}

export async function fakeUpdatePayment(id: string, patch: UpdatePaymentInput): Promise<Payment> {
  await delay();
  const row = rows.find((r) => r.id === id);
  if (!row) throw new ApiClientError("NOT_FOUND", "payment not found", 404);
  failing(row.refId);
  if (patch.amountMinor !== undefined) {
    if (!(Number.isInteger(patch.amountMinor) && patch.amountMinor > 0)) {
      throw new ApiClientError("VALIDATION", "amountMinor must be a positive integer", 400);
    }
    mustFit(row.refId, paidOf(row.refId) - row.amountMinor + patch.amountMinor);
  }
  Object.assign(row, patch, { updatedAt: new Date().toISOString() });
  return { ...row };
}
