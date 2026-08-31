"use client";

import { Badge } from "@mantine/core";
import {
  Clock,
  Bell,
  BadgeCheck,
  UserX,
  Thermometer,
  CalendarPlus,
  ArrowLeftRight,
  Ban,
  type LucideIcon,
} from "lucide-react";
import type { BookingStatus, BookingType, TeacherType } from "@/types/app/scheduler";
import { BOOKING_STATUS_COLOR, TEACHER_TYPE_LABEL } from "@/types/app/scheduler";
import { MANTINE_COLOR, type SemanticColor } from "@/lib/ui/colors";
import { useT } from "@/lib/i18n";

type Size = "sm" | "md";

// Mantine Badge truncates its label with an ellipsis by default (root max-width:100% + label
// overflow:hidden). In a table cell that collapses "PENDING" → "PEN…". Let the badge size to its
// text so the full label always shows — the row scrolls instead of clipping.
const NO_TRUNCATE = { root: { maxWidth: "none" }, label: { overflow: "visible" } } as const;

// SPEC-037 §2 / TASK-129 item 7 — a per-status icon so status is NEVER signalled by colour alone
// (three of these share `danger` red: NO_SHOW / PENDING_RESCHEDULE / CANCELLED). Label + colour + shape.
const STATUS_ICON: Record<BookingStatus, LucideIcon> = {
  PENDING: Clock,
  CONFIRMED: Bell,
  ATTENDED: BadgeCheck,
  NO_SHOW: UserX,
  SICK_LEAVE: Thermometer,
  EXTENDED: CalendarPlus,
  PENDING_RESCHEDULE: ArrowLeftRight,
  CANCELLED: Ban,
};

export function StatusChip({ status, size = "sm" }: { status: BookingStatus; size?: Size }) {
  const t = useT();
  const Icon = STATUS_ICON[status];
  return (
    <Badge
      size={size}
      color={MANTINE_COLOR[BOOKING_STATUS_COLOR[status]]}
      variant="light"
      radius="sm"
      leftSection={<Icon size={size === "md" ? 13 : 11} aria-hidden />}
      styles={NO_TRUNCATE}
    >
      {t(`bookingStatus.${status}`)}
    </Badge>
  );
}

const BOOKING_TYPE_COLOR: Record<BookingType, SemanticColor> = {
  FIRST_TRIAL: "warning",
  SINGLE_SESSION: "default",
  COURSE_PACKAGE: "primary",
  VOUCHER: "secondary",
  // REQ-078 — `default` (grey) is the honest chip for "not a paid lesson". It is shared with SINGLE_SESSION,
  // which is fine here and NOT the same compromise as the cell: this chip always renders its own label beside
  // the dot, so the colour is reinforcement. The cell's stripe has no label, which is why it got its own hue.
  OTHER: "default",
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
