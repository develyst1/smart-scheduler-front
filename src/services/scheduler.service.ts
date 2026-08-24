import dayjs from "dayjs";
import { api } from "@/lib/api/client";
import {
  calendarDayBookings,
  calendarToBookings,
  dtoToBooking,
  dtoToCourseView,
  dtoToTeacher,
  flattenTeachers,
} from "@/lib/api/mappers";
import {
  DEFAULT_TEACHER_TYPE_ORDER,
  readTeacherTypeOrder,
} from "@/lib/api/teacher-order-store";
import { toTeacherView } from "@/lib/scheduler/teacher";
import type {
  BookingType,
  BookingStatus,
  Booking,
  CourseHistory,
  CoursePackageView,
  CoursePlanOverride,
  CoursePreview,
  DailyReport,
  RecordRentalInput,
  RentalResult,
  EligibleStudent,
  EntitlementPlan,
  PlanChange,
  PlanPreview,
  SlotAvailability,
  Teacher,
  TeacherType,
  TeacherView,
  WorkDaysImpact,
} from "@/types/app/scheduler";
import type {
  BookingsResponse,
  BulkConfirmResponse,
  BulkConfirmResult,
  CalendarResponse,
  CourseListItem,
  CoursesResponse,
  CourseStatusCounts,
  Paged,
  CreateCoursePackageResponse,
  CreateVoucherResponse,
  DailyReportResponse,
  MoveBookingResponse,
  SetTeacherWorkDaysResponse,
  TeacherDTO,
  TeachersResponse,
  TeacherTypeOrderResponse,
  UpdateBookingStatusResponse,
  VoucherSummary,
  VouchersResponse,
} from "@/types/api/contract";
import type { CourseStatus, EndCoursePreview, EndCourseReason, PackageSize } from "@/types/app/scheduler";
import { ApiClientError } from "@/lib/api/client";
import * as mock from "./scheduler.mock.service";

const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

const monthRange = (ref = dayjs()) => ({
  from: ref.startOf("month").format("YYYY-MM-DD"),
  to: ref.endOf("month").format("YYYY-MM-DD"),
});

async function fetchMonthBookings(): Promise<Booking[]> {
  const { from, to } = monthRange();
  const { data } = await api.get<BookingsResponse>("/bookings", {
    params: { from, to, page: 1, limit: 200 },
  });
  return data.items.map(dtoToBooking);
}

function teachersToViews(dtos: ReturnType<typeof flattenTeachers>, bookings: Booking[]): TeacherView[] {
  // Order is applied server-side: GET /teachers returns groups in the persisted
  // type order (B.2), and flattenTeachers preserves it — no client re-sort needed.
  // limitOverride is now on the DTO (server-persisted, TASK-008).
  return dtos.map((dto) => toTeacherView(dtoToTeacher(dto), bookings));
}

// ───────────────────────────── Calendar aggregate ─────────────────────────────

export async function getCalendar(date: string, view: "day" | "week"): Promise<CalendarResponse> {
  const { data } = await api.get<CalendarResponse>("/calendar", { params: { date, view } });
  return data;
}

export function parseCalendarTeachers(cal: CalendarResponse, allTeachers?: TeacherView[]): TeacherView[] {
  const day = cal.days[0];
  if (!day) return allTeachers ?? [];
  const order = readTeacherTypeOrder();
  const rank = (type: TeacherType) => {
    const i = order.indexOf(type);
    return i === -1 ? order.length : i;
  };
  const fromCal = day.columns
    .map((col) => {
      const existing = allTeachers?.find((t) => t.id === col.teacher.id);
      if (existing) return existing;
      const teacher = dtoToTeacher(col.teacher);
      return toTeacherView(teacher, calendarToBookings(cal));
    })
    .sort((a, b) => rank(a.type) - rank(b.type) || a.nickname.localeCompare(b.nickname, "th"));
  return fromCal;
}

// ───────────────────────────── Teachers ─────────────────────────────

export const getTeachers = async (): Promise<TeacherView[]> => {
  if (useMock) return mock.getTeachers();
  const [{ data: groups }, bookings] = await Promise.all([
    api.get<TeachersResponse>("/teachers"),
    fetchMonthBookings(),
  ]);
  return teachersToViews(flattenTeachers(groups), bookings);
};

export const setTeacherActive = async (id: string, active: boolean) => {
  if (useMock) return mock.setTeacherActive(id, active);
  const { data } = await api.patch<{ teachers: TeachersResponse["groups"][0]["teachers"] }>(
    "/teachers/availability",
    { teacherId: id, active },
  );
  const row = data.teachers[0];
  return dtoToTeacher(row) as Teacher;
};

export const setTeacherTypeActive = async (type: TeacherType, active: boolean) => {
  if (useMock) return mock.setTeacherTypeActive(type, active);
  const { data } = await api.patch<{ teachers: TeachersResponse["groups"][0]["teachers"] }>(
    "/teachers/availability",
    { type, active },
  );
  return data.teachers.map((t) => dtoToTeacher(t));
};

export const getTeacherTypeOrder = async (): Promise<TeacherType[]> => {
  if (useMock) return mock.getTeacherTypeOrder();
  const { data } = await api.get<TeacherTypeOrderResponse>("/teachers/type-order");
  return data.order;
};

export const setTeacherTypeOrder = async (order: TeacherType[]): Promise<TeacherType[]> => {
  if (useMock) return mock.setTeacherTypeOrder(order);
  const { data } = await api.patch<TeacherTypeOrderResponse>("/teachers/type-order", { order });
  return data.order;
};

export const setTeacherWorkDays = async (id: string, workDays: number[]) => {
  if (useMock) return mock.setTeacherWorkDays(id, workDays);
  const { data } = await api.patch<SetTeacherWorkDaysResponse>(
    `/teachers/${id}/work-days`,
    { workDays },
  );
  return dtoToTeacher(data);
};

/** Preview how many future LIVE course sessions a workDays change would orphan (TASK-100). Read-only. */
export const getWorkDaysImpact = async (id: string, workDays: number[]): Promise<WorkDaysImpact> => {
  if (useMock) return mock.getWorkDaysImpact(id, workDays);
  const { data } = await api.get<WorkDaysImpact>(`/teachers/${id}/work-days/impact`, {
    params: { workDays: workDays.join(",") },
  });
  return data;
};

export const setTeacherLimitOverride = async (id: string, override: boolean) => {
  if (useMock) return mock.setTeacherLimitOverride(id, override);
  // Durable server-side persistence (TASK-008): the booking/confirm path reads this
  // as allowNegative. The caller (useSetLimitOverride) invalidates TEACHERS_KEY, so
  // the refetched DTO reflects the new limitOverride — no client store needed.
  const { data } = await api.patch<TeacherDTO>(`/teachers/${id}/limit-override`, { override });
  return dtoToTeacher(data);
};

// ─────────────────── Teacher lifecycle (SPEC-004 / TASK-017) ───────────────────

export interface CreateTeacherInput {
  name: string;
  nickname: string;
  type: TeacherType;
  workDays?: number[];
  subjectIds?: string[];
}

export interface UpdateTeacherInput {
  name?: string;
  nickname?: string;
  type?: TeacherType;
  subjectIds?: string[];
}

export const createTeacher = async (input: CreateTeacherInput): Promise<Teacher> => {
  if (useMock) return mock.createTeacher(input);
  const { data } = await api.post<TeacherDTO>("/teachers", input);
  return dtoToTeacher(data);
};

export const updateTeacher = async (id: string, input: UpdateTeacherInput): Promise<Teacher> => {
  if (useMock) return mock.updateTeacher(id, input);
  const { data } = await api.patch<TeacherDTO>(`/teachers/${id}`, input);
  return dtoToTeacher(data);
};

export const archiveTeacher = async (id: string): Promise<Teacher> => {
  if (useMock) return mock.archiveTeacher(id);
  const { data } = await api.post<TeacherDTO>(`/teachers/${id}/archive`, {});
  return dtoToTeacher(data);
};

export const reactivateTeacher = async (id: string): Promise<Teacher> => {
  if (useMock) return mock.reactivateTeacher(id);
  const { data } = await api.post<TeacherDTO>(`/teachers/${id}/reactivate`, {});
  return dtoToTeacher(data);
};

export const getArchivedTeachers = async (): Promise<Teacher[]> => {
  if (useMock) return mock.getArchivedTeachers();
  const { data: groups } = await api.get<TeachersResponse>("/teachers", {
    params: { archived: true },
  });
  return flattenTeachers(groups).map((d) => dtoToTeacher(d));
};

// ───────── Local freelance budget admin (SPEC-005 / TASK-020) — no ops calls ─────────

export interface SetFreelanceBudgetInput {
  monthlyBudgetMinor: number;
  rateMinor: number;
  reorderMinor?: number | null;
}

/** Set/edit a freelance's monthly budget + rate + near-cap. Edit is the next-reset target —
 *  it does NOT change current remaining (use top-up for that). Invalidation refetches the row. */
export const setFreelanceBudget = async (
  id: string,
  input: SetFreelanceBudgetInput,
): Promise<void> => {
  if (useMock) return mock.setFreelanceBudget(id, input);
  await api.put(`/teachers/${id}/budget`, input);
};

/** Add to the current remaining budget immediately. */
export const topUpFreelanceBudget = async (id: string, amountMinor: number): Promise<void> => {
  if (useMock) return mock.topUpFreelanceBudget(id, amountMinor);
  await api.post(`/teachers/${id}/budget/topup`, { amountMinor });
};

// ───────────────────────────── Bookings ─────────────────────────────

export const getBookingsByDate = async (date: string) => {
  if (useMock) return mock.getBookingsByDate(date);
  const cal = await getCalendar(date, "day");
  return calendarDayBookings(cal, date);
};

/** พารามิเตอร์ค้นหา/กรอง/แบ่งหน้า ของ GET /bookings (ส่งเฉพาะ key ที่มีค่า) */
/**
 * Server-side date ordering (TASK-073). `upcoming` = today/future soonest-first, then the past most-recent
 * first — it is a **pure sort**, nothing is hidden, so `total` is unchanged in every direction.
 * ⚠️ `date_desc` is NOT "upcoming first" here: a course books every session weeks ahead at registration, so
 * the newest booking is routinely months away. That's why `upcoming` exists and is the default.
 */
export type BookingSort = "upcoming" | "date_asc" | "date_desc";

export interface BookingQuery {
  q?: string;
  type?: BookingType;
  status?: BookingStatus;
  teacherId?: string;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  sort?: BookingSort;
  page?: number;
  limit?: number;
}

/** ผลลัพธ์แบ่งหน้าของรายการจอง */
export interface PagedBookings {
  items: Booking[];
  page: number;
  limit: number;
  total: number;
}

/** ตัด key ที่เป็น undefined/"" ออก เพื่อไม่ส่ง query ว่างเข้า API */
const cleanParams = (q: BookingQuery): Record<string, string | number> => {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== "") out[k] = v as string | number;
  }
  return out;
};

export const getAllBookings = async (query: BookingQuery = {}): Promise<PagedBookings> => {
  const page = query.page ?? 1;
  const limit = query.limit ?? 50;
  if (useMock) return mock.getAllBookings({ ...query, page, limit });
  const { data } = await api.get<BookingsResponse>("/bookings", {
    params: cleanParams({ ...query, page, limit }),
  });
  return { items: data.items.map(dtoToBooking), page: data.page, limit: data.limit, total: data.total };
};

export const getBookingsInRange = async (start: string, end: string) => {
  if (useMock) return mock.getBookingsInRange(start, end);
  const { data } = await api.get<BookingsResponse>("/bookings", {
    params: { from: start, to: end, page: 1, limit: 200 },
  });
  return data.items.map(dtoToBooking);
};

export interface ConfirmResult {
  booking: Booking;
  notification: UpdateBookingStatusResponse["notification"];
}

export const confirmBooking = async (id: string): Promise<ConfirmResult> => {
  if (useMock) {
    const booking = await mock.confirmBooking(id);
    return { booking, notification: null };
  }
  const { data } = await api.patch<UpdateBookingStatusResponse>(`/bookings/${id}/status`, {
    action: "confirm",
  });
  return { booking: dtoToBooking(data.booking), notification: data.notification };
};

export interface SickLeaveResult {
  booking?: Booking;
  extended?: Booking;
  locked: boolean;
}

export const markSickLeave = async (
  id: string,
  override = false,
): Promise<SickLeaveResult> => {
  if (useMock) return mock.markSickLeave(id);
  const { data } = await api.patch<UpdateBookingStatusResponse>(`/bookings/${id}/status`, {
    action: "sick-leave",
    ...(override ? { override: true } : {}),
  });
  return {
    booking: dtoToBooking(data.booking),
    extended: data.extended ? dtoToBooking(data.extended) : undefined,
    locked: data.locked,
  };
};

/** Cancel a booking (SPEC-028 §11 / TASK-105). A DELIVERED session (ATTENDED/NO_SHOW) requires a non-empty
 *  `reason` — else the server returns `REASON_REQUIRED`. A course cancel re-owes a makeup server-side. */
export const cancelBooking = async (id: string, reason?: string): Promise<Booking> => {
  if (useMock) return mock.cancelBooking(id, reason);
  const { data } = await api.patch<UpdateBookingStatusResponse>(`/bookings/${id}/status`, {
    action: "cancel",
    ...(reason ? { reason } : {}),
  });
  return dtoToBooking(data.booking);
};

export const markAttended = async (id: string) => {
  if (useMock) return mock.markAttended(id);
  const { data } = await api.patch<UpdateBookingStatusResponse>(`/bookings/${id}/status`, {
    action: "attend",
  });
  return dtoToBooking(data.booking);
};

/** SPEC-011: confirm many PENDING bookings in one call. Partial-success — per-booking outcome in input order. */
export const bulkConfirm = async (ids: string[]): Promise<BulkConfirmResult[]> => {
  if (useMock) return mock.bulkConfirm(ids);
  const { data } = await api.post<BulkConfirmResponse>("/bookings/bulk-confirm", { ids });
  return data.results;
};

/** SPEC-017: students who hold an active course/voucher, with the context the booking modal shows.
 *  One row per entitlement (a student with two active courses appears twice). */
/**
 * Eligible students for an entitlement booking. `q` searches **server-side** on name · nickname · parent
 * phone (TASK-088) — a local filter can't match a phone, because the payload doesn't carry one.
 */
export const getEligibleStudents = async (
  type: "COURSE_PACKAGE" | "VOUCHER",
  q?: string,
): Promise<EligibleStudent[]> => {
  if (useMock) return mock.getEligibleStudents(type, q);
  const { data } = await api.get<{ students: EligibleStudent[] }>("/students/eligible", {
    params: { type, q: q || undefined },
  });
  return data.students;
};

export interface CreateBookingInput {
  studentName: string;
  /** existing student id (from the dropdown). When set, name/phone are ignored by the API. */
  studentId?: string;
  /** parent phone for a NEW student — backend find-or-creates the guardian. */
  studentPhone?: string;
  teacherId: string;
  /** ชื่อวิชา (legacy) — ใช้ resolve subjectId ถ้าไม่ส่ง id */
  subject: string;
  subjectId?: string;
  date: string;
  startTime: string;
  bookingType: BookingType;
  /** ต้องระบุเมื่อ bookingType === "VOUCHER" — วอยเชอร์ที่จะตัดชั่วโมง */
  voucherId?: string;
  /** ต้องระบุเมื่อ bookingType === "COURSE_PACKAGE" — คอร์สที่ session นี้ตัดโควตา (SPEC-017) */
  courseId?: string;
  /** REQ-063 / TASK-162 — optional admin discount on a TRIAL / SINGLE session (the two that post revenue). */
  discount?: { kind: "PERCENT" | "BAHT"; value: number; reason: string };
  /** REQ-068 — who's bringing the child / logistics. Optional; empty sends nothing (AC-5). */
  attendeeNote?: string;
  /** badge value ids ที่จะติดกับการจอง (type ละ ≤ 1) */
  badgeValueIds?: string[];
}

/** Existing id → { id }; otherwise an inline new student (+ optional parent phone). */
const studentPayload = (input: {
  studentId?: string;
  studentName: string;
  studentPhone?: string;
}) =>
  input.studentId
    ? { id: input.studentId }
    : { name: input.studentName.trim(), phone: input.studentPhone?.trim() || undefined };

function resolveSubjectId(
  teacherId: string,
  subjectName: string,
  subjectId?: string,
  teachers?: TeacherView[],
): string {
  if (subjectId) return subjectId;
  const teacher = teachers?.find((t) => t.id === teacherId);
  const match = teacher?.subjectOptions?.find(
    (s) => s.name.toLowerCase() === subjectName.trim().toLowerCase(),
  );
  if (match) return match.id;
  throw new ApiClientError(
    "VALIDATION",
    "เลือกวิชาจากรายการของครู — ไม่พบ subjectId",
    400,
  );
}

export const detectConflict = async (
  teacherId: string,
  date: string,
  startTime: string,
): Promise<Booking | undefined> => {
  if (useMock) return mock.detectConflict(teacherId, date, startTime);
  const cal = await getCalendar(date, "day");
  const day = cal.days.find((d) => d.date === date);
  const col = day?.columns.find((c) => c.teacher.id === teacherId);
  const slot = col?.slots.find((s) => s.time === startTime);
  return slot?.booking ? dtoToBooking(slot.booking) : undefined;
};

export const createBooking = async (input: CreateBookingInput, teachers?: TeacherView[]) => {
  if (useMock) return mock.createBooking(input);
  const subjectId = resolveSubjectId(input.teacherId, input.subject, input.subjectId, teachers);
  const { data } = await api.post("/bookings", {
    student: studentPayload(input),
    teacherId: input.teacherId,
    subjectId,
    date: input.date,
    startTime: input.startTime,
    bookingType: input.bookingType,
    voucherId: input.bookingType === "VOUCHER" ? input.voucherId : undefined,
    courseId: input.bookingType === "COURSE_PACKAGE" ? input.courseId : undefined,
    badgeValueIds: input.badgeValueIds?.length ? input.badgeValueIds : undefined,
    // 🔴 TASK-170 — this line was MISSING, which is the whole defect: the body below is an explicit allow-list,
    // so adding `discount` to `CreateBookingInput` type-checked perfectly while the value was dropped at the wire.
    // The state, the component and the rules engine were all correct the entire time. Any future field on a sale
    // payload has to be added HERE too — the compiler cannot catch an omission from an object literal.
    discount: input.discount,
    attendeeNote: input.attendeeNote,
  });
  return dtoToBooking(data.booking);
};

/** ย้าย/แก้คาบด้วยมือ (UC-003) — ครู/วัน/เวลา. ชนช่อง → 409 SLOT_TAKEN. */
export interface MoveBookingInput {
  teacherId?: string;
  subjectId?: string;
  date?: string;
  startTime?: string;
  note?: string;
}

export const moveBooking = async (
  id: string,
  patch: MoveBookingInput,
): Promise<Booking> => {
  if (useMock) return mock.moveBooking(id, patch);
  const { data } = await api.patch<MoveBookingResponse>(`/bookings/${id}`, patch);
  return dtoToBooking(data.booking);
};

// ───────────────────────── Course packages ─────────────────────────

export interface CoursesQuery {
  q?: string;
  page?: number;
  limit?: number;
  /** TASK-188/189 — filtered SERVER-side so paging and counts are true (TASK-186 Q1's miscount). */
  status?: CourseStatus;
}

export const getCoursePackages = async (
  query: CoursesQuery = {},
): Promise<Paged<CoursePackageView> & { counts?: CourseStatusCounts }> => {
  if (useMock) return mock.getCoursePackages(query);
  const { data } = await api.get<CoursesResponse>("/courses", { params: query });
  return {
    items: data.items.map(dtoToCourseView),
    page: data.page,
    limit: data.limit,
    total: data.total,
    // AC-B6 — the per-status counts are the SERVER's, over the search-filtered set before paging. Recounting
    // them here would reintroduce exactly the disagreement this task exists to remove.
    counts: data.counts,
  };
};

export const setCourseAdminUnlock = async (id: string, unlocked: boolean) => {
  if (useMock) return mock.setCourseAdminUnlock(id, unlocked);
  const { data } = await api.patch<CourseListItem>(`/courses/${id}`, {
    adminUnlocked: unlocked,
  });
  return dtoToCourseView(data);
};

export interface CreateCourseInput {
  studentName: string;
  studentId?: string;
  studentPhone?: string;
  teacherId: string;
  subjectId: string;
  size: PackageSize;
  startDate: string;
  startTime: string;
  note?: string;
  /** TASK-098 — per-session overrides from the purchase-time planner (len must === size). */
  sessions?: CoursePlanOverride[];
  /** SPEC-049 — 1-based weeks declared absent at creation (free of quota; each appends a make-up). */
  absentWeeks?: number[];
  /** REQ-063 — optional admin discount on the sale; the BE re-validates against the list price. */
  discount?: { kind: "PERCENT" | "BAHT"; value: number; reason: string };
  /** REQ-068 — seeded onto every session the course creates; per-session edits happen in manage-course. */
  attendeeNote?: string;
}

export const createCoursePackage = async (
  input: CreateCourseInput,
): Promise<CreateCoursePackageResponse> => {
  if (useMock) return mock.createCoursePackage(input);
  const { data } = await api.post<CreateCoursePackageResponse>("/courses", {
    student: studentPayload(input),
    teacherId: input.teacherId,
    subjectId: input.subjectId,
    size: input.size,
    startDate: input.startDate,
    startTime: input.startTime,
    note: input.note,
    sessions: input.sessions,
    // SPEC-049 — the BE is the source of truth for what a declared absence does (free quota + appended
    // make-up + ceiling check); the FE only says WHICH weeks.
    absentWeeks: input.absentWeeks,
    discount: input.discount,
    attendeeNote: input.attendeeNote,
  });
  return data;
};

/** Generate the editable size-row plan without writing anything (TASK-098 purchase planner). */
export const previewCoursePackage = async (input: {
  teacherId: string;
  subjectId: string;
  size: PackageSize;
  startDate: string;
  startTime: string;
  /** SPEC-049 — preview the plan WITH the declared absences, so what is shown is what gets saved (AC-2). */
  absentWeeks?: number[];
}): Promise<CoursePreview> => {
  if (useMock) return mock.previewCoursePackage(input);
  const { data } = await api.post<CoursePreview>("/courses/preview", input);
  return data;
};

export interface CreateVoucherInput {
  studentName: string;
  studentId?: string;
  studentPhone?: string;
  totalHours: 5 | 10 | 15;
  /** REQ-063 — optional admin discount; the BE re-validates against the voucher's list price. */
  discount?: { kind: "PERCENT" | "BAHT"; value: number; reason: string };
}

export const createVoucher = async (
  input: CreateVoucherInput,
): Promise<CreateVoucherResponse> => {
  if (useMock) return mock.createVoucher(input);
  const { data } = await api.post<CreateVoucherResponse>("/vouchers", {
    student: studentPayload(input),
    totalHours: input.totalHours,
    discount: input.discount,
  });
  return data;
};

// ───── Migrating what already exists (SPEC-025 / TASK-080) ─────
// These hit `/courses/import` and `/vouchers/import`, **never** the sale endpoints: the family already paid,
// so nothing is charged and no revenue is posted. `size` is deliberately NOT restricted to the price card —
// an off-card package they bought last year is still importable (TASK-079 allows it on purpose).

export interface ImportCourseInput {
  studentName: string;
  studentId?: string;
  studentPhone?: string;
  teacherId: string;
  subjectId: string;
  size: number;
  usedSessions: number;
  /** When the REMAINING sessions resume — not when the course was originally bought. */
  startDate: string;
  startTime: string;
  /** The original purchase's expiry, taken as given and never computed. */
  expiryDate: string;
  note?: string;
}

export const importCoursePackage = async (
  input: ImportCourseInput,
): Promise<{ remaining: number }> => {
  if (useMock) return mock.importCoursePackage(input);
  const { data } = await api.post<{ remaining: number }>("/courses/import", {
    student: studentPayload(input),
    teacherId: input.teacherId,
    subjectId: input.subjectId,
    size: input.size,
    usedSessions: input.usedSessions,
    startDate: input.startDate,
    startTime: input.startTime,
    expiryDate: input.expiryDate,
    note: input.note,
  });
  return data;
};

export interface ImportVoucherInput {
  studentName: string;
  studentId?: string;
  studentPhone?: string;
  totalHours: number;
  usedHours: number;
  expiryDate: string;
}

export const importVoucher = async (input: ImportVoucherInput): Promise<void> => {
  if (useMock) return mock.importVoucher(input);
  await api.post("/vouchers/import", {
    student: studentPayload(input),
    totalHours: input.totalHours,
    usedHours: input.usedHours,
    expiryDate: input.expiryDate,
  });
};

export interface VouchersQuery {
  q?: string;
  page?: number;
  limit?: number;
  studentId?: string;
}

/** รายการวอยเชอร์ (แท็บวอยเชอร์) — ค้นหา/แบ่งหน้า server-side (TASK-070). */
export const getVouchers = async (query: VouchersQuery = {}): Promise<Paged<VoucherSummary>> => {
  if (useMock) return mock.getVouchers(query);
  const { data } = await api.get<VouchersResponse>("/vouchers", { params: query });
  return data;
};

// ───────────────────────────── Reports ─────────────────────────────

const BOOKING_TYPES: BookingType[] = [
  "FIRST_TRIAL",
  "SINGLE_SESSION",
  "COURSE_PACKAGE",
  "VOUCHER",
];

function enrichDailyReport(
  base: DailyReportResponse,
  dayBookings: Booking[],
  teacherId?: string,
): DailyReport {
  const active = dayBookings.filter(
    (b) => !b.pendingSlot && b.status !== "CANCELLED" && (!teacherId || b.teacherId === teacherId),
  );
  const attended = active.filter((b) => b.status === "ATTENDED").length;
  const totalBooked = active.length;

  const byTeacherMap = new Map<string, { count: number; attended: number }>();
  for (const b of active) {
    const cur = byTeacherMap.get(b.teacherId) ?? { count: 0, attended: 0 };
    cur.count += 1;
    if (b.status === "ATTENDED") cur.attended += 1;
    byTeacherMap.set(b.teacherId, cur);
  }

  return {
    date: base.date,
    totalBooked,
    attended,
    confirmed: active.filter((b) => b.status === "CONFIRMED").length,
    pending: active.filter((b) => b.status === "PENDING").length,
    reschedulePending: active.filter((b) => b.status === "PENDING_RESCHEDULE").length,
    onLeave: base.onLeave,
    cancelled: base.cancelled,
    attendanceRate: totalBooked > 0 ? Math.round((attended / totalBooked) * 100) : 0,
    byBookingType: BOOKING_TYPES.map((type) => ({
      type,
      count: active.filter((b) => b.bookingType === type).length,
    })),
    byTeacher: [...byTeacherMap.entries()]
      .map(([tid, v]) => ({ teacherId: tid, count: v.count, attended: v.attended }))
      .sort((a, b) => b.count - a.count),
  };
}

export const getDailyReport = async (date: string, teacherId?: string): Promise<DailyReport> => {
  if (useMock) return mock.getDailyReport(date, teacherId);
  const [{ data: base }, dayBookings] = await Promise.all([
    api.get<DailyReportResponse>("/reports/daily", { params: { date } }),
    getBookingsByDate(date),
  ]);
  return enrichDailyReport(base, dayBookings, teacherId);
};

// ─────────────── Per-entitlement plan (SPEC-028 / REQ-030 — TASK-099) ───────────────

/** The read model behind the plan view — course plan rows / voucher sessions, one shape. */
export const getEntitlementPlan = async (id: string): Promise<EntitlementPlan> => {
  if (useMock) return mock.getEntitlementPlan(id);
  const { data } = await api.get<EntitlementPlan>(`/entitlements/${id}/plan`);
  return data;
};

/** Apply one plan mutation (mark-absence / insert / move) through the shared atomic gate.
 *  On refusal the server returns a typed reason as ApiClientError — surface it verbatim. */
export const applyPlanChange = async (courseId: string, change: PlanChange): Promise<void> => {
  if (useMock) return mock.applyPlanChange(courseId, change);
  await api.post(`/courses/${courseId}/plan`, change);
};

/** Who's free / who clashes at a slot — the same predicates enforced at confirm (read-only). */
export const getSlotAvailability = async (
  date: string,
  startTime: string,
): Promise<SlotAvailability> => {
  if (useMock) return mock.getSlotAvailability(date, startTime);
  const { data } = await api.get<SlotAvailability>("/slots/availability", {
    params: { date, startTime },
  });
  return data;
};

/** Dry-run a plan change (TASK-114) — same body as /plan; returns the resulting plan (or throws the same
 *  typed refusal). preview == apply by construction (BE rolls the tx back). */
export const previewPlanChange = async (
  courseId: string,
  change: PlanChange,
): Promise<PlanPreview> => {
  if (useMock) return mock.previewPlanChange(courseId, change);
  const { data } = await api.post<PlanPreview>(`/courses/${courseId}/plan/preview`, change);
  return data;
};

export interface ExtraSessionInput {
  teacherId: string;
  subjectId: string;
  date: string;
  startTime: string;
}

/** Add a charged SINGLE_SESSION extra to a course (SPEC-033) — does NOT touch size/owed/end. */
export const addExtraSession = async (courseId: string, input: ExtraSessionInput): Promise<void> => {
  if (useMock) return mock.addExtraSession(courseId, input);
  await api.post(`/courses/${courseId}/extra-session`, input);
};

/** Read-only course deduction history (SPEC-035) — the server builds it; the FE only renders. */
export const getCourseHistory = async (courseId: string): Promise<CourseHistory> => {
  if (useMock) return mock.getCourseHistory(courseId);
  const { data } = await api.get<CourseHistory>(`/courses/${courseId}/history`);
  return data;
};

/** Record an equipment rental as revenue (SPEC-031). The post IS the event — the server surfaces recorded/duplicate,
 *  or a 502 `RENTAL_NOT_POSTED` we let bubble as an ApiClientError for the caller to display. */
export const recordRental = async (input: RecordRentalInput): Promise<RentalResult> => {
  if (useMock) return mock.recordRental(input);
  const { data } = await api.post<RentalResult>("/rentals", input);
  return data;
};

/**
 * REQ-068 / TASK-178 — set ONE session's attendee note. Deliberately its own endpoint, not a field on
 * `PATCH /bookings/:id`: that path re-times a session and pushes LINE to the teacher, and a note must notify
 * nobody (AC-8). `null` clears the note; omitting the call leaves it untouched.
 */
export const setAttendeeNote = async (id: string, attendeeNote: string | null) => {
  if (useMock) return mock.setAttendeeNote(id, attendeeNote);
  const { data } = await api.patch(`/bookings/${id}/note`, { attendeeNote });
  return dtoToBooking(data.booking ?? data);
};

/**
 * REQ-036 — end a course early. Two calls, deliberately: the preview says what WILL happen (in the server's own
 * numbers), the cancel does it. The dialog never computes the removed count itself — R2 exists because a client
 * re-count and the server have disagreed before, and this action cannot be undone.
 */
export const previewEndCourse = async (courseId: string): Promise<EndCoursePreview> => {
  if (useMock) return mock.previewEndCourse(courseId);
  const { data } = await api.post<EndCoursePreview>(`/courses/${courseId}/cancel/preview`, {});
  return data;
};

export const endCourse = async (courseId: string, input: { reason: EndCourseReason; note?: string }) => {
  if (useMock) return mock.endCourse(courseId, input);
  const { data } = await api.post(`/courses/${courseId}/cancel`, {
    reason: input.reason,
    note: input.note,
  });
  return data;
};

export { DEFAULT_TEACHER_TYPE_ORDER };
