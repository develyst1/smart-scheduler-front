import dayjs from "dayjs";
import type { Booking, Teacher, TeacherType, TeacherView } from "@/types/app/scheduler";

/**
 * คำนวณรายได้เดือนปัจจุบันของครู + สถานะ over-limit
 *
 * กฎ (item-centric — Phase 2):
 *  - ครู Freelance = EXPENSE item มีโควต้าชั่วโมงรายเดือนใน back-office
 *  - ทำงานทีละชม. → back-office ตัดโควต้า; โควต้าหมด → back-office ตั้ง overLimit
 *  - overLimit และยังไม่ override → ไม่ขึ้นในตารางจอง (กระจายงานให้คนอื่น)
 *  - monthlyHours/monthlyIncome คำนวณจาก booking ที่โหลด ไว้แสดงผลเท่านั้น
 */
export function toTeacherView(
  teacher: Teacher,
  bookings: Booking[],
  ref: dayjs.Dayjs = dayjs(),
): TeacherView {
  const monthlyHours = bookings.filter(
    (b) => b.teacherId === teacher.id && dayjs(b.date).isSame(ref, "month"),
  ).length;

  const rate = teacher.hourlyRate ?? 0;
  const monthlyIncome = rate * monthlyHours;

  // Ceiling comes from the back-office quota (server sets overLimit at quota ≤ 0). Admin
  // can still force the teacher bookable via limitOverride.
  const overLimit = teacher.type === "FREELANCE" && !!teacher.overLimit && !teacher.limitOverride;

  return {
    ...teacher,
    monthlyHours,
    monthlyIncome,
    overLimit,
    bookable: teacher.active && !overLimit,
  };
}

/** เรียงครูตามลำดับประเภทที่ทีมงานกำหนด แล้วตามชื่อเล่น */
export function sortByTypeOrder<T extends Teacher>(teachers: T[], order: TeacherType[]): T[] {
  const rank = (type: TeacherType) => {
    const i = order.indexOf(type);
    return i === -1 ? order.length : i;
  };
  return [...teachers].sort(
    (a, b) => rank(a.type) - rank(b.type) || a.nickname.localeCompare(b.nickname, "th"),
  );
}
