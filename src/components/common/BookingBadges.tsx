"use client";

import { Chip } from "@heroui/react";
import type { BookingStatus, BookingType, TeacherType } from "@/types/app/scheduler";
import {
  BOOKING_STATUS_COLOR,
  BOOKING_STATUS_LABEL,
  BOOKING_TYPE_LABEL,
  TEACHER_TYPE_LABEL,
} from "@/types/app/scheduler";

export function StatusChip({ status, size = "sm" }: { status: BookingStatus; size?: "sm" | "md" }) {
  return (
    <Chip size={size} color={BOOKING_STATUS_COLOR[status]} variant="flat">
      {BOOKING_STATUS_LABEL[status]}
    </Chip>
  );
}

const BOOKING_TYPE_COLOR: Record<
  BookingType,
  "default" | "primary" | "secondary" | "success" | "warning" | "danger"
> = {
  FIRST_TRIAL: "warning",
  SINGLE_SESSION: "default",
  COURSE_PACKAGE: "primary",
  VOUCHER: "secondary",
};

export function BookingTypeChip({ type, size = "sm" }: { type: BookingType; size?: "sm" | "md" }) {
  return (
    <Chip size={size} color={BOOKING_TYPE_COLOR[type]} variant="dot">
      {BOOKING_TYPE_LABEL[type]}
    </Chip>
  );
}

const TEACHER_TYPE_COLOR: Record<TeacherType, "primary" | "secondary" | "default"> = {
  FULL_TIME: "primary",
  PART_TIME: "secondary",
  FREELANCE: "default",
};

export function TeacherTypeChip({ type, size = "sm" }: { type: TeacherType; size?: "sm" | "md" }) {
  return (
    <Chip size={size} color={TEACHER_TYPE_COLOR[type]} variant="flat">
      {TEACHER_TYPE_LABEL[type]}
    </Chip>
  );
}
