/**
 * REQ-099 (TASK-414/415) — the People page's BIRTHDAY filter. 🔑 The server does the filtering and the ordering
 * (`GET /students?birthMonthFrom&birthMonthTo` — both or neither, 1..12, a wrap like 11→2 allowed and ordered around
 * the year; or `?noDob=true` — never with a range, the server's `400`); this file only turns the control's state into
 * that query and a stored date into what is read. 🚫 No month or null filtering here, no sort.
 * TASK-416/417 — optional YEARS beside the months (`birthYearFrom/To`, both or neither; a dated range cannot wrap
 * and must be from ≤ to — the server's `400`, shown as its sentence). Blank years = any year: the month-only query,
 * byte-unchanged.
 */

export interface BirthdayState {
  /** Month numbers 1..12, or null while unset. */
  from: number | null;
  to: number | null;
  /** The `No DOB recorded` switch — exclusive with the range (mirrors the server; the server still decides). */
  noDob: boolean;
  /** TASK-417 — optional 4-digit years beside the months; blank = any year. Absent on an older state. */
  yearFrom?: number | null;
  yearTo?: number | null;
}

export const EMPTY_BIRTHDAY: BirthdayState = { from: null, to: null, noDob: false, yearFrom: null, yearTo: null };

/** A typed year is a 4-digit number; anything else reads as blank. */
export const isYear = (y: number | null | undefined): y is number => typeof y === "number" && Number.isInteger(y) && y >= 1000 && y <= 9999;
/** Years ride only when BOTH are filled; one filled = a half-dated range = NOT a query (mirrors the server's both-or-neither). */
export const yearsSet = (s: Pick<BirthdayState, "yearFrom" | "yearTo">): "none" | "both" | "half" => {
  const a = isYear(s.yearFrom), b = isYear(s.yearTo);
  return a && b ? "both" : a || b ? "half" : "none";
};
export const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/** Set ⇒ the student list replaces the families view. A half-picked range is NOT set (the server wants both). */
export const birthdayActive = (s: BirthdayState): boolean => s.noDob || (s.from !== null && s.to !== null && yearsSet(s) !== "half");

/** The query for `GET /students`: the two months, OR `noDob: "true"` (a boolean-string on the wire) — never both; `q` carried. */
export const birthdayQuery = (s: BirthdayState, q?: string): Record<string, string | number> | null => {
  if (!birthdayActive(s)) return null;
  const base: Record<string, string | number> = q?.trim() ? { q: q.trim() } : {};
  if (s.noDob) return { ...base, noDob: "true", limit: 200 };
  const years: Record<string, number> = yearsSet(s) === "both" ? { birthYearFrom: s.yearFrom as number, birthYearTo: s.yearTo as number } : {};
  return { ...base, birthMonthFrom: s.from as number, birthMonthTo: s.to as number, ...years, limit: 200 };
};

/** A stored `YYYY-MM-DD` → `DD-MM-YYYY` (REQ-099's shape, distinct from the tables' `DD/MMM/YY`); null → `—`. */
export const formatDob = (iso: string | null | undefined): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "—";
};
