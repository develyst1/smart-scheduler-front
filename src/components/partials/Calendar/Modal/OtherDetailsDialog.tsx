"use client";

import { useState } from "react";
import { Alert, Button, Group, Modal, Stack, Text } from "@mantine/core";
import { AlertTriangle } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { useUpdateBookingOther } from "@/hooks/scheduler";
import { draftFromFacts, otherSchedulePatch, type OtherScheduleDraft } from "@/lib/scheduler/other-schedule";
import type { Booking, TeacherView } from "@/types/app/scheduler";
import OtherScheduleFields from "./OtherScheduleFields";

/**
 * REQ-095 Stage 1 (TASK-395) — edit the three facts on an existing OTHER booking through THEIR route
 * (`PATCH /bookings/:id/other` — not the move, which notifies). The body is only what changed against the server's
 * `other` facts (`otherSchedulePatch`); nothing changed ⇒ nothing is sent. Behind `action:calendar.booking-edit`.
 */
export default function OtherDetailsDialog({ booking, teachers, opened, onClose }: { booking: Booking; teachers: TeacherView[]; opened: boolean; onClose: () => void }) {
  const t = useT();
  const update = useUpdateBookingOther();
  const teacherIds = booking.teachers.map((tc) => tc.id);
  const [draft, setDraft] = useState<OtherScheduleDraft>(() => draftFromFacts(booking.other, teacherIds));
  const [error, setError] = useState<string | null>(null);
  const patch = otherSchedulePatch(booking.other, draft, teacherIds);
  const dirty = Object.keys(patch).length > 0;

  const submit = async () => {
    if (!dirty) return onClose();
    setError(null);
    try {
      await update.mutateAsync({ id: booking.id, patch });
      notify({ title: t("booking.otherDetailsSavedOk"), color: "success" });
      onClose();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : (e as Error).message);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} centered title={t("booking.otherEditDetails")}>
      <Stack gap="sm">
        {error && (
          <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
            {error}
          </Alert>
        )}
        <Text size="xs" c="dimmed">
          {t("booking.otherEditDetailsHint")}
        </Text>
        <OtherScheduleFields value={draft} onChange={setDraft} teacherIds={teacherIds} teachers={teachers} />
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button loading={update.isPending} disabled={!dirty} onClick={submit}>
            {t("common.save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
