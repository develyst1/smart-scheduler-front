"use client";

import { useState } from "react";
import { Button, Group, Modal, Stack, Text, Textarea } from "@mantine/core";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { notify } from "@/lib/ui/notify";
import { useMarkCampDay } from "@/hooks/scheduler/useCamp";
import { formatDateDisplay } from "@/lib/ui/format";
import type { CampDayEntry } from "@/types/api/contract";

/**
 * REQ-095 Stage 3b (TASK-404) — UNDO an attended/absent camp day: back to PLANNED with a reason. ONE call, the same
 * route and key as a mark (`PATCH /camp/days/:id { status: "PLANNED", reason }`, `camp.day-mark`). The reason is
 * required; its bounds (3..200) are the server's — a refusal shows the server's sentence and keeps the text. The
 * credit that comes back is the server's `package`; the roster and the card re-read.
 */
export default function UndoDayDialog({ entry, date, opened, onClose }: { entry: CampDayEntry; date: string; opened: boolean; onClose: () => void }) {
  const t = useT();
  const mark = useMarkCampDay();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    try {
      await mark.mutateAsync({ dayId: entry.dayId, status: "PLANNED", reason });
      notify({ title: t("camp.undoneOk", { name: entry.studentName }), color: "success" });
      onClose();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : (e as Error).message);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} centered size="sm" title={t("camp.undoTitle")}>
      <Stack gap="sm">
        <Text size="sm">
          {t("camp.undoLine", { name: entry.studentName, date: formatDateDisplay(date), status: t(`camp.status_${entry.status}`) })}
        </Text>
        <Textarea
          label={t("camp.undoReason")}
          placeholder={t("camp.undoReasonHint")}
          value={reason}
          onChange={(e) => setReason(e.currentTarget.value)}
          autosize
          minRows={2}
          required
          error={error}
          data-autofocus
        />
        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button color="orange" loading={mark.isPending} disabled={reason.trim().length === 0} onClick={() => void submit()}>
            {t("camp.undo")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
