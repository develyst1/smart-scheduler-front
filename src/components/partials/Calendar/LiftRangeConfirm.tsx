"use client";

import { useState } from "react";
import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useT } from "@/lib/i18n";
import { notify } from "@/lib/ui/notify";
import { formatDateWithDay } from "@/lib/ui/format";
import { useLiftLeaveRange } from "@/hooks/scheduler";

/**
 * 🔴 **TASK-820 — the confirm for "Cancel all future days" of a leave RANGE** (the range's twin of `LiftLeaveConfirm`, TASK-814).
 *
 * 🔑 One `DELETE /teacher-leave-ranges/:id`: the server lifts ONLY the days still ahead (days that have begun or passed stay), tells the teacher once on LINE,
 * and answers `teacherNotified`. The toast is the SAME two approved sentences as the one-day cancel, chosen the same way (a number above zero = told; anything
 * else = please tell them yourself). 🚫 No optimistic update, and a refusal (the server's own sentence — e.g. nothing left to lift) stays in the dialog.
 * ✅ The title, the body and the trigger's label are APPROVED words (owner 2026-10-17, REQ-123 Phase 1, verbatim); the two buttons and the two toasts are the approved 814 ones.
 */
export default function LiftRangeConfirm({
  opened,
  onClose,
  rangeId,
  teacherName,
  from,
  to,
  restoreN = 0,
}: {
  opened: boolean;
  onClose: () => void;
  rangeId: string;
  teacherName: string;
  from: string;
  to: string;
  /** 🔴 REQ-125 O1 — the co-taught classes the range's FUTURE days took the teacher off (the list's `continues`, summed over those days); n > 0 ⇒ the approved restoring body, 0 ⇒ today's. */
  restoreN?: number;
}) {
  const t = useT();
  const lift = useLiftLeaveRange();
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setError(null);
    onClose();
  };

  const run = async () => {
    setError(null);
    try {
      const res = await lift.mutateAsync(rangeId);
      notify({ title: t((res.teacherNotified ?? 0) > 0 ? "leaveDays.cancelToastTold" : "leaveDays.cancelToastNotTold"), color: "default" });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={close}
      title={t("leaveDays.cancelRangeTitle", { name: teacherName, from: formatDateWithDay(from), to: formatDateWithDay(to) })}
      centered
      data-lift-range-dialog={rangeId}
    >
      <Stack gap="md">
        <Text size="sm">{restoreN > 0 ? t("leaveDays.cancelRangeBodyRestores", { name: teacherName, n: restoreN }) : t("leaveDays.cancelRangeBody")}</Text>
        {error && (
          <Text size="sm" c="red" data-lift-range-error>
            {error}
          </Text>
        )}
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={close} disabled={lift.isPending}>
            {t("leaveDays.cancelNo")}
          </Button>
          <Button color="red" onClick={run} loading={lift.isPending} data-lift-range-confirm>
            {t("leaveDays.cancelYes")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
