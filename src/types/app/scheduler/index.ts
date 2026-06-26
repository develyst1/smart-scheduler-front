// ───────────────────────────── Teachers ─────────────────────────────

export type TeacherType = "FULL_TIME" | "PART_TIME" | "FREELANCE";

export interface Teacher {
  id: string;
  name: string;
  nickname: string;
  type: TeacherType;
  subjects: string[];
  /** ปิด = ไม่แสดงในตารางจองของเดือนนั้น (เช่น ประหยัดงบครู Freelance) */
  active: boolean;
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
  SINGLE_SESSION: "รายชั่วโมง",
  COURSE_PACKAGE: "คอร์ส",
  VOUCHER: "Voucher",
};

export type BookingStatus =
  | "PENDING" // รอยืนยัน
  | "CONFIRMED" // ยืนยันแล้ว (ส่งแจ้งเตือน Line)
  | "ATTENDED" // มาเรียนจริง
  | "SICK_LEAVE" // ลา/ป่วย
  | "EXTENDED" // คาบที่ขยายต่อท้ายจากการลา
  | "CANCELLED"; // ยกเลิก

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING: "รอยืนยัน",
  CONFIRMED: "ยืนยันแล้ว",
  ATTENDED: "มาเรียน",
  SICK_LEAVE: "ลา/ป่วย",
  EXTENDED: "ขยายคาบ",
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
  CANCELLED: "danger",
};

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
  totalBooked: number;
  attended: number;
  onLeave: number;
  pending: number;
  cancelled: number;
  byBookingType: { type: BookingType; count: number }[];
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
