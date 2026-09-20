"use client";

import { useState } from "react";
import { Alert, Button, Group, Loader, Modal, MultiSelect, NumberInput, Select, Stack, Table, Text, TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { AlertTriangle } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { useTeachers } from "@/hooks/scheduler";
import { useCampWeekDays, useCreateCampWeek, useUpdateCampWeek, useUpdateCampWeekDay } from "@/hooks/scheduler/useCamp";
import { TeacherOption, teacherSelectData } from "@/components/common/TeacherOption";
import { formatDateDisplay } from "@/lib/ui/format";
import { CAMP_HOURS, CAMP_WINDOW_DEFAULT, changedDayPatches, type CampDayFacts } from "@/lib/camp/grid";
import type { CampWeek } from "@/types/api/contract";

/**
 * REQ-095 Stage 3a (TASK-402) — open a camp week (name · date range · capacity · teachers) ⇒ `POST /camp/weeks`; edit
 * ⇒ `PATCH /camp/weeks/:id` with only what changed. 🚫 No client rule: 1–7 consecutive days, capacity ≥ 1 are the
 * server's (its sentence shows here). Behind `action:camp.week-open`.
 *
 * REQ-095 §11 (TASK-418/419) — the week's default WINDOW (two whole-hour boxes; the server's 10:00 / 15:00 when blank)
 * and, on the edit face, a PER-DAY table (date · teachers · window) from the roster's day objects ⇒ on save, the week
 * PATCH (if anything week-level changed) + ONE per-day PATCH for each CHANGED day only (`changedDayPatches`, pure).
 * A week-level teacher/window change re-derives only days not edited by hand (the server's rule) — the note says so;
 * `Apply to every day` copies the week-level values into every day row (⇒ N per-day PATCHes on save). The dates are
 * immutable (open a new week). Refusals (`SLOT_TAKEN` naming date · hour · teacher, a bad window, a closed week) are
 * the server's sentence, and nothing typed is lost.
 */
export default function OpenWeekDialog({ opened, week, onClose }: { opened: boolean; week: CampWeek | null; onClose: () => void }) {
  const t = useT();
  const { data: teachers = [] } = useTeachers();
  const create = useCreateCampWeek();
  const update = useUpdateCampWeek();
  const updateDay = useUpdateCampWeekDay();
  const { data: roster, isLoading: loadingDays } = useCampWeekDays(week?.id ?? null);
  const [name, setName] = useState(week?.name ?? "");
  const [startDate, setStartDate] = useState<string | null>(week?.startDate ?? null);
  const [endDate, setEndDate] = useState<string | null>(week?.endDate ?? null);
  const [capacity, setCapacity] = useState<number | "">(week?.capacity ?? "");
  const [teacherIds, setTeacherIds] = useState<string[]>(week?.teacherIds ?? []);
  const [windowStart, setWindowStart] = useState<string | null>(week?.windowStart ?? null);
  const [windowEnd, setWindowEnd] = useState<string | null>(week?.windowEnd ?? null);
  // The per-day rows as the server sent them (originals) and as edited here; seeded once the roster lands.
  const [days, setDays] = useState<CampDayFacts[] | null>(null);
  const originals: CampDayFacts[] = (roster?.days ?? [])
    .filter((d) => d.campWeekDayId)
    .map((d) => ({ date: d.date, campWeekDayId: d.campWeekDayId as string, teacherIds: d.teacherIds ?? [], startTime: d.startTime ?? CAMP_WINDOW_DEFAULT.start, endTime: d.endTime ?? CAMP_WINDOW_DEFAULT.end, editedAt: d.editedAt ?? null }));
  const rows = days ?? originals;
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending || updateDay.isPending;
  const ready = !!name.trim() && !!startDate && !!endDate;
  const hourData = CAMP_HOURS.map((h) => ({ value: h, label: h }));

  const setDay = (date: string, patch: Partial<CampDayFacts>) => setDays(rows.map((d) => (d.date === date ? { ...d, ...patch } : d)));
  const applyToEveryDay = () =>
    setDays(rows.map((d) => ({ ...d, teacherIds: [...teacherIds], startTime: windowStart ?? CAMP_WINDOW_DEFAULT.start, endTime: windowEnd ?? CAMP_WINDOW_DEFAULT.end })));

  const submit = async () => {
    if (!ready) return;
    setError(null);
    try {
      if (week) {
        const sameTeachers = teacherIds.length === week.teacherIds.length && teacherIds.every((id) => week.teacherIds.includes(id));
        const weekBody = {
          ...(name.trim() !== week.name ? { name } : {}),
          ...((capacity === "" ? null : capacity) !== week.capacity ? { capacity: capacity === "" ? null : capacity } : {}),
          ...(sameTeachers ? {} : { teacherIds }),
          ...(windowStart && windowStart !== (week.windowStart ?? null) ? { windowStart } : {}),
          ...(windowEnd && windowEnd !== (week.windowEnd ?? null) ? { windowEnd } : {}),
        };
        if (Object.keys(weekBody).length) await update.mutateAsync({ id: week.id, input: weekBody });
        // Only the CHANGED days, one call each — the server syncs the grid per day and names the first clash.
        const patches = days ? changedDayPatches(originals, days) : [];
        for (const p of patches) await updateDay.mutateAsync({ weekId: week.id, date: p.date, body: p.body });
        notify({ title: t("camp.weekSavedOk", { name: name.trim() }), color: "success" });
      } else {
        await create.mutateAsync({
          name,
          startDate: startDate!,
          endDate: endDate!,
          ...(capacity !== "" ? { capacity } : {}),
          teacherIds,
          ...(windowStart ? { windowStart } : {}),
          ...(windowEnd ? { windowEnd } : {}),
        });
        notify({ title: t("camp.weekOpenedOk", { name: name.trim() }), color: "success" });
      }
      onClose();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : (e as Error).message);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} centered size={week ? "lg" : "md"} title={week ? t("camp.editWeekTitle", { name: week.name }) : t("camp.openWeekTitle")}>
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
        {week && (
          <Text size="xs" c="dimmed">
            {t("camp.datesImmutable")}
          </Text>
        )}
        <NumberInput label={t("camp.capacity")} description={t("camp.capacityHint")} value={capacity} onChange={(v) => setCapacity(typeof v === "number" ? v : "")} min={1} step={1} allowDecimal={false} className="max-w-xs" />
        <MultiSelect
          label={t("camp.teachers")}
          description={week ? t("camp.weekLevelHint") : undefined}
          data={teacherSelectData(teachers)}
          value={teacherIds}
          onChange={setTeacherIds}
          searchable
          renderOption={({ option, checked }) => <TeacherOption option={option} checked={checked} teachers={teachers} />}
        />
        <Group grow align="flex-start">
          <Select label={t("camp.windowStart")} placeholder={CAMP_WINDOW_DEFAULT.start} data={hourData} value={windowStart} onChange={setWindowStart} clearable />
          <Select label={t("camp.windowEnd")} placeholder={CAMP_WINDOW_DEFAULT.end} data={hourData} value={windowEnd} onChange={setWindowEnd} clearable />
        </Group>

        {week && (
          <div data-day-table={rows.length}>
            <Group justify="space-between" mb={4}>
              <Text size="sm" fw={600}>
                {t("camp.perDay")}
              </Text>
              <Button size="compact-xs" variant="subtle" onClick={applyToEveryDay} disabled={rows.length === 0}>
                {t("camp.applyToEveryDay")}
              </Button>
            </Group>
            {loadingDays && !roster ? (
              <Loader size="xs" />
            ) : (
              <Table verticalSpacing={4} withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("camp.startDate")}</Table.Th>
                    <Table.Th>{t("camp.teachers")}</Table.Th>
                    <Table.Th>{t("camp.windowStart")}</Table.Th>
                    <Table.Th>{t("camp.windowEnd")}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rows.map((d) => (
                    <Table.Tr key={d.date} data-day={d.date} data-edited={d.editedAt ? "yes" : "no"}>
                      <Table.Td className="whitespace-nowrap text-sm">
                        {formatDateDisplay(d.date)}
                        {d.editedAt && (
                          <Text component="span" size="xs" c="dimmed" ml={4}>
                            {t("camp.dayEdited")}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <MultiSelect size="xs" data={teacherSelectData(teachers)} value={d.teacherIds} onChange={(v) => setDay(d.date, { teacherIds: v })} searchable />
                      </Table.Td>
                      <Table.Td>
                        <Select size="xs" data={hourData} value={d.startTime.slice(0, 5)} onChange={(v) => v && setDay(d.date, { startTime: v })} allowDeselect={false} />
                      </Table.Td>
                      <Table.Td>
                        <Select size="xs" data={hourData} value={d.endTime.slice(0, 5)} onChange={(v) => v && setDay(d.date, { endTime: v })} allowDeselect={false} />
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </div>
        )}

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
