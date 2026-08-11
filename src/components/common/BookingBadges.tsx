"use client";

import { Badge } from "@mantine/core";
import type { BookingStatus, BookingType, TeacherType } from "@/types/app/scheduler";
import { BOOKING_STATUS_COLOR, TEACHER_TYPE_LABEL } from "@/types/app/scheduler";
import { MANTINE_COLOR, type SemanticColor } from "@/lib/ui/colors";
import { useT } from "@/lib/i18n";

type Size = "sm" | "md";

// Mantine Badge truncates its label with an ellipsis by default (root max-width:100% + label
// overflow:hidden). In a table cell that collapses "PENDING" → "PEN…". Let the badge size to its
// text so the full label always shows — the row scrolls instead of clipping.
const NO_TRUNCATE = { root: { maxWidth: "none" }, label: { overflow: "visible" } } as const;

export function StatusChip({ status, size = "sm" }: { status: BookingStatus; size?: Size }) {
  const t = useT();
  return (
    <Badge size={size} color={MANTINE_COLOR[BOOKING_STATUS_COLOR[status]]} variant="light" radius="sm" styles={NO_TRUNCATE}>
      {t(`bookingStatus.${status}`)}
    </Badge>
  );
}

const BOOKING_TYPE_COLOR: Record<BookingType, SemanticColor> = {
  FIRST_TRIAL: "warning",
  SINGLE_SESSION: "default",
  COURSE_PACKAGE: "primary",
  VOUCHER: "secondary",
};

export function BookingTypeChip({ type, size = "sm" }: { type: BookingType; size?: Size }) {
  const t = useT();
  return (
    <Badge size={size} color={MANTINE_COLOR[BOOKING_TYPE_COLOR[type]]} variant="dot" radius="sm" styles={NO_TRUNCATE}>
      {t(`bookingType.${type}`)}
    </Badge>
  );
}

const TEACHER_TYPE_COLOR: Record<TeacherType, SemanticColor> = {
  FULL_TIME: "primary",
  PART_TIME: "secondary",
  FREELANCE: "default",
};

export function TeacherTypeChip({ type, size = "sm" }: { type: TeacherType; size?: Size }) {
  return (
    <Badge size={size} color={MANTINE_COLOR[TEACHER_TYPE_COLOR[type]]} variant="light" radius="sm" styles={NO_TRUNCATE}>
      {TEACHER_TYPE_LABEL[type]}
    </Badge>
  );
}
