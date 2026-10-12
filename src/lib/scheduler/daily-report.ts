import type { Booking, BookingStatus, BookingType, DailyReport } from "@/types/app/scheduler";

/**
 * Daily report counters — the ONE place the FE defines what each stat means. Pure, no IO.
 *
 * This is the FE stand-in for `GET /reports/daily` until the backend computes these server-side; the
 * backend handoff (definitions, fields, open questions) is `docs/backend-daily-report.md`. Keep the two in
 * sync — if a definition changes here, change it there too.
 */

/** 1:1 lesson types — the only rows the stat cards and "By booking type" rows count. */
export const LESSON_TYPES: readonly BookingType[] = ["FIRST_TRIAL", "SINGLE_SESSION", "COURSE_PACKAGE", "VOUCHER"];

/** Booking types whose PAUSED rows count as "Awaiting" (1st trial / 1-hour, postponed, waiting for a new slot). */
export const AWAITING_TYPES: readonly BookingType[] = ["FIRST_TRIAL", "SINGLE_SESSION"];

/**
 * Status → stat bucket. A status may feed several stats (Attended ⊂ Confirmed ⊂ Total booked).
 *
 * Client-confirmed: Confirmed = CONFIRMED + ATTENDED (attended is NOT subtracted), a leave (SICK_LEAVE) is
 * NOT confirmed; Pending = PENDING; Awaiting = PAUSED 1st/1HR whose ORIGINAL date is the report day;
 * Cancelled is outside Total booked;
 * attendance rate = attended / totalBooked.
 *
 * ⚠️ PROVISIONAL — open questions in `docs/backend-daily-report.md` §7, placeholders until answered:
 * - NO_SHOW counted as Confirmed (Q1)
 * - EXTENDED counted as Pending (Q2)
 * - Awaiting counts 1st/1HR only, not paused VOUCHER rows (Q4)
 * - Total booked excludes PAUSED (Q5); workload `total` counts rows/hours (Q3) and every non-cancelled,
 *   non-paused row (Q6)
 */
export const CONFIRMED_STATUSES: readonly BookingStatus[] = ["CONFIRMED", "ATTENDED", "NO_SHOW"];
export const PENDING_STATUSES: readonly BookingStatus[] = ["PENDING", "EXTENDED"];
const OFF_DAY_STATUSES: readonly BookingStatus[] = ["CANCELLED", "PAUSED"];

const isLesson = (b: Booking) => LESSON_TYPES.includes(b.bookingType);
const isBooked = (b: Booking) => !OFF_DAY_STATUSES.includes(b.status);
const isConfirmed = (b: Booking) => CONFIRMED_STATUSES.includes(b.status);

/** Per booking type, rows matching `pred` — all four lesson types in fixed order, zeros kept. */
const perLessonType = (rows: Booking[], pred: (b: Booking) => boolean) =>
  LESSON_TYPES.map((type) => ({ type, count: rows.filter((b) => b.bookingType === type && pred(b)).length }));

/**
 * The day's report from raw rows.
 *
 * @param dayRows  every row dated `date` INCLUDING cancelled ones (calendar with `includeCancelled`), any
 *                 type — lessons and group programs (OTHER: ECA/Free/KOL/CAMP, GROUP). Already teacher-filtered.
 * @param paused   PAUSED rows whose original `date` is the report day (they are off the calendar). Same filter.
 */
export function summarizeDailyReport(
  date: string,
  dayRows: Booking[],
  paused: Booking[],
): DailyReport {
  const rows = dayRows.filter((b) => !b.pendingSlot);
  const lessons = rows.filter(isLesson);
  const booked = lessons.filter(isBooked);

  const totalBooked = booked.length;
  const attended = booked.filter((b) => b.status === "ATTENDED").length;
  const confirmed = booked.filter(isConfirmed).length;

  return {
    date,
    totalBooked,
    attended,
    confirmed,
    pending: booked.filter((b) => PENDING_STATUSES.includes(b.status)).length,
    awaiting: paused.filter((b) => b.status === "PAUSED" && AWAITING_TYPES.includes(b.bookingType)).length,
    onLeave: booked.filter((b) => b.status === "SICK_LEAVE").length,
    cancelled: lessons.filter((b) => b.status === "CANCELLED").length,
    attendanceRate: totalBooked > 0 ? Math.round((attended / totalBooked) * 100) : 0,
    byBookingTypeAttended: perLessonType(booked, (b) => b.status === "ATTENDED"),
    byBookingTypeConfirmed: perLessonType(booked, isConfirmed),
    byTeacher: workloadByTeacher(rows.filter(isBooked)),
  };
}

/**
 * Daily workload per teacher. Field meanings: `DailyReport["byTeacher"]`.
 *
 * ⚠️ Known gap vs the server: a row counts only for its primary `teacherId`, so a multi-teacher ECA row
 * credits one teacher. Teachers with group work only still appear (`0/0`, total > 0).
 */
export function workloadByTeacher(rows: Booking[]): DailyReport["byTeacher"] {
  const map = new Map<string, { count: number; attended: number; total: number }>();
  for (const b of rows) {
    if (!isBooked(b)) continue;
    const cur = map.get(b.teacherId) ?? { count: 0, attended: 0, total: 0 };
    cur.total += 1;
    if (isLesson(b)) {
      if (isConfirmed(b)) cur.count += 1;
      if (b.status === "ATTENDED") cur.attended += 1;
    }
    map.set(b.teacherId, cur);
  }
  return [...map.entries()]
    .map(([teacherId, v]) => ({ teacherId, ...v }))
    .sort((a, b) => b.total - a.total || b.count - a.count);
}
