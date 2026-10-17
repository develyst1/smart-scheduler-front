"use client";

import { calendarDayBookings } from "@/lib/api/mappers";
import { useCalendar, useTeachers } from "@/hooks/scheduler";
import type { Booking } from "@/types/app/scheduler";
import BookingModal from "./Modal/BookingModal";

/**
 * 🔴 **TASK-820 — "Open" on a class in the leave panel: the EXISTING booking modal, on that class.**
 *
 * 🔑 The modal takes a full `Booking`, which only the calendar read has. This reads that DAY (the same `GET /calendar` the grid uses, the day view) and finds the class by its
 * id; until it is found nothing is drawn, and if it is not found (cancelled / moved since) nothing is drawn either — never a half-filled modal. Everything the admin does
 * there (move · change teacher · cancel · …) is the modal's own, as on the grid. 🚫 Nothing is bulk-changed from the panel.
 * ⚠️ The create-form doors (`onOverbook`, `onWalkIn`) belong to the grid's cells; a class opened from here is an existing one, so they close the modal and do nothing else.
 */
export default function LeaveClassOpener({ classId, date, onClose }: { classId: string; date: string; onClose: () => void }) {
  const { data: calendar } = useCalendar(date, "day", false, true);
  const { data: teachers = [] } = useTeachers();
  const day: Booking[] = calendar ? calendarDayBookings(calendar, date) : [];
  const booking = day.find((b) => b.id === classId);
  if (!booking) return null;
  return <BookingModal isOpen onClose={onClose} booking={booking} teachers={teachers} bookings={day} onOverbook={onClose} onWalkIn={onClose} />;
}
