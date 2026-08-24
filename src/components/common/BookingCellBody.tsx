"use client";

import { Award, GraduationCap, Sparkles, Ticket } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { Booking, BookingType } from "@/types/app/scheduler";
import type { CellDisplay } from "@/lib/scheduler/cell-display";

/** SPEC-046 AC-9 — an ICON, never an emoji, and never carrying the meaning alone: the type text sits beside it. */
export const BOOKING_TYPE_ICON: Record<BookingType, LucideIcon> = {
  FIRST_TRIAL: Sparkles,
  SINGLE_SESSION: Ticket,
  COURSE_PACKAGE: GraduationCap,
  VOUCHER: Award,
};

/** The dedicated type hues from `globals.css` — deliberately none of the status colours. */
export const BOOKING_TYPE_VAR: Record<BookingType, string> = {
  FIRST_TRIAL: "var(--booking-type-first-trial)",
  SINGLE_SESSION: "var(--booking-type-single-session)",
  COURSE_PACKAGE: "var(--booking-type-course-package)",
  VOUCHER: "var(--booking-type-voucher)",
};

/** The leading edge-stripe that carries the type as a second, quieter channel (status stays primary). */
export function BookingTypeStripe({ type }: { type: BookingType }) {
  return (
    <span
      aria-hidden
      className="absolute inset-y-0 left-0 w-1 rounded-l-lg"
      style={{ backgroundColor: `rgb(${BOOKING_TYPE_VAR[type]})` }}
    />
  );
}

interface Props {
  booking: Booking;
  display: CellDisplay;
  /** Day view keeps the FULL program name (AC-4); the week cell may shorten it. */
  fullProgram?: boolean;
}

/**
 * SPEC-046 (REQ-052) + SPEC-063 (REQ-068) — everything a calendar cell shows **beyond** `time · name`, in one
 * component so the week grid and the day grid can't drift into two different cells.
 *
 * Ordering is the AC-3 rule: **the program shortens first, the type label never does.** The type is what changes
 * what a session *means* commercially; a truncated program is a smaller loss than a truncated type.
 */
export default function BookingCellBody({ booking, display, fullProgram = false }: Props) {
  const t = useT();
  const Icon = BOOKING_TYPE_ICON[booking.bookingType];
  const badge = booking.badges?.[0];

  const showType = display.type;
  const showProgram = display.program && !!booking.subject;
  const showBadge = display.badge && !!badge;
  const showNote = display.note && !!booking.attendeeNote;

  if (!showType && !showProgram && !showBadge && !showNote) return null;

  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      {(showType || showProgram) && (
        <span className="flex min-w-0 items-center gap-1 text-[11px] text-muted-600">
          {showType && (
            <>
              <Icon size={11} aria-hidden className="shrink-0" />
              {/* Never truncated — the type label is the one thing that must survive a narrow cell. */}
              <span className="shrink-0 font-medium">{t(`bookingType.${booking.bookingType}`)}</span>
            </>
          )}
          {showType && showProgram && <span className="shrink-0 text-muted-300">·</span>}
          {showProgram && (
            <span className={fullProgram ? "min-w-0" : "min-w-0 truncate"}>{booking.subject}</span>
          )}
        </span>
      )}

      {showBadge && (
        <span className="truncate text-[10px] text-muted-500">{badge!.label}</span>
      )}

      {/* REQ-068 — the session note. Absent ⇒ nothing rendered at all (AC-5). */}
      {showNote && (
        <span className="truncate text-[10px] italic text-muted-500" title={booking.attendeeNote ?? undefined}>
          {booking.attendeeNote}
        </span>
      )}
    </span>
  );
}
