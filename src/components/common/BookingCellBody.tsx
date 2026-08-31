"use client";

import { Award, GraduationCap, Shapes, Sparkles, Ticket, Users } from "lucide-react";
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
  // REQ-078 — the four lesson icons all say "a paid product". อื่นๆ is not one, so it gets the odd-one-out
  // glyph rather than a fifth product-shaped icon.
  OTHER: Shapes,
};

/** The dedicated type hues from `globals.css` — deliberately none of the status colours. */
export const BOOKING_TYPE_VAR: Record<BookingType, string> = {
  FIRST_TRIAL: "var(--booking-type-first-trial)",
  SINGLE_SESSION: "var(--booking-type-single-session)",
  COURSE_PACKAGE: "var(--booking-type-course-package)",
  VOUCHER: "var(--booking-type-voucher)",
  OTHER: "var(--booking-type-other)",
};

/**
 * 🔴 REQ-078 AC-18 / TASK-227 — an อื่นๆ booking stands in **every** assigned teacher's column, so without this
 * marker three columns read as three separate meetings. It names the OTHER teachers (relative to the column it
 * is being rendered in) rather than counting them: *"who else is on this?"* is the question staff actually have,
 * and a bare "×3" does not answer it. Same id, same name, same status in every column — this is the one thing
 * that differs, and it differs only in which name it omits.
 *
 * Lives here, beside the cell body, so the week grid and the day grid render the identical marker.
 */
export function SharedTeachersMarker({
  booking,
  inColumnOf,
}: {
  booking: Booking;
  /** The teacher whose column this cell sits in — they are the one name the marker leaves out. */
  inColumnOf: string;
}) {
  const t = useT();
  const name = (tc: { name: string; nickname: string }) => tc.nickname || tc.name;
  const others = booking.teachers.filter((tc) => tc.id !== inColumnOf);
  // One teacher ⇒ nothing shared ⇒ nothing rendered. AC-20: the four lesson types can only ever land here.
  if (others.length === 0) return null;

  const shown = others.slice(0, 2);
  const rest = others.length - shown.length;
  const names = shown.map(name).join(", ");

  return (
    <span
      className="flex min-w-0 items-center gap-1 text-[10px] text-muted-500"
      title={t("calendar.sharedTitle", {
        count: booking.teachers.length,
        teachers: booking.teachers.map(name).join(", "),
      })}
    >
      <Users size={10} aria-hidden className="shrink-0" />
      <span className="truncate">
        {rest > 0
          ? t("calendar.sharedWithMore", { teachers: names, count: rest })
          : t("calendar.sharedWith", { teachers: names })}
      </span>
    </span>
  );
}

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

  const showType = display.type;
  const showProgram = display.program && !!booking.subject;
  const showNote = display.note && !!booking.attendeeNote;

  // NOTE: the badge (branch) is rendered by the caller on the name row — a primary identifier deserves the
  // top line, not the meta stack — so it is intentionally absent here even though `display.badge` gates it there.
  if (!showType && !showProgram && !showNote) return null;

  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      {(showType || showProgram) && (
        <span className="flex min-w-0 items-center gap-1 text-[11px] text-muted-600">
          {showType && (
            <>
              <Icon
                size={11}
                aria-hidden
                className="shrink-0"
                style={{ color: `rgb(${BOOKING_TYPE_VAR[booking.bookingType]})` }}
              />
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

      {/* REQ-068 — the session note as a neutral-bordered callout so it reads as a note, not more meta. Absent ⇒
          nothing rendered at all (AC-5). */}
      {showNote && (
        <span
          className="truncate border-l-2 border-muted-300 pl-1.5 text-[10px] text-muted-500"
          title={booking.attendeeNote ?? undefined}
        >
          {booking.attendeeNote}
        </span>
      )}
    </span>
  );
}
