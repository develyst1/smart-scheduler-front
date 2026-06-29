import type { TeacherType } from "@/types/app/scheduler";

const ORDER_KEY = "scheduler.teacherTypeOrder";
const OVERRIDE_KEY = "scheduler.teacherLimitOverride";

export const DEFAULT_TEACHER_TYPE_ORDER: TeacherType[] = [
  "FULL_TIME",
  "PART_TIME",
  "FREELANCE",
];

export function readTeacherTypeOrder(): TeacherType[] {
  if (typeof window === "undefined") return DEFAULT_TEACHER_TYPE_ORDER;
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    if (!raw) return DEFAULT_TEACHER_TYPE_ORDER;
    const parsed = JSON.parse(raw) as TeacherType[];
    return parsed.length ? parsed : DEFAULT_TEACHER_TYPE_ORDER;
  } catch {
    return DEFAULT_TEACHER_TYPE_ORDER;
  }
}

export function writeTeacherTypeOrder(order: TeacherType[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ORDER_KEY, JSON.stringify(order));
}

export function readLimitOverrides(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function writeLimitOverride(id: string, override: boolean) {
  if (typeof window === "undefined") return;
  const all = readLimitOverrides();
  if (override) all[id] = true;
  else delete all[id];
  localStorage.setItem(OVERRIDE_KEY, JSON.stringify(all));
}
