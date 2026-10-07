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
  PauseCircle,
  type LucideIcon,
} from "lucide-react";
import type { BookingStatus, BookingType, TeacherType } from "@/types/app/scheduler";
import { BOOKING_STATUS_COLOR, TEACHER_TYPE_LABEL } from "@/types/app/scheduler";
import { MANTINE_COLOR, type SemanticColor } from "@/lib/ui/colors";
import { useT } from "@/lib/i18n";
import { checkinChannelLabelKey } from "@/lib/scheduler/checkin-source";

type Size = "sm" | "md";

// Mantine Badge truncates its label with an ellipsis by default (root max-width:100% + label
// overflow:hidden). In a table cell that collapses "PENDING" → "PEN…". Let the badge size to its
// text so the full label always shows — the row scrolls instead of clipping.
const NO_TRUNCATE = { root: { maxWidth: "none" }, label: { overflow: "visible" } } as const;

// SPEC-037 §2 / TASK-129 item 7 — a per-status icon so status is NEVER signalled by colour alone
// (three of these share `danger` red: NO_SHOW / PENDING_RESCHEDULE / CANCELLED). Label + colour + shape.
export const BOOKING_STATUS_ICON: Record<BookingStatus, LucideIcon> = {
  PENDING: Clock,
  CONFIRMED: Bell,
  ATTENDED: BadgeCheck,
  NO_SHOW: UserX,
  SICK_LEAVE: Thermometer,
  EXTENDED: CalendarPlus,
  PENDING_RESCHEDULE: ArrowLeftRight,
  CANCELLED: Ban,
  // REQ-076 — the universal "paused" shape. It shares `secondary` with EXTENDED, so the icon is what tells them
  // apart at a glance; that is exactly the job this map was added for.
  PAUSED: PauseCircle,
};

/**
 * 🔴 **TASK-703 (REQ-115) — the «ขยายคาบ» badge, ONE way to draw it.** A make-up is born CONFIRMED now (TASK-702), so its status no longer
 * says it grew from a leave; the server's `isMakeup` marker does, and Khwan kept the badge as a requirement. It is the SAME approved
 * label and icon as the status `EXTENDED` (`bookingStatus.EXTENDED`, `CalendarPlus`) — 🚫 no new words — and it is ADDED beside the real
 * status, never swapped in for it.
 */
export function MakeupChip({ size = "sm" }: { size?: Size }) {
  const t = useT();
  const Icon = BOOKING_STATUS_ICON.EXTENDED;
  return (
    <Badge
      size={size}
      color={MANTINE_COLOR[BOOKING_STATUS_COLOR.EXTENDED]}
      variant="light"
      radius="sm"
      leftSection={<Icon size={size === "md" ? 13 : 11} aria-hidden />}
      styles={NO_TRUNCATE}
      data-makeup-badge
    >
      {t("bookingStatus.EXTENDED")}
    </Badge>
  );
}

/**
 * The status chip. **Pass `isMakeup` wherever the row carries it** (the server's marker): a make-up then shows its REAL status AND the
 * «ขยายคาบ» badge. 📌 A LEGACY `EXTENDED` row already says it in its status chip, so it is NOT badged twice. One prop is all a grid cell /
 * table needs to adopt it. `isMakeup` is read as `=== true`: an absent value claims nothing.
 */
export function StatusChip({ status, isMakeup, size = "sm" }: { status: BookingStatus; isMakeup?: boolean; size?: Size }) {
  const t = useT();
  const Icon = BOOKING_STATUS_ICON[status];
  const chip = (
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
  if (isMakeup !== true || status === "EXTENDED") return chip;
  return (
    <span className="inline-flex items-center gap-1" data-status-with-makeup>
      {chip}
      <MakeupChip size={size} />
    </span>
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
  // REQ-095 Stage 2a — a group session is a product of sorts; the chip carries its label, so `primary` reads fine.
  GROUP: "primary",
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

/**
 * REQ-108 (TASK-481/482) — the wall-QR chip. **Only `shopfront-qr` gets one**; every other source — the other known
 * ones, an admin's username on a staff check-in, a value invented by a later BE task, `null` for a coach — renders
 * NOTHING and throws nothing (the decision is the one map in `lib/scheduler/checkin-source.ts`).
 *
 * Quiet and unmissable: an outlined amber chip, not a red alarm — most shop-QR check-ins are perfectly ordinary, and
 * this is read by an admin scanning a roster after something has gone wrong for a family with no LINE notice.
 */
export function CheckinSourceChip({ channel, size = "sm" }: { channel: string | null | undefined; size?: Size }) {
  const t = useT();
  const key = checkinChannelLabelKey(channel);
  if (!key) return null;
  return (
    <Badge size={size} color="orange" variant="outline" radius="sm" styles={NO_TRUNCATE} title={t("checkinSource.shopfrontQrTitle")} data-checkin-channel={channel}>
      {t(key)}
    </Badge>
  );
}
