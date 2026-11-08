import { formatPriceMinor } from "@/types/app/pricing";
import type { CampConfirmBody, CampPackage } from "@/types/api/contract";
import type { PaymentMethod } from "@/types/payments";

/**
 * TASK-901 / SPEC-099 §11 — D3 «Confirm camp». Pure rules of the card's badge and dialog, so the screen only draws them.
 * 🚫 Nothing here computes money: the amount is the server's net posted sale (`amountMinor`), shown as sent.
 */

/** Today in Bangkok, YYYY-MM-DD — the dialog's default «Date received». */
export const todayBkk = (now: Date = new Date()): string => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(now);

/** Confirmed = the server sent a `confirmedOn` date. Absent / null (an older payload too) ⇒ not confirmed. */
export const isConfirmed = (p: Pick<CampPackage, "confirmedOn">): p is { confirmedOn: string } => typeof p.confirmedOn === "string" && p.confirmedOn !== "";

/** The Amount field: the server's figure as sent, or «—» when the list did not carry one (never 0, never computed here). */
export const amountText = (minor: number | null | undefined): string => (typeof minor === "number" ? formatPriceMinor(minor) : "—");

/** The POST body: exactly `{ receivedOn, method }` — the camp is the URL's, the amount is the server's. */
export const confirmBody = (receivedOn: string, method: PaymentMethod): CampConfirmBody => ({ receivedOn, method });

/** What a refusal shows: the server's own sentence (Silver: «NO_FEE shows as the 409's sentence»); Porter's words are the fallback when the server sent none. */
export const refusalWords = (code: string | undefined, t: (key: string) => string, serverMessage: string): string =>
  serverMessage.trim() !== "" ? serverMessage : code === "ALREADY_CONFIRMED" ? t("campConfirm.alreadyConfirmed") : code === "NO_FEE" ? t("campConfirm.noFee") : "—";
