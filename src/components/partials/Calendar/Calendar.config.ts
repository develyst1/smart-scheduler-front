import type { BookingStatus, BookingType } from "@/types/app/scheduler";
import { BOOKING_STATUS_LABEL, BOOKING_TYPE_LABEL } from "@/types/app/scheduler";

export const STATUS_LEGEND: { status: BookingStatus; label: string }[] = (
  [
    "CONFIRMED",
    "ATTENDED",
    "PENDING",
    "SICK_LEAVE",
    "EXTENDED",
    "PENDING_RESCHEDULE",
  ] as BookingStatus[]
).map((status) => ({ status, label: BOOKING_STATUS_LABEL[status] }));

export const BOOKING_TYPE_OPTIONS: { key: BookingType; label: string }[] = (
  ["FIRST_TRIAL", "SINGLE_SESSION", "COURSE_PACKAGE", "VOUCHER"] as BookingType[]
).map((key) => ({ key, label: BOOKING_TYPE_LABEL[key] }));
