"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  setCourseAdminUnlock,
  confirmBooking,
  createBooking,
  detectConflict,
  getAllBookings,
  type BookingQuery,
  getCalendar,
  getBookingsByDate,
  getBookingsInRange,
  moveBooking,
  type MoveBookingInput,
  createCoursePackage,
  createVoucher,
  getCoursePackages,
  getDailyReport,
  getVouchers,
  getTeachers,
  getTeacherTypeOrder,
  markAttended,
  markSickLeave,
  setTeacherActive,
  setTeacherLimitOverride,
  setTeacherTypeActive,
  setTeacherTypeOrder,
  setTeacherWorkDays,
  type CreateBookingInput,
  type CreateCourseInput,
  type CreateVoucherInput,
} from "@/services/scheduler.service";
import type { TeacherType } from "@/types/app/scheduler";

export const TEACHERS_KEY = ["teachers"] as const;
export const BOOKINGS_KEY = ["bookings"] as const;
export const CALENDAR_KEY = ["calendar"] as const;
export const COURSES_KEY = ["courses"] as const;
export const REPORT_KEY = ["daily-report"] as const;
export const VOUCHERS_KEY = ["vouchers"] as const;

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

export const useSetTeacherWorkDays = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, workDays }: { id: string; workDays: number[] }) =>
      setTeacherWorkDays(id, workDays),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TEACHERS_KEY });
      qc.invalidateQueries({ queryKey: CALENDAR_KEY });
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

// ───────────────────────────── Calendar ─────────────────────────────

export const useCalendar = (date: string, view: "day" | "week") =>
  useQuery({
    queryKey: [...CALENDAR_KEY, date, view],
    queryFn: () => getCalendar(date, view),
  });

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

export const useAllBookings = (query: BookingQuery = {}) =>
  useQuery({
    queryKey: [...BOOKINGS_KEY, "all", query],
    queryFn: () => getAllBookings(query),
    placeholderData: keepPreviousData,
  });

const invalidateAll = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: BOOKINGS_KEY });
  qc.invalidateQueries({ queryKey: CALENDAR_KEY });
  qc.invalidateQueries({ queryKey: COURSES_KEY });
  qc.invalidateQueries({ queryKey: REPORT_KEY });
  qc.invalidateQueries({ queryKey: TEACHERS_KEY });
  qc.invalidateQueries({ queryKey: VOUCHERS_KEY }); // attend ตัดชั่วโมงวอยเชอร์
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

/** ย้าย/แก้คาบด้วยมือ (UC-003) — ครู/วัน/เวลา */
export const useMoveBooking = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: MoveBookingInput }) =>
      moveBooking(id, patch),
    onSuccess: () => invalidateAll(qc),
  });
};

// ───────────────────────── Course packages ─────────────────────────

export const useCoursePackages = () =>
  useQuery({ queryKey: COURSES_KEY, queryFn: getCoursePackages });

export const useSetCourseAdminUnlock = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, unlocked }: { id: string; unlocked: boolean }) =>
      setCourseAdminUnlock(id, unlocked),
    onSuccess: () => invalidateAll(qc),
  });
};

export const useCreateCoursePackage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCourseInput) => createCoursePackage(input),
    onSuccess: () => invalidateAll(qc),
  });
};

export const useCreateVoucher = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateVoucherInput) => createVoucher(input),
    onSuccess: () => invalidateAll(qc),
  });
};

/** รายการวอยเชอร์ — ทั้งหมด (แท็บวอยเชอร์) หรือของนักเรียนคนเดียว (ตัวเลือกตอนจอง) */
export const useVouchers = (studentId?: string, enabled = true) =>
  useQuery({
    queryKey: [...VOUCHERS_KEY, studentId ?? "all"],
    queryFn: () => getVouchers(studentId),
    enabled,
  });

// ───────────────────────────── Reports ─────────────────────────────

export const useDailyReport = (date: string, teacherId?: string) =>
  useQuery({
    queryKey: [...REPORT_KEY, date, teacherId ?? "all"],
    queryFn: () => getDailyReport(date, teacherId),
  });
