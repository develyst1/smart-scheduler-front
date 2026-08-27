import dayjs from "dayjs";
import type {
  Booking,
  CoursePackage,
  Teacher,
  TeacherType,
} from "@/types/app/scheduler";

// ลำดับความสำคัญของประเภทครู (ทีมงานปรับได้) — ครูจะเรียงตามนี้ใน booking grid
// ค่าเริ่มต้น: Full-time → Part-time → Freelance
export let teacherTypeOrder: TeacherType[] = ["FULL_TIME", "PART_TIME", "FREELANCE"];
export const setTeacherTypeOrderStore = (order: TeacherType[]) => {
  teacherTypeOrder = order;
};

// In-memory mock store. Replaces a real backend for now so the UI is fully
// interactive. Swap services/lib-api to real endpoints later (Phase 3).

// `subjectOptions` (id+name) are what the create-course modal offers, and their ids must line up with the
// price groups in `pricing.mock.service.ts` so TASK-078's rules are exercisable offline: s1/s2 = bike-skate
// (4/6/10), s3 = onewheel (**no 10**), s4/s5 = balance (**no 4**), s6 = Surfskate (**no price group at all**).
// The legacy `subjects` display strings are left alone — rewriting every fixture to the wheeled-sports names
// is a bigger change than this task, and nothing here depends on the two agreeing.
const BIKE_SKATE = [{ id: "s1", name: "Bike" }, { id: "s2", name: "Skate" }];
const ONEWHEEL = [{ id: "s3", name: "Onewheel" }];
const BALANCE = [
  { id: "s4", name: "Balance Play (Private)" },
  { id: "s5", name: "Balance Play (Group)" },
];
const UNPRICED = [{ id: "s6", name: "Surfskate" }];

export const teachers: Teacher[] = [
  { id: "t1", name: "ครูแอน สมใจ", nickname: "แอน", type: "FULL_TIME", subjects: ["คณิต", "ฟิสิกส์"], subjectOptions: [...BIKE_SKATE, ...ONEWHEEL], active: true, lineLinked: true, workDays: [0, 1, 2, 3, 4, 5, 6] },
  { id: "t2", name: "ครูบีม รุ่งโรจน์", nickname: "บีม", type: "FULL_TIME", subjects: ["อังกฤษ"], subjectOptions: UNPRICED, active: true, lineLinked: true, workDays: [0, 1, 2, 3, 4, 5, 6] },
  { id: "t3", name: "ครูแคท ปิยะดา", nickname: "แคท", type: "PART_TIME", subjects: ["เคมี", "ชีวะ"], subjectOptions: BALANCE, active: true, workDays: [6, 0] },
  { id: "t4", name: "ครูดิว ธนพล", nickname: "ดิว", type: "PART_TIME", subjects: ["คณิต"], subjectOptions: [...BIKE_SKATE, ...UNPRICED], active: true, workDays: [1, 2, 3, 4, 5] },
  { id: "t5", name: "ครูเอิร์ธ กิตติ", nickname: "เอิร์ธ", type: "FREELANCE", subjects: ["อังกฤษ", "IELTS"], subjectOptions: BIKE_SKATE, active: true, hourlyRate: 500, budgetMinor: 2000000, remainingMinor: 1600000, reorderMinor: 200000, overLimit: false, limitOverride: false, workDays: [0, 1, 2, 3, 4, 5, 6] },
  { id: "t6", name: "ครูฟ้า ชนิดา", nickname: "ฟ้า", type: "FREELANCE", subjects: ["ภาษาไทย"], subjectOptions: UNPRICED, active: false, hourlyRate: 450, budgetMinor: 1500000, remainingMinor: 0, reorderMinor: 150000, overLimit: true, limitOverride: false, workDays: [0, 1, 2, 3, 4, 5, 6] },
  // Shares the nickname "ดิว" with t4 on purpose — the LINE-link collision case (SPEC-023) needs two real
  // teachers to choose between, not a fabricated candidate.
  { id: "t7", name: "ครูดิว ณัฐวรรณ", nickname: "ดิว", type: "PART_TIME", subjects: ["อังกฤษ"], subjectOptions: BALANCE, active: true, workDays: [1, 2, 3, 4, 5] },
];

const today = dayjs().format("YYYY-MM-DD");

export const coursePackages: CoursePackage[] = [
  {
    id: "c1",
    studentName: "น้องพีพี",
    size: 10,
    usedSessions: 3,
    leaveUsed: 1,
    adminUnlocked: false,
    startDate: dayjs().subtract(3, "week").format("YYYY-MM-DD"),
    weekday: 0,
    startTime: "10:00",
    expiryDate: dayjs().add(10, "week").format("YYYY-MM-DD"),
  },
  {
    id: "c2",
    studentName: "น้องเจมส์",
    size: 4,
    usedSessions: 1,
    leaveUsed: 1,
    adminUnlocked: false,
    startDate: dayjs().subtract(1, "week").format("YYYY-MM-DD"),
    weekday: 2,
    startTime: "14:00",
    expiryDate: dayjs().add(4, "week").format("YYYY-MM-DD"),
  },
  {
    id: "c3",
    studentName: "น้องมายด์",
    size: 6,
    usedSessions: 4,
    leaveUsed: 2,
    adminUnlocked: false,
    startDate: dayjs().subtract(4, "week").format("YYYY-MM-DD"),
    weekday: 5,
    startTime: "16:00",
    expiryDate: dayjs().add(2, "week").format("YYYY-MM-DD"),
  },
];

/**
 * TASK-187 — the DTO-derived fields are now REQUIRED on `Booking` (an allow-list mapper that forgets one is a
 * compile error). Fixtures fill them here, once, instead of repeating `nickname: null, badges: [], discount: null`
 * on every row — so adding the next required field is one edit, not twenty, and the fixtures can't drift.
 */
const mockBooking = (
  b: Omit<Booking, "nickname" | "badges" | "discount"> & Partial<Pick<Booking, "nickname" | "badges" | "discount">>,
): Booking => ({ nickname: null, badges: [], discount: null, ...b });

export const bookings: Booking[] = ([
  { id: "b1", studentName: "น้องพีพี", teacherId: "t1", subject: "คณิต", date: today, startTime: "10:00", endTime: "11:00", bookingType: "COURSE_PACKAGE", status: "CONFIRMED", courseId: "c1" },
  { id: "b2", studentName: "น้องโอ๊ค", teacherId: "t1", subject: "ฟิสิกส์", date: today, startTime: "13:00", endTime: "14:00", bookingType: "SINGLE_SESSION", status: "ATTENDED" },
  { id: "b3", studentName: "น้องเบล", teacherId: "t2", subject: "อังกฤษ", date: today, startTime: "11:00", endTime: "12:00", bookingType: "FIRST_TRIAL", status: "PENDING", note: "ทักมาทาง Line ขอทดลองเรียน" },
  { id: "b4", studentName: "น้องมิ้น", teacherId: "t2", subject: "อังกฤษ", date: today, startTime: "15:00", endTime: "16:00", bookingType: "VOUCHER", status: "CONFIRMED" },
  { id: "b5", studentName: "น้องเจมส์", teacherId: "t3", subject: "เคมี", date: today, startTime: "14:00", endTime: "15:00", bookingType: "COURSE_PACKAGE", status: "SICK_LEAVE", courseId: "c2" },
  { id: "b6", studentName: "น้องแพร", teacherId: "t4", subject: "คณิต", date: today, startTime: "10:00", endTime: "11:00", bookingType: "SINGLE_SESSION", status: "CONFIRMED" },
  { id: "b7", studentName: "น้องกัน", teacherId: "t5", subject: "IELTS", date: today, startTime: "16:00", endTime: "17:00", bookingType: "VOUCHER", status: "CONFIRMED" },
  { id: "b8", studentName: "น้องมายด์", teacherId: "t3", subject: "ชีวะ", date: today, startTime: "16:00", endTime: "17:00", bookingType: "COURSE_PACKAGE", status: "EXTENDED", courseId: "c3", note: "คาบขยายจากการลาสัปดาห์ก่อน" },
  { id: "b9", studentName: "น้องนิว", teacherId: "t1", subject: "คณิต", date: dayjs().add(1, "day").format("YYYY-MM-DD"), startTime: "10:00", endTime: "11:00", bookingType: "COURSE_PACKAGE", status: "CONFIRMED", courseId: "c1" },
  // Past + far-future rows so the date sort (TASK-073/074) is observably different. Without them every
  // fixture row is today/tomorrow and "upcoming first" and "oldest first" render identically.
  // b12 is the case that rules out a plain newest-first default: a course books every session weeks ahead
  // at registration, so the *newest* booking is months away, not the next one.
  { id: "b10", studentName: "น้องแทน", teacherId: "t2", subject: "อังกฤษ", date: dayjs().subtract(14, "day").format("YYYY-MM-DD"), startTime: "09:00", endTime: "10:00", bookingType: "SINGLE_SESSION", status: "ATTENDED" },
  { id: "b11", studentName: "น้องปุย", teacherId: "t4", subject: "คณิต", date: dayjs().subtract(1, "day").format("YYYY-MM-DD"), startTime: "15:00", endTime: "16:00", bookingType: "COURSE_PACKAGE", status: "ATTENDED", courseId: "c2" },
  { id: "b12", studentName: "น้องพีพี", teacherId: "t1", subject: "คณิต", date: dayjs().add(9, "week").format("YYYY-MM-DD"), startTime: "10:00", endTime: "11:00", bookingType: "COURSE_PACKAGE", status: "CONFIRMED", courseId: "c1" },
] as const).map((b) => mockBooking(b as Parameters<typeof mockBooking>[0]));

let bookingSeq = bookings.length;
export const nextBookingId = () => `b${++bookingSeq}`;
