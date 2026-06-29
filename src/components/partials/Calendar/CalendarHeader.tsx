"use client";

import dayjs from "dayjs";
import "dayjs/locale/th";
import { ActionIcon, Button, MultiSelect, Paper, SegmentedControl, Tooltip } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { ChevronLeft, ChevronRight, CalendarDays, UserSearch } from "lucide-react";
import { StatusChip } from "@/components/common/BookingBadges";
import type { TeacherView } from "@/types/app/scheduler";
import { TEACHER_TYPE_LABEL } from "@/types/app/scheduler";
import { STATUS_LEGEND } from "./Calendar.config";

export type CalendarView = "day" | "week";

interface Props {
  date: string;
  onChangeDate: (date: string) => void;
  view: CalendarView;
  onChangeView: (view: CalendarView) => void;
  weekDays: string[];
  teachers?: TeacherView[];
  selectedTeacherIds?: string[];
  onChangeTeacherIds?: (ids: string[]) => void;
}

const THAI_DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

export default function CalendarHeader({
  date,
  onChangeDate,
  view,
  onChangeView,
  weekDays,
  teachers = [],
  selectedTeacherIds = [],
  onChangeTeacherIds,
}: Props) {
  const d = dayjs(date).locale("th");
  const step = view === "week" ? 7 : 1;
  const shift = (n: number) => onChangeDate(d.add(n * step, "day").format("YYYY-MM-DD"));
  const isToday = date === dayjs().format("YYYY-MM-DD");

  const dayLabel = `วัน${THAI_DAYS[d.day()]} ที่ ${d.format("D MMMM")} พ.ศ. ${d.year() + 543}`;
  const weekLabel = (() => {
    const start = dayjs(weekDays[0]).locale("th");
    const end = dayjs(weekDays[6]).locale("th");
    return `${start.format("D MMM")} – ${end.format("D MMM")} พ.ศ. ${end.year() + 543}`;
  })();

  return (
    <Paper
      withBorder
      p="sm"
      className="flex flex-wrap items-end justify-between gap-3 bg-content1"
    >
      <div className="flex flex-col gap-1.5">
        <span className="pl-1 text-base font-semibold tracking-tight text-foreground">
          {view === "week" ? weekLabel : dayLabel}
        </span>

        <div className="flex items-center gap-2">
          <SegmentedControl
            size="sm"
            radius="md"
            value={view}
            onChange={(v) => onChangeView(v as CalendarView)}
            data={[
              { label: "รายวัน", value: "day" },
              { label: "รายสัปดาห์", value: "week" },
            ]}
          />

          <Tooltip label={view === "week" ? "สัปดาห์ก่อนหน้า" : "วันก่อนหน้า"}>
            <ActionIcon variant="default" size="lg" radius="md" onClick={() => shift(-1)} aria-label="ก่อนหน้า">
              <ChevronLeft size={18} />
            </ActionIcon>
          </Tooltip>

          <DatePickerInput
            value={date}
            onChange={(v) => v && onChangeDate(v)}
            valueFormat="D MMM YYYY"
            size="sm"
            radius="md"
            popoverProps={{ withinPortal: true }}
            leftSection={<CalendarDays size={16} />}
            className="min-w-52"
            aria-label="เลือกวันที่"
          />

          <Tooltip label={view === "week" ? "สัปดาห์ถัดไป" : "วันถัดไป"}>
            <ActionIcon variant="default" size="lg" radius="md" onClick={() => shift(1)} aria-label="ถัดไป">
              <ChevronRight size={18} />
            </ActionIcon>
          </Tooltip>

          <Button
            variant={isToday ? "filled" : "light"}
            size="sm"
            radius="md"
            onClick={() => onChangeDate(dayjs().format("YYYY-MM-DD"))}
          >
            วันนี้
          </Button>
        </div>

        {teachers.length > 0 && (
          <MultiSelect
            placeholder="ครูทั้งหมด"
            value={selectedTeacherIds}
            onChange={onChangeTeacherIds}
            data={teachers
              .filter((t) => t.bookable)
              .map((t) => ({
                value: t.id,
                label: `${t.nickname} · ${TEACHER_TYPE_LABEL[t.type]}`,
              }))}
            leftSection={<UserSearch size={15} />}
            size="sm"
            radius="md"
            clearable
            searchable
            maxDropdownHeight={280}
            className="max-w-xs"
            aria-label="กรองครู"
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_LEGEND.map((l) => (
          <StatusChip key={l.status} status={l.status} size="md" />
        ))}
      </div>
    </Paper>
  );
}
