"use client";

import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { Loader } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { calendarDayBookings, calendarToBookings } from "@/lib/api/mappers";
import { bookableOnDate } from "@/lib/scheduler/work-days";
import { useT } from "@/lib/i18n";
import { useBadges, useCalendar, usePausedBookings, useTeachers } from "@/hooks/scheduler";
import type { Booking } from "@/types/app/scheduler";
import CalendarHeader, { type CalendarView } from "./CalendarHeader";
import CalendarGrid from "./CalendarGrid";
import CalendarWeekGrid from "./CalendarWeekGrid";
import BookingModal from "./Modal/BookingModal";
import PausedTray from "./PausedTray";

export default function CalendarContent() {
  const t = useT();
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [view, setView] = useState<CalendarView>("week");
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedBadgeValueIds, setSelectedBadgeValueIds] = useState<string[]>([]);
  const [studentQuery, setStudentQuery] = useState("");

  // Week starts on Monday. dayjs weeks default to Sunday, so pull Sunday back to the prior Monday.
  const weekStart = dayjs(date).day(dayjs(date).day() === 0 ? -6 : 1);
  const weekDays = Array.from({ length: 7 }, (_, i) => weekStart.add(i, "day").format("YYYY-MM-DD"));

  const calView = view === "day" ? "day" : "week";
  const { data: teachers = [], isLoading: loadingTeachers } = useTeachers();
  const { data: calendar, isLoading: loadingCalendar } = useCalendar(date, calView);
  const { data: badgeTypes = [] } = useBadges();
  // REQ-076 AC-9 — the tray's own list. Deliberately NOT filtered by the calendar's date/teacher/badge
  // controls: a paused booking has no place in the grid, so hiding it behind a date filter would put it
  // nowhere at all. It is the whole set, always.
  const { data: pausedPage, isLoading: loadingPaused } = usePausedBookings();
  const pausedBookings = pausedPage?.items ?? [];

  // Badge filter (OR): keep bookings carrying at least one selected badge value.
  const byBadge = (list: Booking[]) =>
    selectedBadgeValueIds.length === 0
      ? list
      : list.filter((b) =>
          (b.badges ?? []).some((bd) => selectedBadgeValueIds.includes(bd.valueId)),
        );

  // Student search (REQ-038 #3): case-insensitive substring on what the booking is CALLED. Composes with byBadge.
  //
  // TASK-227 — reads `displayName`, not `studentName`: an อื่นๆ booking may have no student at all, and a
  // search that cannot match the words printed on the cell in front of you is worse than no search.
  const byStudent = (list: Booking[]) => {
    const q = studentQuery.trim().toLowerCase();
    return q ? list.filter((b) => b.displayName.toLowerCase().includes(q)) : list;
  };

  const dayBookings = useMemo(
    () => byStudent(byBadge(calendar ? calendarDayBookings(calendar, date) : [])),
    [calendar, date, selectedBadgeValueIds, studentQuery],
  );
  const weekBookings = useMemo(
    () => byStudent(byBadge(calendar && view === "week" ? calendarToBookings(calendar) : [])),
    [calendar, view, selectedBadgeValueIds, studentQuery],
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
        badgeTypes={badgeTypes}
        selectedBadgeValueIds={selectedBadgeValueIds}
        onChangeBadgeValueIds={setSelectedBadgeValueIds}
        studentQuery={studentQuery}
        onChangeStudentQuery={setStudentQuery}
      />

      {/* 🔴 SPEC-075 / REQ-076 AC-9/AC-10 (TASK-261) — the พัก tray sits BESIDE the grid, never inside it.
          A paused booking has no scheduled slot, and anything dateless dropped into a dated grid is invisible
          or wrong — REQ-078's DEF-4, stated in advance.

          The layout answers TASK-261's two open questions, and both answers are deliberate:

          Q1 — WHERE. A right-hand rail, but only from `2xl` (1536) up — **and the arithmetic decided that
          breakpoint, not taste.** At 1280 with the sidebar expanded the main area is 976px
          (1280 − 256 sidebar − 48 `p-6`), while the week grid's own minimum is 1210px (160 + 7×150): it is
          **already scrolling horizontally before this task touched anything.** A 17rem rail plus its gap takes
          292px more, leaving 684px — about 3.5 day columns where there were 5.4. That is too much of the
          schedule to spend at the very width AC-9 is judged at. At `2xl` the same rail leaves the grid 940px,
          which costs it nothing it was not already paying.

          Q2 — EVERYTHING NARROWER, 1280 INCLUDED. A horizontal STRIP above the grid: not a count, and never a
          disappearance. 🚫 A tray that vanishes at a breakpoint fails AC-9 for whoever is on a laptop that day,
          and a bare count fails AC-12, which asks for rows that can be told apart without opening either. As a
          strip it costs one card of height, keeps all three AC-12 fields per row, and scrolls sideways when
          there are many — so the grid keeps its full width and the tray is still the first thing under the
          header. `min-w-0` on the grid column is what lets it shrink inside the flex row rather than pushing
          the page wider than the viewport. */}
      <div className="2xl:hidden">
        <PausedTray bookings={pausedBookings} loading={loadingPaused} onSelect={openView} layout="strip" />
      </div>

      <div className="flex flex-col gap-5 2xl:flex-row 2xl:items-start">
        <div className="min-w-0 flex-1">
          {loading ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-sm text-muted-500">
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
        </div>

        <aside className="hidden w-[17rem] shrink-0 2xl:block">
          <PausedTray bookings={pausedBookings} loading={loadingPaused} onSelect={openView} layout="rail" />
        </aside>
      </div>

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
