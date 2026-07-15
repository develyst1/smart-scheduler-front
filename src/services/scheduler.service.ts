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
  readLimitOverrides,
  readTeacherTypeOrder,
  writeLimitOverride,
} from "@/lib/api/teacher-order-store";
import { toTeacherView } from "@/lib/scheduler/teacher";
import type {
  BookingType,
  BookingStatus,
  Booking,
  CoursePackageView,
  DailyReport,
  Teacher,
  TeacherType,
  TeacherView,
} from "@/types/app/scheduler";
import type {
  BookingsResponse,
  CalendarResponse,
  CoursesResponse,
  CreateCoursePackageResponse,
  CreateVoucherResponse,
  DailyReportResponse,
  MoveBookingResponse,
  SetTeacherWorkDaysResponse,
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
  const overrides = readLimitOverrides();
  // Order is applied server-side: GET /teachers returns groups in the persisted
  // type order (B.2), and flattenTeachers preserves it — no client re-sort needed.
  return dtos.map((dto) => toTeacherView(dtoToTeacher(dto, !!overrides[dto.id]), bookings));
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
      const overrides = readLimitOverrides();
      const teacher = dtoToTeacher(col.teacher, !!overrides[col.teacher.id]);
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
  writeLimitOverride(id, override);
  if (useMock) return mock.setTeacherLimitOverride(id, override);
  const teachers = await getTeachers();
  const view = teachers.find((t) => t.id === id);
  if (!view) throw new ApiClientError("NOT_FOUND", "ไม่พบครู", 404);
  const { id: _id, monthlyHours, monthlyIncome, overLimit, bookable, ...base } = view;
  return { ...base, limitOverride: override } as Teacher;
};

// ───────────────────────────── Bookings ─────────────────────────────

export const getBookingsByDate = async (date: string) => {
  if (useMock) return mock.getBookingsByDate(date);
  const cal = await getCalendar(date, "day");
  return calendarDayBookings(cal, date);
};

/** พารามิเตอร์ค้นหา/กรอง/แบ่งหน้า ของ GET /bookings (ส่งเฉพาะ key ที่มีค่า) */
export interface BookingQuery {
  q?: string;
  type?: BookingType;
  status?: BookingStatus;
  teacherId?: string;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
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

export const getCoursePackages = async (): Promise<CoursePackageView[]> => {
  if (useMock) return mock.getCoursePackages();
  const { data } = await api.get<CoursesResponse>("/courses");
  return data.map(dtoToCourseView);
};

export const setCourseAdminUnlock = async (id: string, unlocked: boolean) => {
  if (useMock) return mock.setCourseAdminUnlock(id, unlocked);
  const { data } = await api.patch<CoursesResponse[number]>(`/courses/${id}`, {
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

/** รายการวอยเชอร์ (แท็บวอยเชอร์ + ตัวเลือกตอนจอง) — กรองตามนักเรียนได้ */
export const getVouchers = async (studentId?: string): Promise<VoucherSummary[]> => {
  if (useMock) return mock.getVouchers(studentId);
  const { data } = await api.get<VouchersResponse>("/vouchers", {
    params: studentId ? { studentId } : undefined,
  });
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
