"use client";

import dayjs from "dayjs";
import "dayjs/locale/th";
import { Plus } from "lucide-react";
import { TeacherTypeChip } from "@/components/common/BookingBadges";
import type { Booking, TeacherView } from "@/types/app/scheduler";
import { bookableOnDate } from "@/lib/scheduler/work-days";
import { badgeColorVar } from "@/lib/ui/badge-colors";
import { formatTimeDisplay } from "@/lib/ui/format";
import { BOOKING_STATUS_COLOR, OFF_CALENDAR_STATUSES, TIME_SLOTS } from "@/types/app/scheduler";
import { useI18n } from "@/lib/i18n";
import FreelanceBudgetStrip from "./FreelanceBudgetStrip";
import CalendarLegendBar from "./CalendarLegendBar";
import BookingCellBody, { BookingTypeStripe, LastStamp, OtherKindTag, RentalStamp, SharedTeachersMarker } from "@/components/common/BookingCellBody";
import { useCellDisplay } from "@/lib/scheduler/cell-display";
import { useCan } from "@/hooks/scheduler/useMe";
import { CAL_DOT_STYLE, CAL_SURFACE_HOVER, CAL_SURFACE_STYLE } from "./calendar-status";

interface Props {
  teachers: TeacherView[];
  weekDays: string[]; // 7 วัน (YYYY-MM-DD) เรียงตามลำดับ
  bookings: Booking[];
  onSelectBooking: (booking: Booking) => void;
  onCreate: (teacherId: string, time: string, date: string) => void;
}

// พื้น/ขอบ + dot ตามสถานะ — `./calendar-status`, shared with the day grid AND the legend that explains both.
// 🚫 Do not re-declare either map here: the legend drifting out of step with the grid is the defect that put
// them in one file.

export default function CalendarWeekGrid({
  teachers,
  weekDays,
  bookings,
  onSelectBooking,
  onCreate,
}: Props) {
  const { lang, t } = useI18n();
  // Display-only preference (SPEC-046 re-cut) — it hides lines, it never filters bookings.
  const { display } = useCellDisplay();
  const can = useCan();
  const mayBook = can("action:calendar.book");
  const activeTeachers = teachers.filter((tc) => tc.bookable);
  const today = dayjs().format("YYYY-MM-DD");

  // 🔴 REQ-078 AC-18 / TASK-227 — placement is by EVERY assigned teacher, not just `teacherId`. The BE indexes
  // the calendar payload on the FIRST teacher only (`date|teacher.id|startTime`), so an อื่นๆ booking arrives
  // exactly once and this is what puts it in each column — one booking, one id, one status, several columns.
  // `teachers` has length 1 for the four lesson types, so their placement is identical to the old
  // `b.teacherId === teacherId` (AC-20 by construction, not by a guard).
  const cellBookings = (teacherId: string, date: string) =>
    bookings
      .filter(
        (b) =>
          b.teachers.some((tc) => tc.id === teacherId) &&
          b.date === date &&
          !b.pendingSlot &&
          !OFF_CALENDAR_STATUSES.includes(b.status),
      )
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <div className="rounded-2xl border border-muted-200 bg-content1 shadow-sm">
      <CalendarLegendBar />
      <div className="overflow-auto rounded-b-2xl">
        <div
          className="grid min-w-max"
          style={{ gridTemplateColumns: `160px repeat(7, minmax(150px, 1fr))` }}
        >
        {/* Header row */}
        <div className="sticky left-0 top-0 z-20 border-b border-r border-muted-200 bg-content1 p-3 text-xs font-medium text-muted-400">
          {t("calendar.teacherDay")}
        </div>
        {weekDays.map((day) => {
          const d = dayjs(day).locale(lang);
          const isToday = day === today;
          return (
            <div
              key={day}
              className={`sticky top-0 z-10 border-b border-l border-muted-100 p-2 text-center ${
                isToday ? "bg-primary/10" : "bg-content1"
              }`}
            >
              <p className={`text-sm font-semibold leading-none ${isToday ? "text-primary" : ""}`}>
                {/* REQ-075 — same rule as `dayShort`: `ddd` in English, `dd` in Thai (no 3-letter Thai form). */}
                {d.format(lang === "th" ? "dd" : "ddd")}
              </p>
              <p className="mt-1 text-xs text-muted-400">{d.format("D MMM")}</p>
            </div>
          );
        })}

        {/* Teacher rows */}
        {activeTeachers.map((tc) => (
          <div key={tc.id} className="contents">
            <div className="sticky left-0 z-10 flex flex-col gap-1.5 border-r border-t border-muted-100 bg-content1 p-3">
              <p className="truncate text-sm font-semibold leading-none">{tc.nickname}</p>
              <TeacherTypeChip type={tc.type} />
              <FreelanceBudgetStrip teacher={tc} />
            </div>

            {weekDays.map((day) => {
              const items = cellBookings(tc.id, day);
              const canBook = bookableOnDate(tc, day);
              return (
                <div
                  key={day}
                  className={`min-h-24 space-y-1 border-l border-t border-muted-100 p-1.5 ${
                    canBook ? "" : "bg-muted-50/80"
                  }`}
                >
                  {items.map((b) => {
                    const accent = BOOKING_STATUS_COLOR[b.status];
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => onSelectBooking(b)}
                        className={`relative flex w-full flex-col gap-0.5 rounded-lg border-y border-r py-1.5 pl-3 pr-2 text-left transition-colors ${CAL_SURFACE_STYLE[accent]} ${CAL_SURFACE_HOVER[accent]}`}
                      >
                        {/* SPEC-046 — the left stripe carries TYPE; STATUS rides the dot beside the time. */}
                        <BookingTypeStripe type={b.bookingType} />
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${CAL_DOT_STYLE[accent]}`} />
                          {/* 🔴 TASK-326 §1 — through the helper although `toBookingDTO` already applies
                              `hhmm()`, so this cell was never showing seconds. Routed for the reason TASK-324
                              settled on: **a renderer that is correct only because a mapper in another repo is
                              correct breaks silently the day that mapper moves.** */}
                          {/* 🔴 `cal-ink` + `font-semibold` (2026-09-16). Was `muted-500`/`font-medium`: at a
                              34% fill a mid grey is the first thing to sink, and the owner asked every line in
                              the cell to share one colour. Weight, not colour, now sets the reading order. */}
                          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-cal-ink">
                            {formatTimeDisplay(b.startTime)}
                          </span>
                          {/* AC-10 — ONE name field, computed on the BE. 🚫 No `|| studentName` fallback here:
                              that is exactly the per-call-site guessing `displayName` exists to delete. */}
                          {/* `font-semibold` matches the DAY cell, which has always used it — the two views
                              rendered the same name at two different weights until now. */}
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-cal-ink">
                            {b.displayName}
                          </span>
                          {/* REQ-089 item 5 — the server's `courseLast`, as a stamp on the name row. */}
                          <LastStamp booking={b} size="sm" />
                          {/* REQ-091 — the server's rental row: red unpaid, green paid. */}
                          <RentalStamp booking={b} size="sm" />
                          {/* REQ-095 — the OTHER kind, from the server's `other.kind`. */}
                          <OtherKindTag booking={b} size="sm" />
                          {/* Branch (badge) — a primary identifier, kept as a labelled chip like the day cell. */}
                          {display.badge && (b.badges ?? []).length > 0 && (
                            <span className="flex shrink-0 flex-wrap justify-end gap-1">
                              {(b.badges ?? []).map((bd) => (
                                /* 🔴 WHITE ground + a 1px border in the branch colour (2026-09-16). The soft
                                   tint it used to sit on is the same KIND of colour the cell fill is — two
                                   washes stacked — so the owner read it as *"ดูกลืนเกินไป"*, and deepening the
                                   fill only closed the gap further. An opaque white ground keeps the same
                                   distance from every status at every intensity; the hue survives on the
                                   border and the label, so a branch is still recognised by colour.
                                   🚫 `badgeColorSoftVar` is untouched — Badges, BookingModal, Dashboard and
                                   Overview paint on white already and read fine there. */
                                <span
                                  key={bd.valueId}
                                  className="inline-flex items-center gap-1 rounded-full border bg-white px-1.5 py-px text-[9px] font-medium leading-tight"
                                  style={{
                                    borderColor: badgeColorVar(bd.color ?? "gray"),
                                    color: badgeColorVar(bd.color ?? "gray"),
                                  }}
                                >
                                  {bd.label}
                                </span>
                              ))}
                            </span>
                          )}
                        </span>
                        <BookingCellBody booking={b} display={display} />
                        {/* AC-18 — names the OTHER teachers on a shared booking, so three columns read as one
                            booking rather than three meetings. Renders nothing when there is only one teacher. */}
                        <SharedTeachersMarker booking={b} inColumnOf={tc.id} />
                      </button>
                    );
                  })}

                  {canBook && mayBook && (
                    <button
                      type="button"
                      onClick={() => onCreate(tc.id, TIME_SLOTS[0], day)}
                      /* Only the GLYPH was strengthened (`muted-300` → `muted-500`, 14 → 16): beside a 34% fill
                         the plus had faded to almost nothing, and it is the primary way staff create a booking.
                         🚫 The dashed border and the hover wash stay as they were — an empty slot is meant to
                         read as empty, and darkening its outline would give every free cell on the grid a
                         presence it should not have. */
                      className="flex w-full items-center justify-center rounded-lg border border-dashed border-muted-200 py-1 text-muted-500 transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                      aria-label={t("calendar.addBooking")}
                    >
                      <Plus size={16} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}
