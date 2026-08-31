"use client";

import { StatusChip } from "@/components/common/BookingBadges";
import { BOOKING_TYPE_ICON, BOOKING_TYPE_VAR } from "@/components/common/BookingCellBody";
import type { BookingType } from "@/types/app/scheduler";
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
      {STATUS_LEGEND.map((status) => (
        <StatusChip key={status} status={status} size="md" />
      ))}
      <span aria-hidden className="mx-1 h-4 w-px bg-muted-200" />
      <span className="text-[11px] font-medium text-muted-500">{t("calendar.legendType")}</span>
      {BOOKING_TABS_LEGEND.map((bt) => {
        const Icon = BOOKING_TYPE_ICON[bt];
        return (
          <span key={bt} className="flex items-center gap-1 text-[11px] text-muted-600">
            <span
              aria-hidden
              className="h-2.5 w-1 rounded-sm"
              style={{ backgroundColor: `rgb(${BOOKING_TYPE_VAR[bt]})` }}
            />
            <Icon size={11} aria-hidden />
            {t(`bookingType.${bt}`)}
          </span>
        );
      })}
      <div className="ml-auto">
        <CellDisplayMenu />
      </div>
    </div>
  );
}
