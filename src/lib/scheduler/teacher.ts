import dayjs from "dayjs";
import type { Booking, Teacher, TeacherType, TeacherView } from "@/types/app/scheduler";

/**
 * คำนวณรายได้เดือนปัจจุบันของครู + สถานะ over-limit
 *
 * กฎ (จากคุยกับลูกค้า):
 *  - นับ "ทุก booking ที่ assign" ให้ครู ในเดือนปัจจุบัน (1 booking = 1 ชม.)
 *  - รายได้ = hourlyRate × ชั่วโมง
 *  - เกิน incomeLimit และยังไม่ override → overLimit = true → ไม่ขึ้นในตารางจอง
 *  - มีผลเฉพาะ Freelance (มี hourlyRate); ประเภทอื่นเหมาจ่าย ไม่คิด limit
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

  const hasLimit =
    teacher.type === "FREELANCE" &&
    typeof teacher.incomeLimit === "number" &&
    teacher.incomeLimit > 0;

  const overLimit =
    hasLimit && monthlyIncome >= (teacher.incomeLimit as number) && !teacher.limitOverride;

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
