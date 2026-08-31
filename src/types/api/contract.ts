// Synced from smart-scheduler-back/src/types/contract.ts — keep in lockstep.

export type TeacherType = "FULL_TIME" | "PART_TIME" | "FREELANCE";
export type BookingType =
  | "FIRST_TRIAL"
  | "SINGLE_SESSION"
  | "COURSE_PACKAGE"
  | "VOUCHER"
  // SPEC-070 / TASK-224 (REQ-078) — the fifth type: not a lesson. No program, optionally no student, and
  // possibly several teachers. Every `Record<BookingType, …>` in the FE now REFUSES to compile until it has an
  // `OTHER` entry — which is how the cell, the legend and the chip were found rather than remembered.
  | "OTHER";
export type BookingStatus =
  | "PENDING"
  | "CONFIRMED"
  | "ATTENDED"
  | "NO_SHOW"
  | "SICK_LEAVE"
  | "EXTENDED"
  | "PENDING_RESCHEDULE"
  | "CANCELLED";
export type PackageSize = 4 | 6 | 10;

export type RescheduleReason = "MOVE_DAY" | "MOVE_WEEK" | "MOVE_TEACHER";

export interface RescheduleTarget {
  reason: RescheduleReason;
  date: IsoDate;
  teacherId: string;
  startTime: HhMm;
  endTime: HhMm;
}

export type IsoDate = string;
export type HhMm = string;

export interface StudentRef {
  id: string;
  name: string;
  nickname: string | null;
  crmPoints?: number;
  crmLevel?: number;
  crmLevelName?: string;
  /** UC-020 — สิทธิประโยชน์ตามระดับ (advisory ให้ staff) */
  priorityBooking?: boolean;
  perks?: string[];
}

/** UC-020 — one rung of the CRM ladder (GET /api/crm/levels). */
export interface CrmLevelDTO {
  level: number;
  name: string;
  minPoints: number;
  priorityBooking: boolean;
  perks: string[];
}

export interface SubjectRef {
  id: string;
  name: string;
}

export interface TeacherDTO {
  id: string;
  name: string;
  nickname: string;
  type: TeacherType;
  active: boolean;
  subjects: SubjectRef[];
  lineLinked: boolean;
  workDays: number[];
  /** THB/hour = the teacher's EXPENSE item unit price in backoffice (UC-016). */
  hourlyRate?: number | null;
  /** Remaining monthly freelance budget in **satang** (backoffice item stock); null when none. */
  remainingMinor?: number | null;
  /** Configured monthly budget in **satang** (metadata.monthlyBudgetMinor); null when none. */
  budgetMinor?: number | null;
  /** Near-cap warning threshold in **satang** (reorder_level); null when none. */
  reorderMinor?: number | null;
  /** Budget exhausted (remainingMinor ≤ 0) → hide from the calendar. */
  overLimit?: boolean;
  /** Admin keeps the teacher bookable past the cap (durable, server-persisted). */
  limitOverride?: boolean;
  /** No money configured yet (FREELANCE→no budget item, FT/PT→no open salary) → not bookable (SPEC-004). */
  setupIncomplete?: boolean;
  /** Soft-archived (offboarded); excluded from GET /teachers unless ?archived=true. */
  archived?: boolean;
}

/** SPEC-064 / TASK-188 — server-computed lifecycle. Mirrored from the BE contract; never re-derived here. */
export type CourseStatus = "CANCELLED" | "DROPPED" | "COMPLETED" | "EXPIRED" | "ACTIVE";

export interface CourseSummary {
  id: string;
  size: PackageSize;
  usedSessions: number;
  leaveUsed: number;
  leaveQuota: number;
  leaveRemaining: number;
  maxWeek: number;
  leaveLocked: boolean;
  adminUnlocked: boolean;
  /** SPEC-064 / TASK-181 (REQ-036) — when the course was ended early, and why. `null` for a live course.
   *  `size` still reads what the family BOUGHT; these say the plan is finished. Required, not optional: an
   *  ended course that silently maps to `undefined` is the `ปกติ` badge bug (TASK-183). */
  endedAt: string | null;
  endReason: "PROGRAM_CHANGED" | "CUSTOMER_CANCELLED" | "ADMIN_ERROR" | null;
  /** SPEC-064 / TASK-188 — the course's lifecycle status, computed SERVER-side with a fixed precedence
   *  (CANCELLED → COMPLETED → EXPIRED → ACTIVE) so every course is exactly one. **The badge renders this.**
   *  The FE must never re-derive lifecycle: a second computation is precisely what let a cancelled course show a
   *  green `ปกติ`. */
  status: CourseStatus;
  expiryDate: IsoDate;
  /** Sport program of the course, derived from its bookings (SPEC-010). The `/courses` list carries it
   *  (TASK-034); other embeds (e.g. `BookingDTO.course`) / post-mutation responses may omit it → optional. */
  subject?: SubjectRef | null;
}

/** Badge value as embedded on a booking. */
export interface BookingBadgeDTO {
  typeId: string;
  typeName: string | null;
  valueId: string;
  label: string | null;
  color: string | null;
}

export interface BadgeValueDTO {
  id: string;
  typeId: string;
  label: string;
  color: string;
  active: boolean;
  sortOrder: number;
}

export interface BadgeTypeDTO {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
  values: BadgeValueDTO[];
}
export type BadgesResponse = BadgeTypeDTO[];

export interface BadgeReportResponse {
  from: IsoDate;
  to: IsoDate;
  byValue: Array<{
    valueId: string;
    label: string;
    color: string;
    typeId: string;
    typeName: string;
    count: number;
  }>;
  byTeacher: Array<{
    teacherId: string;
    teacherNickname: string;
    valueId: string;
    label: string;
    color: string;
    count: number;
  }>;
}

export interface SetBookingBadgesResponse {
  bookingId: string;
  badges: BookingBadgeDTO[];
}

export interface BookingDTO {
  id: string;
  date: IsoDate;
  startTime: HhMm;
  endTime: HhMm;
  bookingType: BookingType;
  status: BookingStatus;
  note: string | null;
  /** TASK-224 (REQ-078) — `null` on an อื่นๆ booking with no student. Deliberately nullable rather than a
   *  placeholder: the compiler then points at every caller that genuinely needs the student OBJECT. */
  student: StudentRef | null;
  /** The FIRST teacher — unchanged meaning, still always present. See `teachers` for all of them. */
  teacher: Pick<TeacherDTO, "id" | "name" | "nickname" | "type">;
  /** TASK-224 — `null` on an อื่นๆ booking: it has no program, and says so rather than naming a fiction
   *  (a placeholder `อื่นๆ` subject row is exactly what REQ-065 had to undo). */
  subject: SubjectRef | null;
  /** TASK-224 — the admin's typed name for an อื่นๆ booking; `null` on the four lesson types. */
  title: string | null;
  /** 🔴 TASK-224 / AC-10 — the ONE field every surface renders a booking by (`title ?? nickname ?? name`),
   *  computed on the BE for EVERY type. Never blank, never the word อื่นๆ. 🚫 Do not re-derive it here and do
   *  not write a local fallback beside it — that is the 31-call-sites problem this field exists to delete. */
  displayName: string;
  /** 🔴 TASK-224 / AC-18 — EVERY assigned teacher, `teachers[0]` always being `teacher`. Present on every type
   *  (length 1 for the four lesson types), so the FE has ONE shape instead of two. */
  teachers: Array<Pick<TeacherDTO, "id" | "name" | "nickname" | "type">>;
  course: CourseSummary | null;
  badges?: BookingBadgeDTO[]; // always present from the real API; optional so mocks can omit it
  /** TASK-171 (REQ-063) — the captured discount, **null or a whole object, never partly filled**, so an absent
   *  discount and a discount of nothing can't look alike. `value` travels exactly as stored — the HUMAN number
   *  (a percentage, or whole baht per TASK-168) — deliberately NOT satang: a second unit conversion on the wire is
   *  the precise shape of the bug that cost us a day. */
  discount: { kind: "PERCENT" | "BAHT"; value: number; reason: string; actor: string | null } | null;
  /** TASK-178 (REQ-068) — the attendee note: who is actually bringing the child, and logistics. Separate from
   *  `note`, which the status flows own. Editing it notifies nobody (AC-8, structural: its own endpoint). */
  attendeeNote: string | null;
  // Conflict resolution (B.1)
  pendingSlot: boolean;
  incomingBookingId: string | null;
  rescheduleTo: RescheduleTarget | null;
}

/**
 * SPEC-069 / TASK-221 — what the day-end job already put in the books for this booking.
 * `GET /bookings/:id/posted-sale` → `{ posted: PostedSale | null }`.
 *
 * 🔴 It reports what was **POSTED**, never that the money is still there: a reversal is a manual backoffice
 * movement carrying no `refId`, so it cannot be attributed back to the booking it undoes (SPEC-069 §Limitation).
 * That is why the warning says "check and reverse in the backoffice" rather than "reverse it".
 */
export interface PostedSale {
  /**
   * 🔴 NET satang actually in the books — `listMinor + discountMinor`, computed by the BE.
   * **Render this; never re-derive it** from the two fields below. `discountMinor` is already NEGATIVE, so
   * `listMinor - discountMinor` yields a HIGHER number than the truth — on a warning whose entire job is the
   * number (SA ruling, TASK-221 → TASK-222).
   */
  amountMinor: number;
  /** The sale movement alone, before any discount. POSITIVE. Context only — not the number to show. */
  listMinor: number;
  /** The discount movement's own `value_minor`: NEGATIVE when there was one, `0` when there was not. */
  discountMinor: number;
  /** `bo.item.external_ref` — the product code ("first-trial", "single-session", …). */
  productCode: string;
  /** When the sale movement was written, ISO. */
  postedAt: string;
}

export interface PostedSaleResponse {
  posted: PostedSale | null;
}

export interface CalendarResponse {
  view: "day" | "week";
  range: { from: IsoDate; to: IsoDate };
  timeSlots: HhMm[];
  days: Array<{
    date: IsoDate;
    columns: Array<{
      teacher: TeacherDTO;
      slots: Array<{ time: HhMm; booking: BookingDTO | null }>;
    }>;
  }>;
}

export interface TeachersResponse {
  groups: Array<{
    type: TeacherType;
    allActive: boolean;
    teachers: TeacherDTO[];
  }>;
}

/** Generic server-paged list envelope (TASK-070) — the shape `/bookings`, `/courses` and `/vouchers` share. */
export interface Paged<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export type CourseListItem = CourseSummary & { student: StudentRef };

/** TASK-188 — how many courses are in each lifecycle state, over the SEARCH-filtered set before paging, so the
 *  chips show what switching to another status would find (AC-B6: they partition the unfiltered total). */
export type CourseStatusCounts = Record<CourseStatus, number>;

export type CoursesResponse = Paged<CourseListItem> & { counts: CourseStatusCounts };

export interface CreateCoursePackageRequest {
  student: StudentInput;
  teacherId: string;
  subjectId: string;
  size: PackageSize;
  startDate: IsoDate;
  startTime: HhMm;
  note?: string;
}
export interface CreateCoursePackageResponse {
  course: CourseSummary & { student: StudentRef };
  bookings: BookingDTO[];
}

export interface VoucherSummary {
  id: string;
  totalHours: number;
  usedHours: number;
  remaining: number;
  expiryDate: IsoDate;
  student: StudentRef;
}
export type VouchersResponse = Paged<VoucherSummary>;
export interface CreateVoucherRequest {
  student: StudentInput;
  totalHours: 5 | 10 | 15;
}
export interface CreateVoucherResponse {
  voucher: VoucherSummary;
}

export interface BookingsResponse {
  items: BookingDTO[];
  page: number;
  limit: number;
  total: number;
}

export interface DailyReportResponse {
  date: IsoDate;
  totalBooked: number;
  attended: number;
  onLeave: number;
  pending: number;
  cancelled: number;
  byBookingType: Array<{ type: BookingType; count: number }>;
}

export type StudentInput =
  | { id: string }
  | {
      name: string;
      nickname?: string;
      /** parent phone — backend find-or-creates the guardian and attaches the student. */
      phone?: string;
    };

/** GET /api/students?q=&limit= — booking dropdown source (searchable by name/phone). */
export interface StudentListItem {
  id: string;
  name: string;
  nickname: string | null;
  phone: string | null; // parent phone
  parentId: string | null;
  parentName: string | null;
  label: string; // "name (phone)" — ready for display
}
export type StudentsResponse = StudentListItem[];

export interface CreateBookingRequest {
  student: StudentInput;
  teacherId: string;
  subjectId: string;
  date: IsoDate;
  startTime: HhMm;
  bookingType: BookingType;
  courseId?: string;
  voucherId?: string;
  note?: string;
  badgeValueIds?: string[];
}

export interface CreateBookingResponse {
  booking: BookingDTO;
  course: CourseSummary | null;
}

/** Bulk-confirm (SPEC-011): per-booking outcome, in input order. Partial-success, no batch rollback. */
export type BulkConfirmOutcome = "confirmed" | "already_confirmed" | "skipped";
export interface BulkConfirmResult {
  id: string;
  outcome: BulkConfirmOutcome;
  /** Thai reason when `skipped` (e.g. INSUFFICIENT_BUDGET / not-pending / not-found). */
  reason?: string;
}
export interface BulkConfirmResponse {
  results: BulkConfirmResult[];
}

/** PATCH /api/bookings/:id — ย้าย/แก้คาบด้วยมือ (UC-003). */
export interface MoveBookingResponse {
  booking: BookingDTO;
}

export type BookingStatusAction = "confirm" | "attend" | "sick-leave" | "cancel";

export interface UpdateBookingStatusResponse {
  booking: BookingDTO;
  extended: BookingDTO | null;
  course: CourseSummary | null;
  locked: boolean;
  notification:
    | { channel: "line"; status: "queued" | "skipped"; reason?: string }
    | null;
}

export interface SetAvailabilityResponse {
  teachers: TeacherDTO[];
}

export interface SetTeacherWorkDaysRequest {
  workDays: number[];
}
export type SetTeacherWorkDaysResponse = TeacherDTO;

export interface TeacherTypeOrderResponse {
  order: TeacherType[];
}
export interface SetTeacherTypeOrderRequest {
  order: TeacherType[];
}

export type Role = "admin" | "staff";

export interface LoginRequest {
  username: string;
  password: string;
}
export interface LoginResponse {
  token: string;
  user: { username: string; role: Role };
}

export type ApiErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "UNAUTHORIZED"
  | "SLOT_TAKEN"
  | "COURSE_EXPIRED"
  | "LEAVE_LOCKED"
  | "LEAVE_NOTICE_TOO_LATE"
  | "CONFLICT";

export interface ApiError {
  error: { code: ApiErrorCode; message: string; details?: unknown };
}
