"use client";

import { Plus } from "lucide-react";
import { TeacherTypeChip } from "@/components/common/BookingBadges";
import type { Booking, TeacherView } from "@/types/app/scheduler";
import { BOOKING_STATUS_COLOR, TIME_SLOTS } from "@/types/app/scheduler";
import { badgeColorSoftVar, badgeColorVar } from "@/lib/ui/badge-colors";
import { useT } from "@/lib/i18n";
import FreelanceBudgetStrip from "./FreelanceBudgetStrip";

interface Props {
  teachers: TeacherView[];
  bookings: Booking[];
  onSelectBooking: (booking: Booking) => void;
  onCreate: (teacherId: string, time: string) => void;
}

// แมป semantic color → คลาส bg/border แบบเรียบตา (พื้นอ่อน ขอบเข้ม)
const CARD_STYLE: Record<string, string> = {
  primary: "bg-primary/10 border-primary/30 hover:bg-primary/15",
  success: "bg-success/10 border-success/30 hover:bg-success/15",
  warning: "bg-warning/10 border-warning/40 hover:bg-warning/15",
  secondary: "bg-secondary/10 border-secondary/30 hover:bg-secondary/15",
  danger: "bg-danger/10 border-danger/30 hover:bg-danger/15",
  default: "bg-default-100 border-default-300 hover:bg-default-200",
};

// แถบสีบาง ๆ ด้านซ้ายของการ์ด ตามสถานะ
const ACCENT_STYLE: Record<string, string> = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  secondary: "bg-secondary",
  danger: "bg-danger",
  default: "bg-default-400",
};

export default function CalendarGrid({ teachers, bookings, onSelectBooking, onCreate }: Props) {
  const t = useT();
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
    <div className="overflow-auto rounded-2xl border border-default-200 bg-content1 shadow-sm">
      <div
        className="grid min-w-max"
        style={{ gridTemplateColumns: `72px repeat(${activeTeachers.length}, minmax(160px, 1fr))` }}
      >
        {/* Header row */}
        <div className="sticky left-0 top-0 z-20 border-b border-r border-default-200 bg-content1 p-3 text-xs font-medium text-default-400">
          {t("calendar.time")}
        </div>
        {activeTeachers.map((tc) => (
          <div
            key={tc.id}
            className="sticky top-0 z-10 flex flex-col items-center gap-1.5 border-b border-l border-default-100 bg-content1 p-3"
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
          />
        ))}
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
}: {
  time: string;
  teachers: TeacherView[];
  findBooking: (teacherId: string, time: string) => Booking | undefined;
  onSelectBooking: (b: Booking) => void;
  onCreate: (teacherId: string, time: string) => void;
}) {
  const t = useT();
  return (
    <>
      <div className="sticky left-0 z-10 flex items-start justify-end border-r border-t border-default-100 bg-content1 p-2 pr-3 text-xs font-medium text-default-500">
        {time}
      </div>
      {teachers.map((tc) => {
        const booking = findBooking(tc.id, time);
        const accent = booking ? BOOKING_STATUS_COLOR[booking.status] : "default";
        return (
          <div key={tc.id} className="min-h-20 border-l border-t border-default-100 p-1.5">
            {booking ? (
              <button
                type="button"
                onClick={() => onSelectBooking(booking)}
                className={`relative flex h-full w-full flex-col gap-1 overflow-hidden rounded-xl border p-2 pl-3 text-left shadow-sm transition-all hover:shadow-md ${CARD_STYLE[accent]}`}
              >
                <span className={`absolute left-0 top-0 h-full w-1 ${ACCENT_STYLE[accent]}`} />
                <span className="truncate text-sm font-semibold">{booking.studentName}</span>
                <span className="truncate text-xs text-default-500">{booking.subject}</span>
                <span className="truncate text-[10px] uppercase tracking-wide text-default-400">
                  {t(`bookingType.${booking.bookingType}`)}
                </span>
                {(booking.badges ?? []).length > 0 && (
                  <span className="flex flex-wrap gap-1">
                    {(booking.badges ?? []).map((bd) => (
                      <span
                        key={bd.valueId}
                        className="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[9px] font-medium leading-tight"
                        style={{
                          backgroundColor: badgeColorSoftVar(bd.color ?? "gray"),
                          color: badgeColorVar(bd.color ?? "gray"),
                        }}
                      >
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: badgeColorVar(bd.color ?? "gray") }}
                        />
                        {bd.label}
                      </span>
                    ))}
                  </span>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onCreate(tc.id, time)}
                className="flex h-full min-h-16 w-full items-center justify-center rounded-xl border border-dashed border-default-200 text-default-300 transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
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
