// Sellable packages (SPEC-024 / TASK-078). The API is the source of truth for BOTH availability and price —
// the FE must never carry a second copy of the price card, which is the whole point of this design.

export interface PricedSubjectRef {
  id: string;
  name: string;
}

export interface SellablePackage {
  priceGroup: string;
  /** 1 = a single session; 4 / 6 / 10 = course packages. Not every size exists for every program. */
  size: 1 | 4 | 6 | 10;
  externalRef: string;
  /** ⚠️ Satang, and **VAT-inclusive** — the final amount the customer pays. Never add tax, never net it down. */
  priceMinor: number;
  /** The programs sold on this combination. */
  subjects: PricedSubjectRef[];
}

export interface SellablePackagesResponse {
  vatInclusive: boolean;
  packages: SellablePackage[];
  /** Programs with no price group — nothing sellable, so the UI says so instead of showing an empty control. */
  unpricedSubjects: PricedSubjectRef[];
  /** SPEC-030 / TASK-106 — the price groups a voucher may book. The picker filters from here, never a hardcoded
   *  list (the card changes before the code does). Excluded groups (Onewheel / Balance Play) are simply absent. */
  voucherAllowedGroups: string[];
  /** SPEC-031 / TASK-123 — rental price card (code + VAT-incl `priceMinor`; the FE owns labels via i18n). Derived
   *  server-side from the one price authority, so the FE never carries a second copy of the rental prices. */
  rentalItems: { code: string; priceMinor: number }[];
}

/** Satang → the displayed baht string. Display-only; no arithmetic on the price itself. */
export const formatPriceMinor = (minor: number, locale = "th-TH") =>
  (minor / 100).toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
