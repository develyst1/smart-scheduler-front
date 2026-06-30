import dayjs from "dayjs";
import type { Teacher, TeacherView } from "@/types/app/scheduler";

const THAI_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"] as const;
const WEEKEND_DAYS = [6, 0];
const WEEKDAY_DAYS = [1, 2, 3, 4, 5];

export const ALL_WORK_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export const WORK_DAY_OPTIONS = ALL_WORK_DAYS.map((d) => ({
  value: String(d),
  label: THAI_SHORT[d],
}));

/** ปุ่มลัดในหน้าจัดการครู */
export const WORK_DAY_PRESETS: { label: string; days: number[] }[] = [
  { label: "ทุกวัน", days: [...ALL_WORK_DAYS] },
  { label: "เสาร์–อาทิตย์", days: [...WEEKEND_DAYS] },
  { label: "จ–ศ", days: [...WEEKDAY_DAYS] },
  { label: "เสาร์", days: [6] },
  { label: "อาทิตย์", days: [0] },
];

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
