"use client";

import { useState } from "react";
import dayjs from "dayjs";
import { Button, Card, Group, Loader, SegmentedControl, Stack, Text } from "@mantine/core";
import { useT } from "@/lib/i18n";
import { formatDateWithDay } from "@/lib/ui/format";
import { useCan } from "@/hooks/scheduler/useMe";
import { useLeaveDays } from "@/hooks/scheduler";
import type { LeaveDayRow } from "@/types/api/contract";
import CancelLeaveButton from "@/components/partials/Calendar/CancelLeaveButton";
import LeaveChip from "@/components/partials/Calendar/LeaveChip";
import LiftRangeConfirm from "@/components/partials/Calendar/LiftRangeConfirm";

/** One leave as the admin thinks of it: a RANGE is one record (its days share a `rangeId`), a single day is its own. */
export interface LeaveRecord {
  key: string;
  teacherId: string;
  teacherName: string;
  rangeId: string | null;
  from: string;
  to: string;
  reason: string | null;
  classes: number;
  /** the record's first day as the server sent it — what the panel is opened on */
  first: LeaveDayRow;
  days: number;
}

/** The server's rows → records. Pure: no date maths — the rows are the server's, in the order asked for here (`from` ascending). */
export const leaveRecordsOf = (rows: readonly LeaveDayRow[]): LeaveRecord[] => {
  const byKey = new Map<string, LeaveDayRow[]>();
  for (const r of rows) {
    const key = r.rangeId ? `range:${r.rangeId}` : `day:${r.teacherId}:${r.date}`;
    byKey.set(key, [...(byKey.get(key) ?? []), r]);
  }
  return [...byKey.entries()].map(([key, days]) => {
    const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
    return {
      key,
      teacherId: sorted[0].teacherId,
      teacherName: sorted[0].teacherName,
      rangeId: sorted[0].rangeId ?? null,
      from: sorted[0].date,
      to: sorted[sorted.length - 1].date,
      reason: sorted[0].reason,
      classes: sorted.reduce((n, d) => n + d.bookings.length, 0),
      first: sorted[0],
      days: sorted.length,
    };
  });
};

/** Records grouped under their teacher, the teacher with the NEXT leave first (the list is already in date order). */
export const groupByTeacher = (records: readonly LeaveRecord[]): { teacherId: string; teacherName: string; records: LeaveRecord[] }[] => {
  const groups: { teacherId: string; teacherName: string; records: LeaveRecord[] }[] = [];
  for (const r of records) {
    const g = groups.find((x) => x.teacherId === r.teacherId);
    if (g) g.records.push(r);
    else groups.push({ teacherId: r.teacherId, teacherName: r.teacherName, records: [r] });
  }
  return groups;
};

/**
 * 🔴 **TASK-819 (BE) → TASK-821 — "Teacher leave" on the Teachers page: every teacher's leave, upcoming first, then past (REQ-123 P5).**
 *
 * 🔑 One read, the existing `GET /teacher-leave-days?from&to` (the server allows a PAST window and answers at most 92 days; the two windows here are 92 and 91 days):
 * **Upcoming** = today … +91 days, **Past** = the 91 days before today. A leave row names the teacher, its days (a range is ONE row), the classes on them and the reason;
 * pressing it opens TASK-820's panel (days, who/what, Open, Cancel). Cancel is TASK-814's approved control for a one-day record, and "Cancel all future days" for a range.
 * 🚫 Nothing here changes a class. 📌 No `enabled` gate for a teacher-scoped session (the calendar's strip needs one): this page is behind `menu:teachers`, which a linked teacher's
 * account does not hold, so they can never mount it — and the list reads the same `useLeaveDays` the page's other mounts would, with no session read of its own.
 * 📌 The windows are computed from "today" only to ASK; which days are future for Cancel is each control's own rule (and the server's).
 */
export default function TeacherLeaveList() {
  const t = useT();
  const can = useCan();
  const [mode, setMode] = useState<"upcoming" | "past">("upcoming");
  const [rangeFor, setRangeFor] = useState<LeaveRecord | null>(null);
  const today = dayjs();
  const from = mode === "upcoming" ? today.format("YYYY-MM-DD") : today.subtract(91, "day").format("YYYY-MM-DD");
  const to = mode === "upcoming" ? today.add(91, "day").format("YYYY-MM-DD") : today.subtract(1, "day").format("YYYY-MM-DD");
  const { data, isLoading } = useLeaveDays(from, to, true);

  // upcoming: the nearest first (the server's order); past: the most recent first
  const rows = data ? (mode === "upcoming" ? data : [...data].reverse()) : [];
  const groups = groupByTeacher(leaveRecordsOf(rows));
  const todayIso = today.format("YYYY-MM-DD");

  return (
    <Card padding="md" id="teacher-leave" data-teacher-leave-list>
      <Group justify="space-between" mb="sm">
        <p className="text-sm font-semibold">{t("leaveDays.listTitle")}</p>
        <SegmentedControl
          size="xs"
          value={mode}
          onChange={(v) => setMode(v as "upcoming" | "past")}
          data={[
            { value: "upcoming", label: t("leaveDays.listUpcoming") },
            { value: "past", label: t("leaveDays.listPast") },
          ]}
        />
      </Group>
      {isLoading && <Loader size="xs" />}
      {!isLoading && groups.length === 0 && (
        <Text size="sm" c="dimmed" data-teacher-leave-empty={mode}>
          {mode === "upcoming" ? t("leaveDays.listEmptyUpcoming") : t("leaveDays.listEmptyPast")}
        </Text>
      )}
      <Stack gap="md">
        {groups.map((g) => (
          <div key={g.teacherId} data-teacher-leave-group={g.teacherId}>
            <p className="mb-1 text-sm font-semibold text-muted-500">{g.teacherName}</p>
            <Stack gap={6}>
              {g.records.map((r) => {
                const span = r.days > 1 || r.from !== r.to ? `${formatDateWithDay(r.from)} – ${formatDateWithDay(r.to)}` : formatDateWithDay(r.from);
                const parts = [span, r.days > 1 ? t("leaveDays.listDays", { n: r.days }) : null, r.classes > 0 ? t("teacherLeave.rangeDayClasses", { n: r.classes }) : t("teacherLeave.rangeDayNone")];
                return (
                  <Group key={r.key} justify="space-between" wrap="nowrap" gap="xs" data-teacher-leave-record={r.key}>
                    <div className="min-w-0">
                      <LeaveChip row={r.first} text={parts.filter(Boolean).join(" · ")} />
                      {r.reason && (
                        <Text size="xs" c="dimmed">
                          {r.reason}
                        </Text>
                      )}
                    </div>
                    {/* 🔴 Cancel: the approved 814 control for a ONE-DAY record (it asks the key and the date itself); a RANGE with a day still ahead gets the range's own button. */}
                    {r.rangeId === null ? (
                      <CancelLeaveButton teacherId={r.teacherId} teacherName={r.teacherName} date={r.from} />
                    ) : (
                      r.to > todayIso &&
                      can("action:calendar.status") && (
                        <Button size="compact-xs" color="red" variant="light" onClick={() => setRangeFor(r)} data-teacher-leave-cancel-range={r.rangeId}>
                          {t("leaveDays.cancelRange")}
                        </Button>
                      )
                    )}
                  </Group>
                );
              })}
            </Stack>
          </div>
        ))}
      </Stack>
      {rangeFor?.rangeId && <LiftRangeConfirm opened onClose={() => setRangeFor(null)} rangeId={rangeFor.rangeId} teacherName={rangeFor.teacherName} from={rangeFor.from} to={rangeFor.to} />}
    </Card>
  );
}
