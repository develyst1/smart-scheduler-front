/** In-memory mock — used when NEXT_PUBLIC_USE_MOCK=true */
import dayjs from "dayjs";
import {
  bookings,
  coursePackages,
  nextBookingId,
  teachers,
  teacherTypeOrder,
  setTeacherTypeOrderStore,
} from "@/lib/mock/data";
import { canTakeLeave, toCourseView } from "@/lib/scheduler/leave";
import { sortByTypeOrder, toTeacherView } from "@/lib/scheduler/teacher";
import type {
  Booking,
  BookingType,
  BookingStatus,
  CoursePackageView,
  DailyReport,
  Teacher,
  TeacherType,
  TeacherView,
} from "@/types/app/scheduler";
import type { BulkConfirmResult } from "@/types/api/contract";

const delay = <T>(value: T, ms = 200) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export const getTeachers = (): Promise<TeacherView[]> => {
  const views = teachers.filter((t) => !t.archived).map((t) => toTeacherView(t, bookings));
  return delay(sortByTypeOrder(clone(views), teacherTypeOrder));
};

export const createTeacher = (input: {
  name: string;
  nickname: string;
  type: TeacherType;
  workDays?: number[];
}): Promise<Teacher> => {
  const teacher: Teacher = {
    id: `mock-${teachers.length + 1}`,
    name: input.name,
    nickname: input.nickname,
    type: input.type,
    subjects: [],
    active: true,
    workDays: input.workDays ?? [],
    setupIncomplete: true, // no money yet — set in backoffice
    archived: false,
  };
  teachers.push(teacher);
  return delay(clone(teacher));
};

export const updateTeacher = (
  id: string,
  input: { name?: string; nickname?: string; type?: TeacherType },
): Promise<Teacher> => {
  const t = teachers.find((x) => x.id === id);
  if (t) {
    if (input.name !== undefined) t.name = input.name;
    if (input.nickname !== undefined) t.nickname = input.nickname;
    if (input.type !== undefined) t.type = input.type;
  }
  return delay(clone(t) as Teacher);
};

export const archiveTeacher = (id: string): Promise<Teacher> => {
  const t = teachers.find((x) => x.id === id);
  if (t) {
    t.archived = true;
    t.active = false;
  }
  return delay(clone(t) as Teacher);
};

export const reactivateTeacher = (id: string): Promise<Teacher> => {
  const t = teachers.find((x) => x.id === id);
  if (t) {
    t.archived = false;
    t.active = true;
  }
  return delay(clone(t) as Teacher);
};

export const getArchivedTeachers = (): Promise<Teacher[]> =>
  delay(clone(teachers.filter((t) => t.archived)));

export const setFreelanceBudget = (
  id: string,
  input: { monthlyBudgetMinor: number; rateMinor: number; reorderMinor?: number | null },
): Promise<void> => {
  const t = teachers.find((x) => x.id === id);
  if (t) {
    const firstSet = t.budgetMinor == null;
    t.budgetMinor = input.monthlyBudgetMinor;
    t.hourlyRate = Math.round(input.rateMinor / 100);
    t.reorderMinor = input.reorderMinor ?? undefined;
    if (firstSet) t.remainingMinor = input.monthlyBudgetMinor; // edit doesn't touch remaining
    t.overLimit = (t.remainingMinor ?? 0) <= 0;
    t.setupIncomplete = false;
  }
  return delay(undefined);
};

export const topUpFreelanceBudget = (id: string, amountMinor: number): Promise<void> => {
  const t = teachers.find((x) => x.id === id);
  if (t) {
    t.remainingMinor = (t.remainingMinor ?? 0) + amountMinor;
    t.overLimit = t.remainingMinor <= 0;
  }
  return delay(undefined);
};

export const setTeacherActive = (id: string, active: boolean) => {
  const t = teachers.find((x) => x.id === id);
  if (t) t.active = active;
  return delay(clone(t) as Teacher);
};

export const setTeacherTypeActive = (type: TeacherType, active: boolean) => {
  teachers.filter((t) => t.type === type).forEach((t) => (t.active = active));
  return delay(clone(teachers.filter((t) => t.type === type)));
};

export const getTeacherTypeOrder = (): Promise<TeacherType[]> =>
  delay(clone(teacherTypeOrder));

export const setTeacherTypeOrder = (order: TeacherType[]) => {
  setTeacherTypeOrderStore(order);
  return delay(clone(order));
};

export const setTeacherLimitOverride = (id: string, override: boolean) => {
  const t = teachers.find((x) => x.id === id);
  if (t) t.limitOverride = override;
  return delay(clone(t) as Teacher);
};

export const setTeacherWorkDays = (id: string, workDays: number[]) => {
  const t = teachers.find((x) => x.id === id);
  if (t) t.workDays = workDays;
  return delay(clone(t) as Teacher);
};

export const getBookingsByDate = (date: string) =>
  delay(clone(bookings.filter((b) => b.date === date)));

export const getAllBookings = (query: {
  q?: string;
  type?: BookingType;
  status?: BookingStatus;
  teacherId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
} = {}) => {
  const page = query.page ?? 1;
  const limit = query.limit ?? 50;
  const q = query.q?.trim().toLowerCase();
  const filtered = bookings
    .filter((b) => !b.pendingSlot)
    .filter((b) => (q ? b.studentName.toLowerCase().includes(q) : true))
    .filter((b) => (query.type ? b.bookingType === query.type : true))
    .filter((b) => (query.status ? b.status === query.status : true))
    .filter((b) => (query.teacherId ? b.teacherId === query.teacherId : true))
    .filter((b) => (query.from ? b.date >= query.from : true))
    .filter((b) => (query.to ? b.date <= query.to : true))
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  const items = filtered.slice((page - 1) * limit, page * limit);
  return delay({ items: clone(items), page, limit, total: filtered.length });
};

export const getBookingsInRange = (start: string, end: string) =>
  delay(clone(bookings.filter((b) => b.date >= start && b.date <= end)));

export const confirmBooking = (id: string) => {
  const b = bookings.find((x) => x.id === id);
  if (b) {
    b.status = "CONFIRMED";
    console.info(`[Line notify] ยืนยันคาบเรียน ${b.studentName} ${b.date} ${b.startTime}`);
  }
  return delay(clone(b) as Booking);
};

export interface SickLeaveResult {
  booking?: Booking;
  extended?: Booking;
  locked: boolean;
}

export const markSickLeave = (id: string): Promise<SickLeaveResult> => {
  const b = bookings.find((x) => x.id === id);
  if (!b) return delay({ booking: undefined, extended: undefined, locked: false });

  b.status = "SICK_LEAVE";

  const course = b.courseId ? coursePackages.find((c) => c.id === b.courseId) : undefined;
  if (!course) {
    return delay({ booking: clone(b), extended: undefined, locked: false });
  }

  if (!canTakeLeave(course)) {
    return delay({ booking: clone(b), extended: undefined, locked: true });
  }

  course.leaveUsed += 1;
  const extended: Booking = {
    ...clone(b),
    id: nextBookingId(),
    date: dayjs(b.date).add(1, "week").format("YYYY-MM-DD"),
    status: "EXTENDED",
    note: "คาบขยายอัตโนมัติจากการลา",
  };
  bookings.push(extended);

  return delay({ booking: clone(b), extended: clone(extended), locked: false });
};

export const markAttended = (id: string) => {
  const b = bookings.find((x) => x.id === id);
  if (b) b.status = "ATTENDED";
  return delay(clone(b) as Booking);
};

export const bulkConfirm = (ids: string[]): Promise<BulkConfirmResult[]> => {
  const results: BulkConfirmResult[] = ids.map((id) => {
    const b = bookings.find((x) => x.id === id);
    if (!b) return { id, outcome: "skipped", reason: "ไม่พบคาบเรียน" };
    if (b.status === "CONFIRMED" || b.status === "ATTENDED") return { id, outcome: "already_confirmed" };
    if (b.status !== "PENDING") return { id, outcome: "skipped", reason: "ไม่ใช่คาบที่รอยืนยัน" };
    b.status = "CONFIRMED";
    return { id, outcome: "confirmed" };
  });
  return delay(results);
};

export interface CreateBookingInput {
  studentName: string;
  teacherId: string;
  subject: string;
  subjectId?: string;
  date: string;
  startTime: string;
  bookingType: BookingType;
  voucherId?: string;
}

const endOf = (startTime: string) =>
  dayjs(`2000-01-01 ${startTime}`).add(1, "hour").format("HH:mm");

const slotOccupant = (teacherId: string, date: string, startTime: string) =>
  bookings.find(
    (b) =>
      b.teacherId === teacherId &&
      b.date === date &&
      b.startTime === startTime &&
      !b.pendingSlot &&
      b.status !== "CANCELLED",
  );

export const detectConflict = (
  teacherId: string,
  date: string,
  startTime: string,
): Promise<Booking | undefined> => {
  const found = slotOccupant(teacherId, date, startTime);
  return delay(found ? clone(found) : undefined);
};

export const createBooking = (input: CreateBookingInput) => {
  const newBooking: Booking = {
    id: nextBookingId(),
    ...input,
    endTime: endOf(input.startTime),
    status: "PENDING",
  };
  bookings.push(newBooking);
  return delay(clone(newBooking));
};

/** ย้าย/แก้คาบด้วยมือ (UC-003) — ครู/วัน/เวลา */
export const moveBooking = (
  id: string,
  patch: {
    teacherId?: string;
    subjectId?: string;
    date?: string;
    startTime?: string;
    note?: string;
  },
): Promise<Booking> => {
  const b = bookings.find((x) => x.id === id);
  if (!b) return delay(undefined as unknown as Booking);
  if (patch.teacherId) b.teacherId = patch.teacherId;
  if (patch.date) b.date = patch.date;
  if (patch.startTime) {
    b.startTime = patch.startTime;
    b.endTime = endOf(patch.startTime);
  }
  if (patch.note !== undefined) b.note = patch.note;
  return delay(clone(b));
};

export const getCoursePackages = (): Promise<CoursePackageView[]> =>
  delay(coursePackages.map((c) => toCourseView(clone(c))));

export const setCourseAdminUnlock = (id: string, unlocked: boolean) => {
  const c = coursePackages.find((x) => x.id === id);
  if (c) c.adminUnlocked = unlocked;
  return delay(c ? toCourseView(clone(c)) : undefined);
};

export const createCoursePackage = (input: {
  studentName: string;
  teacherId: string;
  subjectId: string;
  size: 4 | 6 | 10;
  startDate: string;
  startTime: string;
  note?: string;
}) => {
  const teacher = teachers.find((t) => t.id === input.teacherId);
  const subjectName =
    teacher?.subjectOptions?.find((s) => s.id === input.subjectId)?.name ??
    teacher?.subjects[0] ??
    "โปรแกรม";
  const courseId = `c${coursePackages.length + 1}`;
  const newCourse = {
    id: courseId,
    studentName: input.studentName,
    size: input.size,
    usedSessions: 0,
    leaveUsed: 0,
    adminUnlocked: false,
    startDate: input.startDate,
    weekday: dayjs(input.startDate).day(),
    startTime: input.startTime,
    expiryDate: dayjs(input.startDate).add(input.size + 1, "week").format("YYYY-MM-DD"),
  };
  coursePackages.push(newCourse);

  const generated: Booking[] = Array.from({ length: input.size }, (_, i) => ({
    id: nextBookingId(),
    studentName: input.studentName,
    teacherId: input.teacherId,
    subject: subjectName,
    date: dayjs(input.startDate).add(i, "week").format("YYYY-MM-DD"),
    startTime: input.startTime,
    endTime: dayjs(`2000-01-01 ${input.startTime}`).add(1, "hour").format("HH:mm"),
    bookingType: "COURSE_PACKAGE" as const,
    status: "CONFIRMED" as const,
    courseId,
    note: input.note,
  }));
  bookings.push(...generated);

  return delay({
    course: {
      ...toCourseView(newCourse),
      student: { id: "s-mock", name: input.studentName, nickname: input.studentName },
    },
    bookings: generated.map((b) => ({
      id: b.id,
      date: b.date,
      startTime: b.startTime,
      endTime: b.endTime,
      bookingType: b.bookingType,
      status: b.status,
      note: b.note ?? null,
      student: { id: "s-mock", name: b.studentName, nickname: b.studentName },
      teacher: {
        id: teacher!.id,
        name: teacher!.name,
        nickname: teacher!.nickname,
        type: teacher!.type,
      },
      subject: { id: input.subjectId, name: subjectName },
      course: toCourseView(newCourse),
      pendingSlot: false,
      incomingBookingId: null,
      rescheduleTo: null,
    })),
  });
};

const MOCK_VOUCHERS = [
  { id: "v1", totalHours: 10, usedHours: 4, remaining: 6, expiryDate: "2026-12-15", student: { id: "s1", name: "น้องมิ้น", nickname: "มิ้น" } },
  { id: "v2", totalHours: 5, usedHours: 5, remaining: 0, expiryDate: "2026-09-01", student: { id: "s2", name: "น้องเอิร์ธ", nickname: "เอิร์ธ" } },
  { id: "v3", totalHours: 15, usedHours: 2, remaining: 13, expiryDate: "2027-03-30", student: { id: "s3", name: "น้องพลอย", nickname: "พลอย" } },
];

export const getVouchers = (studentId?: string) =>
  delay(clone(studentId ? MOCK_VOUCHERS.filter((v) => v.student.id === studentId) : MOCK_VOUCHERS));

export const createVoucher = (input: { studentName: string; totalHours: 5 | 10 | 15 }) =>
  delay({
    voucher: {
      id: `v${Date.now()}`,
      totalHours: input.totalHours,
      usedHours: 0,
      remaining: input.totalHours,
      expiryDate: dayjs().add(input.totalHours === 5 ? 3 : input.totalHours === 10 ? 6 : 9, "month").format("YYYY-MM-DD"),
      student: { id: "s-mock", name: input.studentName, nickname: input.studentName },
    },
  });

const BOOKING_TYPES: BookingType[] = [
  "FIRST_TRIAL",
  "SINGLE_SESSION",
  "COURSE_PACKAGE",
  "VOUCHER",
];

export const getDailyReport = (date: string, teacherId?: string): Promise<DailyReport> => {
  const dayBookings = bookings.filter(
    (b) => b.date === date && !b.pendingSlot && (!teacherId || b.teacherId === teacherId),
  );
  const cancelled = dayBookings.filter((b) => b.status === "CANCELLED").length;
  const active = dayBookings.filter((b) => b.status !== "CANCELLED");
  const totalBooked = active.length;
  const attended = active.filter((b) => b.status === "ATTENDED").length;

  const byTeacherMap = new Map<string, { count: number; attended: number }>();
  for (const b of active) {
    const cur = byTeacherMap.get(b.teacherId) ?? { count: 0, attended: 0 };
    cur.count += 1;
    if (b.status === "ATTENDED") cur.attended += 1;
    byTeacherMap.set(b.teacherId, cur);
  }

  return delay({
    date,
    totalBooked,
    attended,
    confirmed: active.filter((b) => b.status === "CONFIRMED").length,
    pending: active.filter((b) => b.status === "PENDING").length,
    reschedulePending: active.filter((b) => b.status === "PENDING_RESCHEDULE").length,
    onLeave: active.filter((b) => b.status === "SICK_LEAVE").length,
    cancelled,
    attendanceRate: totalBooked > 0 ? Math.round((attended / totalBooked) * 100) : 0,
    byBookingType: BOOKING_TYPES.map((type) => ({
      type,
      count: active.filter((b) => b.bookingType === type).length,
    })),
    byTeacher: [...byTeacherMap.entries()]
      .map(([tid, v]) => ({ teacherId: tid, count: v.count, attended: v.attended }))
      .sort((a, b) => b.count - a.count),
  });
};
