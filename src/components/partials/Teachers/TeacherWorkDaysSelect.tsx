"use client";

import { useState } from "react";
import { Alert, Button, Group, Modal, Stack, Text } from "@mantine/core";
import { AlertTriangle } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { useSetTeacherWorkDays } from "@/hooks/scheduler";
import { getWorkDaysImpact } from "@/services/scheduler.service";
import { useT } from "@/lib/i18n";
import { useWorkDays } from "@/lib/scheduler/useWorkDays";
import { ALL_WORK_DAYS, WORK_DAY_PRESETS } from "@/lib/scheduler/work-days";
import type { WorkDaysImpact } from "@/types/app/scheduler";

interface Props {
  teacherId: string;
  nickname: string;
  workDays?: number[];
}

/** วันที่เลือกในรูปแบบ set ที่เทียบเท่ากันไม่ว่าจะเรียงลำดับยังไง */
const sameDays = (a: number[], b: number[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

export default function TeacherWorkDaysSelect({ teacherId, nickname, workDays }: Props) {
  const t = useT();
  const { options: dayOptions, format } = useWorkDays();
  const setWorkDays = useSetTeacherWorkDays();
  // ค่าจริงจาก server (ว่าง = สอนทุกวัน)
  const saved = workDays?.length ? workDays : [...ALL_WORK_DAYS];
  // ค่าที่กำลังแก้ใน UI ก่อนกดบันทึก
  const [draft, setDraft] = useState<number[]>(saved);

  const dirty = !sameDays(draft, saved);
  // TASK-100 — if the change removes a day the teacher works, warn before applying (not a hard block).
  const [impact, setImpact] = useState<WorkDaysImpact | null>(null);
  const [checking, setChecking] = useState(false);

  const toggleDay = (day: number) =>
    setDraft((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );

  const reset = () => setDraft(saved);

  const applyChange = () => {
    setImpact(null);
    setWorkDays.mutate(
      { id: teacherId, workDays: draft },
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
    setChecking(true);
    try {
      const imp = await getWorkDaysImpact(teacherId, draft);
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

  return (
    <div className="mt-2 space-y-2">
      <p className="text-xs text-default-500">{t("teachers.workDaysLabel")}</p>

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
                  : "border border-default-200 text-default-500 hover:bg-default-100"
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
          <Alert variant="light" color="orange" icon={<AlertTriangle size={16} />}>
            <Text fz="sm">
              {t("teachers.workDaysOrphanWarn", {
                n: impact?.orphanCount ?? 0,
                days: impact?.removedDaysLabel || format(impact?.removedDays ?? []),
              })}
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
