"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminUnlockCourse,
  confirmBooking,
  createBooking,
  getBookingsByDate,
  getBookingsInRange,
  getCoursePackages,
  getDailyReport,
  getTeachers,
  markAttended,
  markSickLeave,
  setTeacherActive,
  setTeacherTypeActive,
  type CreateBookingInput,
} from "@/services/scheduler.service";
import type { TeacherType } from "@/types/app/scheduler";

export const TEACHERS_KEY = ["teachers"] as const;
export const BOOKINGS_KEY = ["bookings"] as const;
export const COURSES_KEY = ["courses"] as const;
export const REPORT_KEY = ["daily-report"] as const;

// ───────────────────────────── Teachers ─────────────────────────────

export const useTeachers = () =>
  useQuery({ queryKey: TEACHERS_KEY, queryFn: getTeachers });

export const useToggleTeacher = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      setTeacherActive(id, active),
    onSuccess: () => qc.invalidateQueries({ queryKey: TEACHERS_KEY }),
  });
};

export const useToggleTeacherType = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ type, active }: { type: TeacherType; active: boolean }) =>
      setTeacherTypeActive(type, active),
    onSuccess: () => qc.invalidateQueries({ queryKey: TEACHERS_KEY }),
  });
};

// ───────────────────────────── Bookings ─────────────────────────────

export const useBookingsByDate = (date: string) =>
  useQuery({
    queryKey: [...BOOKINGS_KEY, date],
    queryFn: () => getBookingsByDate(date),
  });

export const useBookingsInRange = (start: string, end: string) =>
  useQuery({
    queryKey: [...BOOKINGS_KEY, "range", start, end],
    queryFn: () => getBookingsInRange(start, end),
  });

const invalidateAll = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: BOOKINGS_KEY });
  qc.invalidateQueries({ queryKey: COURSES_KEY });
  qc.invalidateQueries({ queryKey: REPORT_KEY });
};

export const useConfirmBooking = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => confirmBooking(id),
    onSuccess: () => invalidateAll(qc),
  });
};

export const useMarkSickLeave = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markSickLeave(id),
    onSuccess: () => invalidateAll(qc),
  });
};

export const useMarkAttended = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markAttended(id),
    onSuccess: () => invalidateAll(qc),
  });
};

export const useCreateBooking = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBookingInput) => createBooking(input),
    onSuccess: () => invalidateAll(qc),
  });
};

// ───────────────────────── Course packages ─────────────────────────

export const useCoursePackages = () =>
  useQuery({ queryKey: COURSES_KEY, queryFn: getCoursePackages });

export const useAdminUnlockCourse = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminUnlockCourse(id),
    onSuccess: () => invalidateAll(qc),
  });
};

// ───────────────────────────── Reports ─────────────────────────────

export const useDailyReport = (date: string) =>
  useQuery({
    queryKey: [...REPORT_KEY, date],
    queryFn: () => getDailyReport(date),
  });
