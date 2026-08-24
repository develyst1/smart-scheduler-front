import type {
  BookingDTO,
  CalendarResponse,
  CourseSummary,
  StudentRef,
  TeacherDTO,
} from "@/types/api/contract";
import type { Booking, CoursePackageView, Teacher } from "@/types/app/scheduler";

export function dtoToBooking(dto: BookingDTO): Booking {
  return {
    id: dto.id,
    studentName: dto.student.name,
    teacherId: dto.teacher.id,
    subject: dto.subject.name,
    date: dto.date,
    startTime: dto.startTime,
    endTime: dto.endTime,
    bookingType: dto.bookingType,
    status: dto.status,
    courseId: dto.course?.id,
    note: dto.note ?? undefined,
    badges: dto.badges ?? [],
    // ⚠️ This object literal is an allow-list, exactly like `createBooking`'s POST body — the omission that WAS
    // TASK-170. A field added to `BookingDTO` reaches the UI only if it is also mapped here; the compiler won't say.
    discount: dto.discount ?? null,
    // Conflict resolution (B.1)
    pendingSlot: dto.pendingSlot || undefined,
    incomingBookingId: dto.incomingBookingId ?? undefined,
    rescheduleTo: dto.rescheduleTo ?? undefined,
  };
}

export function dtoToTeacher(dto: TeacherDTO): Teacher {
  return {
    id: dto.id,
    name: dto.name,
    nickname: dto.nickname,
    type: dto.type,
    subjects: dto.subjects.map((s) => s.name),
    subjectOptions: dto.subjects,
    active: dto.active,
    lineLinked: dto.lineLinked,
    workDays: dto.workDays,
    // UC-016 / SPEC-001: rate (baht) + budget fields (satang) from the teacher's
    // backoffice EXPENSE item; limitOverride is now persisted server-side (TASK-008).
    hourlyRate: dto.hourlyRate ?? undefined,
    remainingMinor: dto.remainingMinor ?? undefined,
    budgetMinor: dto.budgetMinor ?? undefined,
    reorderMinor: dto.reorderMinor ?? undefined,
    overLimit: dto.overLimit ?? undefined,
    limitOverride: dto.limitOverride ?? false,
    setupIncomplete: dto.setupIncomplete ?? false,
    archived: dto.archived ?? false,
  };
}

export function dtoToCourseView(row: CourseSummary & { student: StudentRef }): CoursePackageView {
  return {
    id: row.id,
    studentName: row.student.name,
    size: row.size,
    usedSessions: row.usedSessions,
    leaveUsed: row.leaveUsed,
    adminUnlocked: row.adminUnlocked,
    startDate: "",
    weekday: 0,
    startTime: "09:00",
    expiryDate: row.expiryDate,
    leaveQuota: row.leaveQuota,
    leaveRemaining: row.leaveRemaining,
    maxWeek: row.maxWeek,
    leaveLocked: row.leaveLocked,
    subject: row.subject ?? null,
  };
}

export function flattenTeachers(response: { groups: Array<{ teachers: TeacherDTO[] }> }) {
  return response.groups.flatMap((g) => g.teachers);
}

export function calendarToBookings(cal: CalendarResponse): Booking[] {
  const out: Booking[] = [];
  for (const day of cal.days) {
    for (const col of day.columns) {
      for (const slot of col.slots) {
        if (slot.booking) out.push(dtoToBooking(slot.booking));
      }
    }
  }
  return out;
}

export function calendarDayBookings(cal: CalendarResponse, date: string): Booking[] {
  const day = cal.days.find((d) => d.date === date);
  if (!day) return [];
  const out: Booking[] = [];
  for (const col of day.columns) {
    for (const slot of col.slots) {
      if (slot.booking) out.push(dtoToBooking(slot.booking));
    }
  }
  return out;
}
