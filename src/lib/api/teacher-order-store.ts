import type { TeacherType } from "@/types/app/scheduler";

const ORDER_KEY = "scheduler.teacherTypeOrder";

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
