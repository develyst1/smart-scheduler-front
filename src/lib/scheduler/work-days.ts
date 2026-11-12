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

/**
 * 🔴 **TASK-966 (SPEC-108 §3-4, REQ-5015) — the times a coach's part-day leave and working hours are picked from: every half hour, `HH:MM`** (the server takes "on the hour or the half hour").
 * Last choice 23:30. A window that reaches the end of the day is simply the whole day, so there is no 24:00.
 */
export const HALF_HOUR_TIMES: string[] = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

/** `HH:MM` from a server time (`09:00:00` or `09:00`); anything else is returned as it came. */
export const hhmm = (time: string | null | undefined): string => (time ?? "").slice(0, 5);

/** The only refusal a from/to pair can have on the screen: one end without the other, or From not before To. `null` = fine (both empty = the whole day). */
export const timeRangeIssue = (from: string | null | undefined, to: string | null | undefined): "partial" | "order" | null => {
  if (!from && !to) return null;
  if (!from || !to) return "partial";
  return from < to ? null : "order";
};

/** One weekday's hours as the screen edits them: both empty = the whole day. */
export type HoursDraft = Record<number, { from: string | null; to: string | null }>;

/** The saved `workHours` (`{ "6": ["13:00","18:00"] }`, a server time may carry seconds) as the editor's draft. */
export const hoursDraftFromSaved = (saved: Record<string, [string, string]> | null | undefined): HoursDraft =>
  Object.fromEntries(Object.entries(saved ?? {}).map(([d, [from, to]]) => [Number(d), { from: hhmm(from), to: hhmm(to) }]));

/**
 * 🔴 **TASK-966 (SPEC-108 §4) — what the draft saves:** `workHours` holds a key ONLY for a ticked working day that has a complete From–To (the server refuses a key outside `workDays`, and an empty day means the
 * whole day, so it is simply absent). `issue` is the first day left with one end only, or with From not before To — nothing is sent while one stands.
 */
export const hoursFromDraft = (days: readonly number[], draft: HoursDraft): { hours: Record<string, [string, string]>; issue: { day: number; kind: "partial" | "order" } | null } => {
  const hours: Record<string, [string, string]> = {};
  let issue: { day: number; kind: "partial" | "order" } | null = null;
  for (const day of ALL_WORK_DAYS) {
    if (!days.includes(day)) continue;
    const h = draft[day];
    const bad = h ? timeRangeIssue(h.from, h.to) : null;
    if (bad) {
      issue ??= { day, kind: bad };
      continue;
    }
    if (h?.from && h.to) hours[String(day)] = [h.from, h.to];
  }
  return { hours, issue };
};

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
