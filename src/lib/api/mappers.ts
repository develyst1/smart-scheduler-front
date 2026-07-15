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
    // Conflict resolution (B.1)
    pendingSlot: dto.pendingSlot || undefined,
    incomingBookingId: dto.incomingBookingId ?? undefined,
    rescheduleTo: dto.rescheduleTo ?? undefined,
  };
}

export function dtoToTeacher(dto: TeacherDTO, limitOverride = false): Teacher {
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
    limitOverride,
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
