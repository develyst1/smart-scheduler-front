/**
 * REQ-095 Stage 1 / SPEC-080 (TASK-395) — the ECA · Free · KOL facts on an `OTHER` booking, as pure functions.
 *
 * Three fields the owner types on the อื่นๆ form: the KIND (`ECA` / `FREE` / `KOL`), the HEAD COUNT, and a RATE per
 * teacher (primary + each additional) — 🔴 stored for the backoffice, NOT posted here (the hint says so; the BE's
 * `ratePostedAt` is null until a later stage posts). The wire carries ONE `teacherRates` map, keyed by teacher id,
 * in SATANG — the baht→satang conversion happens ONCE, here, through `bahtToMinor` (TASK-169's lesson).
 *
 * 🚫 No client rule: an empty kind / count / rate is simply absent from the body; the server refuses what it refuses
 * (`VALIDATION` on a non-integer, `409 SLOT_TAKEN` on a series clash naming the date).
 */

import { bahtToMinor } from "./discount";

export const OTHER_KINDS = ["ECA", "FREE", "KOL"] as const;
export type OtherKind = (typeof OTHER_KINDS)[number];

/** What the form holds for these three: the human units (baht as typed, `""` = untouched). */
export interface OtherScheduleDraft {
  kind: OtherKind | null;
  headCount: number | "";
  /** teacherId → baht as typed. A teacher with no entry sends no rate. */
  ratesBaht: Record<string, number | "">;
}

export const emptyOtherSchedule = (): OtherScheduleDraft => ({ kind: null, headCount: "", ratesBaht: {} });

/** The wire fragment for a create / a series: each field only when set; the map only when at least one rate. */
export interface OtherScheduleFacts {
  otherKind?: OtherKind;
  headCount?: number;
  teacherRates?: Record<string, number>;
}

/** Baht map → satang map, dropping untouched entries and teachers not on the booking. Pure. */
export const teacherRatesMinor = (ratesBaht: Record<string, number | "">, teacherIds: readonly string[]): Record<string, number> | undefined => {
  const out: Record<string, number> = {};
  for (const id of teacherIds) {
    const v = ratesBaht[id];
    if (typeof v === "number" && Number.isFinite(v)) out[id] = bahtToMinor(v);
  }
  return Object.keys(out).length ? out : undefined;
};

export const otherScheduleFacts = (d: OtherScheduleDraft, teacherIds: readonly string[]): OtherScheduleFacts => ({
  ...(d.kind ? { otherKind: d.kind } : {}),
  ...(typeof d.headCount === "number" ? { headCount: d.headCount } : {}),
  ...(() => {
    const m = teacherRatesMinor(d.ratesBaht, teacherIds);
    return m ? { teacherRates: m } : {};
  })(),
});

/** The server's facts on a booking DTO (`other`), as the FE reads them. */
export interface OtherFacts {
  /** TASK-419 — `CAMP` arrives on a camp hour (owned by its week); the form never offers it (`OTHER_KINDS` stays three). */
  kind: OtherKind | "CAMP" | null;
  headCount: number | null;
  /** teacherId → SATANG. */
  teacherRates: Record<string, number>;
  ratePostedAt: string | null;
}

/** A draft seeded from the server's facts (satang → baht for the inputs). Pure. */
export const draftFromFacts = (facts: OtherFacts | null | undefined, teacherIds: readonly string[]): OtherScheduleDraft => ({
  // a CAMP row never reaches the form (its doors are hidden); read defensively as "no kind"
  kind: facts?.kind === "CAMP" ? null : (facts?.kind ?? null),
  headCount: typeof facts?.headCount === "number" ? facts.headCount : "",
  ratesBaht: Object.fromEntries(teacherIds.map((id) => [id, typeof facts?.teacherRates?.[id] === "number" ? facts.teacherRates[id] / 100 : ""])),
});

/**
 * The EDIT body (`PATCH /bookings/:id/other`) — ONLY what changed against the server's facts; an unchanged draft
 * gives `{}` (the caller sends nothing). `teacherRates` is sent whole when any rate differs (the map REPLACES).
 */
export const otherSchedulePatch = (facts: OtherFacts | null | undefined, d: OtherScheduleDraft, teacherIds: readonly string[]): OtherScheduleFacts => {
  const next = otherScheduleFacts(d, teacherIds);
  const out: OtherScheduleFacts = {};
  if ((next.otherKind ?? null) !== (facts?.kind ?? null) && next.otherKind) out.otherKind = next.otherKind;
  if ((next.headCount ?? null) !== (facts?.headCount ?? null) && typeof next.headCount === "number") out.headCount = next.headCount;
  const before = facts?.teacherRates ?? {};
  const after = next.teacherRates ?? {};
  const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
  if ([...ids].some((id) => before[id] !== after[id])) out.teacherRates = after;
  return out;
};
