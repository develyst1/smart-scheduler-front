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

/**
 * The create body's `duo` block — ONLY when the toggle is on: the second child, and the rate (satang via the ONE
 * `bahtToMinor`) ONLY with key 59 (REQ-102 §8, TASK-432: without it the field is absent and the body carries no
 * `classRateMinor` — the rate is optional at create; a key holder sets the default on the card later).
 */
export const duoBody = (d: DuoDraft, canRate = true): { coStudentId: string; classRateMinor?: number } | undefined =>
  !d.on || !d.coStudentId ? undefined : canRate && d.rateBaht !== "" ? { coStudentId: d.coStudentId, classRateMinor: bahtToMinor(d.rateBaht) } : { coStudentId: d.coStudentId };

/** Is the DUO half of the form complete? (a second child that is not the first; the rate typed ONLY when key 59 shows the field) — the server still judges. */
export const duoReady = (d: DuoDraft, primaryId: string | null | undefined, canRate = true): boolean =>
  !d.on || (!!d.coStudentId && d.coStudentId !== (primaryId ?? null) && (!canRate || d.rateBaht !== ""));

/**
 * REQ-102 §6/§8 (TASK-431/434/432) — key 59 `action:bookings.coach-rate` gates EVERY rate on the FE: without it the
 * server nulls `rate` / `classRateMinor` / `teacherRates` (read null as "no key", never as ฿0) and refuses any body
 * carrying `classRateMinor` / `teacherRates` / `rateMinor` with 403. This strips those three from a body when the key
 * is absent — ONE guard at every body site, pinned. Independent of 57 (`teachers.budget-view`, the `—` rule).
 */
export const COACH_RATE_KEY = "action:bookings.coach-rate" as const;
const RATE_FIELDS = ["classRateMinor", "teacherRates", "rateMinor"] as const;
export const withoutRates = <T extends object>(body: T, canRate: boolean): T => {
  if (canRate) return body;
  const out = { ...body } as Record<string, unknown>;
  for (const k of RATE_FIELDS) delete out[k];
  return out as T;
};

/** `classRateMinor` for the COURSE default body — only when the typed baht differs from the course's satang; else nothing (never null: the default is set, not cleared). */
export const rateChange = (typedBaht: number | "", currentMinor: number | null | undefined): { classRateMinor: number } | undefined =>
  typedBaht === "" || bahtToMinor(typedBaht) === (currentMinor ?? null) ? undefined : { classRateMinor: bahtToMinor(typedBaht) };

/**
 * REQ-095 §13.3 (TASK-423/424) — the server's THREE facts on a course row. 🔴 The FE never computes `override ?? default`:
 * `effectiveMinor` is rendered as sent (0 is a rate — ฿0, not blank); the tag reads `overrideMinor != null` alone.
 */
export interface SessionRate {
  effectiveMinor: number;
  overrideMinor: number | null;
  defaultMinor: number | null;
}
export const rateTag = (rate: SessionRate | null | undefined): "override" | "default" | null => (rate ? (rate.overrideMinor !== null && rate.overrideMinor !== undefined ? "override" : "default") : null);

/**
 * THIS session's body: `{ classRateMinor: n }` when the typed baht differs from the EFFECTIVE rate; `{ classRateMinor: null }`
 * on `Clear` when an override is set (back to the default); nothing otherwise (blank typed = leave as is).
 */
export const sessionRateChange = (typedBaht: number | "", rate: SessionRate | null | undefined, clear: boolean): { classRateMinor: number | null } | undefined => {
  if (!rate) return undefined;
  if (clear) return rate.overrideMinor !== null && rate.overrideMinor !== undefined ? { classRateMinor: null } : undefined;
  if (typedBaht === "") return undefined;
  const minor = bahtToMinor(typedBaht);
  return minor === rate.effectiveMinor ? undefined : { classRateMinor: minor };
};

/**
 * REQ-095 §13.4a (TASK-437/438) — a subject carries `kind: PRIVATE | DUO` (the server's; no name rule anywhere). The
 * DUO create's Program dropdown lists DUO subjects ONLY; every other COURSE picker hides them; a subject without
 * `kind` (an older payload) counts as PRIVATE. Single-session / trial pickers are untouched (not course pickers).
 */
export const subjectsFor = <S extends { kind?: "PRIVATE" | "DUO" | null }>(subjects: readonly S[], duoOn: boolean): S[] =>
  subjects.filter((s) => (s.kind === "DUO") === duoOn);

/** The kinds `Create group` offers (TASK-421: Group only — a DUO is a course now); existing DUO series still render. */
export const CREATABLE_GROUP_KINDS = ["GROUP"] as const;
