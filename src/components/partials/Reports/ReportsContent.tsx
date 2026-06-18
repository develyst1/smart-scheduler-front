"use client";

import { useState } from "react";
import dayjs from "dayjs";
import { Card, Loader, ThemeIcon, Paper, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import {
  Users,
  CheckCircle2,
  CalendarOff,
  Clock,
  CalendarDays,
} from "lucide-react";
import { BookingTypeChip } from "@/components/common/BookingBadges";
import { useDailyReport } from "@/hooks/scheduler";

const STAT_CARDS = [
  { key: "totalBooked", label: "ลงเรียนทั้งหมด", icon: Users, color: "blue" },
  { key: "attended", label: "มาเรียนจริง", icon: CheckCircle2, color: "green" },
  { key: "onLeave", label: "ลา/ป่วย", icon: CalendarOff, color: "gray" },
  { key: "pending", label: "รอยืนยัน", icon: Clock, color: "orange" },
] as const;

export default function ReportsContent() {
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const { data: report, isLoading } = useDailyReport(date);

  return (
    <div className="space-y-6">
      <DatePickerInput
        label="เลือกวันที่"
        value={date}
        onChange={(v) => v && setDate(v)}
        valueFormat="D MMM YYYY"
        size="sm"
        radius="md"
        className="max-w-56"
        leftSection={<CalendarDays size={16} />}
      />

      {isLoading || !report ? (
        <div className="flex h-48 flex-col items-center justify-center gap-3 text-sm text-default-500">
          <Loader size="md" />
          กำลังสรุปยอด...
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {STAT_CARDS.map((s) => {
              const Icon = s.icon;
              return (
                <Card key={s.key} padding="lg">
                  <div className="flex items-center gap-4">
                    <ThemeIcon
                      variant="light"
                      color={s.color}
                      size={48}
                      radius="md"
                    >
                      <Icon size={26} />
                    </ThemeIcon>
                    <div>
                      <p className="text-3xl font-bold leading-none tracking-tight">
                        {report[s.key]}
                      </p>
                      <p className="mt-1 text-xs text-default-400">{s.label}</p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          <Card padding="lg">
            <Text size="sm" fw={600} mb="md">
              แยกตามรูปแบบการจอง
            </Text>
            <div className="flex flex-wrap gap-3">
              {report.byBookingType.map((item) => (
                <Paper
                  key={item.type}
                  withBorder
                  p="md"
                  className="flex items-center gap-3 bg-default-100/50"
                >
                  <BookingTypeChip type={item.type} size="md" />
                  <span className="text-xl font-bold">{item.count}</span>
                </Paper>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
