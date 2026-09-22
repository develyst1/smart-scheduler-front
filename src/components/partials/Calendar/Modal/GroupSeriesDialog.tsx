"use client";

import { useState } from "react";
import { Alert, Button, Group, Modal, MultiSelect, NumberInput, Select, Stack, TextInput } from "@mantine/core";
import { AlertTriangle, Users } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { useCreateGroupSeries, useTeachers } from "@/hooks/scheduler";
import { TeacherOption, teacherSelectData } from "@/components/common/TeacherOption";
import { teacherRatesMinor, type OtherScheduleDraft } from "@/lib/scheduler/other-schedule";
import { DUO_CAP, GROUP_CAP_MAX, GROUP_CAP_MIN, seatCapFor, type GroupKind } from "@/lib/scheduler/group-session";
import { COACH_RATE_KEY, CREATABLE_GROUP_KINDS, withoutRates } from "@/lib/scheduler/duo";
import { useCan } from "@/hooks/scheduler/useMe";
import { TIME_SLOTS } from "@/types/app/scheduler";
import OtherScheduleFields from "./OtherScheduleFields";
import MultiDateField from "./MultiDateField";

/**
 * REQ-095 Stage 2a (TASK-398) — `Create group`: a DUO/Group series — name, kind (DUO ⇒ the cap is LOCKED at 2, the
 * ONE client rule; Group ⇒ 3–12 typed), the teacher(s) + rate per teacher (the ONE `OtherScheduleFields`, kind/head
 * count hidden — a group's kind and cap are its own fields), time, the SHARED multi-date picker ⇒ ONE
 * `POST /bookings/group-series`, all or nothing. On `409 SLOT_TAKEN` the sentence names the date and the ticks STAY
 * (Stage 1's shape — the same field, the same catch). Behind `action:calendar.group-series` (the door on the create form).
 */
export default function GroupSeriesDialog({
  opened,
  onClose,
  seed,
}: {
  opened: boolean;
  onClose: () => void;
  seed: { teacherIds: string[]; startTime: string; date: string; schedule: OtherScheduleDraft };
}) {
  const t = useT();
  const { data: teachers = [] } = useTeachers();
  const create = useCreateGroupSeries();
  const [name, setName] = useState("");
  // TASK-421 — a DUO is a COURSE now (two kids, one course); the creator offers Group only. Existing DUO series still render.
  const [kind, setKind] = useState<GroupKind>("GROUP");
  const [capTyped, setCapTyped] = useState<number | "">(GROUP_CAP_MIN);
  const [teacherIds, setTeacherIds] = useState<string[]>(seed.teacherIds);
  const [startTime, setStartTime] = useState(seed.startTime);
  const [schedule, setSchedule] = useState<OtherScheduleDraft>(seed.schedule);
  const [dates, setDates] = useState<string[]>(seed.date ? [seed.date] : []);
  const [error, setError] = useState<string | null>(null);
  // REQ-102 §8 (TASK-432) — without key 59 the rate inputs are absent and `teacherRates` never rides.
  const can = useCan();
  const canRate = can(COACH_RATE_KEY);

  const seatCap = seatCapFor(kind, capTyped);
  const [primary, ...additional] = teacherIds;
  const ready = !!name.trim() && typeof seatCap === "number" && !!primary && !!startTime && dates.length > 0;

  const submit = async () => {
    if (!ready || typeof seatCap !== "number") return;
    setError(null);
    try {
      const res = await create.mutateAsync(withoutRates({
        name: name.trim(),
        groupKind: kind,
        seatCap,
        teacherId: primary,
        additionalTeacherIds: additional.length ? additional : undefined,
        teacherRates: teacherRatesMinor(schedule.ratesBaht, teacherIds),
        startTime,
        dates,
      }, canRate));
      notify({ title: t("booking.groupSeriesCreatedOk", { n: String(res.created) }), color: "success" });
      onClose();
    } catch (e) {
      // `SLOT_TAKEN` names the date; the ticks stay so the admin un-ticks it and retries.
      setError(e instanceof ApiClientError ? e.message : (e as Error).message);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} centered size="lg" title={t("booking.groupCreateTitle")}>
      <Stack gap="sm">
        {error && (
          <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
            {error}
          </Alert>
        )}
        <TextInput label={t("booking.groupName")} value={name} onChange={(e) => setName(e.currentTarget.value)} required />
        <Group grow align="flex-start">
          <Select
            label={t("booking.groupKindLabel")}
            value={kind}
            onChange={(v) => setKind((v as GroupKind | null) ?? "GROUP")}
            data={CREATABLE_GROUP_KINDS.map((k) => ({ value: k, label: t(`booking.groupKind_${k}`) }))}
            allowDeselect={false}
          />
          <NumberInput
            label={t("booking.groupSeatCap")}
            description={kind === "DUO" ? t("booking.groupSeatCapDuo") : t("booking.groupSeatCapHint")}
            value={kind === "DUO" ? DUO_CAP : capTyped}
            onChange={(v) => setCapTyped(typeof v === "number" ? v : "")}
            min={kind === "DUO" ? DUO_CAP : GROUP_CAP_MIN}
            max={kind === "DUO" ? DUO_CAP : GROUP_CAP_MAX}
            step={1}
            allowDecimal={false}
            disabled={kind === "DUO"}
          />
        </Group>
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
        <OtherScheduleFields value={schedule} onChange={setSchedule} teacherIds={teacherIds} teachers={teachers} ratesOnly />
        <Select
          label={t("booking.time")}
          value={startTime}
          onChange={(v) => setStartTime(v ?? "")}
          data={TIME_SLOTS.map((slot) => ({ value: slot, label: slot }))}
          allowDeselect={false}
          searchable
          className="max-w-xs"
        />
        <MultiDateField value={dates} onChange={setDates} />
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button leftSection={<Users size={15} />} loading={create.isPending} disabled={!ready} onClick={submit}>
            {t("booking.otherSeriesCreate", { n: String(dates.length) })}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
