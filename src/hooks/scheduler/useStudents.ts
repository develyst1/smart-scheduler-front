"use client";

import { useQuery } from "@tanstack/react-query";
import { searchStudents } from "@/services/student.service";

export const STUDENTS_KEY = ["students"] as const;

/** Debounced student search for the booking dropdown. Pass an already-debounced query. */
export const useStudentSearch = (q: string) =>
  useQuery({
    queryKey: [...STUDENTS_KEY, q],
    queryFn: () => searchStudents(q),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
