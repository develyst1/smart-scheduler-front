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

export const BOOKING_TYPE_OPTIONS: BookingType[] = [
  "FIRST_TRIAL",
  "SINGLE_SESSION",
  "COURSE_PACKAGE",
  "VOUCHER",
];
