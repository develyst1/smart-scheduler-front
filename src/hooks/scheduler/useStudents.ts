"use client";

import { useQuery } from "@tanstack/react-query";
import { searchStudents } from "@/services/student.service";

export const STUDENTS_KEY = ["students"] as const;

/** Debounced student search for the picker. Pass an already-debounced query. Suspended households are
 *  excluded server-side (TASK-058), so all consumers get the same filtered list — no per-caller variant. */
export const useStudentSearch = (q: string) =>
  useQuery({
    queryKey: [...STUDENTS_KEY, q],
    queryFn: () => searchStudents(q),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
