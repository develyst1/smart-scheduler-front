/**
 * REQ-099 (TASK-414/415) — the People page's BIRTHDAY filter. 🔑 The server does the filtering and the ordering
 * (`GET /students?birthMonthFrom&birthMonthTo` — both or neither, 1..12, a wrap like 11→2 allowed and ordered around
 * the year; or `?noDob=true` — never with a range, the server's `400`); this file only turns the control's state into
 * that query and a stored date into what is read. 🚫 No month or null filtering here, no sort.
 */

export interface BirthdayState {
  /** Month numbers 1..12, or null while unset. */
  from: number | null;
  to: number | null;
  /** The `No DOB recorded` switch — exclusive with the range (mirrors the server; the server still decides). */
  noDob: boolean;
}

export const EMPTY_BIRTHDAY: BirthdayState = { from: null, to: null, noDob: false };
export const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/** Set ⇒ the student list replaces the families view. A half-picked range is NOT set (the server wants both). */
export const birthdayActive = (s: BirthdayState): boolean => s.noDob || (s.from !== null && s.to !== null);

/** The query for `GET /students`: the two months, OR `noDob: "true"` (a boolean-string on the wire) — never both; `q` carried. */
export const birthdayQuery = (s: BirthdayState, q?: string): Record<string, string | number> | null => {
  if (!birthdayActive(s)) return null;
  const base: Record<string, string | number> = q?.trim() ? { q: q.trim() } : {};
  if (s.noDob) return { ...base, noDob: "true", limit: 200 };
  return { ...base, birthMonthFrom: s.from as number, birthMonthTo: s.to as number, limit: 200 };
};

/** A stored `YYYY-MM-DD` → `DD-MM-YYYY` (REQ-099's shape, distinct from the tables' `DD/MMM/YY`); null → `—`. */
export const formatDob = (iso: string | null | undefined): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "—";
};
