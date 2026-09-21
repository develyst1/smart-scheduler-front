/**
 * REQ-102 (TASK-426/427) — a masked money figure. Without `action:teachers.budget-view` the SERVER nulls every teacher
 * DTO's `hourlyRate · budgetMinor · remainingMinor · reorderMinor` (the shape kept; the booleans stay). The FE draws
 * `—` for a null figure — never `฿0`, never blank — and masks nothing itself. ONE helper for every reader.
 */

/** A baht figure ⇒ `฿1,234` (th-TH grouping, whole baht); null/undefined ⇒ `—`. */
export const moneyOrDash = (baht: number | null | undefined): string => (typeof baht === "number" && Number.isFinite(baht) ? `฿${Math.round(baht).toLocaleString("th-TH")}` : "—");

/** The same for a SATANG figure (the DTO's `*Minor` fields). */
export const minorOrDash = (minor: number | null | undefined): string => (typeof minor === "number" && Number.isFinite(minor) ? moneyOrDash(minor / 100) : "—");
