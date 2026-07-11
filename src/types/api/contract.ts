// Synced from smart-scheduler-back/src/types/contract.ts — keep in lockstep.

export type TeacherType = "FULL_TIME" | "PART_TIME" | "FREELANCE";
export type BookingType =
  | "FIRST_TRIAL"
  | "SINGLE_SESSION"
  | "COURSE_PACKAGE"
  | "VOUCHER";
export type BookingStatus =
  | "PENDING"
  | "CONFIRMED"
  | "ATTENDED"
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
}

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
  expiryDate: IsoDate;
}

export interface BookingDTO {
  id: string;
  date: IsoDate;
  startTime: HhMm;
  endTime: HhMm;
  bookingType: BookingType;
  status: BookingStatus;
  note: string | null;
  student: StudentRef;
  teacher: Pick<TeacherDTO, "id" | "name" | "nickname" | "type">;
  subject: SubjectRef;
  course: CourseSummary | null;
  // Conflict resolution (B.1)
  pendingSlot: boolean;
  incomingBookingId: string | null;
  rescheduleTo: RescheduleTarget | null;
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

export type CoursesResponse = Array<CourseSummary & { student: StudentRef }>;

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
}

export interface CreateBookingResponse {
  booking: BookingDTO;
  course: CourseSummary | null;
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
  | "CONFLICT";

export interface ApiError {
  error: { code: ApiErrorCode; message: string; details?: unknown };
}
