import { listPayments, updatePayment } from "@/services/payments.service";
import { DEFAULT_PAYMENT_METHOD, type PaymentMethod, type PaymentRefType } from "@/types/payments";

/**
 * TASK-876: after a successful sale, record the method the admin chose on the sale form.
 * The API has already created row 1 as Transfer (SPEC-099 §8 decision 3), so a Transfer choice needs no call at all.
 * Anything else is a GET of the sale's rows and a PATCH of row 1's method only.
 *
 * Never throws: the sale is already saved, and a failure here is a warning, not an error (the caller shows it).
 * Returns "ok" (nothing to do, or done) or "failed".
 */
export async function recordSaleMethod(
  refType: PaymentRefType,
  refId: string,
  method: PaymentMethod,
): Promise<"ok" | "failed"> {
  if (method === DEFAULT_PAYMENT_METHOD) return "ok";
  try {
    const { payments } = await listPayments({ refType, refId });
    const first = payments.find((r) => r.n === 1);
    if (!first) return "failed"; // no row 1 to edit (the API's best-effort insert did not land)
    await updatePayment(first.id, { method });
    return "ok";
  } catch {
    return "failed";
  }
}
