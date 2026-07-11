"use client";

import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { Loader } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { calendarDayBookings, calendarToBookings } from "@/lib/api/mappers";
import { bookableOnDate } from "@/lib/scheduler/work-days";
import { useT } from "@/lib/i18n";
import { useCalendar, useTeachers } from "@/hooks/scheduler";
import type { Booking } from "@/types/app/scheduler";
import CalendarHeader, { type CalendarView } from "./CalendarHeader";
import CalendarGrid from "./CalendarGrid";
import CalendarWeekGrid from "./CalendarWeekGrid";
import BookingModal from "./Modal/BookingModal";

export default function CalendarContent() {
  const t = useT();
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [view, setView] = useState<CalendarView>("day");
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  const weekStart = dayjs(date).day(0);
  const weekDays = Array.from({ length: 7 }, (_, i) => weekStart.add(i, "day").format("YYYY-MM-DD"));

  const calView = view === "day" ? "day" : "week";
  const { data: teachers = [], isLoading: loadingTeachers } = useTeachers();
  const { data: calendar, isLoading: loadingCalendar } = useCalendar(date, calView);

  const dayBookings = useMemo(
    () => (calendar ? calendarDayBookings(calendar, date) : []),
    [calendar, date],
  );
  const weekBookings = useMemo(
    () => (calendar && view === "week" ? calendarToBookings(calendar) : []),
    [calendar, view],
  );

  // กรองครูตามประเภท + รายชื่อ — ว่าง = แสดงทั้งหมด
  const filteredTeachers = teachers.filter(
    (t) =>
      (selectedTypes.length === 0 || selectedTypes.includes(t.type)) &&
      (selectedTeacherIds.length === 0 || selectedTeacherIds.includes(t.id)) &&
      (view === "week" || bookableOnDate(t, date)),
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

  const openOverbook = (b: Booking) => {
    setSelected(undefined);
    setCreateSlot({ teacherId: b.teacherId, time: b.startTime, date: b.date });
  };

  const loading = loadingTeachers || loadingCalendar;

  return (
    <div className="space-y-5">
      <CalendarHeader
        date={date}
        onChangeDate={setDate}
        view={view}
        onChangeView={setView}
        weekDays={weekDays}
        teachers={teachers}
        selectedTeacherIds={selectedTeacherIds}
        onChangeTeacherIds={setSelectedTeacherIds}
        selectedTypes={selectedTypes}
        onChangeTypes={setSelectedTypes}
      />

      {loading ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 text-sm text-default-500">
          <Loader size="md" />
          {t("calendar.loading")}
        </div>
      ) : view === "day" ? (
        <CalendarGrid
          teachers={filteredTeachers}
          bookings={dayBookings}
          onSelectBooking={openView}
          onCreate={openCreate}
        />
      ) : (
        <CalendarWeekGrid
          teachers={filteredTeachers}
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
        bookings={view === "day" ? dayBookings : weekBookings}
        onOverbook={openOverbook}
      />
    </div>
  );
}
