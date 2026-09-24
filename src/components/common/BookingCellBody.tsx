"use client";

import { Award, GraduationCap, Shapes, Sparkles, Ticket, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useT } from "@/lib/i18n";
import { seatsLabel } from "@/lib/scheduler/group-session";
import { groupTone, isClash } from "@/lib/scheduler/group-clash";
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
  // REQ-095 Stage 2a — a DUO/Group session: people, plural.
  GROUP: Users,
};

/** The dedicated type hues from `globals.css` — deliberately none of the status colours. */
export const BOOKING_TYPE_VAR: Record<BookingType, string> = {
  FIRST_TRIAL: "var(--booking-type-first-trial)",
  SINGLE_SESSION: "var(--booking-type-single-session)",
  COURSE_PACKAGE: "var(--booking-type-course-package)",
  VOUCHER: "var(--booking-type-voucher)",
  OTHER: "var(--booking-type-other)",
  GROUP: "var(--booking-type-group)",
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
      className="flex min-w-0 items-center gap-1 text-[10px] font-medium text-cal-ink"
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

/**
 * 🔴 REQ-089 item 5 (TASK-367) — the owner's stamp: *"แปะบนตารางว่า Last เห็นชัดๆ แปะๆ ไว้"*. Rendered ONLY from the
 * server's `courseLast` (true on the live row that is its course's last session — TASK-366); 🚫 nothing here or in
 * either grid derives "last" from the rows on screen, because the visible range never holds the whole course.
 * High-contrast on purpose (a solid dark chip, not a pastel tint): it must read at the week cell's smallest size,
 * and it must not inherit the dashboard-colour complaint (item 6, not ours). Not gated by `CellDisplay` — it is
 * the one thing an admin should see even with every other channel switched off. One component; the day grid and
 * the week grid both place it on the name row, beside the branch badge.
 */
export function LastStamp({ booking, size = "md" }: { booking: Booking; size?: "sm" | "md" }) {
  const t = useT();
  if (booking.courseLast !== true) return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-sm bg-neutral-900 px-1.5 font-bold uppercase leading-tight tracking-wide text-white ${
        size === "sm" ? "text-[9px] py-px" : "text-[10px] py-0.5"
      }`}
      title={t("calendar.lastLegend")}
    >
      {t("calendar.lastStamp")}
    </span>
  );
}

/**
 * 🔴 REQ-091 (TASK-372) — the `R` chip: *"like the Last chip"* — RED = a rental recorded and UNPAID, GREEN = paid.
 * Renders ONLY from the server's `booking.rental` (null ⇒ nothing; a historic rental posted before the row
 * existed has no row and so no chip, by the owner's ruling). Solid, high-contrast, not a pastel; not gated by the
 * display toggles; one component, both grids, on the name row beside `LastStamp`. 🚫 Nothing here reads the ledger
 * or derives "paid" from anything but the flag.
 */
export function RentalStamp({ booking, size = "md" }: { booking: Booking; size?: "sm" | "md" }) {
  const t = useT();
  const rental = booking.rental;
  if (!rental) return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-sm px-1.5 font-bold uppercase leading-tight tracking-wide text-white ${
        rental.paid ? "bg-green-700" : "bg-red-600"
      } ${size === "sm" ? "text-[9px] py-px" : "text-[10px] py-0.5"}`}
      title={rental.paid ? t("calendar.rentalLegendPaid") : t("calendar.rentalLegendUnpaid")}
    >
      {t("calendar.rentalStamp")}
    </span>
  );
}

/**
 * REQ-095 Stage 1 (TASK-395) — the KIND tag on an OTHER cell (`ECA` / `Free` / `KOL`), from the server's `other.kind`
 * only; null ⇒ nothing. On the name row beside the other stamps, both grids; the legend shows the same three.
 */
export function OtherKindTag({ booking, size = "md" }: { booking: Booking; size?: "sm" | "md" }) {
  const t = useT();
  // TASK-398 — the same tag grows the two GROUP kinds (DUO / Group), from `group.kind` on a GROUP row only.
  const isGroup = booking.bookingType === "GROUP";
  const kind = isGroup ? booking.group?.kind : booking.bookingType === "OTHER" ? booking.other?.kind : null;
  if (!kind) return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-sm border border-cal-ink/40 bg-white px-1 font-semibold uppercase leading-tight tracking-wide text-cal-ink ${
        size === "sm" ? "text-[9px] py-px" : "text-[10px] py-0.5"
      }`}
      title={isGroup ? t(`booking.groupKind_${kind}`) : t(`booking.otherKind_${kind}`)}
    >
      {isGroup ? t(`calendar.groupKindTag_${kind}`) : t(`calendar.otherKindTag_${kind}`)}
    </span>
  );
}

/**
 * REQ-095 Stage 2a (TASK-398) — a GROUP row's seats on the cell: `n/cap` from the server's `group.seats` (never
 * counted from anything else) and the seated names. An empty group reads `0/cap`. Nothing on a non-GROUP row.
 */
export function GroupSeatsLine({ booking, size = "md" }: { booking: Booking; size?: "sm" | "md" }) {
  const t = useT();
  const g = booking.group;
  if (booking.bookingType !== "GROUP" || !g) return null;
  const names = g.seats.map((s) => s.studentName).filter((n): n is string => !!n);
  return (
    <span className={`flex min-w-0 items-baseline gap-1 text-cal-ink ${size === "sm" ? "text-[10px]" : "text-[11px]"}`} data-seats={seatsLabel(g)}>
      <span className="shrink-0 font-semibold tabular-nums">{t("booking.groupSeats", { n: seatsLabel(g) })}</span>
      {names.length > 0 && <span className="truncate text-muted-600">{names.join(", ")}</span>}
    </span>
  );
}

/**
 * REQ-105 §1 (TASK-453/457) — a GROUP block's **two colour states**: it has children (`filled`) or it has none yet
 * (`empty`, a hollower tint — the thing the customer scans for when filling a group). A CLASH outranks both.
 * 🚫 The clash is the server's `group.clash`; the seat count is the server's seats — nothing is derived here.
 */
export function groupToneClass(booking: Booking): string {
  switch (groupTone(booking)) {
    case "clash":
      return "ring-2 ring-orange-500";
    case "filled":
      return "";
    default:
      return "opacity-80 [background-image:repeating-linear-gradient(135deg,transparent,transparent_5px,rgba(0,0,0,0.05)_5px,rgba(0,0,0,0.05)_10px)]";
  }
}

/**
 * The CLASH mark — worn by BOTH halves of the pair (the yielded group block and the Private standing in its hour),
 * so a reader can see WHICH coach-hour is being fought over. A group block reads its own `group.clash`; the Private
 * has no flag of its own, so the grid passes `inPair` (computed once over the rows on screen, pure).
 */
export function ClashMark({ booking, inPair = false, size = "md" }: { booking: Booking; inPair?: boolean; size?: "sm" | "md" }) {
  const t = useT();
  if (!isClash(booking) && !inPair) return null;
  return (
    <span
      data-clash-mark
      title={t("clash.markTitle")}
      className={`inline-flex shrink-0 items-center rounded-sm bg-orange-600 px-1 font-bold uppercase leading-tight tracking-wide text-white ${
        size === "sm" ? "text-[9px] py-px" : "text-[10px] py-0.5"
      }`}
    >
      {t("clash.mark")}
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
      {/* 🔴 `cal-ink` + `font-medium` (2026-09-16, owner review). Every line in a calendar cell now shares ONE
          colour: the old three-tier grey put this line at `muted-600`, and once the status fill went to 34% a
          mid grey was the first thing to sink into it. Hierarchy is carried by size and weight instead —
          neither of which fades as the fill deepens. This file is imported by the two calendar grids only
          (plus one test), so the change reaches nothing else. */}
      {(showType || showProgram) && (
        <span className="flex min-w-0 items-center gap-1 text-[11px] font-medium text-cal-ink">
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
          {showType && showProgram && <span className="shrink-0 text-cal-ink">·</span>}
          {showProgram && (
            <span className={fullProgram ? "min-w-0" : "min-w-0 truncate"}>{booking.subject}</span>
          )}
        </span>
      )}

      {/* REQ-068 — the session note as a neutral-bordered callout so it reads as a note, not more meta. Absent ⇒
          nothing rendered at all (AC-5). */}
      {showNote && (
        <span
          className="truncate border-l-2 border-cal-ink pl-1.5 text-[10px] font-medium text-cal-ink"
          title={booking.attendeeNote ?? undefined}
        >
          {booking.attendeeNote}
        </span>
      )}
    </span>
  );
}
