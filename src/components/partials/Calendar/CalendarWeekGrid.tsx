"use client";

import dayjs from "dayjs";
import "dayjs/locale/th";
import { Plus } from "lucide-react";
import { TeacherTypeChip } from "@/components/common/BookingBadges";
import type { Booking, TeacherView } from "@/types/app/scheduler";
import { bookableOnDate } from "@/lib/scheduler/work-days";
import { BOOKING_STATUS_COLOR, TIME_SLOTS } from "@/types/app/scheduler";
import { useI18n } from "@/lib/i18n";

interface Props {
  teachers: TeacherView[];
  weekDays: string[]; // 7 วัน (YYYY-MM-DD) เรียงตามลำดับ
  bookings: Booking[];
  onSelectBooking: (booking: Booking) => void;
  onCreate: (teacherId: string, time: string, date: string) => void;
}

// แถบสีบาง ๆ ด้านซ้ายของ chip ตามสถานะ
const DOT_STYLE: Record<string, string> = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  secondary: "bg-secondary",
  danger: "bg-danger",
  default: "bg-default-400",
};

const CHIP_STYLE: Record<string, string> = {
  primary: "bg-primary/10 hover:bg-primary/15",
  success: "bg-success/10 hover:bg-success/15",
  warning: "bg-warning/10 hover:bg-warning/15",
  secondary: "bg-secondary/10 hover:bg-secondary/15",
  danger: "bg-danger/10 hover:bg-danger/15",
  default: "bg-default-100 hover:bg-default-200",
};

export default function CalendarWeekGrid({
  teachers,
  weekDays,
  bookings,
  onSelectBooking,
  onCreate,
}: Props) {
  const { lang, t } = useI18n();
  const activeTeachers = teachers.filter((tc) => tc.bookable);
  const today = dayjs().format("YYYY-MM-DD");

  const cellBookings = (teacherId: string, date: string) =>
    bookings
      .filter(
        (b) =>
          b.teacherId === teacherId &&
          b.date === date &&
          !b.pendingSlot &&
          b.status !== "CANCELLED",
      )
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <div className="overflow-auto rounded-2xl border border-default-200 bg-content1 shadow-sm">
      <div
        className="grid min-w-max"
        style={{ gridTemplateColumns: `160px repeat(7, minmax(150px, 1fr))` }}
      >
        {/* Header row */}
        <div className="sticky left-0 top-0 z-20 border-b border-r border-default-200 bg-content1 p-3 text-xs font-medium text-default-400">
          {t("calendar.teacherDay")}
        </div>
        {weekDays.map((day) => {
          const d = dayjs(day).locale(lang);
          const isToday = day === today;
          return (
            <div
              key={day}
              className={`sticky top-0 z-10 border-b border-l border-default-100 p-2 text-center ${
                isToday ? "bg-primary/10" : "bg-content1"
              }`}
            >
              <p className={`text-sm font-semibold leading-none ${isToday ? "text-primary" : ""}`}>
                {d.format("dd")}
              </p>
              <p className="mt-1 text-xs text-default-400">{d.format("D MMM")}</p>
            </div>
          );
        })}

        {/* Teacher rows */}
        {activeTeachers.map((tc) => (
          <div key={tc.id} className="contents">
            <div className="sticky left-0 z-10 flex flex-col gap-1.5 border-r border-t border-default-100 bg-content1 p-3">
              <p className="truncate text-sm font-semibold leading-none">{tc.nickname}</p>
              <TeacherTypeChip type={tc.type} />
            </div>

            {weekDays.map((day) => {
              const items = cellBookings(tc.id, day);
              const canBook = bookableOnDate(tc, day);
              return (
                <div
                  key={day}
                  className={`min-h-24 space-y-1 border-l border-t border-default-100 p-1.5 ${
                    canBook ? "" : "bg-default-50/80"
                  }`}
                >
                  {items.map((b) => {
                    const accent = BOOKING_STATUS_COLOR[b.status];
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => onSelectBooking(b)}
                        className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition-colors ${CHIP_STYLE[accent]}`}
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${DOT_STYLE[accent]}`} />
                        <span className="shrink-0 text-[11px] font-medium text-default-500">
                          {b.startTime}
                        </span>
                        <span className="truncate text-xs font-medium">{b.studentName}</span>
                      </button>
                    );
                  })}

                  {canBook && (
                    <button
                      type="button"
                      onClick={() => onCreate(tc.id, TIME_SLOTS[0], day)}
                      className="flex w-full items-center justify-center rounded-lg border border-dashed border-default-200 py-1 text-default-300 transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                      aria-label={t("calendar.addBooking")}
                    >
                      <Plus size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
