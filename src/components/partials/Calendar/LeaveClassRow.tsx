"use client";

import { Button, Group, Text } from "@mantine/core";
import { StatusChip } from "@/components/common/BookingBadges";
import { useT } from "@/lib/i18n";
import { formatTimeDisplay } from "@/lib/ui/format";
import type { LeaveDayClass } from "@/types/api/contract";

/** The child (DUO: both) — nickname first, as everywhere else on the calendar. Empty when an older server sent no names. */
export const leaveClassWho = (c: LeaveDayClass): string => {
  const one = c.childNickname || c.childName || "";
  const two = c.coChildNickname || c.coChildName || "";
  return one && two ? `${one} + ${two}` : one || two;
};
/** The program, or an "other" row's title. Empty when an older server sent neither. */
export const leaveClassWhat = (c: LeaveDayClass): string => c.program || c.title || "";

/**
 * 🔴 **TASK-820 → TASK-822 — ONE class on a leave day: time · who · what · status · "Open".** Shared by the leave PANEL (TASK-820) and the leave DIALOG's result (TASK-822), so the two
 * can never describe the same class differently. 🔑 `onOpen` absent ⇒ no "Open" at all (the teacher's own result: a teacher is not handed the admin's booking modal). The words are
 * the approved ones ("Open" = `leaveDays.panelOpen`); the data attributes are the panel's own, unchanged.
 */
export default function LeaveClassRow({ c, onOpen }: { c: LeaveDayClass; onOpen?: (c: LeaveDayClass) => void }) {
  const t = useT();
  return (
    <Group gap="xs" wrap="nowrap" data-leave-panel-class={c.id}>
      <Text size="sm" className="tabular-nums" w={96}>
        {formatTimeDisplay(c.startTime)} – {formatTimeDisplay(c.endTime)}
      </Text>
      <Text size="sm" className="min-w-0 flex-1 truncate">
        {[leaveClassWho(c), leaveClassWhat(c)].filter(Boolean).join(" · ")}
      </Text>
      <StatusChip status={c.status} />
      {onOpen && (
        <Button size="compact-xs" variant="light" onClick={() => onOpen(c)} data-leave-class-open={c.id}>
          {t("leaveDays.panelOpen")}
        </Button>
      )}
    </Group>
  );
}
