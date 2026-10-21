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
  PauseCircle,
  Ban,
} from "lucide-react";
import { BookingTypeChip, TeacherTypeChip } from "@/components/common/BookingBadges";
import { TeacherOption, teacherSelectData } from "@/components/common/TeacherOption";
import { useDailyReport, useTeachers } from "@/hooks/scheduler";
import { useT } from "@/lib/i18n";
import type { DailyReport } from "@/types/app/scheduler";
import { KID_PROGRAMS } from "@/lib/scheduler/daily-report";
import { useLoadPhase } from "@/lib/ui/load-phase";
import { SKEL, SKEL_RADIUS } from "@/components/common/skeleton";

const STAT_CARDS = [
  { key: "totalBooked", labelKey: "reports.statTotalBooked", icon: Users, color: "blue" },
  { key: "attended", labelKey: "reports.statAttended", icon: CheckCircle2, color: "green" },
  { key: "confirmed", labelKey: "reports.statConfirmed", icon: Bell, color: "cyan" },
  { key: "pending", labelKey: "reports.statPending", icon: Clock, color: "orange" },
  { key: "awaiting", labelKey: "reports.statAwaiting", icon: PauseCircle, color: "gray" },
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

          {/* แยกตามรูปแบบ — ATTENDED-only row, then CONFIRMED-only row (field semantics: `DailyReport`) */}
          <BookingTypeRow title={t("reports.byTypeAttended")} items={report.byBookingTypeAttended} />
          <BookingTypeRow title={t("reports.byTypeConfirmed")} items={report.byBookingTypeConfirmed} />

          {/* Others Program — Group / ECA / Camp / Other counted by kids (field: `DailyReport["kidsByProgram"]`) */}
          <KidsByProgramCard programs={report.kidsByProgram} />

          {/* workload ต่อครู (เฉพาะตอนดูครูทุกคน) */}
          {teacherId === "ALL" && (
            <Card padding="lg">
              <Text size="sm" fw={600} mb="md">
                {t("reports.workload")}
              </Text>
              {report.byTeacher.length === 0 ? (
                <p className="text-sm text-muted-400">{t("reports.noSessions")}</p>
              ) : (
                // One tile per teacher, numbers only (no bar). Every tile has the SAME fixed skeleton so the eye
                // finds each value in the same spot on every card: name (top) → type chip (own line) → a divider
                // pinned to the bottom → two labelled cells, `attended/count` (lessons) left and `total`
                // (+ ECA/Camp/Group) right. Grid rows stretch, and `flex-1` on the head pushes the numbers down,
                // so a long, wrapping name never knocks a neighbour's numbers out of line. Each cell label reserves
                // two lines (`min-h-[2lh]`) so a label that wraps (e.g. in Thai) doesn't drop its number lower.
                // Field semantics — and the open denominator question — live on `DailyReport["byTeacher"]`.
                <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
                  {report.byTeacher.map((tc) => {
                    const type = teacherType(tc.teacherId);
                    return (
                      <Paper
                        key={tc.teacherId}
                        withBorder
                        p="md"
                        className="flex h-full flex-col bg-muted-100/50"
                      >
                        <div className="flex flex-1 flex-col items-start gap-1">
                          <span className="break-words text-sm font-medium leading-snug">
                            {teacherName(tc.teacherId)}
                          </span>
                          {type && <TeacherTypeChip type={type} />}
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-muted-200 pt-3 tabular-nums">
                          <div>
                            <p className="min-h-[2lh] text-[11px] leading-tight text-muted-500">
                              {t("reports.workloadRatioHint")}
                            </p>
                            <p className="mt-1 text-2xl font-bold leading-none">
                              {tc.attended}
                              <span className="text-muted-400">/{tc.count}</span>
                            </p>
                          </div>
                          <div className="border-l border-muted-200 pl-3">
                            <p className="min-h-[2lh] text-[11px] leading-tight text-muted-500">
                              {t("reports.workloadTotal")}
                            </p>
                            <p className="mt-1 text-2xl font-bold leading-none">{tc.total}</p>
                          </div>
                        </div>
                      </Paper>
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

/** One "By booking type (…)" card: a chip + count per booking type, in the order the report gives. */
function BookingTypeRow({
  title,
  items,
}: {
  title: string;
  items: DailyReport["byBookingTypeAttended"];
}) {
  return (
    <Card padding="lg">
      <Text size="sm" fw={600} mb="md">
        {title}
      </Text>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {items.map((item) => (
          <Paper key={item.type} withBorder p="md" className="flex items-center justify-between gap-3 bg-muted-100/50">
            <BookingTypeChip type={item.type} size="md" />
            <span className="text-xl font-bold">{item.count}</span>
          </Paper>
        ))}
      </div>
    </Card>
  );
}

/**
 * "Others Program" — kids per group program: ALWAYS four tiles (Group · ECA · Camp · Other, client request), each
 * with the program's kid total in its header and one `name … kids` line per group / school / camp / schedule.
 * A program with nothing that day keeps its tile, showing "—". Numbers carry no unit (client request). Every tile
 * keeps the same skeleton (header row, divider, list) so totals and counts sit in the same place on every card.
 * `null` kids = not recorded → "—", never a guessed 0.
 */
function KidsByProgramCard({ programs }: { programs: DailyReport["kidsByProgram"] }) {
  const t = useT();
  const kids = (n: number | null) => (n === null ? "—" : n);
  // Pad to the fixed four in fixed order, whatever the payload carries (a server may omit empty programs) — a day
  // with no program kids shows four "—" tiles.
  const shown = KID_PROGRAMS.map(
    (program) => programs.find((p) => p.program === program) ?? { program, total: null, items: [] },
  );
  return (
    <Card padding="lg">
      <Text size="sm" fw={600} mb="md">
        {t("reports.kidsByProgram")}
      </Text>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {shown.map((p) => (
          <Paper key={p.program} withBorder p="md" className="flex h-full flex-col bg-muted-100/50">
            <div className="mb-2 flex items-baseline justify-between gap-3 border-b border-muted-200 pb-2">
              <span className="text-sm font-semibold">{t(`reports.program.${p.program}`)}</span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{kids(p.total)}</span>
            </div>
            {p.items.length === 0 ? (
              <p className="m-0 text-sm">—</p>
            ) : (
              <ul className="m-0 list-none space-y-1 p-0">
                {p.items.map((item) => (
                  <li key={item.name} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 break-words">{item.name}</span>
                    <span className="shrink-0 font-semibold tabular-nums">{kids(item.kids)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Paper>
        ))}
      </div>
    </Card>
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
