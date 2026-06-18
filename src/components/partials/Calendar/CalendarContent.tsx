"use client";

import { useState } from "react";
import dayjs from "dayjs";
import { Loader } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useBookingsByDate, useBookingsInRange, useTeachers } from "@/hooks/scheduler";
import type { Booking } from "@/types/app/scheduler";
import CalendarHeader, { type CalendarView } from "./CalendarHeader";
import CalendarGrid from "./CalendarGrid";
import CalendarWeekGrid from "./CalendarWeekGrid";
import BookingModal from "./Modal/BookingModal";

export default function CalendarContent() {
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [view, setView] = useState<CalendarView>("day");

  // สัปดาห์เริ่มวันอาทิตย์ (firstDayOfWeek=0) — 7 วันสำหรับ week view
  const weekStart = dayjs(date).day(0);
  const weekDays = Array.from({ length: 7 }, (_, i) => weekStart.add(i, "day").format("YYYY-MM-DD"));

  const { data: teachers = [], isLoading: loadingTeachers } = useTeachers();
  const { data: dayBookings = [], isLoading: loadingDay } = useBookingsByDate(date);
  const { data: weekBookings = [], isLoading: loadingWeek } = useBookingsInRange(
    weekDays[0],
    weekDays[6],
  );

  const [isOpen, { open: onOpen, close: onClose }] = useDisclosure(false);
  const [selected, setSelected] = useState<Booking | undefined>();
  const [createSlot, setCreateSlot] = useState<
    { teacherId: string; time: string; date: string } | undefined
  >();

  const openView = (booking: Booking) => {
    setSelected(booking);
    setCreateSlot(undefined);
    onOpen();
  };

  const openCreate = (teacherId: string, time: string, createDate: string = date) => {
    setSelected(undefined);
    setCreateSlot({ teacherId, time, date: createDate });
    onOpen();
  };

  const loading = loadingTeachers || (view === "day" ? loadingDay : loadingWeek);

  return (
    <div className="space-y-5">
      <CalendarHeader
        date={date}
        onChangeDate={setDate}
        view={view}
        onChangeView={setView}
        weekDays={weekDays}
      />

      {loading ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 text-sm text-default-500">
          <Loader size="md" />
          กำลังโหลดตาราง...
        </div>
      ) : view === "day" ? (
        <CalendarGrid
          teachers={teachers}
          bookings={dayBookings}
          onSelectBooking={openView}
          onCreate={openCreate}
        />
      ) : (
        <CalendarWeekGrid
          teachers={teachers}
          weekDays={weekDays}
          bookings={weekBookings}
          onSelectBooking={openView}
          onCreate={openCreate}
        />
      )}

      <BookingModal
        isOpen={isOpen}
        onClose={onClose}
        booking={selected}
        createSlot={createSlot}
        teachers={teachers}
      />
    </div>
  );
}
