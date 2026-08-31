/** In-memory mock — used when NEXT_PUBLIC_USE_MOCK=true */
import dayjs from "dayjs";
import {
  asBooking,
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
  CourseStatus,
  CoursePackageView,
  DailyReport,
  EligibleStudent,
  EntitlementPlan,
  PlanChange,
  SlotAvailability,
  Teacher,
  TeacherType,
  TeacherView,
} from "@/types/app/scheduler";
import type { BulkConfirmResult, PostedSale } from "@/types/api/contract";

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

export const getWorkDaysImpact = (_id: string, _workDays: number[]) =>
  delay({ removedDays: [], removedDaysLabel: "", orphanCount: 0, sessions: [] });

export const cancelBooking = (id: string, _reason?: string): Promise<Booking> => {
  const b = bookings.find((x) => x.id === id);
  if (b) b.status = "CANCELLED";
  return delay(clone(b) as Booking);
};

/**
 * SPEC-069 / TASK-222 — the posted-sale lookup, offline.
 *
 * 🔴 Returns `null` (never a rejection) **on purpose**: an offline mock that threw would leave the cancel dialog
 * permanently in its "could not verify" state, which is exactly the band staff must keep taking seriously. The
 * error path is exercised against the real endpoint, not by breaking the mock.
 */
export const getPostedSale = (_id: string): Promise<PostedSale | null> => delay(null);

export const getBookingsByDate = (date: string) =>
  delay(clone(bookings.filter((b) => b.date === date)));

export const getAllBookings = (query: {
  q?: string;
  type?: BookingType;
  status?: BookingStatus;
  teacherId?: string;
  from?: string;
  to?: string;
  sort?: "upcoming" | "date_asc" | "date_desc";
  page?: number;
  limit?: number;
} = {}) => {
  const page = query.page ?? 1;
  const limit = query.limit ?? 50;
  const today = dayjs().format("YYYY-MM-DD");
  // Mirrors TASK-073's server ordering so the control can be exercised offline. `upcoming` = today/future
  // soonest-first, then the past most-recent-first. A pure sort — no row is removed in any direction.
  const orderKey = (b: { date: string; startTime: string }) => b.date + b.startTime;
  const compare = (a: { date: string; startTime: string }, b: { date: string; startTime: string }) => {
    const sort = query.sort ?? "upcoming";
    if (sort === "date_asc") return orderKey(a).localeCompare(orderKey(b));
    if (sort === "date_desc") return orderKey(b).localeCompare(orderKey(a));
    const aPast = a.date < today;
    const bPast = b.date < today;
    if (aPast !== bPast) return aPast ? 1 : -1; // future block first
    return aPast
      ? orderKey(b).localeCompare(orderKey(a)) // past: most recent first
      : orderKey(a).localeCompare(orderKey(b)); // future: soonest first
  };
  const q = query.q?.trim().toLowerCase();
  const filtered = bookings
    .filter((b) => !b.pendingSlot)
    // TASK-227 — search what the booking is CALLED, matching the real bookings list: an อื่นๆ booking may have
    // no student, and would otherwise be unfindable by the words printed on its own row.
    .filter((b) => (q ? b.displayName.toLowerCase().includes(q) : true))
    .filter((b) => (query.type ? b.bookingType === query.type : true))
    .filter((b) => (query.status ? b.status === query.status : true))
    .filter((b) => (query.teacherId ? b.teacherId === query.teacherId : true))
    .filter((b) => (query.from ? b.date >= query.from : true))
    .filter((b) => (query.to ? b.date <= query.to : true))
    .sort(compare);
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

export const getEligibleStudents = (
  type: "COURSE_PACKAGE" | "VOUCHER",
  q?: string,
): Promise<EligibleStudent[]> => {
  // Mirrors TASK-088: the SERVER filters on name/nickname/parent phone. Mock has no phone column, so it
  // matches name+nickname only — the phone half is only provable against the real API (flagged in notes).
  const needle = q?.trim().toLowerCase();
  const match = (r: EligibleStudent) =>
    !needle || r.name.toLowerCase().includes(needle) || (r.nickname ?? "").toLowerCase().includes(needle);
  const QUOTA: Record<number, number> = { 4: 1, 6: 2, 10: 3 };
  if (type === "COURSE_PACKAGE") {
    const rows: EligibleStudent[] = coursePackages
      .map((c, i) => ({
        id: `elig-course-${i}`,
        name: c.studentName,
        nickname: c.studentName,
        context: {
          courseId: c.id,
          subject: { id: "subj-surf", name: "Surfskate" },
          size: c.size,
          usedSessions: c.usedSessions,
          remainingSessions: Math.max(0, c.size - c.usedSessions),
          leaveUsed: c.leaveUsed,
          leaveQuota: QUOTA[c.size] ?? 0,
          expiryDate: c.expiryDate,
        },
      }))
      .filter((s) => (s.context as { remainingSessions: number }).remainingSessions > 0)
      .filter(match);
    return delay(clone(rows));
  }
  const vouchers: EligibleStudent[] = [
    {
      id: "elig-v1",
      name: "น้องวิว สายลม",
      nickname: "วิว",
      context: { voucherId: "v-mock-1", totalHours: 10, usedHours: 3, remainingHours: 7, expiryDate: "2026-12-31" },
    },
    {
      id: "elig-v2",
      name: "น้องกัน ปิติ",
      nickname: "กัน",
      context: { voucherId: "v-mock-2", totalHours: 15, usedHours: 1, remainingHours: 14, expiryDate: "2027-01-31" },
    },
  ];
  return delay(clone(vouchers.filter(match)));
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
  // TASK-227 — `asBooking` derives `displayName` + `teachers` by the same rules the BE uses, so the mock cannot
  // drift from the contract (and a newly created booking lands in the calendar rather than in no column).
  const newBooking: Booking = asBooking({
    id: nextBookingId(),
    ...input,
    endTime: endOf(input.startTime),
    status: "PENDING",
  });
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

/**
 * Mirrors `listCoursesPaged` (TASK-188/205): the status filter is applied server-side, and `counts` are taken
 * over the SEARCH-filtered set **before** the status filter — so the chips say what switching would find.
 *
 * 🔴 Counts are derived from the SAME `status` each row reports. TASK-204's bug was a hand-written projection
 * that dropped `droppedAt`, so counts and rows disagreed; deriving both from one value means this mock cannot
 * reproduce that split. That property is the part worth copying, not the numbers.
 */
export const getCoursePackages = (query: { q?: string; page?: number; limit?: number; status?: string } = {}) => {
  const q = query.q?.trim().toLowerCase();
  const page = query.page ?? 1;
  const limit = query.limit ?? 12;
  const searched = coursePackages
    .map((c) => toCourseView(clone(c)))
    .filter((c) => (q ? c.studentName.toLowerCase().includes(q) : true));

  // Typed as the real contract so the mock cannot drift from the five the FE renders.
  const counts: Record<CourseStatus, number> = { ACTIVE: 0, DROPPED: 0, COMPLETED: 0, EXPIRED: 0, CANCELLED: 0 };
  for (const c of searched) counts[c.status] += 1;

  const matching = query.status ? searched.filter((c) => c.status === query.status) : searched;
  return delay({
    items: matching.slice((page - 1) * limit, page * limit),
    page,
    limit,
    total: matching.length,
    counts,
  });
};

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

  const generated: Booking[] = Array.from({ length: input.size }, (_, i) =>
    asBooking({
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
    }),
  );
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
      student: { id: "s-mock", name: b.studentName ?? "", nickname: b.studentName },
      teacher: {
        id: teacher!.id,
        name: teacher!.name,
        nickname: teacher!.nickname,
        type: teacher!.type,
      },
      subject: { id: input.subjectId, name: subjectName },
      // TASK-224/227 — the three fields the DTO now always carries. A course session has no title and exactly
      // one teacher, so these are the four-lesson-type shape: `displayName` from the student, `teachers` of one.
      title: null,
      displayName: b.displayName,
      teachers: [
        {
          id: teacher!.id,
          name: teacher!.name,
          nickname: teacher!.nickname,
          type: teacher!.type,
        },
      ],
      course: toCourseView(newCourse),
      pendingSlot: false,
      incomingBookingId: null,
      rescheduleTo: null,
      discount: null, // TASK-171 — mocks post no discount; null (not undefined) matches the DTO contract.
      attendeeNote: null,
    })),
  });
};

const MOCK_VOUCHERS = [
  { id: "v1", totalHours: 10, usedHours: 4, remaining: 6, expiryDate: "2026-12-15", student: { id: "s1", name: "น้องมิ้น", nickname: "มิ้น" } },
  { id: "v2", totalHours: 5, usedHours: 5, remaining: 0, expiryDate: "2026-09-01", student: { id: "s2", name: "น้องเอิร์ธ", nickname: "เอิร์ธ" } },
  { id: "v3", totalHours: 15, usedHours: 2, remaining: 13, expiryDate: "2027-03-30", student: { id: "s3", name: "น้องพลอย", nickname: "พลอย" } },
];

export const getVouchers = (
  query: { q?: string; page?: number; limit?: number; studentId?: string } = {},
) => {
  const q = query.q?.trim().toLowerCase();
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const filtered = MOCK_VOUCHERS.filter((v) => (query.studentId ? v.student.id === query.studentId : true)).filter(
    (v) =>
      q ? v.student.name.toLowerCase().includes(q) || (v.student.nickname ?? "").toLowerCase().includes(q) : true,
  );
  return delay({ items: clone(filtered.slice((page - 1) * limit, page * limit)), page, limit, total: filtered.length });
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

// ── Migrating existing course/voucher balances (SPEC-025 / TASK-080) ──
// Offline stand-in for the import endpoints. Mirrors the server: remaining = size - used, the REMAINING
// sessions only are created (never the already-taught ones), and expiry is taken as given.
export const importCoursePackage = (input: {
  studentName: string;
  teacherId: string;
  subjectId: string;
  size: number;
  usedSessions: number;
  startDate: string;
  startTime: string;
  expiryDate: string;
}) => {
  const remaining = Math.max(0, Math.floor(input.size) - Math.max(0, Math.floor(input.usedSessions)));
  const id = `ci-${coursePackages.length + 1}`;
  coursePackages.push({
    id,
    studentName: input.studentName,
    size: input.size as never,
    usedSessions: input.usedSessions,
    startDate: input.startDate,
    startTime: input.startTime,
    expiryDate: input.expiryDate,
    leaveUsed: 0,
    adminUnlocked: false,
  } as never);
  for (let i = 0; i < remaining; i++) {
    bookings.push({
      id: `bi-${bookings.length + 1}-${i}`,
      studentName: input.studentName,
      teacherId: input.teacherId,
      subject: "",
      date: dayjs(input.startDate).add(i, "week").format("YYYY-MM-DD"),
      startTime: input.startTime,
      endTime: `${String(Number(input.startTime.slice(0, 2)) + 1).padStart(2, "0")}:00`,
      bookingType: "COURSE_PACKAGE",
      status: "CONFIRMED",
      courseId: id,
    } as never);
  }
  return delay({ remaining });
};

export const importVoucher = (input: {
  studentName: string;
  totalHours: number;
  usedHours: number;
  expiryDate: string;
}) => {
  MOCK_VOUCHERS.push({
    id: `vi-${MOCK_VOUCHERS.length + 1}`,
    totalHours: input.totalHours,
    usedHours: input.usedHours,
    remaining: Math.max(0, input.totalHours - input.usedHours),
    expiryDate: input.expiryDate,
    student: { id: `s-imp-${MOCK_VOUCHERS.length + 1}`, name: input.studentName, nickname: input.studentName },
  });
  return delay(undefined);
};

// ── Per-entitlement plan (SPEC-028 / TASK-099) — mock ──
export const getEntitlementPlan = (id: string): Promise<EntitlementPlan> => {
  const course = coursePackages.find((c) => c.id === id);
  const rows = bookings.filter((b) => b.courseId === id);
  const sessions = rows.map((b) => {
    const teacher = teachers.find((t) => t.id === b.teacherId);
    return {
      id: b.id,
      date: b.date,
      startTime: b.startTime,
      status: b.status as string,
      teacher: teacher ? { id: teacher.id, name: teacher.name, nickname: teacher.nickname } : null,
      subject: { id: "mock-subj", name: b.subject ?? "—" }, // TASK-227: `subject` is nullable now (อื่นๆ); a course plan session always has one.
    };
  });
  const liveEnd = rows.length ? rows[rows.length - 1].date : null;
  const cv = course ? toCourseView(course) : undefined;
  const plan: EntitlementPlan = {
    kind: "course",
    id,
    student: course ? { id: `s-${id}`, name: course.studentName, nickname: course.studentName } : null,
    sessions,
    liveEndDate: liveEnd,
    summary: {
      kind: "course",
      size: cv?.size ?? 4,
      leaveUsed: cv?.leaveUsed ?? 0,
      leaveQuota: cv?.leaveQuota ?? 1,
      maxWeek: cv?.maxWeek ?? 5,
      owedCount: Math.max(0, (cv?.size ?? 4) - sessions.length),
      expiryDate: cv?.expiryDate ?? "",
    },
  };
  return delay(clone(plan));
};

export const applyPlanChange = (_courseId: string, _change: PlanChange): Promise<void> =>
  delay(undefined);

export const previewPlanChange = (courseId: string, _change: PlanChange) => {
  const rows = bookings.filter((b) => b.courseId === courseId);
  return delay({
    moves: { appended: [] as string[], cancelled: [] as string[] },
    resultingSessions: rows.map((b) => {
      const teacher = teachers.find((t) => t.id === b.teacherId);
      return {
        id: b.id,
        date: b.date,
        startTime: b.startTime,
        status: b.status as string,
        bookingType: b.bookingType as string,
        teacher: teacher ? { id: teacher.id, name: teacher.name, nickname: teacher.nickname } : null,
        subject: { id: "mock-subj", name: b.subject ?? "—" }, // TASK-227: `subject` is nullable now (อื่นๆ); a course plan session always has one.
      };
    }),
    liveEndDate: rows.length ? rows[rows.length - 1].date : null,
  });
};

export const addExtraSession = (
  _courseId: string,
  _input: { teacherId: string; subjectId: string; date: string; startTime: string },
): Promise<void> => delay(undefined);

export const getCourseHistory = (courseId: string) => {
  const course = coursePackages.find((c) => c.id === courseId);
  const cv = course ? toCourseView(course) : undefined;
  const rows = bookings.filter((b) => b.courseId === courseId);
  const events = rows.map((b) => ({
    at: `${b.date}T${b.startTime}:00`,
    kind: b.status === "ATTENDED" ? "attended" : b.status === "SICK_LEAVE" ? "sick-leave" : "scheduled",
    sessionDate: b.date,
    status: b.status as string,
    teacher: null,
    subject: { id: "mock-subj", name: b.subject ?? "—" }, // TASK-227: `subject` is nullable now (อื่นๆ); a course plan session always has one.
    reason: null,
    makeupOfDate: null,
    valueMinor: null,
    actor: null as null,
  }));
  return delay({
    courseId,
    summary: {
      size: cv?.size ?? 4,
      usedSessions: cv?.usedSessions ?? 0,
      leaveUsed: cv?.leaveUsed ?? 0,
      remaining: (cv?.size ?? 4) - (cv?.usedSessions ?? 0),
      liveEndDate: rows.length ? rows[rows.length - 1].date : null,
    },
    events,
  });
};

// Mock rental: echo the same key the real service would build; a repeated key in one session reads as a duplicate.
const _rentalSeen = new Set<string>();
export const recordRental = (input: {
  code: string;
  hours: number;
  refId?: string;
  idempotencyKey?: string;
}) => {
  const idempotencyKey = `rental:${input.refId ?? input.idempotencyKey ?? "walkin"}:${input.code}`;
  const duplicate = _rentalSeen.has(idempotencyKey);
  _rentalSeen.add(idempotencyKey);
  return delay({
    status: (duplicate ? "duplicate" : "recorded") as "recorded" | "duplicate",
    code: input.code,
    hours: input.hours,
    refId: input.refId ?? null,
    idempotencyKey,
  });
};

export const previewCoursePackage = (input: {
  teacherId: string;
  subjectId: string;
  size: number;
  startDate: string;
  startTime: string;
  absentWeeks?: number[];
}) => {
  const teacher = teachers.find((t) => t.id === input.teacherId);
  const subj = teacher?.subjectOptions?.find((s) => s.id === input.subjectId) ?? null;
  const ref = {
    startTime: input.startTime,
    teacher: teacher ? { id: teacher.id, name: teacher.name, nickname: teacher.nickname } : null,
    subject: subj,
  };
  // SPEC-049 (TASK-148) — mirrors the BE shape: the `size` weekly rows, absences flagged in place, and one
  // appended make-up per absence so the LIVE count still equals `size`. The real placement is availability-aware
  // server-side; the mock appends naive weekly slots (no teacher calendar offline) — enough to exercise the UI.
  const absent = new Set(input.absentWeeks ?? []);
  const sessions = Array.from({ length: input.size }, (_, i) => ({
    date: dayjs(input.startDate).add(i, "week").format("YYYY-MM-DD"),
    ...ref,
    absent: absent.has(i + 1),
    makeup: false,
  }));
  for (let k = 0; k < absent.size; k++) {
    sessions.push({
      date: dayjs(input.startDate).add(input.size + k, "week").format("YYYY-MM-DD"),
      ...ref,
      absent: false,
      makeup: true,
    });
  }
  const live = sessions.filter((s) => !s.absent);
  const expiryDate = dayjs(input.startDate).add(input.size + 2, "week").format("YYYY-MM-DD");
  return delay({
    size: input.size,
    startDate: input.startDate,
    startTime: input.startTime,
    expiryDate,
    absentWeeks: [...absent].sort((a, b) => a - b),
    liveCount: live.length,
    endDate: live[live.length - 1]?.date ?? input.startDate,
    exceedsCeiling: sessions.some((s) => dayjs(s.date).isAfter(dayjs(expiryDate))),
    sessions,
  });
};

export const getSlotAvailability = (date: string, startTime: string): Promise<SlotAvailability> => {
  const out: SlotAvailability = {
    date,
    startTime,
    teachers: teachers
      .filter((t) => !t.archived)
      .map((t) => ({
        teacher: { id: t.id, name: t.name, nickname: t.nickname, type: t.type },
        available: true,
        reason: null,
        clash: null,
      })),
  };
  return delay(clone(out));
};

/** REQ-068 — the mock's per-session note edit: echoes the change back so the UI can be exercised offline. */
export const setAttendeeNote = (id: string, attendeeNote: string | null) =>
  delay({ id, attendeeNote });

/** REQ-036 — offline stand-in for the end-course preview/commit so the dialog is exercisable without a server. */
export const previewEndCourse = (courseId: string) =>
  delay({
    alreadyEnded: false,
    removedSessions: 3,
    sessions: [
      { date: "2026-09-01", time: "10:00", teacher: "บีม" },
      { date: "2026-09-08", time: "10:00", teacher: "บีม" },
      { date: "2026-09-15", time: "10:00", teacher: "บีม" },
    ],
    student: { id: "s1", name: "น้องพอลล่า", nickname: "พอลล่า" },
    program: "Surfskate",
  });

export const endCourse = (courseId: string, input: { reason: string; note?: string }) =>
  delay({ id: courseId, ended: true, reason: input.reason });

/** TASK-199 — offline stand-ins so the drop/resume dialogs are exercisable without a server. */
export const dropCourse = (courseId: string, input: { reason?: string }) => {
  // Mutate the fixture, so a drop actually moves a course between buckets offline. A mock that returned
  // success without changing state would make the counts LOOK right while proving nothing — the kind of
  // evidence that let TASK-204 sit unnoticed.
  const c = coursePackages.find((x) => x.id === courseId) as any;
  if (c) {
    c.droppedAt = new Date().toISOString();
    c.dropReason = input.reason ?? null;
  }
  return delay({ id: courseId, dropped: true, reason: input.reason ?? null });
};

export const resumeCourse = (courseId: string, input: { expiryDate: string }) => {
  const c = coursePackages.find((x) => x.id === courseId) as any;
  if (c) {
    c.droppedAt = null;
    c.dropReason = null;
    c.expiryDate = input.expiryDate;
  }
  return delay({ id: courseId, dropped: false, expiryDate: input.expiryDate });
};

/** TASK-202 — offline stand-in; mirrors the real shape incl. a skip so the skip path is exercisable. */
export const confirmCourse = (courseId: string) =>
  delay({ confirmed: 3, skipped: 0, alreadyConfirmed: 1, results: [] });
