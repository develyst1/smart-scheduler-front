"use client";

import { useState } from "react";
import dayjs from "dayjs";
import { Spinner, useDisclosure } from "@heroui/react";
import { useBookingsByDate, useTeachers } from "@/hooks/scheduler";
import type { Booking } from "@/types/app/scheduler";
import CalendarHeader from "./CalendarHeader";
import CalendarGrid from "./CalendarGrid";
import BookingModal from "./Modal/BookingModal";

export default function CalendarContent() {
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const { data: teachers = [], isLoading: loadingTeachers } = useTeachers();
  const { data: bookings = [], isLoading: loadingBookings } = useBookingsByDate(date);

  const { isOpen, onOpen, onClose } = useDisclosure();
  const [selected, setSelected] = useState<Booking | undefined>();
  const [createSlot, setCreateSlot] = useState<
    { teacherId: string; time: string; date: string } | undefined
  >();

  const openView = (booking: Booking) => {
    setSelected(booking);
    setCreateSlot(undefined);
    onOpen();
  };

  const openCreate = (teacherId: string, time: string) => {
    setSelected(undefined);
    setCreateSlot({ teacherId, time, date });
    onOpen();
  };

  return (
    <div className="space-y-5">
      <CalendarHeader date={date} onChangeDate={setDate} />

      {loadingTeachers || loadingBookings ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner label="กำลังโหลดตาราง..." />
        </div>
      ) : (
        <CalendarGrid
          teachers={teachers}
          bookings={bookings}
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
