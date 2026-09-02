// People (parents + students) — REQ-019 / SPEC-016. The scheduling API returns camelCase JSON that
// already matches these shapes (parent row + embedded students), so no DTO→view mapper is needed.

export interface Student {
  id: string;
  parentId: string | null;
  name: string;
  nickname: string | null;
  /** "male" | "female" | "other" — stored free-text; UI offers the three. */
  gender: string | null;
  /** Date of birth, YYYY-MM-DD. Age is DERIVED for display — never stored. */
  birthDate: string | null;
  /** "ไทย" for Thai, else the free-text country name. */
  nationality: string | null;
  note: string | null;
}

export interface Parent {
  id: string;
  phone: string;
  name: string | null;
  /** Household address province (≠ the per-booking `จังหวัด` badge). */
  province: string | null;
  /** Free-text staff note about the household (max 500). Reachable since TASK-050. */
  note: string | null;
  /** ISO timestamp when suspended; null = active. */
  suspendedAt: string | null;
  students: Student[];
}

/**
 * SPEC-071 / TASK-243 — what `GET /parents/:id` adds over a list row: whether this family has a LINE account
 * bound, and how many.
 *
 * 🔴 **Detail only, deliberately.** `GET /parents` does NOT carry these — the BE counts them through the
 * family-link accessor, one query per parent, so a badge on every list row would be N+1 on a screen that loads
 * 20 at a time. Making it a list field is a **batched** BE read (one `inArray` over the page's ids), which is a
 * BE task and not this one — see TASK-243 §Questions.
 */
export interface ParentDetail extends Parent {
  /** True when at least one LINE account is bound to this family. */
  lineLinked: boolean;
  /** How many — since TASK-230 a family can hold more than one, so this is not a boolean in disguise. */
  lineAccounts: number;
}

export interface ParentsResponse {
  parents: Parent[];
  total: number;
}

export const GENDERS = ["male", "female", "other"] as const;
export type Gender = (typeof GENDERS)[number];

/** Canonical stored value for Thai nationality (a data value, not UI copy). */
export const THAI_NATIONALITY = "ไทย";
