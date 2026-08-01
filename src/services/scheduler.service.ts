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
  CoursePackageView,
  DailyReport,
  EligibleStudent,
  Teacher,
  TeacherType,
  TeacherView,
} from "@/types/app/scheduler";
import type {
  BookingsResponse,
  BulkConfirmResponse,
  BulkConfirmResult,
  CalendarResponse,
  CourseListItem,
  CoursesResponse,
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
import type { PackageSize } from "@/types/app/scheduler";
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
export const getEligibleStudents = async (
  type: "COURSE_PACKAGE" | "VOUCHER",
): Promise<EligibleStudent[]> => {
  if (useMock) return mock.getEligibleStudents(type);
  const { data } = await api.get<{ students: EligibleStudent[] }>("/students/eligible", {
    params: { type },
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
}

export const getCoursePackages = async (
  query: CoursesQuery = {},
): Promise<Paged<CoursePackageView>> => {
  if (useMock) return mock.getCoursePackages(query);
  const { data } = await api.get<CoursesResponse>("/courses", { params: query });
  return { items: data.items.map(dtoToCourseView), page: data.page, limit: data.limit, total: data.total };
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
  });
  return data;
};

export interface CreateVoucherInput {
  studentName: string;
  studentId?: string;
  studentPhone?: string;
  totalHours: 5 | 10 | 15;
}

export const createVoucher = async (
  input: CreateVoucherInput,
): Promise<CreateVoucherResponse> => {
  if (useMock) return mock.createVoucher(input);
  const { data } = await api.post<CreateVoucherResponse>("/vouchers", {
    student: studentPayload(input),
    totalHours: input.totalHours,
  });
  return data;
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

export { DEFAULT_TEACHER_TYPE_ORDER };
