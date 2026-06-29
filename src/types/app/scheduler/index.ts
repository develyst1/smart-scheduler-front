// ───────────────────────────── Teachers ─────────────────────────────

export type TeacherType = "FULL_TIME" | "PART_TIME" | "FREELANCE";

export interface SubjectOption {
  id: string;
  name: string;
}

export interface Teacher {
  id: string;
  name: string;
  nickname: string;
  type: TeacherType;
  /** ชื่อวิชา — ใช้แสดงผล */
  subjects: string[];
  /** id+name จาก API — ใช้ตอนสร้าง booking */
  subjectOptions?: SubjectOption[];
  /** ผูก LINE แล้ว — confirm จะ push ได้ */
  lineLinked?: boolean;
  /** ปิด = ไม่แสดงในตารางจองของเดือนนั้น (เช่น ประหยัดงบครู Freelance) */
  active: boolean;
  /** เรทค่าจ้างต่อชั่วโมง (จากระบบ back-office) — ใช้กับ Freelance */
  hourlyRate?: number;
  /** เพดานรายได้ต่อเดือน (จาก back-office, read-only) — เกินแล้ว auto-disable (Freelance) */
  incomeLimit?: number;
  /** เปิดรับงานต่อแม้รายได้เกิน limit (กรณีพิเศษ ทีมงานกดเอง) */
  limitOverride?: boolean;
}

/** Teacher + ข้อมูลรายได้เดือนปัจจุบันที่คำนวณแล้ว (Freelance) */
export interface TeacherView extends Teacher {
  /** ชั่วโมงที่รับงานเดือนนี้ (1 booking = 1 ชม.) */
  monthlyHours: number;
  /** รายได้สะสมเดือนนี้ = hourlyRate × monthlyHours */
  monthlyIncome: number;
  /** รายได้ถึง/เกิน limit และยังไม่ override */
  overLimit: boolean;
  /** แสดงในตารางจองได้ = active && ไม่ over limit */
  bookable: boolean;
}

export const TEACHER_TYPE_LABEL: Record<TeacherType, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  FREELANCE: "Freelance",
};

/** ลำดับการจัดสรร: Full-time/Part-time ก่อน (เหมาจ่าย) แล้วค่อย Freelance */
export const TEACHER_TYPE_PRIORITY: Record<TeacherType, number> = {
  FULL_TIME: 0,
  PART_TIME: 1,
  FREELANCE: 2,
};

// ───────────────────────────── Bookings ─────────────────────────────

export type BookingType =
  | "FIRST_TRIAL" // ทดลองเรียนครั้งแรก
  | "SINGLE_SESSION" // รายชั่วโมง
  | "COURSE_PACKAGE" // แพ็คเกจคอร์ส 4/6/10
  | "VOUCHER"; // บัตรกำนัล 5/10/15 ชม.

export const BOOKING_TYPE_LABEL: Record<BookingType, string> = {
  FIRST_TRIAL: "ทดลองเรียน",
  SINGLE_SESSION: "จองรายครั้ง",
  COURSE_PACKAGE: "คอร์สรายสัปดาห์",
  VOUCHER: "Voucher",
};

export type BookingStatus =
  | "PENDING" // รอยืนยัน
  | "CONFIRMED" // ยืนยันแล้ว (ส่งแจ้งเตือน Line)
  | "ATTENDED" // มาเรียนจริง
  | "SICK_LEAVE" // ลา/ป่วย
  | "EXTENDED" // คาบที่ขยายต่อท้ายจากการลา
  | "PENDING_RESCHEDULE" // รอย้าย — แจ้งผู้ปกครองแล้ว รอตอบรับ (จองทับ)
  | "CANCELLED"; // ยกเลิก

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING: "รอยืนยัน",
  CONFIRMED: "ยืนยันแล้ว",
  ATTENDED: "มาเรียน",
  SICK_LEAVE: "ลา/ป่วย",
  EXTENDED: "ขยายคาบ",
  PENDING_RESCHEDULE: "รอย้าย (รอผู้ปกครอง)",
  CANCELLED: "ยกเลิก",
};

/** สี semantic ตามสถานะ — map เป็นสี Mantine ใน lib/ui/colors.ts (ใช้สีน้อย เรียบตา) */
export const BOOKING_STATUS_COLOR: Record<
  BookingStatus,
  "default" | "primary" | "secondary" | "success" | "warning" | "danger"
> = {
  PENDING: "warning",
  CONFIRMED: "primary",
  ATTENDED: "success",
  SICK_LEAVE: "default",
  EXTENDED: "secondary",
  PENDING_RESCHEDULE: "danger",
  CANCELLED: "danger",
};

/** วิธีย้ายการจองเดิมเมื่อมีการจองทับ */
export type RescheduleReason = "MOVE_DAY" | "MOVE_WEEK" | "MOVE_TEACHER";

export const RESCHEDULE_REASON_LABEL: Record<RescheduleReason, string> = {
  MOVE_DAY: "ย้ายไปวันอื่น",
  MOVE_WEEK: "ย้ายไปสัปดาห์อื่น",
  MOVE_TEACHER: "ย้ายไปครูคนอื่น",
};

/** ปลายทางที่จะย้ายการจองเดิมไป (รอผู้ปกครองตอบรับ) */
export interface RescheduleTarget {
  reason: RescheduleReason;
  date: string; // YYYY-MM-DD
  teacherId: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

export interface Booking {
  id: string;
  studentName: string;
  teacherId: string;
  subject: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  bookingType: BookingType;
  status: BookingStatus;
  /** อ้างถึงคอร์สแพ็คเกจ (ถ้ามี) สำหรับการนับโควตาการลา */
  courseId?: string;
  note?: string;
  /** ปลายทางที่เสนอย้าย (เมื่อ status = PENDING_RESCHEDULE) */
  rescheduleTo?: RescheduleTarget;
  /** id ของการจองใหม่ที่รอช่องนี้ว่าง (ผูกกับ booking ที่กำลังถูกย้าย) */
  incomingBookingId?: string;
  /** true = การจองใหม่ที่ยังรอช่องว่าง (ไม่แสดงในตารางจนกว่าของเดิมจะย้าย) */
  pendingSlot?: boolean;
}

// ──────────────────────── Course package + leave quota ────────────────────────

export type PackageSize = 4 | 6 | 10;

/** โควตาการลา ผูกกับขนาดคอร์ส: 4→1, 6→2, 10→3 */
export const LEAVE_QUOTA_BY_SIZE: Record<PackageSize, number> = {
  4: 1,
  6: 2,
  10: 3,
};

/** สัปดาห์สูงสุดที่ตารางขยายได้: 4→5, 6→8, 10→13 */
export const MAX_WEEK_BY_SIZE: Record<PackageSize, number> = {
  4: 5,
  6: 8,
  10: 13,
};

export interface CoursePackage {
  id: string;
  studentName: string;
  size: PackageSize;
  usedSessions: number;
  leaveUsed: number;
  /** ปลดล็อกพิเศษโดยแอดมิน เมื่อใช้โควตาการลาเกิน (เช่น ขาหัก) */
  adminUnlocked: boolean;
  startDate: string; // YYYY-MM-DD
  weekday: number; // 0-6
  startTime: string; // HH:mm
  expiryDate: string; // YYYY-MM-DD
}

export interface CoursePackageView extends CoursePackage {
  leaveQuota: number;
  leaveRemaining: number;
  maxWeek: number;
  /** ลาเกินโควตา และยังไม่ถูกปลดล็อก → ห้ามเลื่อนตารางเพิ่ม */
  leaveLocked: boolean;
}

// ───────────────────────────── Daily report ─────────────────────────────

export interface DailyReport {
  date: string;
  totalBooked: number; // ไม่นับที่ยกเลิก/รอช่อง
  attended: number;
  confirmed: number;
  pending: number;
  reschedulePending: number; // รอผู้ปกครองตอบรับการย้าย (จองทับ)
  onLeave: number;
  cancelled: number;
  /** อัตรามาเรียน % = attended / totalBooked */
  attendanceRate: number;
  byBookingType: { type: BookingType; count: number }[];
  /** จำนวนคาบต่อครู (workload) — เรียงมากไปน้อย */
  byTeacher: { teacherId: string; count: number; attended: number }[];
}

// ───────────────────────────── Misc ─────────────────────────────

export type ModalMode = "create" | "edit" | "view";

/** สล็อตเวลา 09:00–18:00 (คาบละ 1 ชม.) — ตาม requirement.md */
export const TIME_SLOTS = [
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
] as const;

export type TimeSlot = (typeof TIME_SLOTS)[number];
