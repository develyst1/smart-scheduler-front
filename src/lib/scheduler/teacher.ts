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

  // Ceiling comes from the back-office quota (server sets overLimit at quota ≤ 0). Admin can
  // force the teacher bookable via limitOverride; monthly reset restores remaining.
  const overLimit = teacher.type === "FREELANCE" && !!teacher.overLimit && !teacher.limitOverride;

  // SPEC-008 (REQ-007, revised 2026-07-28): a FULL freelance (overLimit, no durable override)
  // is HIDDEN from the calendar — auto-disabled like inactive, to stop giving them more work.
  // Top-up / limit-override / monthly reset flips overLimit off → the teacher reappears.
  // `setupIncomplete` (no pay set, SPEC-004) also suppresses.
  return {
    ...teacher,
    monthlyHours,
    monthlyIncome,
    overLimit,
    bookable: teacher.active && !overLimit && !teacher.setupIncomplete,
  };
}

export type BudgetTone = "green" | "yellow" | "red";

/**
 * สีสถานะงบครูฟรีแลนซ์บนปฏิทิน (display-only) — ตาม "% ของเพดานที่ใช้ไป" (SPEC-008 revised):
 *   usedPct = (budget − remaining) / budget × 100
 *   🟢 ≤ 30% · 🟡 30–70% · 🔴 > 70% (ครูที่ใช้ครบ 100% จะถูกซ่อน แถบจึงแสดงเฉพาะครูที่ยัง < 100%)
 * คืน null เมื่อไม่มีข้อมูลงบ (budget เป็น null/≤ 0 หรือ remaining เป็น null) → ไม่แสดงแถบ
 * คำนวณจากค่าที่ back-office ส่งมาเท่านั้น ไม่คำนวณเองฝั่ง FE
 */
export function budgetTone(
  remainingMinor?: number | null,
  budgetMinor?: number | null,
): BudgetTone | null {
  if (remainingMinor == null || budgetMinor == null || budgetMinor <= 0) return null;
  const usedPct = ((budgetMinor - remainingMinor) / budgetMinor) * 100;
  if (usedPct <= 30) return "green";
  if (usedPct <= 70) return "yellow";
  return "red";
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
