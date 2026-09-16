"use client";

import { BOOKING_TYPE_ICON, BOOKING_TYPE_VAR } from "@/components/common/BookingCellBody";
import { BOOKING_STATUS_ICON } from "@/components/common/BookingBadges";
import type { BookingType } from "@/types/app/scheduler";
import { BOOKING_STATUS_COLOR } from "@/types/app/scheduler";
import { CAL_SURFACE_STYLE } from "./calendar-status";
import { useT } from "@/lib/i18n";
import { STATUS_LEGEND } from "./Calendar.config";
import CellDisplayMenu from "./CellDisplayMenu";

/**
 * AC-9 — the legend lists the types in the same order the booking modal offers them.
 *
 * ⚠️ TASK-227 **checked this instead of assuming it**: the array is hand-written, NOT derived from
 * `BOOKING_TYPE_ICON`, so widening `BookingType` adds no row here and the compiler says nothing. A new type
 * must be added on this line, or it renders in the grid under a legend that cannot explain it.
 */
const BOOKING_TABS_LEGEND: BookingType[] = [
  "FIRST_TRIAL",
  "SINGLE_SESSION",
  "COURSE_PACKAGE",
  "VOUCHER",
  "OTHER",
];

/**
 * SPEC-046 AC-9 — the cell legend, sitting on top of the grid it explains rather than in the header: staff read a
 * chip's meaning and drop their eyes straight into the table below it. Names BOTH dimensions — status and type are
 * different questions about the same cell — and carries the display toggle at the end.
 *
 * Rendered as a NON-scrolling strip inside the grid card, above the horizontally-scrolling grid body, so it stays
 * put while the teacher columns scroll sideways.
 */
export default function CalendarLegendBar() {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-t-2xl border-b border-muted-200 bg-content1 px-3 py-2">
      <span className="text-[11px] font-medium text-muted-500">{t("calendar.legendStatus")}</span>
      {/* 🔴 The legend is a SAMPLE of the cell, not a second way of drawing a status (2026-09-16, owner review).
          It used to render Mantine `StatusChip`s, which read `MANTINE_COLOR` — so after the grid moved to the
          `cal-*` ramp the strip that exists to say *"this colour means ลา"* was showing a different colour from
          the cells right below it. A legend that disagrees with its grid is worse than no legend, because staff
          trust it and then misread the schedule.
          ⇒ same fill and border straight from `CAL_SURFACE_STYLE`, with the same per-status icon used by
          `StatusChip` everywhere else. Shape now carries the meaning alongside colour again.
          🚫 `StatusChip` itself is untouched — `BookingsTable`, `PlanModal` and `BookingModal` sit on white and
          read fine as they are. */}
      {STATUS_LEGEND.map((status) => {
        const accent = BOOKING_STATUS_COLOR[status];
        const Icon = BOOKING_STATUS_ICON[status];
        return (
          <span
            key={status}
            /* `font-bold` + `uppercase` restore what the Mantine `Badge` did before this was hand-rolled: its
               label ships at 700 and upper-cased, so dropping both made the legend read lighter and softer than
               the strip staff were used to. ⚠️ `uppercase` is visible in ENGLISH only — Thai has no case — which
               is exactly why it was easy to lose: the default language here shows the difference, the toggle
               does not. The CELL keeps its own weights; this is the legend's own label, not a sample of the
               cell's typography. */
            className={`inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] font-bold uppercase text-cal-ink ${CAL_SURFACE_STYLE[accent]}`}
          >
            <Icon size={13} strokeWidth={2.25} aria-hidden className="shrink-0" />
            {t(`bookingStatus.${status}`)}
          </span>
        );
      })}
      <span aria-hidden className="mx-1 h-4 w-px bg-muted-200" />
      <span className="text-[11px] font-medium text-muted-500">{t("calendar.legendType")}</span>
      {BOOKING_TABS_LEGEND.map((bt) => {
        const Icon = BOOKING_TYPE_ICON[bt];
        return (
          /* Nudged up a step (11px → 12px, swatch 10×4 → 12×6, icon 11 → 13). The status row beside it gained a
             border, a background and bold uppercase text, which left these reading as a footnote to it rather
             than as the other half of the same legend — they answer an equally important question about a cell. */
          <span key={bt} className="flex items-center gap-1.5 text-xs text-muted-600">
            <span
              aria-hidden
              className="h-3 w-1.5 rounded-sm"
              style={{ backgroundColor: `rgb(${BOOKING_TYPE_VAR[bt]})` }}
            />
            <Icon size={13} aria-hidden />
            {t(`bookingType.${bt}`)}
          </span>
        );
      })}
      <span aria-hidden className="mx-1 h-4 w-px bg-muted-200" />
      {/* REQ-089 item 5 — the stamp, explained. Same chip as the cell (same key), so the legend IS the sample. */}
      <span className="flex items-center gap-1 text-[11px] text-muted-600">
        <span className="inline-flex items-center rounded-sm bg-neutral-900 px-1.5 py-px text-[9px] font-bold uppercase leading-tight tracking-wide text-white">
          {t("calendar.lastStamp")}
        </span>
        {t("calendar.lastLegend")}
      </span>
      <div className="ml-auto">
        <CellDisplayMenu />
      </div>
    </div>
  );
}
