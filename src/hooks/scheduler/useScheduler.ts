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
  updateBookingOther,
  createOtherSeries,
  createGroupSeries,
  swapGroupTeacher,
  type OtherSeriesInput,
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
  reportOwnLeave,
  updateCourseRate,
  bulkConfirm,
  getEligibleStudents,
  markSickLeave,
  cancelBooking,
  pauseBooking,
  resumeBooking,
  getPostedSale,
  getCatalogItems,
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
  getCourseHistory,
  recordRental,
  recordBookingRental,
  payBookingRental,
  removeBookingRental,
  getSlotAvailability,
  previewCoursePackage,
  setAttendeeNote,
  previewEndCourse,
  endCourse,
  dropCourse,
  resumeCourse,
  updateCourseExpiry,
  removeCourseRental,
  previewCourseExpiry,
  confirmCourse,
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
import type { EndCourseReason, PlanChange, RecordRentalInput, TeacherType } from "@/types/app/scheduler";
import type { OtherScheduleFacts } from "@/lib/scheduler/other-schedule";
import type { GroupSeriesInput, GroupTeacherSwapInput } from "@/lib/scheduler/group-session";

export const TEACHERS_KEY = ["teachers"] as const;
export const BOOKINGS_KEY = ["bookings"] as const;
export const CALENDAR_KEY = ["calendar"] as const;
export const COURSES_KEY = ["courses"] as const;
export const REPORT_KEY = ["daily-report"] as const;
export const VOUCHERS_KEY = ["vouchers"] as const;
/** SPEC-069 / TASK-222 — per-booking, read-only. Never invalidated by a mutation: it describes the ledger, not us. */
export const POSTED_SALE_KEY = ["posted-sale"] as const;
/** SPEC-070 / TASK-229 — the backoffice INCOME items an อื่นๆ booking can be charged to. */
export const CATALOG_ITEMS_KEY = ["catalog-items"] as const;

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

/** TASK-369 — `includeCancelled` is part of the KEY, so ON and OFF are two cached answers, never one stale one. */
export const useCalendar = (date: string, view: "day" | "week", includeCancelled = false) =>
  useQuery({
    queryKey: [...CALENDAR_KEY, date, view, includeCancelled ? "with-cancelled" : "live"],
    queryFn: () => getCalendar(date, view, includeCancelled),
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

/** REQ-068 — save one session's attendee note. Invalidates like any other booking write so the calendar,
 *  the day view and the plan all re-read it; it never notifies (that's the endpoint's whole point). */
export const useSetAttendeeNote = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, attendeeNote }: { id: string; attendeeNote: string | null }) =>
      setAttendeeNote(id, attendeeNote),
    onSuccess: () => invalidateAll(qc),
  });
};

/** REQ-036 — the server's own account of what ending this course will remove (R2: never a client re-count). */
export const usePreviewEndCourse = () =>
  useMutation({ mutationFn: (courseId: string) => previewEndCourse(courseId) });

/** REQ-036 — commit it. Invalidates everything: the plan, the calendar and the attention panel all change. */
export const useEndCourse = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ courseId, reason, note }: { courseId: string; reason: EndCourseReason; note?: string }) =>
      endCourse(courseId, { reason, note }),
    onSuccess: () => invalidateAll(qc),
  });
};

/** TASK-199 — pause a course. Invalidates everything: the calendar, the plan and the status counts all change. */
export const useDropCourse = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ courseId, reason }: { courseId: string; reason?: string }) =>
      dropCourse(courseId, { reason }),
    onSuccess: () => invalidateAll(qc),
  });
};

/**
 * REQ-084 / TASK-287 — resume a paused course as a **RE-PLAN**. 🔴 The schedule is REQUIRED: the empty body is
 * refused server-side, because that untested second path is what produced DEF-2.
 *
 * 🧹 Two dead comment blocks stood above this one and were removed with it: TASK-199's *"back on its own slot
 * under a NEW expiry"* (resume no longer returns to the old slot) and TASK-264's *"`expiryDate` is optional …
 * `EXPIRY_REQUIRED`"* (both the field and the code are gone). **Neither described anything the code did.**
 */
export const useResumeCourse = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      courseId,
      startDate,
      startTime,
      teacherId,
    }: {
      courseId: string;
      startDate: string;
      startTime: string;
      /** TASK-360 — only when the dialog chose a different teacher; `undefined` ⇒ the key is not sent. */
      teacherId?: string;
    }) => resumeCourse(courseId, { startDate, startTime, teacherId }),
    onSuccess: () => invalidateAll(qc),
  });
};

/**
 * REQ-082 AC-1/AC-4 — move a course's expiry. 🚫 The `expiryWarning` on the response is a **warning about a
 * save that already happened**, never a refusal: nothing here or at the call site may use it to block.
 */
/** TASK-391 — remove a course's rental from its remaining sessions; the same invalidation set as the other course actions. */
export const useRemoveCourseRental = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (courseId: string) => removeCourseRental(courseId), onSuccess: () => invalidateAll(qc) });
};

export const useUpdateCourseExpiry = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ courseId, expiryDate }: { courseId: string; expiryDate: string }) =>
      updateCourseExpiry(courseId, expiryDate),
    onSuccess: () => invalidateAll(qc),
  });
};

/**
 * TASK-311 / `REQ-085 §11.3` — what a new expiry WOULD cut, before saving. Reads only, so it invalidates
 * nothing: a preview that refetched the world would make the dialog jump under the admin's pointer.
 */
export const usePreviewCourseExpiry = () =>
  useMutation({
    mutationFn: ({ courseId, expiryDate }: { courseId: string; expiryDate: string }) =>
      previewCourseExpiry(courseId, expiryDate),
  });

/** TASK-202 — confirm a whole course. Invalidates everything: statuses, the calendar and the counts all move. */
export const useConfirmCourse = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (courseId: string) => confirmCourse(courseId),
    onSuccess: () => invalidateAll(qc),
  });
};

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
/** REQ-097 (TASK-407) — the teacher's own leave; the calendar and the bookings re-read (the rows went CANCELLED). */
export const useReportOwnLeave = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { date: string; sessionIds?: string[]; reason: string }) => reportOwnLeave(body),
    onSuccess: () => invalidateAll(qc),
  });
};

/** Cancel a booking (TASK-105) — delivered needs a reason; a course cancel re-owes a makeup server-side. */
export const useCancelBooking = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason, reasonCode }: { id: string; reason?: string; reasonCode?: EndCourseReason }) =>
      cancelBooking(id, reason, reasonCode),
    onSuccess: () => invalidateAll(qc),
  });
};

/**
 * SPEC-069 / TASK-222 — has this booking's revenue already been posted?
 *
 * A **read**, so no `invalidateAll` and no mutation: this feature adds a warning, never a way to move money.
 * `enabled` is the dialog's `opened`, so a dialog nobody opens never queries.
 *
 * 🔴 `retry: false` — a failure must reach the UI as "could not verify" **now**, not after three silent retries
 * during which the dialog looks clean and staff can already press Confirm. A missing warning is the whole defect.
 */
export const usePostedSale = (id: string | null | undefined, enabled: boolean) =>
  useQuery({
    queryKey: [...POSTED_SALE_KEY, id],
    queryFn: () => getPostedSale(id as string),
    enabled: enabled && !!id,
    retry: false,
    staleTime: 0,
  });

/**
 * SPEC-070 / TASK-226 — the catalogue an อื่นๆ booking can be charged to. `enabled` only while the charge
 * toggle is on and the item source is chosen, so opening the form on a lesson type queries nothing.
 *
 * A **read** — no invalidation. An empty result is data, not an error, and the picker says so in words.
 */
export const useCatalogItems = (enabled: boolean) =>
  useQuery({ queryKey: CATALOG_ITEMS_KEY, queryFn: getCatalogItems, enabled });

/**
 * SPEC-075 / REQ-076 / TASK-261 — the **รายการที่พักไว้** tray's source.
 *
 * 🔑 **No new endpoint.** A paused booking is a booking with a status, so the existing bookings list already
 * answers this; asking @Jason for a `/paused` route would be a second way to ask one question. `limit` is
 * generous because the tray shows them all — a paused booking that is off the calendar AND off the bottom of
 * its own tray does not exist anywhere (AC-9).
 */
export const usePausedBookings = () =>
  useQuery({
    queryKey: [...BOOKINGS_KEY, "paused"],
    queryFn: () => getAllBookings({ status: "PAUSED", limit: 200, sort: "date_asc" }),
  });

/** REQ-076 AC-1 — พัก. 🚫 Takes an id and nothing else: there is no reason to pass (AC-8). */
export const usePauseBooking = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => pauseBooking(id),
    onSuccess: () => invalidateAll(qc),
  });
};

/** REQ-076 AC-13 — นำกลับมาลงตาราง, at any date and time. A clash rejects with the SERVER's message (AC-14). */
export const useResumeBooking = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, date, startTime, teacherId }: { id: string; date: string; startTime: string; teacherId?: string }) =>
      resumeBooking(id, { date, startTime, teacherId }),
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
/** REQ-095 (TASK-395) — the OTHER facts editor (its own route, no notice) and the series; the calendar re-reads as for every write. */
export const useUpdateBookingOther = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: OtherScheduleFacts }) => updateBookingOther(id, patch),
    onSuccess: () => invalidateAll(qc),
  });
};
export const useCreateOtherSeries = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: OtherSeriesInput) => createOtherSeries(input), onSuccess: () => invalidateAll(qc) });
};

/** REQ-095 Stage 2a (TASK-398) — the group series and the teacher swap; the calendar re-reads as for every write. */
export const useCreateGroupSeries = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: GroupSeriesInput) => createGroupSeries(input), onSuccess: () => invalidateAll(qc) });
};
export const useSwapGroupTeacher = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: GroupTeacherSwapInput }) => swapGroupTeacher(id, input),
    onSuccess: () => invalidateAll(qc),
  });
};

/** REQ-095 §13 (TASK-421) — the DUO course's rate from the course card; the list re-reads. */
export const useUpdateCourseRate = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ courseId, classRateMinor }: { courseId: string; classRateMinor: number }) => updateCourseRate(courseId, classRateMinor), onSuccess: () => invalidateAll(qc) });
};
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

/** Read-only course deduction history (TASK-120). Gated until the modal opens. */
export const useCourseHistory = (id: string | null, enabled = true) =>
  useQuery({
    queryKey: [...COURSES_KEY, "history", id ?? ""],
    queryFn: () => getCourseHistory(id as string),
    enabled: enabled && !!id,
  });

/** Record an equipment rental (TASK-109). Invalidates reports (rental is revenue); the caller shows the result. */
// REQ-091 (TASK-372) — the three rental doors invalidate the same set pause/resume do (the row rides the booking
// DTO everywhere: the grid, the tray, the single read, the list — and the money reaches the day's report).
export const useRecordBookingRental = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId, code, remark }: { bookingId: string; code: string; remark?: string }) =>
      recordBookingRental(bookingId, { code, remark }),
    onSuccess: () => invalidateAll(qc),
  });
};
export const usePayBookingRental = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (bookingId: string) => payBookingRental(bookingId), onSuccess: () => invalidateAll(qc) });
};
export const useRemoveBookingRental = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (bookingId: string) => removeBookingRental(bookingId), onSuccess: () => invalidateAll(qc) });
};

export const useRecordRental = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordRentalInput) => recordRental(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: REPORT_KEY }),
  });
};

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
