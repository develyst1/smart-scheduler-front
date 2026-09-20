/**
 * REQ-095 §13 / SPEC-087 (TASK-420/421) — DUO = ONE course, TWO kids. The server owns the pair (`coStudent` on the
 * course and on every session row of it), the price (`course-balance-duo-{size}` from the sellable card — never a
 * number here), the pool and the leave rules. This file: the ONE two-name label, the create body's `duo` block, the
 * move/edit rate body, and the DUO card's price-group NAME as the server's card lists it.
 * 🚫 No client pool/leave logic; the same-child rule is the server's `DUO_SAME_CHILD` (mirrored as a hint only).
 */
import { bahtToMinor } from "./discount";

/** The pair as it rides on a row or a course: the second child in the same `studentRef` shape, or null. */
export interface CoStudentRef {
  id: string;
  name: string;
  nickname?: string | null;
}

/** What staff call a child: the nickname when recorded, else the name (the server's own displayName rule). */
export const callName = (s: { name: string; nickname?: string | null } | null | undefined): string | null => (s ? (s.nickname?.trim() || s.name) : null);

/**
 * ONE label for "who is this row/course for": a Private renders `first` unchanged (byte-identical — the server's
 * `displayName` stays the one name field); a DUO renders `first & <co's call name>`. Pure, value-tested.
 */
export const studentLabel = (first: string, coStudent: CoStudentRef | null | undefined): string => {
  const co = callName(coStudent);
  return co ? `${first} & ${co}` : first;
};

/** The DUO card's price group, as the server's sellable card names it (`priceGroup`); the price is read FROM the card. */
export const DUO_PRICE_GROUP = "balance-duo";
/** Which card a course form prices from: the DUO card when the toggle is on, else the subject's own group (TASK-400's rule). */
export const priceGroupFor = (duo: boolean, subjectGroup: string | null | undefined): string | null | undefined => (duo ? DUO_PRICE_GROUP : subjectGroup);

export interface DuoDraft {
  on: boolean;
  coStudentId: string | null;
  /** The teaching rate in BAHT as typed; "" = blank. */
  rateBaht: number | "";
}
export const emptyDuo = (): DuoDraft => ({ on: false, coStudentId: null, rateBaht: "" });

/** The create body's `duo` block — ONLY when the toggle is on: both fields, the rate in satang via the ONE `bahtToMinor`. */
export const duoBody = (d: DuoDraft): { coStudentId: string; classRateMinor: number } | undefined =>
  d.on && d.coStudentId && d.rateBaht !== "" ? { coStudentId: d.coStudentId, classRateMinor: bahtToMinor(d.rateBaht) } : undefined;

/** Is the DUO half of the form complete? (a second child that is not the first, a rate typed) — the server still judges. */
export const duoReady = (d: DuoDraft, primaryId: string | null | undefined): boolean =>
  !d.on || (!!d.coStudentId && d.coStudentId !== (primaryId ?? null) && d.rateBaht !== "");

/** `classRateMinor` for a move/edit body — only when the typed baht differs from the course's satang; else nothing. */
export const rateChange = (typedBaht: number | "", currentMinor: number | null | undefined): { classRateMinor: number } | undefined =>
  typedBaht === "" || bahtToMinor(typedBaht) === (currentMinor ?? null) ? undefined : { classRateMinor: bahtToMinor(typedBaht) };

/** The kinds `Create group` offers (TASK-421: Group only — a DUO is a course now); existing DUO series still render. */
export const CREATABLE_GROUP_KINDS = ["GROUP"] as const;
