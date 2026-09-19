"use client";

import { useState } from "react";
import { Alert, Button, Group, Modal, MultiSelect, NumberInput, Stack, TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { AlertTriangle } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { useTeachers } from "@/hooks/scheduler";
import { useCreateCampWeek, useUpdateCampWeek } from "@/hooks/scheduler/useCamp";
import { TeacherOption, teacherSelectData } from "@/components/common/TeacherOption";
import type { CampWeek } from "@/types/api/contract";

/**
 * REQ-095 Stage 3a (TASK-402) — open a camp week (name · date range · capacity · teachers) ⇒ `POST /camp/weeks`; edit
 * ⇒ `PATCH /camp/weeks/:id` with only what changed. 🚫 No client rule: 1–7 consecutive days, capacity ≥ 1 are the
 * server's (its sentence shows here). Behind `action:camp.week-open`.
 */
export default function OpenWeekDialog({ opened, week, onClose }: { opened: boolean; week: CampWeek | null; onClose: () => void }) {
  const t = useT();
  const { data: teachers = [] } = useTeachers();
  const create = useCreateCampWeek();
  const update = useUpdateCampWeek();
  const [name, setName] = useState(week?.name ?? "");
  const [startDate, setStartDate] = useState<string | null>(week?.startDate ?? null);
  const [endDate, setEndDate] = useState<string | null>(week?.endDate ?? null);
  const [capacity, setCapacity] = useState<number | "">(week?.capacity ?? "");
  const [teacherIds, setTeacherIds] = useState<string[]>(week?.teacherIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending;
  const ready = !!name.trim() && !!startDate && !!endDate;

  const submit = async () => {
    if (!ready) return;
    setError(null);
    try {
      if (week) {
        const sameTeachers = teacherIds.length === week.teacherIds.length && teacherIds.every((id) => week.teacherIds.includes(id));
        await update.mutateAsync({
          id: week.id,
          input: {
            ...(name.trim() !== week.name ? { name } : {}),
            ...((capacity === "" ? null : capacity) !== week.capacity ? { capacity: capacity === "" ? null : capacity } : {}),
            ...(sameTeachers ? {} : { teacherIds }),
          },
        });
        notify({ title: t("camp.weekSavedOk", { name: name.trim() }), color: "success" });
      } else {
        await create.mutateAsync({ name, startDate: startDate!, endDate: endDate!, ...(capacity !== "" ? { capacity } : {}), teacherIds });
        notify({ title: t("camp.weekOpenedOk", { name: name.trim() }), color: "success" });
      }
      onClose();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : (e as Error).message);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} centered title={week ? t("camp.editWeekTitle", { name: week.name }) : t("camp.openWeekTitle")}>
      <Stack gap="sm">
        {error && (
          <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
            {error}
          </Alert>
        )}
        <TextInput label={t("camp.weekName")} value={name} onChange={(e) => setName(e.currentTarget.value)} required />
        <Group grow align="flex-start">
          <DatePickerInput label={t("camp.startDate")} value={startDate} onChange={(v) => setStartDate(v)} valueFormat="D MMM YYYY" disabled={!!week} required />
          <DatePickerInput label={t("camp.endDate")} value={endDate} onChange={(v) => setEndDate(v)} valueFormat="D MMM YYYY" disabled={!!week} required />
        </Group>
        <NumberInput label={t("camp.capacity")} description={t("camp.capacityHint")} value={capacity} onChange={(v) => setCapacity(typeof v === "number" ? v : "")} min={1} step={1} allowDecimal={false} className="max-w-xs" />
        <MultiSelect
          label={t("camp.teachers")}
          data={teacherSelectData(teachers)}
          value={teacherIds}
          onChange={setTeacherIds}
          searchable
          renderOption={({ option, checked }) => <TeacherOption option={option} checked={checked} teachers={teachers} />}
        />
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button loading={busy} disabled={!ready} onClick={submit}>
            {week ? t("common.save") : t("camp.openWeek")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
