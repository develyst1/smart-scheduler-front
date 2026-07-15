"use client";

import dayjs from "dayjs";
import "dayjs/locale/th";
import { ActionIcon, Button, MultiSelect, Paper, SegmentedControl, Tooltip } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { ChevronLeft, ChevronRight, CalendarDays, UserSearch, Users, Tag } from "lucide-react";
import { StatusChip } from "@/components/common/BookingBadges";
import { TeacherOption, teacherSelectData } from "@/components/common/TeacherOption";
import type { BadgeType, TeacherType, TeacherView } from "@/types/app/scheduler";
import { TEACHER_TYPE_LABEL } from "@/types/app/scheduler";
import { bookableOnDate } from "@/lib/scheduler/work-days";
import { useI18n } from "@/lib/i18n";
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
  selectedTypes?: string[];
  onChangeTypes?: (types: string[]) => void;
  badgeTypes?: BadgeType[];
  selectedBadgeValueIds?: string[];
  onChangeBadgeValueIds?: (ids: string[]) => void;
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
  selectedTypes = [],
  onChangeTypes,
  badgeTypes = [],
  selectedBadgeValueIds = [],
  onChangeBadgeValueIds,
}: Props) {
  const { lang, t } = useI18n();
  // Grouped select data: one group per badge type, active values only.
  const badgeSelectData = badgeTypes
    .filter((bt) => bt.active)
    .map((bt) => ({
      group: bt.name,
      items: bt.values
        .filter((v) => v.active)
        .map((v) => ({ value: v.id, label: v.label })),
    }))
    .filter((g) => g.items.length > 0);
  const d = dayjs(date).locale(lang);
  const step = view === "week" ? 7 : 1;
  const shift = (n: number) => onChangeDate(d.add(n * step, "day").format("YYYY-MM-DD"));
  const isToday = date === dayjs().format("YYYY-MM-DD");

  // th → Thai weekday + Buddhist era; en → Gregorian English.
  const dayLabel =
    lang === "th"
      ? `วัน${THAI_DAYS[d.day()]} ที่ ${d.format("D MMMM")} พ.ศ. ${d.year() + 543}`
      : d.format("dddd, D MMMM YYYY");
  const weekLabel = (() => {
    const start = dayjs(weekDays[0]).locale(lang);
    const end = dayjs(weekDays[6]).locale(lang);
    return lang === "th"
      ? `${start.format("D MMM")} – ${end.format("D MMM")} พ.ศ. ${end.year() + 543}`
      : `${start.format("D MMM")} – ${end.format("D MMM YYYY")}`;
  })();

  return (
    <Paper withBorder p="sm" className="flex flex-col gap-3 bg-content1">
      {/* แถวบน: ชื่อช่วงวัน + ปุ่มควบคุม | legend สถานะ */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="pl-1 text-base font-semibold tracking-tight text-foreground">
            {view === "week" ? weekLabel : dayLabel}
          </span>

          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              size="sm"
              radius="md"
              value={view}
              onChange={(v) => onChangeView(v as CalendarView)}
              data={[
                { label: t("calendar.daily"), value: "day" },
                { label: t("calendar.weekly"), value: "week" },
              ]}
            />

            <Tooltip label={view === "week" ? t("calendar.prevWeek") : t("calendar.prevDay")}>
              <ActionIcon variant="default" size="lg" radius="md" onClick={() => shift(-1)} aria-label={t("calendar.prev")}>
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
              aria-label={t("calendar.pickDate")}
            />

            <Tooltip label={view === "week" ? t("calendar.nextWeek") : t("calendar.nextDay")}>
              <ActionIcon variant="default" size="lg" radius="md" onClick={() => shift(1)} aria-label={t("calendar.next")}>
                <ChevronRight size={18} />
              </ActionIcon>
            </Tooltip>

            <Button
              variant={isToday ? "filled" : "light"}
              size="sm"
              radius="md"
              onClick={() => onChangeDate(dayjs().format("YYYY-MM-DD"))}
            >
              {t("calendar.today")}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_LEGEND.map((status) => (
            <StatusChip key={status} status={status} size="md" />
          ))}
        </div>
      </div>

      {/* แถวล่าง: ตัวกรองครูผู้สอน */}
      {teachers.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 border-t border-default-100 pt-3">
          <MultiSelect
            label={t("calendar.teacher")}
            placeholder={selectedTeacherIds.length > 0 ? undefined : t("calendar.allTeachers")}
            value={selectedTeacherIds}
            onChange={onChangeTeacherIds}
            data={teacherSelectData(
              teachers.filter((t) => {
                const available = view === "day" ? bookableOnDate(t, date) : t.bookable;
                return available && (selectedTypes.length === 0 || selectedTypes.includes(t.type));
              }),
            )}
            renderOption={({ option }) => <TeacherOption option={option} teachers={teachers} />}
            leftSection={<UserSearch size={15} />}
            size="sm"
            radius="md"
            clearable
            searchable
            maxDropdownHeight={280}
            className="min-w-52 basis-0 grow-[6]"
            classNames={{
              // pills อยู่แถวเดียว เลื่อนแนวนอนแทนการ wrap ขึ้นบรรทัดใหม่
              pillsList: "!flex-nowrap overflow-x-auto scroll-smooth py-0.5",
              inputField: "min-w-12",
            }}
            aria-label={t("calendar.filterTeacher")}
          />

          <MultiSelect
            label={t("calendar.type")}
            placeholder={selectedTypes.length > 0 ? undefined : t("calendar.allTypes")}
            value={selectedTypes}
            onChange={onChangeTypes}
            data={(Object.keys(TEACHER_TYPE_LABEL) as TeacherType[]).map((type) => ({
              value: type,
              label: TEACHER_TYPE_LABEL[type],
            }))}
            leftSection={<Users size={15} />}
            size="sm"
            radius="md"
            clearable
            searchable
            maxDropdownHeight={280}
            className="min-w-44 basis-0 grow-[4]"
            classNames={{
              pillsList: "!flex-nowrap overflow-x-auto scroll-smooth py-0.5",
            }}
            aria-label={t("calendar.filterType")}
          />

          {badgeSelectData.length > 0 && (
            <MultiSelect
              label={t("calendar.badge")}
              placeholder={selectedBadgeValueIds.length > 0 ? undefined : t("calendar.allBadges")}
              value={selectedBadgeValueIds}
              onChange={onChangeBadgeValueIds}
              data={badgeSelectData}
              leftSection={<Tag size={15} />}
              size="sm"
              radius="md"
              clearable
              searchable
              maxDropdownHeight={280}
              className="min-w-44 basis-0 grow-[4]"
              classNames={{
                pillsList: "!flex-nowrap overflow-x-auto scroll-smooth py-0.5",
              }}
              aria-label={t("calendar.filterBadge")}
            />
          )}
        </div>
      )}
    </Paper>
  );
}
