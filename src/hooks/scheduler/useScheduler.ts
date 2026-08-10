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
  importCoursePackage,
  importVoucher,
  type ImportCourseInput,
  type ImportVoucherInput,
  getCoursePackages,
  getDailyReport,
  getVouchers,
  getTeachers,
  getTeacherTypeOrder,
  markAttended,
  bulkConfirm,
  getEligibleStudents,
  markSickLeave,
  cancelBooking,
  setTeacherActive,
  setTeacherLimitOverride,
  setTeacherTypeActive,
  setTeacherTypeOrder,
  setTeacherWorkDays,
  createTeacher,
  updateTeacher,
  archiveTeacher,
  reactivateTeacher,
  getArchivedTeachers,
  setFreelanceBudget,
  topUpFreelanceBudget,
  getEntitlementPlan,
  applyPlanChange,
  previewPlanChange,
  addExtraSession,
  getSlotAvailability,
  previewCoursePackage,
  type CreateBookingInput,
  type CreateCourseInput,
  type CoursesQuery,
  type CreateVoucherInput,
  type VouchersQuery,
  type CreateTeacherInput,
  type UpdateTeacherInput,
  type SetFreelanceBudgetInput,
  type ExtraSessionInput,
} from "@/services/scheduler.service";
import type { PlanChange, TeacherType } from "@/types/app/scheduler";

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

// ─────────────────── Teacher lifecycle (SPEC-004 / TASK-017) ───────────────────

export const ARCHIVED_TEACHERS_KEY = ["teachers", "archived"] as const;

const invalidateTeacherRoster = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: TEACHERS_KEY });
  qc.invalidateQueries({ queryKey: CALENDAR_KEY });
  qc.invalidateQueries({ queryKey: ARCHIVED_TEACHERS_KEY });
};

export const useArchivedTeachers = () =>
  useQuery({ queryKey: ARCHIVED_TEACHERS_KEY, queryFn: getArchivedTeachers });

export const useCreateTeacher = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTeacherInput) => createTeacher(input),
    onSuccess: () => invalidateTeacherRoster(qc),
  });
};

export const useUpdateTeacher = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTeacherInput }) =>
      updateTeacher(id, input),
    onSuccess: () => invalidateTeacherRoster(qc),
  });
};

export const useArchiveTeacher = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveTeacher(id),
    onSuccess: () => invalidateTeacherRoster(qc),
  });
};

export const useReactivateTeacher = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reactivateTeacher(id),
    onSuccess: () => invalidateTeacherRoster(qc),
  });
};

// ───────── Local freelance budget admin (SPEC-005 / TASK-020) ─────────

export const useSetFreelanceBudget = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SetFreelanceBudgetInput }) =>
      setFreelanceBudget(id, input),
    onSuccess: () => invalidateTeacherRoster(qc),
  });
};

export const useTopUpFreelanceBudget = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amountMinor }: { id: string; amountMinor: number }) =>
      topUpFreelanceBudget(id, amountMinor),
    onSuccess: () => invalidateTeacherRoster(qc),
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

export const useEligibleStudents = (
  type: "COURSE_PACKAGE" | "VOUCHER",
  enabled: boolean,
  q?: string,
) =>
  useQuery({
    queryKey: ["students", "eligible", type, q ?? ""],
    queryFn: () => getEligibleStudents(type, q),
    enabled,
    // The list is a picker: keep the current options on screen while a new search resolves.
    placeholderData: keepPreviousData,
  });

export const useBulkConfirm = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => bulkConfirm(ids),
    onSuccess: () => invalidateAll(qc),
  });
};

export const useMarkSickLeave = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; override?: boolean }) =>
      markSickLeave(vars.id, vars.override),
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

/** Cancel a booking (TASK-105) — delivered needs a reason; a course cancel re-owes a makeup server-side. */
export const useCancelBooking = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => cancelBooking(id, reason),
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

// ─────────── Per-entitlement plan (SPEC-028 / REQ-030 — TASK-099) ───────────

export const useEntitlementPlan = (id: string | null, enabled = true) =>
  useQuery({
    queryKey: [...COURSES_KEY, "plan", id ?? ""],
    queryFn: () => getEntitlementPlan(id as string),
    enabled: enabled && !!id,
  });

export const useApplyPlanChange = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ courseId, change }: { courseId: string; change: PlanChange }) =>
      applyPlanChange(courseId, change),
    onSuccess: () => invalidateAll(qc),
  });
};

/** Dry-run a plan change to preview the diff before committing (TASK-115). No invalidation — writes nothing. */
export const usePreviewPlanChange = () =>
  useMutation({
    mutationFn: ({ courseId, change }: { courseId: string; change: PlanChange }) =>
      previewPlanChange(courseId, change),
  });

/** Add a charged SINGLE_SESSION extra to a course (TASK-113). */
export const useAddExtraSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ courseId, input }: { courseId: string; input: ExtraSessionInput }) =>
      addExtraSession(courseId, input),
    onSuccess: () => invalidateAll(qc),
  });
};

/** Availability + clash for a slot. `enabled` gates until a date & time are chosen. */
export const useSlotAvailability = (date: string | null, startTime: string | null, enabled = true) =>
  useQuery({
    queryKey: [...CALENDAR_KEY, "availability", date ?? "", startTime ?? ""],
    queryFn: () => getSlotAvailability(date as string, startTime as string),
    enabled: enabled && !!date && !!startTime,
  });

/** Generate the editable course plan without writing (TASK-098 purchase planner). */
export const usePreviewCourse = () => useMutation({ mutationFn: previewCoursePackage });

// ───────────────────────── Course packages ─────────────────────────

export const useCoursePackages = (query: CoursesQuery = {}) =>
  useQuery({
    queryKey: [...COURSES_KEY, query],
    queryFn: () => getCoursePackages(query),
    placeholderData: keepPreviousData,
  });

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

/** รายการวอยเชอร์ (แท็บวอยเชอร์) — ค้นหา/แบ่งหน้า server-side. */
export const useVouchers = (query: VouchersQuery = {}, enabled = true) =>
  useQuery({
    queryKey: [...VOUCHERS_KEY, query],
    queryFn: () => getVouchers(query),
    enabled,
    placeholderData: keepPreviousData,
  });

// ───────────────────────────── Reports ─────────────────────────────

export const useDailyReport = (date: string, teacherId?: string) =>
  useQuery({
    queryKey: [...REPORT_KEY, date, teacherId ?? "all"],
    queryFn: () => getDailyReport(date, teacherId),
  });

// ───── Migrating existing balances (SPEC-025 / TASK-080) ─────
// These call the **import** endpoints, never the sale ones: nothing is charged and no revenue is posted.

export const useImportCoursePackage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ImportCourseInput) => importCoursePackage(input),
    onSuccess: () => invalidateAll(qc),
  });
};

export const useImportVoucher = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ImportVoucherInput) => importVoucher(input),
    onSuccess: () => invalidateAll(qc),
  });
};
