"use client";

import { useState } from "react";
import dayjs from "dayjs";
import Link from "next/link";
import { Badge, Button, Group, Loader, Modal, Stack, Text } from "@mantine/core";
import { StatusChip } from "@/components/common/BookingBadges";
import { useT } from "@/lib/i18n";
import { formatDateWithDay, formatTimeDisplay } from "@/lib/ui/format";
import { useCan, useMe } from "@/hooks/scheduler/useMe";
import { hasMenu } from "@/lib/rbac/menus";
import { useTeacherLeaveDays } from "@/hooks/scheduler";
import type { LeaveDayClass, LeaveDayRow } from "@/types/api/contract";
import CancelLeaveButton from "./CancelLeaveButton";
import LiftRangeConfirm from "./LiftRangeConfirm";

/** The child (DUO: both) — nickname first, as everywhere else on the calendar. Empty when an older server sent no names. */
export const leaveClassWho = (c: LeaveDayClass): string => {
  const one = c.childNickname || c.childName || "";
  const two = c.coChildNickname || c.coChildName || "";
  return one && two ? `${one} + ${two}` : one || two;
};
/** The program, or an "other" row's title. Empty when an older server sent neither. */
export const leaveClassWhat = (c: LeaveDayClass): string => c.program || c.title || "";

/** The days of ONE leave: the whole range when the record has a `rangeId`, otherwise the one day. Date order; the server's own rows, never re-derived. */
export const daysOfLeave = (rows: readonly LeaveDayRow[], teacherId: string, date: string, rangeId: string | null | undefined): LeaveDayRow[] =>
  rows
    .filter((r) => r.teacherId === teacherId && (rangeId ? r.rangeId === rangeId : r.date === date))
    .sort((a, b) => a.date.localeCompare(b.date));

/**
 * 🔴 **TASK-820 (REQ-123 P3 + P4) — the leave PANEL a calendar chip opens: this leave's days, the classes on each (WHO · WHAT · when · status), "Open", and Cancel.**
 *
 * 🔑 **It shows and it cancels the LEAVE; it never changes a CLASS.** Each class has an "Open" that hands the admin to the existing booking modal (move / change teacher /
 * cancel, as today) — nothing is bulk-changed from here. Cancel leave is the approved 814 control, per FUTURE day; a RANGE adds "Cancel all future days" (one call, one LINE).
 * ⚠️ A range can run past the week on screen, so the panel asks for THIS teacher's days around the chip's date (a range is at most 31 days, so every day of it is within 31
 * of any other) — and shows the chip's own row until that answer is in.
 */
export default function LeaveDayPanel({
  opened,
  onClose,
  row,
  onOpenClass,
  seeAll = false,
}: {
  opened: boolean;
  onClose: () => void;
  /** The chip's own recorded day — what the panel shows until the teacher's days arrive. */
  row: LeaveDayRow;
  onOpenClass: (c: LeaveDayClass) => void;
  /** 🔴 TASK-821 — offer "See all teacher leave →" (the list on the Teachers page). Passed by the calendar's chip; 🚫 not by the list itself, which is already there. */
  seeAll?: boolean;
}) {
  const t = useT();
  const can = useCan();
  const { access } = useMe();
  const [rangeOpen, setRangeOpen] = useState(false);
  const { data, isLoading } = useTeacherLeaveDays(row.teacherId, dayjs(row.date).subtract(31, "day").format("YYYY-MM-DD"), dayjs(row.date).add(31, "day").format("YYYY-MM-DD"), opened);
  const days = data ? daysOfLeave(data, row.teacherId, row.date, row.rangeId) : [row];
  const shown = days.length > 0 ? days : [row];
  const today = dayjs().format("YYYY-MM-DD");
  const first = shown[0].date;
  const last = shown[shown.length - 1].date;
  const isRange = Boolean(row.rangeId) && shown.length > 1;
  const anyFuture = shown.some((d) => d.date > today);

  return (
    <Modal opened={opened} onClose={onClose} title={t("leaveDays.panelTitle", { name: row.teacherName })} size="lg" centered data-leave-panel={`${row.teacherId}|${row.date}`}>
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {t("leaveDays.panelNote")}
        </Text>
        {shown[0].reason && (
          <Text size="sm">
            <b>{t("teacherLeave.reason")}:</b> {shown[0].reason}
          </Text>
        )}
        {isLoading && <Loader size="xs" />}
        <Stack gap="sm" data-leave-panel-days={shown.length}>
          {shown.map((d) => (
            <div key={d.date} data-leave-panel-day={d.date}>
              <Group justify="space-between" gap="xs" wrap="nowrap">
                <Group gap="xs">
                  <Text size="sm" fw={600} className="tabular-nums">
                    {formatDateWithDay(d.date)}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {d.bookings.length > 0 ? t("teacherLeave.rangeDayClasses", { n: d.bookings.length }) : t("teacherLeave.rangeDayNone")}
                  </Text>
                </Group>
                <CancelLeaveButton teacherId={d.teacherId} teacherName={d.teacherName} date={d.date} />
              </Group>
              {d.bookings.length > 0 && (
                <Stack gap={4} mt={4}>
                  {d.bookings.map((c) => (
                    <Group key={c.id} gap="xs" wrap="nowrap" data-leave-panel-class={c.id}>
                      <Text size="sm" className="tabular-nums" w={96}>
                        {formatTimeDisplay(c.startTime)} – {formatTimeDisplay(c.endTime)}
                      </Text>
                      <Text size="sm" className="min-w-0 flex-1 truncate">
                        {[leaveClassWho(c), leaveClassWhat(c)].filter(Boolean).join(" · ")}
                      </Text>
                      <StatusChip status={c.status} />
                      <Button size="compact-xs" variant="light" onClick={() => onOpenClass(c)} data-leave-class-open={c.id}>
                        {t("leaveDays.panelOpen")}
                      </Button>
                    </Group>
                  ))}
                </Stack>
              )}
            </div>
          ))}
        </Stack>
        {isRange && anyFuture && can("action:calendar.status") && (
          <Group justify="flex-end">
            <Badge variant="light" color="gray">
              {formatDateWithDay(first)} – {formatDateWithDay(last)}
            </Badge>
            <Button color="red" variant="light" size="xs" onClick={() => setRangeOpen(true)} data-leave-cancel-range={row.rangeId}>
              {t("leaveDays.cancelRange")}
            </Button>
          </Group>
        )}
        {/* 🔴 TASK-821 — only for an admin who HAS the Teachers menu (else the link would bounce at the route guard): the list lives on that page, no new route or menu. */}
        {seeAll && hasMenu(access, "menu:teachers") && (
          <Link href="/scheduler/teachers#teacher-leave" className="text-sm underline underline-offset-2" data-leave-see-all>
            {t("leaveDays.seeAll")}
          </Link>
        )}
        {rangeOpen && row.rangeId && (
          <LiftRangeConfirm opened onClose={() => setRangeOpen(false)} rangeId={row.rangeId} teacherName={row.teacherName} from={first} to={last} />
        )}
      </Stack>
    </Modal>
  );
}
