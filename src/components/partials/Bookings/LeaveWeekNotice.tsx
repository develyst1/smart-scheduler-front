"use client";

import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { AlertTriangle, Info } from "lucide-react";
import { useT } from "@/lib/i18n";
import { formatDateWithDay } from "@/lib/ui/format";
import type { CoursePreviewSession } from "@/types/app/scheduler";

/** One previewed week that falls on the teacher's leave day. `week` is the row's 1-based POSITION — what `absentWeeks` takes. */
export interface LeaveWeek {
  week: number;
  date: string;
  teacher: string;
  absent: boolean;
}

/**
 * 🔴 **TASK-815 (BE) → TASK-816 — the weeks the server flagged `teacherOnLeave`, from the preview's own rows.**
 * 🔑 `=== true`, never truthy: an older server that sends no flag claims nothing. The position is the row's index + 1, make-up rows
 * included — exactly how `absentWeeks` is counted (TASK-362). 🚫 No date comparison here: the flag is the server's one reader.
 */
export const leaveWeeksOf = (sessions: readonly CoursePreviewSession[]): LeaveWeek[] =>
  sessions.flatMap((s, i) =>
    s.teacherOnLeave === true ? [{ week: i + 1, date: s.date, teacher: s.teacher?.nickname || s.teacher?.name || "", absent: s.absent === true }] : [],
  );

/**
 * 🔴 **TASK-816 — "this class is on the teacher's leave day": a warning with ONE click to the planned absence.**
 *
 * Create refuses a class on a leave day (TEST-107), and the preview looked fine until then. An UNTICKED flagged week warns, with the
 * existing REQ-045 control as its button (the approved `plan.plannedAbsence` label); the click is the same `toggleAbsent` the row's
 * own button runs, so the plan is re-previewed by the server. 🔑 Once ticked the week turns into a calm note — an absence on a leave
 * day is fine (TASK-813) — and **keeps its flag**, so the admin still sees why. Nothing flagged ⇒ nothing is drawn.
 */
export default function LeaveWeekNotice({ weeks, pending, onTick }: { weeks: readonly LeaveWeek[]; pending: boolean; onTick: (week: number) => void }) {
  const t = useT();
  if (weeks.length === 0) return null;
  return (
    <Stack gap="xs" data-leave-week-notice={weeks.length}>
      {weeks.map((w) => {
        const vars = { name: w.teacher, date: formatDateWithDay(w.date) };
        return w.absent ? (
          <Alert key={w.week} color="gray" variant="light" icon={<Info size={16} />} data-leave-week-note={w.week}>
            <Text fz="sm">{t("plan.leaveWeekNote", vars)}</Text>
          </Alert>
        ) : (
          <Alert key={w.week} color="orange" variant="light" icon={<AlertTriangle size={16} />} title={t("plan.leaveWeekTitle", vars)} data-leave-week-warn={w.week}>
            <Group justify="space-between" align="flex-end" wrap="nowrap" gap="sm">
              <Text fz="sm">{t("plan.leaveWeekWarn", vars)}</Text>
              <Button size="xs" variant="light" color="orange" disabled={pending} onClick={() => onTick(w.week)} data-leave-week-tick={w.week}>
                {t("plan.plannedAbsence")}
              </Button>
            </Group>
          </Alert>
        );
      })}
    </Stack>
  );
}
