"use client";

import { useState } from "react";
import { Alert, Button, Group, Modal, Select, Stack, Text } from "@mantine/core";
import { AlertTriangle } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { useSetTeacherWorkDays } from "@/hooks/scheduler";
import { useCan } from "@/hooks/scheduler/useMe";
import { getWorkDaysImpact } from "@/services/scheduler.service";
import { useT } from "@/lib/i18n";
import { useWorkDays } from "@/lib/scheduler/useWorkDays";
import { ALL_WORK_DAYS, HALF_HOUR_TIMES, WORK_DAY_PRESETS, hoursDraftFromSaved, hoursFromDraft, type HoursDraft } from "@/lib/scheduler/work-days";
import type { WorkDaysImpact } from "@/types/app/scheduler";

interface Props {
  teacherId: string;
  nickname: string;
  workDays?: number[];
  /** 🔴 TASK-966 — the saved hours per weekday (absent = the whole day on every working day). */
  workHours?: Record<string, [string, string]> | null;
}

/** วันที่เลือกในรูปแบบ set ที่เทียบเท่ากันไม่ว่าจะเรียงลำดับยังไง */
const sameDays = (a: number[], b: number[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

/**
 * 🔴 **TASK-966 (SPEC-108 §3.4, REQ-5015 AC3) — each ticked working day gets an OPTIONAL From / To** (half hours; both empty = the whole day). Shared by this page's editor and the «add teacher» form.
 * It only edits the draft: nothing is sent from here, and an unticked day shows no row (its hours are dropped by `hoursFromDraft`).
 */
export function WorkHoursEditor({ days, draft, onChange, disabled = false }: { days: number[]; draft: HoursDraft; onChange: (d: HoursDraft) => void; disabled?: boolean }) {
  const t = useT();
  const { options: dayOptions } = useWorkDays();
  const label = (d: number) => dayOptions.find((o) => Number(o.value) === d)?.label ?? String(d);
  const set = (d: number, patch: Partial<{ from: string | null; to: string | null }>) => onChange({ ...draft, [d]: { from: draft[d]?.from ?? null, to: draft[d]?.to ?? null, ...patch } });
  const shown = ALL_WORK_DAYS.filter((d) => days.includes(d));
  if (shown.length === 0) return null;
  return (
    <Stack gap={6} data-work-hours>
      <p className="text-xs text-muted-500">{t("teachers.workHoursHint")}</p>
      {shown.map((d) => (
        <Group key={d} gap="xs" wrap="nowrap" data-work-hours-day={d}>
          <Text size="sm" fw={500} w={44}>
            {label(d)}
          </Text>
          <Select
            aria-label={`${label(d)} ${t("teachers.workHoursFrom")}`}
            placeholder={t("teachers.workHoursFrom")}
            data={HALF_HOUR_TIMES}
            value={draft[d]?.from ?? null}
            onChange={(v) => set(d, { from: v })}
            clearable
            disabled={disabled}
            comboboxProps={{ withinPortal: true }}
            w={110}
            data-work-hours-from={d}
          />
          <Select
            aria-label={`${label(d)} ${t("teachers.workHoursTo")}`}
            placeholder={t("teachers.workHoursTo")}
            data={HALF_HOUR_TIMES}
            value={draft[d]?.to ?? null}
            onChange={(v) => set(d, { to: v })}
            clearable
            disabled={disabled}
            comboboxProps={{ withinPortal: true }}
            w={110}
            data-work-hours-to={d}
          />
        </Group>
      ))}
    </Stack>
  );
}

export default function TeacherWorkDaysSelect({ teacherId, nickname, workDays, workHours }: Props) {
  const t = useT();
  const { options: dayOptions, format } = useWorkDays();
  const setWorkDays = useSetTeacherWorkDays();
  // ค่าจริงจาก server (ว่าง = สอนทุกวัน)
  const saved = workDays?.length ? workDays : [...ALL_WORK_DAYS];
  // ค่าที่กำลังแก้ใน UI ก่อนกดบันทึก
  const [draft, setDraft] = useState<number[]>(saved);
  // 🔴 TASK-966 — the hours being edited, and what they would save (only complete From–To pairs on ticked days).
  const [hoursDraft, setHoursDraft] = useState<HoursDraft>(() => hoursDraftFromSaved(workHours));
  const parsed = hoursFromDraft(draft, hoursDraft);
  const savedHours = hoursFromDraft(saved, hoursDraftFromSaved(workHours)).hours;
  const hoursDirty = JSON.stringify(parsed.hours) !== JSON.stringify(savedHours);
  // `workHours` rides the save ONLY when hours changed (a set of hours, or `null` to clear them); a days-only save is exactly what it was.
  const hoursToSend = hoursDirty ? (Object.keys(parsed.hours).length ? parsed.hours : null) : undefined;

  // a half-filled day (one end only / From not before To) is a change too: Save must be there to say what is wrong, not hide it
  const dirty = !sameDays(draft, saved) || hoursDirty || parsed.issue !== null;
  // TASK-100 — if the change removes a day the teacher works, warn before applying (not a hard block).
  const [impact, setImpact] = useState<WorkDaysImpact | null>(null);
  const [checking, setChecking] = useState(false);
  // REQ-092 Stage 3 — without `teachers.work-days` the days are read, not edited: one line, no buttons.
  const can = useCan();
  const canEdit = can("action:teachers.work-days");

  const toggleDay = (day: number) =>
    setDraft((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );

  const reset = () => {
    setDraft(saved);
    setHoursDraft(hoursDraftFromSaved(workHours));
  };

  const applyChange = () => {
    setImpact(null);
    setWorkDays.mutate(
      { id: teacherId, workDays: draft, ...(hoursToSend !== undefined ? { workHours: hoursToSend } : {}) },
      {
        onSuccess: () =>
          notify({
            title: t("teachers.workDaysSaved"),
            description: `${nickname} · ${format(draft)}`,
            color: "success",
          }),
      },
    );
  };

  const save = async () => {
    if (draft.length === 0) {
      notify({ title: t("teachers.pickAtLeastOne"), color: "warning" });
      return;
    }
    if (parsed.issue) {
      // one end without the other, or From not before To — said in words, nothing is sent
      const day = dayOptions.find((o) => Number(o.value) === parsed.issue?.day)?.label ?? "";
      notify({ title: t(parsed.issue.kind === "order" ? "teachers.workHoursOrder" : "teachers.workHoursPartial", { day }), color: "warning" });
      return;
    }
    setChecking(true);
    try {
      const imp = await getWorkDaysImpact(teacherId, draft, hoursToSend);
      if (imp.orphanCount > 0) {
        setImpact(imp); // open the confirm dialog
        return;
      }
      applyChange();
    } catch {
      // The impact preview is a courtesy, not a gate (TASK-096 is the backstop) — proceed on failure.
      applyChange();
    } finally {
      setChecking(false);
    }
  };

  if (!canEdit) {
    return (
      <p className="mt-2 text-xs text-muted-500">
        {t("teachers.workDaysLabel")} · {format(saved)}
        {Object.keys(savedHours).length > 0 && (
          <span data-work-hours-read>
            {" · "}
            {Object.entries(savedHours)
              .map(([d, [from, to]]) => `${dayOptions.find((o) => o.value === d)?.label ?? d} ${from}–${to}`)
              .join(", ")}
          </span>
        )}
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <p className="text-xs text-muted-500">{t("teachers.workDaysLabel")}</p>

      {/* ปุ่มวัน 7 ปุ่ม — กด toggle ได้หลายวัน */}
      <div className="flex gap-1.5">
        {dayOptions.map((opt) => {
          const day = Number(opt.value);
          const selected = draft.includes(day);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggleDay(day)}
              disabled={setWorkDays.isPending}
              aria-pressed={selected}
              aria-label={opt.label}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                selected
                  ? "bg-primary text-primary-foreground"
                  : "border border-muted-200 text-muted-500 hover:bg-muted-100"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* preset — quick-fill ลง draft (ยังไม่ save) · ตัวที่ตรงปัจจุบันถูก highlight */}
      <Group gap={6} wrap="wrap">
        {WORK_DAY_PRESETS.map((p) => {
          const active = sameDays(draft, p.days);
          return (
            <Button
              key={p.labelKey}
              size="compact-xs"
              variant={active ? "light" : "default"}
              color={active ? "blue" : "gray"}
              disabled={setWorkDays.isPending}
              onClick={() => setDraft(p.days)}
              leftSection={active ? <span aria-hidden>✓</span> : undefined}
            >
              {t(p.labelKey)}
            </Button>
          );
        })}
      </Group>

      {/* 🔴 TASK-966 — hours for each ticked day (optional; empty = the whole day) */}
      <WorkHoursEditor days={draft} draft={hoursDraft} onChange={setHoursDraft} disabled={setWorkDays.isPending} />

      {/* แถวบันทึก — โผล่เฉพาะตอนมีการแก้ (dirty) */}
      {dirty && (
        <Group justify="space-between" mt={4}>
          <span className="text-xs text-warning">{t("teachers.unsavedChanges")}</span>
          <Group gap={6}>
            <Button
              size="sm"
              px="lg"
              variant="subtle"
              color="gray"
              onClick={reset}
              disabled={setWorkDays.isPending}
            >
              {t("common.cancel")}
            </Button>
            <Button size="sm" px="lg" onClick={save} loading={setWorkDays.isPending || checking}>
              {t("common.save")}
            </Button>
          </Group>
        </Group>
      )}

      {/* TASK-100 — soft warning: this change orphans future sessions. Proceed or cancel (not a hard block). */}
      <Modal
        opened={!!impact}
        onClose={() => setImpact(null)}
        title={t("teachers.workDaysOrphanTitle")}
        centered
        radius="lg"
      >
        <Stack gap="md">
          <Alert variant="light" color="orange" icon={<AlertTriangle size={16} />} data-work-orphan={impact?.orphanCount ?? 0}>
            <Text fz="sm">
              {/* 🔴 TASK-966 — the same warning for hours: when no WORKING DAY is being removed, the classes are the ones outside the new hours. */}
              {(impact?.removedDays?.length ?? 0) > 0
                ? t("teachers.workDaysOrphanWarn", {
                    n: impact?.orphanCount ?? 0,
                    days: impact?.removedDaysLabel || format(impact?.removedDays ?? []),
                  })
                : t("teachers.workHoursOrphanWarn", { n: impact?.orphanCount ?? 0 })}
            </Text>
          </Alert>
          <Group justify="flex-end">
            <Button variant="subtle" color="gray" onClick={() => setImpact(null)}>
              {t("common.cancel")}
            </Button>
            <Button color="orange" onClick={applyChange} loading={setWorkDays.isPending}>
              {t("teachers.workDaysOrphanProceed")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
}
