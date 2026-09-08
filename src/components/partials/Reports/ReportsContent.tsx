"use client";

import { useState } from "react";
import dayjs from "dayjs";
import {
  Card,
  Skeleton,
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
import { useT } from "@/lib/i18n";
import { useLoadPhase } from "@/lib/ui/load-phase";
import { SKEL, SKEL_RADIUS } from "@/components/common/skeleton";

const STAT_CARDS = [
  { key: "totalBooked", labelKey: "reports.statTotalBooked", icon: Users, color: "blue" },
  { key: "attended", labelKey: "reports.statAttended", icon: CheckCircle2, color: "green" },
  { key: "confirmed", labelKey: "reports.statConfirmed", icon: Bell, color: "cyan" },
  { key: "pending", labelKey: "reports.statPending", icon: Clock, color: "orange" },
  { key: "reschedulePending", labelKey: "reports.statReschedulePending", icon: ArrowLeftRight, color: "red" },
  { key: "onLeave", labelKey: "reports.statOnLeave", icon: CalendarOff, color: "gray" },
  { key: "cancelled", labelKey: "reports.statCancelled", icon: Ban, color: "gray" },
] as const;

export default function ReportsContent() {
  const t = useT();
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [teacherId, setTeacherId] = useState<string>("ALL");
  const { data: teachers = [] } = useTeachers();
  const { data: report, isLoading } = useDailyReport(
    date,
    teacherId === "ALL" ? undefined : teacherId,
  );

  const phase = useLoadPhase(isLoading, report !== undefined);

  const teacherName = (id: string) => teachers.find((tc) => tc.id === id)?.nickname ?? id;
  const teacherType = (id: string) => teachers.find((tc) => tc.id === id)?.type;
  const maxTeacherCount = report?.byTeacher.reduce((m, tc) => Math.max(m, tc.count), 0) ?? 0;

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
          label={t("reports.pickDate")}
          value={date}
          onChange={(v) => v && setDate(v)}
          valueFormat="D MMM YYYY"
          size="sm"
          radius="md"
          className="max-w-56"
          leftSection={<CalendarDays size={16} />}
        />
        <Select
          label={t("reports.teacher")}
          value={teacherId}
          onChange={(v) => setTeacherId(v ?? "ALL")}
          allowDeselect={false}
          searchable
          size="sm"
          radius="md"
          className="max-w-64"
          leftSection={<User size={16} />}
          data={[{ value: "ALL", label: t("reports.allTeachers") }, ...teacherSelectData(teachers)]}
          renderOption={({ option, checked }) => (
            <TeacherOption option={option} checked={checked} teachers={teachers} />
          )}
        />
      </div>

      {/* `useDailyReport(date, teacherId)` takes a new key on every date and teacher change, so this branch runs
          on every filter press — not just the first load. It used to swap the whole report for a spinner in an
          `h-48` box; the ring and the stat cards are a fixed, known shape, so they get a frame instead.
          `!report` stays in `busy`: a resolved query with no report is still nothing to render. */}
      {phase === "skeleton" ? (
        <ReportSkeleton />
      ) : phase === "quiet" || !report ? null : (
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
                      {t("reports.attendanceRate")}
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
                        <p className="mt-1 text-xs text-muted-400">{t(s.labelKey)}</p>
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
              {t("reports.byType")}
            </Text>
            <div className="flex flex-wrap gap-3">
              {report.byBookingType.map((item) => (
                <Paper
                  key={item.type}
                  withBorder
                  p="md"
                  className="flex items-center gap-3 bg-muted-100/50"
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
                {t("reports.workload")}
              </Text>
              {report.byTeacher.length === 0 ? (
                <p className="text-sm text-muted-400">{t("reports.noSessions")}</p>
              ) : (
                <div className="space-y-3">
                  {report.byTeacher.map((tc) => {
                    const type = teacherType(tc.teacherId);
                    return (
                      <div key={tc.teacherId} className="flex items-center gap-3">
                        <div className="flex w-40 shrink-0 items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {teacherName(tc.teacherId)}
                          </span>
                          {type && <TeacherTypeChip type={type} />}
                        </div>
                        <Progress
                          className="flex-1"
                          size="lg"
                          radius="xl"
                          value={maxTeacherCount > 0 ? (tc.count / maxTeacherCount) * 100 : 0}
                          color="blue"
                        />
                        <span className="w-24 shrink-0 text-right text-xs text-muted-500">
                          {t("reports.sessionsAttended", { count: tc.count, attended: tc.attended })}
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

/**
 * The daily report's loading frame — the attendance ring and the stat cards, empty.
 *
 * The report's shape is fixed and known before the request answers (one ring, then `STAT_CARDS.length` tiles),
 * which is exactly the case a skeleton is for: it can be honest about the layout without claiming a number.
 * 🚫 No bar stands in for the ring's percentage and none for a stat's value — a placeholder is a shape, never a
 * figure. Only the boxes those figures will land in.
 */
function ReportSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[auto_1fr]" aria-busy aria-live="polite">
      <Card padding="lg" className="flex items-center justify-center">
        <Skeleton height={150} width={150} circle />
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {STAT_CARDS.map((s) => (
          <Card key={s.key} padding="md">
            <div className="flex items-center gap-3">
              <Skeleton height={42} width={42} radius="md" />
              <div className="flex-1">
                <Skeleton height={SKEL.title} width="40%" radius={SKEL_RADIUS} />
                <Skeleton height={SKEL.meta} width="65%" mt={8} radius={SKEL_RADIUS} />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
