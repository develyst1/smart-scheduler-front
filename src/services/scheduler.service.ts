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

// Simulate network latency so React Query states behave realistically.
const delay = <T>(value: T, ms = 200) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

// ───────────────────────────── Teachers ─────────────────────────────

export const getTeachers = (): Promise<TeacherView[]> => {
  const views = teachers.map((t) => toTeacherView(t, bookings));
  return delay(sortByTypeOrder(clone(views), teacherTypeOrder));
};

export const setTeacherActive = (id: string, active: boolean) => {
  const t = teachers.find((x) => x.id === id);
  if (t) t.active = active;
  return delay(clone(t) as Teacher);
};

/** ปิด/เปิดครูทั้งประเภท (เช่น ปิด Freelance ทั้งหมดเพื่อประหยัดงบ) */
export const setTeacherTypeActive = (type: TeacherType, active: boolean) => {
  teachers.filter((t) => t.type === type).forEach((t) => (t.active = active));
  return delay(clone(teachers.filter((t) => t.type === type)));
};

/** ลำดับความสำคัญของประเภทครู (drag/reorder) */
export const getTeacherTypeOrder = (): Promise<TeacherType[]> =>
  delay(clone(teacherTypeOrder));

export const setTeacherTypeOrder = (order: TeacherType[]) => {
  setTeacherTypeOrderStore(order);
  return delay(clone(order));
};

/** เปิด/ปิด override รับงานต่อแม้เกิน limit */
export const setTeacherLimitOverride = (id: string, override: boolean) => {
  const t = teachers.find((x) => x.id === id);
  if (t) t.limitOverride = override;
  return delay(clone(t) as Teacher);
};

// ───────────────────────────── Bookings ─────────────────────────────

export const getBookingsByDate = (date: string) =>
  delay(clone(bookings.filter((b) => b.date === date)));

export const getAllBookings = () => delay(clone(bookings));

/** ดึงการจองในช่วงวันที่ [start, end] (inclusive) — ใช้กับ week view */
export const getBookingsInRange = (start: string, end: string) =>
  delay(clone(bookings.filter((b) => b.date >= start && b.date <= end)));

/** ยืนยันตาราง → ส่งแจ้งเตือนทันทีผ่าน Line (mock) */
export const confirmBooking = (id: string) => {
  const b = bookings.find((x) => x.id === id);
  if (b) {
    b.status = "CONFIRMED";
    // TODO(phase2): integrate Line Messaging API push here.
    console.info(`[Line notify] ยืนยันคาบเรียน ${b.studentName} ${b.date} ${b.startTime}`);
  }
  return delay(clone(b) as Booking);
};

/**
 * บันทึกการลา/ป่วย:
 *  - ตั้งสถานะคาบเป็น SICK_LEAVE
 *  - ถ้าผูกคอร์สและยังมีโควตา → สร้างคาบ EXTENDED ต่อท้ายสัปดาห์ถัดไปอัตโนมัติ
 *  - ถ้าลาเกินโควตาและยังไม่ปลดล็อก → ไม่ขยายคาบ (ส่ง warning กลับ)
 */
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
    // ลาเกินโควตา — ล็อกไม่ให้ขยายตาราง
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
  date: string;
  startTime: string;
  bookingType: BookingType;
}

const endOf = (startTime: string) =>
  dayjs(`2000-01-01 ${startTime}`).add(1, "hour").format("HH:mm");

/** การจองที่ "ครอง" slot อยู่จริง (ไม่นับคิวที่รอช่อง / ยกเลิก) */
const slotOccupant = (teacherId: string, date: string, startTime: string) =>
  bookings.find(
    (b) =>
      b.teacherId === teacherId &&
      b.date === date &&
      b.startTime === startTime &&
      !b.pendingSlot &&
      b.status !== "CANCELLED",
  );

/** เช็คว่ามีการจองทับ slot นี้มั้ย (ใช้ก่อนสร้าง — ฝั่ง UI เด้ง conflict dialog) */
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
  /** ปลายทาง: วัน/สัปดาห์ → date ใหม่; ครู → teacherId ใหม่ */
  date: string;
  teacherId: string;
  startTime: string;
}

/**
 * จองทับ slot ที่มีคนจองอยู่:
 *  - การจองเดิม → PENDING_RESCHEDULE (คาที่เดิมไว้ก่อน tentative) + เก็บ target
 *  - การจองใหม่ → สร้างแบบ pendingSlot (รอช่องว่าง, ยังไม่โผล่ในตาราง)
 *  - mock: ส่ง Line แจ้งผู้ปกครองขอย้าย รอตอบรับ
 * ช่องจะเป็นของการจองใหม่จริง เมื่อ confirmReschedule (ผู้ปกครองตกลง)
 */
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
    // ไม่ชนแล้ว (เปลี่ยนไประหว่างทาง) → สร้างปกติ
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

  // TODO(phase2): Line push ขอย้ายไปยังผู้ปกครองของ existing.studentName
  console.info(
    `[Line notify] ขอย้ายคาบ ${existing.studentName} → ${existing.rescheduleTo.date} ${existing.rescheduleTo.startTime} (รอตอบรับ)`,
  );

  return delay({ existing: clone(existing), incoming: clone(incoming) });
};

/** ผู้ปกครองตอบรับ → ย้ายของเดิมไป target จริง แล้วปล่อยช่องให้การจองใหม่ */
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
    if (incoming) incoming.pendingSlot = false; // เข้าครองช่องเดิมได้แล้ว
  }
  old.rescheduleTo = undefined;
  old.incomingBookingId = undefined;

  console.info(`[Line notify] ยืนยันย้ายคาบ ${old.studentName} → ${old.date} ${old.startTime}`);
  return delay(clone(old));
};

/** ผู้ปกครองไม่ตกลง / ยกเลิกการย้าย → คืนของเดิม + ลบคิวที่รอช่อง */
export const cancelReschedule = (oldId: string) => {
  const old = bookings.find((b) => b.id === oldId);
  if (!old) return delay(undefined);

  if (old.incomingBookingId) {
    const idx = bookings.findIndex((b) => b.id === old.incomingBookingId);
    if (idx !== -1) bookings.splice(idx, 1); // ยกเลิกการจองใหม่
  }
  old.status = "CONFIRMED";
  old.rescheduleTo = undefined;
  old.incomingBookingId = undefined;

  return delay(clone(old));
};

// ───────────────────────── Course packages ─────────────────────────

export const getCoursePackages = (): Promise<CoursePackageView[]> =>
  delay(coursePackages.map((c) => toCourseView(clone(c))));

/** ปลดล็อกพิเศษโดยแอดมิน เมื่อนักเรียนลาเกินโควตา (กรณีพิเศษ) */
export const adminUnlockCourse = (id: string) => {
  const c = coursePackages.find((x) => x.id === id);
  if (c) c.adminUnlocked = true;
  return delay(c ? toCourseView(clone(c)) : undefined);
};

// ───────────────────────────── Reports ─────────────────────────────

const BOOKING_TYPES: BookingType[] = [
  "FIRST_TRIAL",
  "SINGLE_SESSION",
  "COURSE_PACKAGE",
  "VOUCHER",
];

export const getDailyReport = (
  date: string,
  teacherId?: string,
): Promise<DailyReport> => {
  // ไม่นับคิวที่รอช่อง (จองทับ) — ยังไม่ใช่การจองจริง
  const dayBookings = bookings.filter(
    (b) => b.date === date && !b.pendingSlot && (!teacherId || b.teacherId === teacherId),
  );
  const cancelled = dayBookings.filter((b) => b.status === "CANCELLED").length;
  // "ลงเรียนทั้งหมด" = ไม่นับที่ยกเลิก
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

  const report: DailyReport = {
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
  };
  return delay(report);
};
