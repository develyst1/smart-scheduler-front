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
export const leaveBody = (
  date: string,
  allIds: readonly string[],
  ticked: readonly string[],
  reason: string,
  advance = false,
): { date: string; sessionIds?: string[]; reason: string } => {
  // 🔴 TASK-582 (BE) → TASK-588 — an ADVANCE day is a WHOLE-DAY block: `sessionIds` picks classes to CANCEL and nothing is
  // being cancelled, so the server REFUSES a body carrying them (400, in words). 🚫 It can never ride here — not "is
  // usually omitted", cannot.
  if (advance) return { date, reason: reason.trim() };
  const set = new Set(ticked);
  const ids = allIds.filter((id) => set.has(id));
  const whole = ids.length === allIds.length && allIds.length > 0;
  return { date, ...(whole ? {} : { sessionIds: ids }), reason: reason.trim() };
};

/**
 * 🔴 **TASK-588 — is this date the ADVANCE act?** The server's rule is `date > today` in Bangkok, and this is the screen's
 * copy of the same comparison — **taken as an argument so it is testable and so the call site owns "today".**
 *
 * ⚠️ **Why a copy is acceptable here, stated rather than assumed:** the server decides what is DONE; this decides only what
 * is SHOWN. 🔑 **And both ways of being wrong are safe:** if the screen thinks "advance" on a date the server calls today,
 * the body carries no `sessionIds` — which is exactly what ticking every class would have sent, so the ordinary cancel
 * runs unchanged; if it thinks "today" on a date the server calls advance, the body may carry `sessionIds` and the server
 * **refuses in its own words.** *Neither outcome is a silent wrong answer, which is the only kind worth fearing.*
 */
export const isAdvanceLeaveDate = (date: string, today: string): boolean => Boolean(date && today) && date > today;

/** The answer says which act ran; 🚫 the screen never re-derives it from the date it sent. */
export const isAdvanceResult = (res: { mode?: string } | null | undefined): boolean => res?.mode === "advance";

/**
 * 🔴 **TASK-587 (BE) → TASK-589 — the ADMIN's marker for a blocked day, as a pure rule.**
 *
 * **What the marker must carry, and why each half:** ⚠️ **whose day** (an admin cannot act without knowing which coach) and
 * 🔑 **how many classes are on it** — *a marker that only says "blocked" sends an admin looking for the classes; one that
 * says "3 classes" tells them there is work.*
 *
 * ⚖️ **The EMPTY blocked day SHOWS — and this is a deliberate divergence from my own camp-banner decision (TASK-586),
 * where an empty closed week is hidden as noise.** The two markers answer different questions:
 *  · the camp banner reports **work happening** ⇒ an empty one has nothing to report;
 *  · this reports **a coach being unavailable** ⇒ 🔑 **the empty case is exactly the one an admin needs BEFORE booking.**
 * *A blocked day with nothing on it is not noise; it is the answer to "can I put a class here?" — and the booking gate will
 * refuse that class anyway, so the marker turns a refusal into something seen first.*
 * 📌 The row says which kind it is (`classes`), so the screen can word them differently: **work to handle** vs **away**.
 */
export interface LeaveMarker {
  teacherId: string;
  teacherName: string;
  date: string;
  classes: number;
}

export const leaveMarkersFor = (
  rows: readonly { teacherId: string; teacherName: string; date: string; bookings?: readonly unknown[] }[] | undefined,
  dates: readonly string[],
): LeaveMarker[] =>
  (rows ?? [])
    .filter((r) => dates.includes(r.date))
    .map((r) => ({ teacherId: r.teacherId, teacherName: r.teacherName, date: r.date, classes: (r.bookings ?? []).length }));
// 🚫 **Not sorted here.** The server already answers in date-then-coach order, and a second ordering on this side is a
// second opinion about a question that already has an answer — *my first version re-sorted with `localeCompare`, which put
// บี before เอ and disagreed with the list the server sent.* **Filter and shape only.**

/** The copy key for one marker: 🔑 a day WITH classes says there is work; an empty one says the coach is away. */
export const leaveMarkerKey = (m: { classes: number }): string =>
  m.classes > 0 ? "leaveDays.markerClasses" : "leaveDays.markerAway";
