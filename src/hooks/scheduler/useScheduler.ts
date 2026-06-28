"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminUnlockCourse,
  cancelReschedule,
  confirmBooking,
  confirmReschedule,
  createBooking,
  createBookingWithReschedule,
  detectConflict,
  getBookingsByDate,
  getBookingsInRange,
  type RescheduleResolution,
  getCoursePackages,
  getDailyReport,
  getTeachers,
  getTeacherTypeOrder,
  markAttended,
  markSickLeave,
  setTeacherActive,
  setTeacherLimitOverride,
  setTeacherTypeActive,
  setTeacherTypeOrder,
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

export const TEACHER_ORDER_KEY = ["teacher-type-order"] as const;

export const useTeacherTypeOrder = () =>
  useQuery({ queryKey: TEACHER_ORDER_KEY, queryFn: getTeacherTypeOrder });

export const useSetTeacherTypeOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (order: TeacherType[]) => setTeacherTypeOrder(order),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TEACHER_ORDER_KEY });
      qc.invalidateQueries({ queryKey: TEACHERS_KEY });
    },
  });
};

export const useSetLimitOverride = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, override }: { id: string; override: boolean }) =>
      setTeacherLimitOverride(id, override),
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

/** เช็คการจองทับก่อนสร้าง (คืน booking เดิมถ้าชน) */
export const useDetectConflict = () =>
  useMutation({
    mutationFn: ({
      teacherId,
      date,
      startTime,
    }: {
      teacherId: string;
      date: string;
      startTime: string;
    }) => detectConflict(teacherId, date, startTime),
  });

export const useCreateBookingWithReschedule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      input,
      resolution,
    }: {
      input: CreateBookingInput;
      resolution: RescheduleResolution;
    }) => createBookingWithReschedule(input, resolution),
    onSuccess: () => invalidateAll(qc),
  });
};

export const useConfirmReschedule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (oldId: string) => confirmReschedule(oldId),
    onSuccess: () => invalidateAll(qc),
  });
};

export const useCancelReschedule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (oldId: string) => cancelReschedule(oldId),
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

export const useDailyReport = (date: string, teacherId?: string) =>
  useQuery({
    queryKey: [...REPORT_KEY, date, teacherId ?? "all"],
    queryFn: () => getDailyReport(date, teacherId),
  });
