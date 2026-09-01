import type { BookingStatus, BookingType } from "@/types/app/scheduler";

// Labels are resolved at render via t(`bookingStatus.${status}`) / t(`bookingType.${key}`)
// so the calendar legend + booking-type options follow the active language.
export const STATUS_LEGEND: BookingStatus[] = [
  "CONFIRMED",
  "ATTENDED",
  "PENDING",
  "SICK_LEAVE",
  "EXTENDED",
  "PENDING_RESCHEDULE",
];

/**
 * The bookings-table TYPE FILTER (`BookingsTable.tsx`) — **not** the create-form tabs, which are `BOOKING_TABS`
 * inside `BookingModal`.
 *
 * ⚠️ **Hand-written, so widening `BookingType` does NOT add a row here and the compiler stays silent.** That is
 * the gap class this repo has now produced twice (the other: `CalendarLegendBar`'s legend array) — a
 * `Record<BookingType, …>` fails the build when the union widens; an array of the same type does not. Without
 * `OTHER` on this line staff could create อื่นๆ bookings and then have no way to filter to them, on the very
 * page REQ-024 exists to make searchable. (Found while building TASK-227; placed here by Sober's ruling.)
 */
export const BOOKING_TYPE_OPTIONS: BookingType[] = [
  "FIRST_TRIAL",
  "SINGLE_SESSION",
  "COURSE_PACKAGE",
  "VOUCHER",
  "OTHER",
];
