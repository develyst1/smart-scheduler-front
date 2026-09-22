"use client";

import { useState } from "react";
import { Alert, Button, Group, Modal, Stack, Text } from "@mantine/core";
import { AlertTriangle } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { useUpdateBookingOther } from "@/hooks/scheduler";
import { draftFromFacts, otherSchedulePatch, type OtherScheduleDraft } from "@/lib/scheduler/other-schedule";
import { COACH_RATE_KEY, withoutRates } from "@/lib/scheduler/duo";
import { useCan } from "@/hooks/scheduler/useMe";
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
  // TASK-398 — on a GROUP row the same route edits the cap (`headCount`) and the rates; the facts come from `group`
  // (`other` is null there) and the kind is the group's own, not editable here.
  const isGroup = booking.bookingType === "GROUP";
  const facts = isGroup && booking.group ? { kind: null, headCount: booking.group.seatCap, teacherRates: booking.group.teacherRates, ratePostedAt: booking.group.ratePostedAt } : booking.other;
  const [draft, setDraft] = useState<OtherScheduleDraft>(() => draftFromFacts(facts, teacherIds));
  const [error, setError] = useState<string | null>(null);
  // REQ-102 §8 (TASK-432) — without key 59 the rate inputs are absent and `teacherRates` never rides (the server's 403 otherwise).
  const can = useCan();
  const canRate = can(COACH_RATE_KEY);
  const patch = withoutRates(otherSchedulePatch(facts, draft, teacherIds), canRate);
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
        <OtherScheduleFields value={draft} onChange={setDraft} teacherIds={teacherIds} teachers={teachers} hideKind={isGroup} />
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
