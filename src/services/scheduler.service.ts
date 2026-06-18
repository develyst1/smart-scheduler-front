import dayjs from "dayjs";
import {
  bookings,
  coursePackages,
  nextBookingId,
  teachers,
} from "@/lib/mock/data";
import { canTakeLeave, toCourseView } from "@/lib/scheduler/leave";
import type {
  Booking,
  BookingType,
  CoursePackageView,
  DailyReport,
  Teacher,
  TeacherType,
} from "@/types/app/scheduler";
import { TEACHER_TYPE_PRIORITY } from "@/types/app/scheduler";

// Simulate network latency so React Query states behave realistically.
const delay = <T>(value: T, ms = 200) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

// ───────────────────────────── Teachers ─────────────────────────────

export const getTeachers = () =>
  delay(
    clone(
      [...teachers].sort(
        (a, b) => TEACHER_TYPE_PRIORITY[a.type] - TEACHER_TYPE_PRIORITY[b.type],
      ),
    ),
  );

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

export const createBooking = (input: CreateBookingInput) => {
  const newBooking: Booking = {
    id: nextBookingId(),
    ...input,
    endTime: dayjs(`2000-01-01 ${input.startTime}`).add(1, "hour").format("HH:mm"),
    status: "PENDING",
  };
  bookings.push(newBooking);
  return delay(clone(newBooking));
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

export const getDailyReport = (date: string): Promise<DailyReport> => {
  const dayBookings = bookings.filter((b) => b.date === date);
  const report: DailyReport = {
    date,
    totalBooked: dayBookings.length,
    attended: dayBookings.filter((b) => b.status === "ATTENDED").length,
    onLeave: dayBookings.filter((b) => b.status === "SICK_LEAVE").length,
    pending: dayBookings.filter((b) => b.status === "PENDING").length,
    cancelled: dayBookings.filter((b) => b.status === "CANCELLED").length,
    byBookingType: BOOKING_TYPES.map((type) => ({
      type,
      count: dayBookings.filter((b) => b.bookingType === type).length,
    })),
  };
  return delay(report);
};
