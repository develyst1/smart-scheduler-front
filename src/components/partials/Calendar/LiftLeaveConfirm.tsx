"use client";

import { useState } from "react";
import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useT } from "@/lib/i18n";
import { notify } from "@/lib/ui/notify";
import { useLiftTeacherLeave } from "@/hooks/scheduler";

/**
 * 🔴 **TASK-814 — the confirm for "Cancel leave" on a FUTURE leave day** (the owner's 10-17 ask; copy APPROVED, verbatim).
 *
 * 🔑 It acts on the LEAVE only: `DELETE /teacher-leave-days/:teacherId/:date` removes that one row, restores nothing, cancels
 * nothing, tells no family, and the server tells the TEACHER on LINE. The toast reads `teacherNotified`: **a number above
 * zero = told; anything else = not told, so the admin is asked to tell them** (the action-safe reading when a server older
 * than this screen sends no number). 🚫 No optimistic update: the strip changes only after the server has answered, and a
 * refusal (the server's own sentence) stays in the dialog instead of becoming a success.
 * 📌 One self-contained piece, so TASK-820 can move it from the chip into the leave panel without touching the banner.
 */
export default function LiftLeaveConfirm({
  opened,
  onClose,
  teacherId,
  teacherName,
  date,
  restoreN = 0,
}: {
  opened: boolean;
  onClose: () => void;
  teacherId: string;
  teacherName: string;
  date: string;
  /** 🔴 REQ-125 O1 — how many co-taught classes this leave day took the teacher OFF (the list's `continues` for that day): n > 0 ⇒ the approved "goes back on the {n} co-taught class(es)" body; 0 ⇒ today's body. */
  restoreN?: number;
}) {
  const t = useT();
  const lift = useLiftTeacherLeave();
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setError(null);
    onClose();
  };

  const run = async () => {
    setError(null);
    try {
      const res = await lift.mutateAsync({ teacherId, date });
      notify({
        title: t((res.teacherNotified ?? 0) > 0 ? "leaveDays.cancelToastTold" : "leaveDays.cancelToastNotTold"),
        color: "default",
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Modal opened={opened} onClose={close} title={t("leaveDays.cancelTitle", { name: teacherName, date })} centered data-lift-leave-dialog={`${teacherId}|${date}`}>
      <Stack gap="md">
        <Text size="sm">{restoreN > 0 ? t("leaveDays.cancelBodyRestores", { name: teacherName, n: restoreN }) : t("leaveDays.cancelBody")}</Text>
        {error && (
          <Text size="sm" c="red" data-lift-leave-error>
            {error}
          </Text>
        )}
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={close} disabled={lift.isPending}>
            {t("leaveDays.cancelNo")}
          </Button>
          <Button color="red" onClick={run} loading={lift.isPending} data-lift-leave-confirm>
            {t("leaveDays.cancelYes")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
