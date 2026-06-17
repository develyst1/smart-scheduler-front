"use client";

import { Plus } from "lucide-react";
import { TeacherTypeChip } from "@/components/common/BookingBadges";
import type { Booking, Teacher } from "@/types/app/scheduler";
import {
  BOOKING_STATUS_COLOR,
  BOOKING_TYPE_LABEL,
  TIME_SLOTS,
} from "@/types/app/scheduler";

interface Props {
  teachers: Teacher[];
  bookings: Booking[];
  onSelectBooking: (booking: Booking) => void;
  onCreate: (teacherId: string, time: string) => void;
}

// แมป HeroUI color → คลาส bg/border แบบเรียบตา (พื้นอ่อน ขอบเข้ม)
const CARD_STYLE: Record<string, string> = {
  primary: "bg-primary/10 border-primary/40 hover:bg-primary/20",
  success: "bg-success/10 border-success/40 hover:bg-success/20",
  warning: "bg-warning/10 border-warning/50 hover:bg-warning/20",
  secondary: "bg-secondary/10 border-secondary/40 hover:bg-secondary/20",
  danger: "bg-danger/10 border-danger/40 hover:bg-danger/20",
  default: "bg-default-100 border-default-300 hover:bg-default-200",
};

export default function CalendarGrid({ teachers, bookings, onSelectBooking, onCreate }: Props) {
  const activeTeachers = teachers.filter((t) => t.active);

  const findBooking = (teacherId: string, time: string) =>
    bookings.find((b) => b.teacherId === teacherId && b.startTime === time);

  return (
    <div className="overflow-auto rounded-2xl border border-default-200 bg-content1">
      <div
        className="grid min-w-max"
        style={{ gridTemplateColumns: `80px repeat(${activeTeachers.length}, minmax(150px, 1fr))` }}
      >
        {/* Header row */}
        <div className="sticky left-0 top-0 z-20 border-b border-r border-default-200 bg-content1 p-3 text-xs font-medium text-default-400">
          เวลา
        </div>
        {activeTeachers.map((t) => (
          <div
            key={t.id}
            className="sticky top-0 z-10 border-b border-default-200 bg-content1 p-3 text-center"
          >
            <p className="truncate text-sm font-semibold">{t.nickname}</p>
            <div className="mt-1 flex justify-center">
              <TeacherTypeChip type={t.type} />
            </div>
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
  teachers: Teacher[];
  findBooking: (teacherId: string, time: string) => Booking | undefined;
  onSelectBooking: (b: Booking) => void;
  onCreate: (teacherId: string, time: string) => void;
}) {
  return (
    <>
      <div className="sticky left-0 z-10 flex items-start justify-end border-r border-default-200 bg-content1 p-2 pr-3 text-xs font-medium text-default-500">
        {time}
      </div>
      {teachers.map((t) => {
        const booking = findBooking(t.id, time);
        return (
          <div key={t.id} className="min-h-20 border-b border-default-100 p-1.5">
            {booking ? (
              <button
                type="button"
                onClick={() => onSelectBooking(booking)}
                className={`flex h-full w-full flex-col gap-1 rounded-lg border p-2 text-left transition-colors ${
                  CARD_STYLE[BOOKING_STATUS_COLOR[booking.status]]
                }`}
              >
                <span className="truncate text-sm font-medium">{booking.studentName}</span>
                <span className="truncate text-xs text-default-500">{booking.subject}</span>
                <span className="truncate text-[10px] text-default-400">
                  {BOOKING_TYPE_LABEL[booking.bookingType]}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onCreate(t.id, time)}
                className="flex h-full min-h-16 w-full items-center justify-center rounded-lg border border-dashed border-default-200 text-default-300 transition-colors hover:border-primary/40 hover:text-primary"
                aria-label="เพิ่มการจอง"
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
