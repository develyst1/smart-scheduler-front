"use client";

import { useState } from "react";
import dayjs from "dayjs";
import { Alert, Button, Group, Modal, MultiSelect, NumberInput, Select, Stack, Text, TextInput, Textarea } from "@mantine/core";
import { DatePicker } from "@mantine/dates";
import { AlertTriangle, CalendarPlus } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { useCreateOtherSeries, useTeachers } from "@/hooks/scheduler";
import { TeacherOption, teacherSelectData } from "@/components/common/TeacherOption";
import { OTHER_KINDS, teacherRatesMinor, type OtherKind, type OtherScheduleDraft } from "@/lib/scheduler/other-schedule";
import { TIME_SLOTS } from "@/types/app/scheduler";
import OtherScheduleFields from "./OtherScheduleFields";

/**
 * REQ-095 Stage 1 (TASK-395) — the SERIES: the same OTHER facts + a multi-date picker ⇒ ONE call,
 * `POST /bookings/other-series`, all or nothing. On `409 SLOT_TAKEN` the server's sentence names the date and the
 * ticks STAY, so the admin un-ticks that date and retries. The title is required by the server (a series has no
 * student to name it); `endTime` is the server's (+1h). Behind `action:calendar.other-series` (the door is gated
 * on the create form; the dialog itself asks nothing). 🚫 No client rule: the count of ticks is shown, not judged.
 */
export default function OtherSeriesDialog({
  opened,
  onClose,
  seed,
}: {
  opened: boolean;
  onClose: () => void;
  /** What the create form already holds — copied on open so nothing is typed twice. */
  seed: { title: string; teacherIds: string[]; startTime: string; date: string; schedule: OtherScheduleDraft };
}) {
  const t = useT();
  const { data: teachers = [] } = useTeachers();
  const create = useCreateOtherSeries();
  const [title, setTitle] = useState(seed.title);
  const [note, setNote] = useState("");
  const [teacherIds, setTeacherIds] = useState<string[]>(seed.teacherIds);
  const [startTime, setStartTime] = useState(seed.startTime);
  const [schedule, setSchedule] = useState<OtherScheduleDraft>(seed.schedule);
  const [dates, setDates] = useState<string[]>(seed.date ? [seed.date] : []);
  const [error, setError] = useState<string | null>(null);

  const [primary, ...additional] = teacherIds;
  const ready = !!title.trim() && !!schedule.kind && typeof schedule.headCount === "number" && !!primary && !!startTime && dates.length > 0;

  const submit = async () => {
    if (!ready || !schedule.kind || typeof schedule.headCount !== "number") return;
    setError(null);
    try {
      const res = await create.mutateAsync({
        title: title.trim(),
        otherKind: schedule.kind,
        headCount: schedule.headCount,
        note: note.trim() || undefined,
        teacherId: primary,
        additionalTeacherIds: additional.length ? additional : undefined,
        teacherRates: teacherRatesMinor(schedule.ratesBaht, teacherIds),
        startTime,
        dates: [...dates].sort(),
      });
      notify({ title: t("booking.otherSeriesCreatedOk", { n: String(res.created) }), color: "success" });
      onClose();
    } catch (e) {
      // `SLOT_TAKEN` names the date; the ticks stay so the admin un-ticks it and retries.
      setError(e instanceof ApiClientError ? e.message : (e as Error).message);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} centered size="lg" title={t("booking.otherSeriesTitle")}>
      <Stack gap="sm">
        {error && (
          <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
            {error}
          </Alert>
        )}
        <TextInput label={t("booking.otherTitle")} value={title} onChange={(e) => setTitle(e.currentTarget.value)} required />
        <MultiSelect
          label={t("booking.otherTeachers")}
          description={t("booking.otherTeachersHint")}
          data={teacherSelectData(teachers)}
          value={teacherIds}
          onChange={setTeacherIds}
          searchable
          required
          renderOption={({ option, checked }) => <TeacherOption option={option} checked={checked} teachers={teachers} />}
        />
        <OtherScheduleFields value={schedule} onChange={setSchedule} teacherIds={teacherIds} teachers={teachers} kindRequired />
        <Select
          label={t("booking.time")}
          value={startTime}
          onChange={(v) => setStartTime(v ?? "")}
          data={TIME_SLOTS.map((slot) => ({ value: slot, label: slot }))}
          allowDeselect={false}
          searchable
          className="max-w-xs"
        />
        <Textarea label={t("booking.otherSeriesNote")} value={note} onChange={(e) => setNote(e.currentTarget.value)} autosize minRows={1} />
        <div>
          <Text size="sm" fw={500}>
            {t("booking.otherSeriesDates")}
          </Text>
          <Text size="xs" c="dimmed" mb={4}>
            {t("booking.otherSeriesCount", { n: String(dates.length) })}
          </Text>
          <DatePicker
            type="multiple"
            value={dates.map((d) => new Date(d))}
            onChange={(v) => setDates((v as unknown as (Date | string)[]).map((d) => dayjs(d).format("YYYY-MM-DD")))}
            numberOfColumns={2}
          />
        </div>
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button leftSection={<CalendarPlus size={15} />} loading={create.isPending} disabled={!ready} onClick={submit}>
            {t("booking.otherSeriesCreate", { n: String(dates.length) })}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export { OTHER_KINDS };
export type { OtherKind };
