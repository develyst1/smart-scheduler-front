"use client";

import { useState } from "react";
import { Alert, Button, Group, Modal, Select, Stack, Switch, Text } from "@mantine/core";
import { AlertTriangle, Repeat } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { useSwapGroupTeacher } from "@/hooks/scheduler";
import { TeacherOption, teacherSelectData } from "@/components/common/TeacherOption";
import { bookableOnDate } from "@/lib/scheduler/work-days";
import type { Booking, TeacherView } from "@/types/app/scheduler";

/**
 * REQ-095 Stage 2a (TASK-398) — swap the teacher on a GROUP row: a teacher picker + `From this date on` ⇒ ONE
 * `PATCH /bookings/:id/group-teacher { teacherId, fromHereOn }`; the seats follow server-side; `409 SLOT_TAKEN`
 * names the date (the server's sentence, shown as is). 🔴 @Jason's build note: the swap sends NO message to families
 * or the coach — the dialog says so in one line. Behind `action:calendar.booking-edit`.
 */
export default function GroupSwapDialog({ booking, teachers, opened, onClose }: { booking: Booking; teachers: TeacherView[]; opened: boolean; onClose: () => void }) {
  const t = useT();
  const swap = useSwapGroupTeacher();
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [fromHereOn, setFromHereOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const choices = teachers.filter((tc) => tc.id !== booking.teacherId && bookableOnDate(tc, booking.date));

  const submit = async () => {
    if (!teacherId) return;
    setError(null);
    try {
      await swap.mutateAsync({ id: booking.id, input: { teacherId, fromHereOn } });
      notify({ title: t("booking.groupSwapOk"), color: "success" });
      onClose();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : (e as Error).message);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} centered title={t("booking.groupSwapTitle", { name: booking.group?.name ?? booking.displayName })}>
      <Stack gap="sm">
        {error && (
          <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
            {error}
          </Alert>
        )}
        <Select
          label={t("booking.teacher")}
          placeholder={t("course.pickTeacher")}
          value={teacherId}
          onChange={setTeacherId}
          data={teacherSelectData(choices)}
          renderOption={({ option, checked }) => <TeacherOption option={option} checked={checked} teachers={teachers} />}
          allowDeselect={false}
          searchable
          comboboxProps={{ withinPortal: true }}
        />
        <Switch label={t("booking.groupSwapFromHereOn")} checked={fromHereOn} onChange={(e) => setFromHereOn(e.currentTarget.checked)} />
        {/* TASK-397's ruling: no notice exists for a swap; the words are the owner's to write later. Say so. */}
        <Text size="xs" c="dimmed">
          {t("booking.groupSwapNoNotice")}
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button leftSection={<Repeat size={15} />} loading={swap.isPending} disabled={!teacherId} onClick={submit}>
            {t("booking.groupSwap")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
