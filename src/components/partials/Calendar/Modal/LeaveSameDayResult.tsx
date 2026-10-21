"use client";

import { Button, Group, Stack, Text } from "@mantine/core";
import { useT } from "@/lib/i18n";
import { formatTimeDisplay } from "@/lib/ui/format";
import type { OwnLeaveResult } from "@/types/api/contract";
import { LeaveCannotNote, LeaveContinuesRow } from "../LeaveClassRow";

/**
 * 🔴 **TASK-829 (REQ-125 K1) — what a teacher's own SAME-DAY leave DID, when a co-taught class was involved** (TEST-111: a class left as it is was surfaced to nobody, because the dialog closed on a toast).
 *
 * 🔑 Shown ONLY when the act's answer carries `continues` / `toHandle` (the back sends those keys only when a co-taught class was involved); a sole-teacher-only day keeps today's toast + close, byte for byte.
 * The answer is read AS SENT: the approved headline «{n} sessions cancelled · {families} families told» (its counts are the classes REALLY cancelled — a continuing or left-as-is class is not one);
 * the cancelled classes (their ids are in the answer, their times and names in the day's rows the dialog holds); each CONTINUING class with the approved «Continues with {names}» tag; each class
 * LEFT AS IT IS (D4) with the approved D4 sentence — naming the class's main teacher, which on this door is the teacher themself (no name is guessed: a class not among the rows gets no sentence).
 */
export default function LeaveSameDayResult({
  res,
  rows,
  onClose,
}: {
  res: OwnLeaveResult;
  /** the day's classes this dialog already holds — ONLY to name a class's time / child / main teacher, never to count */
  rows: readonly { id: string; startTime: string; displayName?: string; teachers: readonly { name: string; nickname?: string | null }[] }[];
  onClose: () => void;
}) {
  const t = useT();
  const cancelled = res.bookingIds.flatMap((id) => rows.filter((r) => r.id === id));
  return (
    <Stack gap="sm" data-leave-same-day>
      <Text fw={600}>{t("teacherLeave.done", { n: res.cancelled, families: res.familiesNotified })}</Text>
      {cancelled.length > 0 && (
        <Stack gap={2} data-leave-same-day-cancelled={cancelled.length}>
          {cancelled.map((r) => (
            <Group key={r.id} gap="xs" wrap="nowrap">
              <Text size="sm" className="tabular-nums" w={96}>
                {formatTimeDisplay(r.startTime)}
              </Text>
              <Text size="sm" className="min-w-0 flex-1 truncate">
                {r.displayName ?? ""}
              </Text>
            </Group>
          ))}
        </Stack>
      )}
      {(res.continues?.length ?? 0) > 0 && (
        <Stack gap={2} data-leave-same-day-continues={res.continues?.length}>
          {res.continues?.map((c) => (
            <LeaveContinuesRow key={c.bookingId} c={c} />
          ))}
        </Stack>
      )}
      {(res.toHandle?.length ?? 0) > 0 && (
        <Stack gap={4} data-leave-same-day-left={res.toHandle?.length}>
          {res.toHandle?.map((x) => {
            const main = rows.find((r) => r.id === x.bookingId)?.teachers[0];
            const name = main?.nickname || main?.name;
            return name ? (
              <LeaveCannotNote key={x.bookingId} name={name} startTime={x.startTime} />
            ) : (
              <Text key={x.bookingId} size="xs" c="orange" className="tabular-nums" data-leave-d4>
                {formatTimeDisplay(x.startTime)}
              </Text>
            );
          })}
        </Stack>
      )}
      {/* 🔴 K1 — said ONLY when the back says an admin was actually alerted (`adminsAlerted > 0`, sent only when a class was left as it is): "has been told" must be true, and with no linked admin it is not. */}
      {(res.adminsAlerted ?? 0) > 0 && (
        <Text size="xs" c="dimmed" data-leave-admin-told>
          {t("leaveDays.adminToldLeftAsIs")}
        </Text>
      )}
      <Group justify="flex-end">
        <Button onClick={onClose}>{t("common.close")}</Button>
      </Group>
    </Stack>
  );
}
