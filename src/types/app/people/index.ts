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
  /** ISO timestamp when suspended; null = active. */
  suspendedAt: string | null;
  students: Student[];
}

export interface ParentsResponse {
  parents: Parent[];
  total: number;
}

export const GENDERS = ["male", "female", "other"] as const;
export type Gender = (typeof GENDERS)[number];

/** Canonical stored value for Thai nationality (a data value, not UI copy). */
export const THAI_NATIONALITY = "ไทย";
