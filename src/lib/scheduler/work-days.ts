import dayjs from "dayjs";
import "dayjs/locale/th";
import type { Teacher, TeacherView } from "@/types/app/scheduler";

const WEEKEND_DAYS = [6, 0];
const WEEKDAY_DAYS = [1, 2, 3, 4, 5];

// Monday-first ordering (Sunday last) to match the calendar's week start.
export const ALL_WORK_DAYS = [1, 2, 3, 4, 5, 6, 0] as const;

/** Locale-aware short weekday name (0=Sun … 6=Sat). */
/**
 * REQ-075 — English reads `Mon/Tue/Wed`, not `Mo/Tu/We`.
 *
 * 🔴 Thai deliberately stays on `dd` (จ. อ. พ.). dayjs' Thai locale has **no** three-letter form: `ddd` there
 * yields the FULL name (จันทร์, อังคาร…), which is longer, not shorter — and widening the weekday would fight
 * REQ-052 AC-3, the 375px no-truncation rule the calendar cell was just measured against. `dd` already IS the
 * conventional Thai abbreviation, so the REQ's intent (a readable short day) is met in both languages by
 * different tokens, not the same one.
 */
export const dayShort = (d: number, lang: string) =>
  dayjs().day(d).locale(lang).format(lang === "th" ? "dd" : "ddd");

/** 7 day buttons for the working-days picker, labelled in the active language. */
export const workDayOptions = (lang: string) =>
  ALL_WORK_DAYS.map((d) => ({ value: String(d), label: dayShort(d, lang) }));

/** ปุ่มลัดในหน้าจัดการครู — labelKey resolved with t() in the component. */
export const WORK_DAY_PRESETS: { labelKey: string; days: number[] }[] = [
  { labelKey: "workdays.presetAll", days: [...ALL_WORK_DAYS] },
  { labelKey: "workdays.presetWeekend", days: [...WEEKEND_DAYS] },
  { labelKey: "workdays.presetWeekdays", days: [...WEEKDAY_DAYS] },
  { labelKey: "workdays.presetSat", days: [6] },
  { labelKey: "workdays.presetSun", days: [0] },
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

/** Localized summary of a teacher's working days. `labels` come from t() in the component. */
export function formatWorkDaysLabel(
  workDays: readonly number[] | undefined,
  lang: string,
  labels: { allDays: string; weekdays: string; weekend: string },
): string {
  if (!workDays?.length || workDays.length === 7) return labels.allDays;
  const sorted = [...new Set(workDays)].sort((a, b) => {
    const order = (d: number) => (d === 0 ? 7 : d);
    return order(a) - order(b);
  });
  if (
    sorted.length === WEEKDAY_DAYS.length &&
    WEEKDAY_DAYS.every((d) => sorted.includes(d))
  ) {
    return labels.weekdays;
  }
  if (
    sorted.length === WEEKEND_DAYS.length &&
    WEEKEND_DAYS.every((d) => sorted.includes(d))
  ) {
    return labels.weekend;
  }
  return sorted.map((d) => dayShort(d, lang)).join(", ");
}
