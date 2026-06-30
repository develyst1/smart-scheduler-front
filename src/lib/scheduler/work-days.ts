import dayjs from "dayjs";
import type { Teacher, TeacherView } from "@/types/app/scheduler";

const THAI_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"] as const;
const WEEKEND_DAYS = [6, 0];
const WEEKDAY_DAYS = [1, 2, 3, 4, 5];

export function teacherWorksOnDay(workDays: readonly number[] | undefined, weekday: number): boolean {
  if (!workDays?.length) return true;
  return workDays.includes(weekday);
}

export function teacherWorksOnDate(teacher: Pick<Teacher, "workDays">, date: string): boolean {
  return teacherWorksOnDay(teacher.workDays, dayjs(date).day());
}

export function bookableOnDate(teacher: TeacherView, date: string): boolean {
  return teacher.bookable && teacherWorksOnDate(teacher, date);
}

export function formatWorkDaysLabel(workDays: readonly number[] | undefined): string {
  if (!workDays?.length || workDays.length === 7) return "ทุกวัน";
  const sorted = [...new Set(workDays)].sort((a, b) => {
    const order = (d: number) => (d === 0 ? 7 : d);
    return order(a) - order(b);
  });
  if (
    sorted.length === WEEKDAY_DAYS.length &&
    WEEKDAY_DAYS.every((d) => sorted.includes(d))
  ) {
    return "จ–ศ (วันธรรมดา)";
  }
  if (
    sorted.length === WEEKEND_DAYS.length &&
    WEEKEND_DAYS.every((d) => sorted.includes(d))
  ) {
    return "เสาร์–อาทิตย์";
  }
  return sorted.map((d) => THAI_SHORT[d] ?? String(d)).join(", ");
}
