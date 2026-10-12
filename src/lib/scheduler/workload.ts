import type { Booking, BookingType, DailyReport } from "@/types/app/scheduler";

/** The 1:1 lesson types — what the workload ratio counts. Everything else (OTHER: ECA/Free/KOL/CAMP, GROUP) is "group". */
const LESSON_TYPES: readonly BookingType[] = ["FIRST_TRIAL", "SINGLE_SESSION", "COURSE_PACKAGE", "VOUCHER"];

/**
 * Daily workload per teacher, from the day's non-cancelled rows — the FE stand-in for the server's
 * `DailyReportResponse.byTeacher` (see its TODO). Field meanings: `DailyReport["byTeacher"]`.
 *
 * ⚠️ Known gap vs the server: a row counts only for its primary `teacherId`, so a multi-teacher ECA row
 * credits one teacher. Teachers with group work only still appear (`0/0`, total > 0).
 */
export function workloadByTeacher(active: Booking[]): DailyReport["byTeacher"] {
  const map = new Map<string, { count: number; attended: number; total: number }>();
  for (const b of active) {
    const cur = map.get(b.teacherId) ?? { count: 0, attended: 0, total: 0 };
    cur.total += 1;
    if (LESSON_TYPES.includes(b.bookingType)) {
      // Denominator = every non-cancelled lesson row (the pre-existing number) — see the open question on `count`.
      cur.count += 1;
      if (b.status === "ATTENDED") cur.attended += 1;
    }
    map.set(b.teacherId, cur);
  }
  return [...map.entries()]
    .map(([teacherId, v]) => ({ teacherId, ...v }))
    .sort((a, b) => b.total - a.total || b.count - a.count);
}
