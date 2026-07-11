"use client";

import { useState } from "react";
import { Button, Group } from "@mantine/core";
import { notify } from "@/lib/ui/notify";
import { useSetTeacherWorkDays } from "@/hooks/scheduler";
import { useT } from "@/lib/i18n";
import { useWorkDays } from "@/lib/scheduler/useWorkDays";
import { ALL_WORK_DAYS, WORK_DAY_PRESETS } from "@/lib/scheduler/work-days";

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

  const toggleDay = (day: number) =>
    setDraft((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );

  const reset = () => setDraft(saved);

  const save = () => {
    if (draft.length === 0) {
      notify({ title: t("teachers.pickAtLeastOne"), color: "warning" });
      return;
    }
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
            <Button size="sm" px="lg" onClick={save} loading={setWorkDays.isPending}>
              {t("common.save")}
            </Button>
          </Group>
        </Group>
      )}
    </div>
  );
}
