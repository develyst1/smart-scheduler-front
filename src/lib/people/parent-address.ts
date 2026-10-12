import type { Lang } from "@/lib/i18n";
import type { Parent } from "@/types/app/people";

/**
 * 🔴 **TASK-801 (REQ-118) — what the parent card prints as the household's address.**
 *
 * The server renders the address from the AREA CODES in both languages (`addressTh` / `addressEn`); **there is no language negotiation, the
 * front picks the one matching its own UI language.** ⇒ 🔑 *A card never shows Thai under an English screen once codes exist.* When the
 * rendered line is absent (a parent with no codes yet — the backfill leaves some NULL on purpose), the raw `province` text is shown exactly
 * as before, so no card goes blank on release day. 🚫 The page decides nothing about the address: it only chooses which string to print.
 */
export const parentAddress = (p: Pick<Parent, "province" | "addressTh" | "addressEn">, lang: Lang): string | null => {
  const rendered = lang === "th" ? p.addressTh : p.addressEn;
  return rendered?.trim() ? rendered : p.province?.trim() ? p.province : null;
};
