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
  /** เรทค่าจ้างต่อชั่วโมง (บาท) (= ราคาต่อหน่วยของ EXPENSE item ใน back-office) — Freelance */
  hourlyRate?: number;
  /** งบฟรีแลนซ์คงเหลือเดือนนี้ (สตางค์ — จาก back-office item stock) */
  remainingMinor?: number;
  /** งบรายเดือนที่ตั้งไว้ (สตางค์ — metadata.monthlyBudgetMinor) */
  budgetMinor?: number;
  /** เกณฑ์เตือนใกล้เต็มงบ (สตางค์ — reorder_level) */
  reorderMinor?: number;
  /** งบหมด (back-office คำนวณจาก remainingMinor ≤ 0) → auto-disable */
  overLimit?: boolean;
  /** เปิดรับงานต่อแม้งบหมด (กรณีพิเศษ ทีมงานกดเอง — เก็บถาวรฝั่ง server) */
  limitOverride?: boolean;
  /** ยังไม่ตั้งเงิน (freelance ยังไม่มีงบ / ประจำ-พาร์ทไทม์ยังไม่มีเงินเดือน) → จองไม่ได้ (SPEC-004) */
  setupIncomplete?: boolean;
  /** เก็บ/ออกจากงานแล้ว — ซ่อนจาก roster + ปฏิทิน */
  archived?: boolean;
  /** 0=Sun … 6=Sat — วันที่ครูมาสอนได้ */
  workDays?: number[];
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

// Display labels for booking types/statuses come from the i18n dictionary via
// t(`bookingType.*`) / t(`bookingStatus.*`) — see src/lib/i18n/dictionaries.ts.

export type BookingStatus =
  | "PENDING" // รอยืนยัน
  | "CONFIRMED" // ยืนยันแล้ว (ส่งแจ้งเตือน Line)
  | "ATTENDED" // มาเรียนจริง
  | "NO_SHOW" // ไม่มาเรียน (ถือว่าเรียนแล้ว — ตัดคาบ)
  | "SICK_LEAVE" // ลา/ป่วย
  | "EXTENDED" // คาบที่ขยายต่อท้ายจากการลา
  | "PENDING_RESCHEDULE" // รอย้าย — แจ้งผู้ปกครองแล้ว รอตอบรับ (จองทับ)
  | "CANCELLED"; // ยกเลิก

/** สี semantic ตามสถานะ — map เป็นสี Mantine ใน lib/ui/colors.ts (ใช้สีน้อย เรียบตา) */
export const BOOKING_STATUS_COLOR: Record<
  BookingStatus,
  "default" | "primary" | "secondary" | "success" | "warning" | "danger"
> = {
  PENDING: "warning",
  CONFIRMED: "primary",
  ATTENDED: "success",
  NO_SHOW: "danger",
  SICK_LEAVE: "default",
  EXTENDED: "secondary",
  PENDING_RESCHEDULE: "danger",
  CANCELLED: "danger",
};

/** วิธีย้ายการจองเดิมเมื่อมีการจองทับ */
export type RescheduleReason = "MOVE_DAY" | "MOVE_WEEK" | "MOVE_TEACHER";

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
  /** badge ที่ติดกับการจอง (type ละ ≤ 1 ค่า) — real API ส่งมาเสมอ (mapper coalesce เป็น []) */
  badges?: BookingBadge[];
}

// ──────────────────────────── Badges ────────────────────────────
// Admin-defined tags on bookings. A type groups values; a booking carries ≤ 1
// value per type. Colour is a palette key mapped to Mantine in lib/ui/colors.

export type BadgeColor =
  | "blue"
  | "cyan"
  | "teal"
  | "green"
  | "lime"
  | "yellow"
  | "orange"
  | "red"
  | "pink"
  | "grape"
  | "violet"
  | "gray";

export const BADGE_COLORS: BadgeColor[] = [
  "blue", "cyan", "teal", "green", "lime", "yellow",
  "orange", "red", "pink", "grape", "violet", "gray",
];

export interface BookingBadge {
  typeId: string;
  typeName: string | null;
  valueId: string;
  label: string | null;
  color: BadgeColor | string | null;
}

export interface BadgeValue {
  id: string;
  typeId: string;
  label: string;
  color: BadgeColor;
  active: boolean;
  sortOrder: number;
}

export interface BadgeType {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
  values: BadgeValue[];
}

// ──────────────── Eligible students for booking (SPEC-017 / TASK-051) ────────────────
// GET /students/eligible?type=COURSE_PACKAGE|VOUCHER → students holding an active
// course/voucher, each with the context the booking modal shows. One row per entitlement.

export interface CourseContext {
  courseId: string;
  subject: SubjectOption | null;
  size: number;
  usedSessions: number;
  remainingSessions: number;
  leaveUsed: number;
  leaveQuota: number;
  expiryDate: string; // YYYY-MM-DD
}

export interface VoucherContext {
  voucherId: string;
  totalHours: number;
  usedHours: number;
  remainingHours: number;
  expiryDate: string; // YYYY-MM-DD
}

export interface EligibleStudent {
  id: string;
  name: string;
  nickname: string | null;
  context: CourseContext | VoucherContext;
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
  /** โปรแกรมกีฬาของคอร์ส (มาจาก booking ของคอร์ส — SPEC-010); null เมื่อไม่มีข้อมูล */
  subject?: SubjectOption | null;
}

export interface CoursePackageView extends CoursePackage {
  leaveQuota: number;
  leaveRemaining: number;
  maxWeek: number;
  /** ลาเกินโควตา และยังไม่ถูกปลดล็อก → ห้ามเลื่อนตารางเพิ่ม */
  leaveLocked: boolean;
}

// ──────────── Per-entitlement plan (SPEC-028 / REQ-030 — TASK-099) ────────────
// Synced 1:1 with the backend `getEntitlementPlan` / `applyPlanChange` / `getSlotAvailability`
// shapes (read model; no client-side money/end derivation — liveEndDate is server-derived).

export type EntitlementKind = "course" | "voucher";

export interface PlanSessionRef {
  id: string;
  name: string;
  nickname: string;
}

export interface PlanSession {
  id: string; // bookingId
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  /** BookingStatus (may include NO_SHOW, which the FE enum omits) — kept as string. */
  status: string;
  /** SPEC-033 — a soft-linked SINGLE_SESSION "extra" reads distinctly from the COURSE_PACKAGE plan rows. */
  bookingType?: string;
  teacher: PlanSessionRef | null;
  subject: { id: string; name: string } | null;
}

export interface CoursePlanSummary {
  kind: "course";
  size: number;
  leaveUsed: number;
  leaveQuota: number;
  maxWeek: number;
  owedCount: number;
  expiryDate: string; // the MAX_WEEK ceiling (NOT the live end)
}

export interface VoucherPlanSummary {
  kind: "voucher";
  totalHours: number;
  usedHours: number;
  hoursRemaining: number;
  expiryDate: string;
}

export interface EntitlementPlan {
  kind: EntitlementKind;
  id: string;
  student: PlanSessionRef | null;
  sessions: PlanSession[];
  liveEndDate: string | null; // server-derived (max date over LIVE sessions)
  /** SPEC-028 §12.1 — there is a session to reschedule (course: canInsert; voucher: false). */
  insertable?: boolean;
  summary: CoursePlanSummary | VoucherPlanSummary;
}

/** `POST /courses/:id/plan/preview` — the dry-run result (preview == apply, drift-proof). */
export interface PlanPreview {
  moves: { appended: string[]; cancelled: string[] };
  resultingSessions: PlanSession[];
  liveEndDate: string | null;
}

export interface SlotTeacher {
  teacher: { id: string; name: string; nickname: string; type: TeacherType };
  available: boolean;
  reason: "NO_BUDGET" | "BOOKED" | null;
  clash: { bookingId: string; student: string | null } | null;
}

export interface SlotAvailability {
  date: string;
  startTime: string;
  teachers: SlotTeacher[];
}

/** applyPlanChange request union — matches the backend `v.planChange` discriminated union. */
export type PlanChange =
  | { kind: "mark-absence"; bookingId: string; planned: boolean; reason?: string; override?: boolean }
  | { kind: "insert"; teacherId: string; subjectId: string; date: string; startTime: string }
  | {
      kind: "move";
      bookingId: string;
      teacherId?: string;
      subjectId?: string;
      date?: string;
      startTime?: string;
      override?: boolean;
    };

/** ATTENDED / NO_SHOW = delivered → read-only (SPEC-028 attended-immutability). */
export const isDeliveredStatus = (s: string) => s === "ATTENDED" || s === "NO_SHOW";

// ──────── Purchase-time course preview + per-session overrides (TASK-095/098) ────────

export interface CoursePlanOverride {
  date: string;
  startTime?: string;
  teacherId?: string;
  subjectId?: string;
}

export interface CoursePreviewSession {
  date: string;
  startTime: string;
  teacher: PlanSessionRef | null;
  subject: { id: string; name: string } | null;
}

/** `GET /teachers/:id/work-days/impact` — future LIVE course sessions orphaned by removing weekdays (TASK-100). */
export interface WorkDaysImpact {
  removedDays: number[];
  removedDaysLabel: string;
  orphanCount: number;
  sessions: { id: string; date: string; startTime: string }[];
}

/** `POST /courses/preview` — the generated size-row plan, written nowhere until confirm. */
export interface CoursePreview {
  size: number;
  startDate: string;
  startTime: string;
  expiryDate: string; // the MAX_WEEK ceiling
  sessions: CoursePreviewSession[];
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
