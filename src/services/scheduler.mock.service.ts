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
  CoursePackageView,
  DailyReport,
  RescheduleReason,
  Teacher,
  TeacherType,
  TeacherView,
} from "@/types/app/scheduler";

const delay = <T>(value: T, ms = 200) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export const getTeachers = (): Promise<TeacherView[]> => {
  const views = teachers.map((t) => toTeacherView(t, bookings));
  return delay(sortByTypeOrder(clone(views), teacherTypeOrder));
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

export const getBookingsByDate = (date: string) =>
  delay(clone(bookings.filter((b) => b.date === date)));

export const getAllBookings = () => delay(clone(bookings));

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

export interface CreateBookingInput {
  studentName: string;
  teacherId: string;
  subject: string;
  subjectId?: string;
  date: string;
  startTime: string;
  bookingType: BookingType;
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

export interface RescheduleResolution {
  reason: RescheduleReason;
  date: string;
  teacherId: string;
  startTime: string;
}

export interface RescheduleResult {
  existing?: Booking;
  incoming: Booking;
}

export const createBookingWithReschedule = (
  input: CreateBookingInput,
  resolution: RescheduleResolution,
): Promise<RescheduleResult> => {
  const existing = slotOccupant(input.teacherId, input.date, input.startTime);
  if (!existing) {
    const created: Booking = {
      id: nextBookingId(),
      ...input,
      endTime: endOf(input.startTime),
      status: "PENDING",
    };
    bookings.push(created);
    return delay({ existing: undefined, incoming: clone(created) });
  }

  const incoming: Booking = {
    id: nextBookingId(),
    ...input,
    endTime: endOf(input.startTime),
    status: "PENDING",
    pendingSlot: true,
  };
  bookings.push(incoming);

  existing.status = "PENDING_RESCHEDULE";
  existing.incomingBookingId = incoming.id;
  existing.rescheduleTo = {
    reason: resolution.reason,
    date: resolution.date,
    teacherId: resolution.teacherId,
    startTime: resolution.startTime,
    endTime: endOf(resolution.startTime),
  };

  console.info(
    `[Line notify] ขอย้ายคาบ ${existing.studentName} → ${existing.rescheduleTo.date} ${existing.rescheduleTo.startTime} (รอตอบรับ)`,
  );

  return delay({ existing: clone(existing), incoming: clone(incoming) });
};

export const confirmReschedule = (oldId: string) => {
  const old = bookings.find((b) => b.id === oldId);
  if (!old || !old.rescheduleTo) return delay(undefined);

  const t = old.rescheduleTo;
  old.date = t.date;
  old.teacherId = t.teacherId;
  old.startTime = t.startTime;
  old.endTime = t.endTime;
  old.status = "CONFIRMED";
  old.note = "ย้ายคาบจากการจองทับ (ผู้ปกครองตกลง)";

  if (old.incomingBookingId) {
    const incoming = bookings.find((b) => b.id === old.incomingBookingId);
    if (incoming) incoming.pendingSlot = false;
  }
  old.rescheduleTo = undefined;
  old.incomingBookingId = undefined;

  return delay(clone(old));
};

export const cancelReschedule = (oldId: string) => {
  const old = bookings.find((b) => b.id === oldId);
  if (!old) return delay(undefined);

  if (old.incomingBookingId) {
    const idx = bookings.findIndex((b) => b.id === old.incomingBookingId);
    if (idx !== -1) bookings.splice(idx, 1);
  }
  old.status = "CONFIRMED";
  old.rescheduleTo = undefined;
  old.incomingBookingId = undefined;

  return delay(clone(old));
};

export const getCoursePackages = (): Promise<CoursePackageView[]> =>
  delay(coursePackages.map((c) => toCourseView(clone(c))));

export const adminUnlockCourse = (id: string) => {
  const c = coursePackages.find((x) => x.id === id);
  if (c) c.adminUnlocked = true;
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
