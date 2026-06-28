"use client";

import { useState } from "react";
import dayjs from "dayjs";
import {
  Card,
  Loader,
  ThemeIcon,
  Paper,
  Text,
  Select,
  RingProgress,
  Progress,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import {
  Users,
  CheckCircle2,
  CalendarOff,
  Clock,
  CalendarDays,
  User,
  Bell,
  ArrowLeftRight,
  Ban,
} from "lucide-react";
import { BookingTypeChip, TeacherTypeChip } from "@/components/common/BookingBadges";
import { TeacherOption, teacherSelectData } from "@/components/common/TeacherOption";
import { useDailyReport, useTeachers } from "@/hooks/scheduler";

const STAT_CARDS = [
  { key: "totalBooked", label: "ลงเรียนทั้งหมด", icon: Users, color: "blue" },
  { key: "attended", label: "มาเรียนจริง", icon: CheckCircle2, color: "green" },
  { key: "confirmed", label: "ยืนยันแล้ว", icon: Bell, color: "cyan" },
  { key: "pending", label: "รอยืนยัน", icon: Clock, color: "orange" },
  { key: "reschedulePending", label: "รอผู้ปกครอง (ย้าย)", icon: ArrowLeftRight, color: "red" },
  { key: "onLeave", label: "ลา/ป่วย", icon: CalendarOff, color: "gray" },
  { key: "cancelled", label: "ยกเลิก", icon: Ban, color: "gray" },
] as const;

export default function ReportsContent() {
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [teacherId, setTeacherId] = useState<string>("ALL");
  const { data: teachers = [] } = useTeachers();
  const { data: report, isLoading } = useDailyReport(
    date,
    teacherId === "ALL" ? undefined : teacherId,
  );

  const teacherName = (id: string) => teachers.find((t) => t.id === id)?.nickname ?? id;
  const teacherType = (id: string) => teachers.find((t) => t.id === id)?.type;
  const maxTeacherCount = report?.byTeacher.reduce((m, t) => Math.max(m, t.count), 0) ?? 0;

  const rateColor =
    !report || report.attendanceRate >= 80
      ? "green"
      : report && report.attendanceRate >= 50
        ? "orange"
        : "red";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
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
        <Select
          label="ครูผู้สอน"
          value={teacherId}
          onChange={(v) => setTeacherId(v ?? "ALL")}
          allowDeselect={false}
          size="sm"
          radius="md"
          className="max-w-64"
          leftSection={<User size={16} />}
          data={[{ value: "ALL", label: "ครูทุกคน" }, ...teacherSelectData(teachers)]}
          renderOption={({ option }) => <TeacherOption option={option} teachers={teachers} />}
        />
      </div>

      {isLoading || !report ? (
        <div className="flex h-48 flex-col items-center justify-center gap-3 text-sm text-default-500">
          <Loader size="md" />
          กำลังสรุปยอด...
        </div>
      ) : (
        <>
          {/* อัตราการมาเรียน + stat ครบสถานะ */}
          <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
            <Card padding="lg" className="flex items-center justify-center">
              <RingProgress
                size={150}
                thickness={12}
                roundCaps
                sections={[{ value: report.attendanceRate, color: rateColor }]}
                label={
                  <div className="text-center">
                    <Text size="xl" fw={700} lh={1}>
                      {report.attendanceRate}%
                    </Text>
                    <Text size="xs" c="dimmed">
                      อัตรามาเรียน
                    </Text>
                    <Text size="xs" c="dimmed">
                      {report.attended}/{report.totalBooked}
                    </Text>
                  </div>
                }
              />
            </Card>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {STAT_CARDS.map((s) => {
                const Icon = s.icon;
                return (
                  <Card key={s.key} padding="md">
                    <div className="flex items-center gap-3">
                      <ThemeIcon variant="light" color={s.color} size={42} radius="md">
                        <Icon size={22} />
                      </ThemeIcon>
                      <div>
                        <p className="text-2xl font-bold leading-none tracking-tight">
                          {report[s.key]}
                        </p>
                        <p className="mt-1 text-xs text-default-400">{s.label}</p>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* แยกตามรูปแบบ */}
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

          {/* workload ต่อครู (เฉพาะตอนดูครูทุกคน) */}
          {teacherId === "ALL" && (
            <Card padding="lg">
              <Text size="sm" fw={600} mb="md">
                จำนวนคาบต่อครู (workload)
              </Text>
              {report.byTeacher.length === 0 ? (
                <p className="text-sm text-default-400">ไม่มีคาบเรียนในวันนี้</p>
              ) : (
                <div className="space-y-3">
                  {report.byTeacher.map((t) => {
                    const type = teacherType(t.teacherId);
                    return (
                      <div key={t.teacherId} className="flex items-center gap-3">
                        <div className="flex w-40 shrink-0 items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {teacherName(t.teacherId)}
                          </span>
                          {type && <TeacherTypeChip type={type} />}
                        </div>
                        <Progress
                          className="flex-1"
                          size="lg"
                          radius="xl"
                          value={maxTeacherCount > 0 ? (t.count / maxTeacherCount) * 100 : 0}
                          color="blue"
                        />
                        <span className="w-24 shrink-0 text-right text-xs text-default-500">
                          {t.count} คาบ · มา {t.attended}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
