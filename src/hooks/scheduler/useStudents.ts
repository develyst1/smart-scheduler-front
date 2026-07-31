"use client";

import { useQuery } from "@tanstack/react-query";
import { searchStudents } from "@/services/student.service";

export const STUDENTS_KEY = ["students"] as const;

/**
 * Debounced student search for the booking dropdown. Pass an already-debounced query.
 * `bookable` (booking picker only) hides suspended households — and is part of the cache key so the booking
 * picker and the course/voucher sale modals never reuse each other's results (TASK-057).
 */
export const useStudentSearch = (q: string, opts?: { bookable?: boolean }) =>
  useQuery({
    queryKey: [...STUDENTS_KEY, "search", opts?.bookable ? "bookable" : "all", q],
    queryFn: () => searchStudents(q, 50, opts),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
