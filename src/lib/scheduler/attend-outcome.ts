import { ApiClientError } from "@/lib/api/client";

type Translate = (key: string) => string;
export interface AttendToast {
  title: string;
  description?: string;
  color: "success" | "warning" | "danger";
}

/**
 * TASK-870 (REQ-5008) — what the admin's มาเรียน (attend) action tells staff. Pure, so both outcomes are pinned without mounting the modal.
 * 🔑 The sentences are the SERVER's, shown unchanged; the only words here are two existing approved titles.
 */

/** The attend went through. With `voucherWarning` it deducted from an already-empty voucher (the `WARN` value of the server's switch): same title, the sentence under it, an orange toast. */
export const attendedToast = (res: { voucherWarning?: string }, t: Translate): AttendToast =>
  res.voucherWarning
    ? { title: t("booking.attendedTitle"), description: res.voucherWarning, color: "warning" }
    : { title: t("booking.attendedTitle"), color: "success" };

/** The attend was refused (`409 VOUCHER_EXHAUSTED` by default): nothing was deducted, the row stays un-attended — the server's sentence, unchanged. */
export const attendRefusedToast = (e: unknown, t: Translate): AttendToast => ({
  title: t("plan.genericError"),
  description: e instanceof ApiClientError ? e.message : (e as Error).message,
  color: "danger",
});
