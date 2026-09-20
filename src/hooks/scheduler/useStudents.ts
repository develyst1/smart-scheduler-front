"use client";

import { useQuery } from "@tanstack/react-query";
import { listStudentsByBirthday, searchStudents } from "@/services/student.service";

export const STUDENTS_KEY = ["students"] as const;

/** REQ-099 (TASK-415) — the birthday list; fetched only while the control is set (`params` null ⇒ nothing). */
export const useBirthdayStudents = (params: Record<string, string | number> | null) =>
  useQuery({
    queryKey: [...STUDENTS_KEY, "birthday", params],
    queryFn: () => listStudentsByBirthday(params as Record<string, string | number>),
    enabled: params !== null,
    placeholderData: (prev) => prev,
  });

/** Debounced student search for the picker. Pass an already-debounced query. Suspended households are
 *  excluded server-side (TASK-058), so all consumers get the same filtered list — no per-caller variant. */
export const useStudentSearch = (q: string) =>
  useQuery({
    queryKey: [...STUDENTS_KEY, q],
    queryFn: () => searchStudents(q),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
