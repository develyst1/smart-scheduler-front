"use client";

import { Plus } from "lucide-react";
import { TeacherTypeChip } from "@/components/common/BookingBadges";
import type { Booking, TeacherView } from "@/types/app/scheduler";
import { BOOKING_STATUS_COLOR, TIME_SLOTS } from "@/types/app/scheduler";
import { badgeColorSoftVar, badgeColorVar } from "@/lib/ui/badge-colors";
import { useCellDisplay, type CellDisplay } from "@/lib/scheduler/cell-display";
import { useT } from "@/lib/i18n";
import FreelanceBudgetStrip from "./FreelanceBudgetStrip";
import CalendarLegendBar from "./CalendarLegendBar";
import { BOOKING_TYPE_ICON, BOOKING_TYPE_VAR } from "@/components/common/BookingCellBody";
import { useCellDisplay } from "@/lib/scheduler/cell-display";

interface Props {
  teachers: TeacherView[];
  bookings: Booking[];
  onSelectBooking: (booking: Booking) => void;
  onCreate: (teacherId: string, time: string) => void;
}

// พื้น/ขอบการ์ดตามสถานะ (พื้นอ่อน ขอบเข้ม) — คงสัญญาณสถานะที่พื้นการ์ดไว้
const CARD_STYLE: Record<string, string> = {
  primary: "bg-primary/10 border-primary/30 hover:bg-primary/15",
  success: "bg-success/10 border-success/30 hover:bg-success/15",
  warning: "bg-warning/10 border-warning/40 hover:bg-warning/15",
  secondary: "bg-secondary/10 border-secondary/30 hover:bg-secondary/15",
  danger: "bg-danger/10 border-danger/30 hover:bg-danger/15",
  default: "bg-muted-100 border-muted-300 hover:bg-muted-200",
};

// สี dot สถานะ (จุดกลมหน้าชื่อ) — แถบซ้าย = ประเภท
const DOT_STYLE: Record<string, string> = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  secondary: "bg-secondary",
  danger: "bg-danger",
  default: "bg-muted-400",
};

export default function CalendarGrid({ teachers, bookings, onSelectBooking, onCreate }: Props) {
  const t = useT();
  // Display-only preference (SPEC-046) — shared with the week grid via the cell-display store. It hides lines,
  // it never filters bookings, so the day cell honours the SAME toggles the week cell does.
  const { display } = useCellDisplay();
  const activeTeachers = teachers.filter((tt) => tt.bookable);

  const findBooking = (teacherId: string, time: string) =>
    bookings.find(
      (b) =>
        b.teacherId === teacherId &&
        b.startTime === time &&
        !b.pendingSlot &&
        b.status !== "CANCELLED",
    );

  return (
    <div className="rounded-2xl border border-muted-200 bg-content1 shadow-sm">
      <CalendarLegendBar />
      <div className="overflow-auto rounded-b-2xl">
        <div
          className="grid min-w-max"
          style={{ gridTemplateColumns: `72px repeat(${activeTeachers.length}, minmax(160px, 1fr))` }}
        >
        {/* Header row */}
        <div className="sticky left-0 top-0 z-20 border-b border-r border-muted-200 bg-content1 p-3 text-xs font-medium text-muted-400">
          {t("calendar.time")}
        </div>
        {activeTeachers.map((tc) => (
          <div
            key={tc.id}
            className="sticky top-0 z-10 flex flex-col items-center gap-1.5 border-b border-l border-muted-100 bg-content1 p-3"
          >
            <p className="truncate text-sm font-semibold leading-none">{tc.nickname}</p>
            <TeacherTypeChip type={tc.type} />
            <FreelanceBudgetStrip teacher={tc} />
          </div>
        ))}

        {/* Time rows */}
        {TIME_SLOTS.map((time) => (
          <Row
            key={time}
            time={time}
            teachers={activeTeachers}
            findBooking={findBooking}
            onSelectBooking={onSelectBooking}
            onCreate={onCreate}
            display={display}
          />
        ))}
        </div>
      </div>
    </div>
  );
}

function Row({
  time,
  teachers,
  findBooking,
  onSelectBooking,
  onCreate,
  display,
}: {
  time: string;
  teachers: TeacherView[];
  findBooking: (teacherId: string, time: string) => Booking | undefined;
  onSelectBooking: (b: Booking) => void;
  onCreate: (teacherId: string, time: string) => void;
  display: CellDisplay;
}) {
  const t = useT();
  // TASK-191 — the cells live HERE, so this is where the shared preference must be read. One Context, one state:
  // the original bug was two independent `useState`s that could disagree.
  const { display } = useCellDisplay();
  return (
    <>
      <div className="sticky left-0 z-10 flex items-start justify-end border-r border-t border-muted-100 bg-content1 p-2 pr-3 text-xs font-medium text-muted-500">
        {time}
      </div>
      {teachers.map((tc) => {
        const booking = findBooking(tc.id, time);
        const accent = booking ? BOOKING_STATUS_COLOR[booking.status] : "default";
        return (
          <div key={tc.id} className="min-h-20 border-l border-t border-muted-100 p-1.5">
            {booking ? (
              <button
                type="button"
                onClick={() => onSelectBooking(booking)}
                className={`relative flex h-full w-full flex-col gap-1 overflow-hidden rounded-xl border-y border-r p-2 pl-3 text-left shadow-sm transition-shadow hover:shadow-md ${CARD_STYLE[accent]}`}
              >
                {/* SPEC-046 — the left stripe carries TYPE (the stable commercial channel), matching the week cell;
                    STATUS rides the dot beside the name. Two competing stripes on one card would make neither
                    dimension readable, which is the collision REQ-052 exists to avoid. */}
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-1 rounded-l-xl"
                  style={{ backgroundColor: `rgb(${BOOKING_TYPE_VAR[booking.bookingType]})` }}
                />
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${DOT_STYLE[accent]}`} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {booking.nickname || booking.studentName}
                  </span>
                  {/* Branch (badge) — a primary identifier here, so it stays a labelled chip, never a bare dot. */}
                  {display.badge && (booking.badges ?? []).length > 0 && (
                    <span className="flex shrink-0 flex-wrap justify-end gap-1">
                      {(booking.badges ?? []).map((bd) => (
                        <span
                          key={bd.valueId}
                          className="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-medium leading-tight"
                          style={{
                            backgroundColor: badgeColorSoftVar(bd.color ?? "gray"),
                            color: badgeColorVar(bd.color ?? "gray"),
                          }}
                        >
                          <span
                            aria-hidden
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: badgeColorVar(bd.color ?? "gray") }}
                          />
                          {bd.label}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                {/* type · program on one line — AC-4: the day view keeps the FULL program name (it may wrap, never truncates). */}
                {(display.type || (display.program && booking.subject)) && (
                  <span className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-[11px] text-muted-600">
                    {display.type && (
                      <>
                        {(() => {
                          const Icon = BOOKING_TYPE_ICON[booking.bookingType];
                          return (
                            <Icon
                              size={11}
                              aria-hidden
                              className="shrink-0"
                              style={{ color: `rgb(${BOOKING_TYPE_VAR[booking.bookingType]})` }}
                            />
                          );
                        })()}
                        <span className="shrink-0 font-medium">{t(`bookingType.${booking.bookingType}`)}</span>
                      </>
                    )}
                    {display.type && display.program && booking.subject && (
                      <span className="shrink-0 text-muted-300">·</span>
                    )}
                    {display.program && booking.subject && <span className="min-w-0">{booking.subject}</span>}
                  </span>
                )}
                {/* REQ-068 — the session note as a neutral-bordered callout so it reads as a note, not more meta. */}
                {display.note && booking.attendeeNote && (
                  <span
                    className="truncate border-l-2 border-muted-300 pl-1.5 text-[11px] text-muted-500"
                    title={booking.attendeeNote}
                  >
                    {booking.attendeeNote}
                  </span>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onCreate(tc.id, time)}
                className="flex h-full min-h-16 w-full items-center justify-center rounded-xl border border-dashed border-muted-200 text-muted-300 transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                aria-label={t("calendar.addBooking")}
              >
                <Plus size={16} />
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}
