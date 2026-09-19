/**
 * REQ-097 / SPEC-083 (TASK-406/407) — a TEACHER's own account: `/me` carries `teacherId` when the account is linked
 * to a teacher. 🔴 The server decides the scope (its `own-scope` predicate filters every read, its `TEACHER_ALLOWED`
 * set refuses every other route with `403 SCOPE_TEACHER`); this file only READS the flag to shape the screen and
 * shapes the one confirmed body. 🚫 No id comparison of its own on booking rows, no second calendar.
 */
import type { CalendarResponse } from "@/types/api/contract";

/** `teacherId` set ⇒ the account is scoped. The FE shows it; the server enforces it. */
export const isScoped = (me: { teacherId?: string | null } | null | undefined): boolean => !!me?.teacherId;

/**
 * The teacher columns a scoped calendar came back with — "render what comes; no empty coaches". The payload's own
 * `days[].columns[].teacher` ids, in first-seen order; the roster (`GET /teachers`) is only the lookup for their cards.
 */
export const columnTeacherIds = (calendar: Pick<CalendarResponse, "days"> | undefined): string[] => {
  const seen: string[] = [];
  for (const d of calendar?.days ?? []) for (const c of d.columns) if (!seen.includes(c.teacher.id)) seen.push(c.teacher.id);
  return seen;
};

/** The routes the calendar page may call while scoped — the server's `TEACHER_ALLOWED`, for the test's walk. */
export const TEACHER_ALLOWED_ROUTES = [
  "GET /calendar",
  "GET /bookings",
  "GET /teachers",
  "GET /badges",
  "GET /bookings/:id/checkin",
  "GET /bookings/:id/posted-sale",
  "PATCH /bookings/:id/status",
  "POST /teachers/me/leave",
] as const;

/** A row the leave dialog lists: what the day's grid already holds for me. */
export interface LeaveCandidate {
  id: string;
  status: string;
}

/** Ticked by default: every row except one already delivered (`ATTENDED` ⇒ the server's `409 SESSION_DELIVERED` if ticked). */
export const leaveDefaultTicks = (rows: readonly LeaveCandidate[]): string[] => rows.filter((r) => r.status !== "ATTENDED").map((r) => r.id);

/**
 * `POST /teachers/me/leave` — `{ date, sessionIds?, reason }`. `sessionIds` rides ONLY when the ticks are a strict
 * subset of the day's rows (the whole day = no list, the server's own set); the reason is trimmed, its bounds
 * (3..200) are the server's sentence.
 */
export const leaveBody = (date: string, allIds: readonly string[], ticked: readonly string[], reason: string): { date: string; sessionIds?: string[]; reason: string } => {
  const set = new Set(ticked);
  const ids = allIds.filter((id) => set.has(id));
  const whole = ids.length === allIds.length && allIds.length > 0;
  return { date, ...(whole ? {} : { sessionIds: ids }), reason: reason.trim() };
};
