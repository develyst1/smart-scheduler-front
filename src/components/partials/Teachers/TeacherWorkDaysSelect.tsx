"use client";

import { useState } from "react";
import { Button, Group } from "@mantine/core";
import { notify } from "@/lib/ui/notify";
import { useSetTeacherWorkDays } from "@/hooks/scheduler";
import {
  ALL_WORK_DAYS,
  formatWorkDaysLabel,
  WORK_DAY_OPTIONS,
  WORK_DAY_PRESETS,
} from "@/lib/scheduler/work-days";

interface Props {
  teacherId: string;
  nickname: string;
  workDays?: number[];
}

/** วันที่เลือกในรูปแบบ set ที่เทียบเท่ากันไม่ว่าจะเรียงลำดับยังไง */
const sameDays = (a: number[], b: number[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

export default function TeacherWorkDaysSelect({ teacherId, nickname, workDays }: Props) {
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
      notify({ title: "เลือกอย่างน้อย 1 วัน", color: "warning" });
      return;
    }
    setWorkDays.mutate(
      { id: teacherId, workDays: draft },
      {
        onSuccess: () =>
          notify({
            title: "บันทึกวันที่มาสอนแล้ว",
            description: `${nickname} · ${formatWorkDaysLabel(draft)}`,
            color: "success",
          }),
      },
    );
  };

  return (
    <div className="mt-2 space-y-2">
      <p className="text-xs text-default-500">วันที่มาสอน</p>

      {/* ปุ่มวัน 7 ปุ่ม — กด toggle ได้หลายวัน */}
      <div className="flex gap-1.5">
        {WORK_DAY_OPTIONS.map((opt) => {
          const day = Number(opt.value);
          const selected = draft.includes(day);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggleDay(day)}
              disabled={setWorkDays.isPending}
              aria-pressed={selected}
              aria-label={`วัน${opt.label}`}
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
              key={p.label}
              size="compact-xs"
              variant={active ? "light" : "default"}
              color={active ? "blue" : "gray"}
              disabled={setWorkDays.isPending}
              onClick={() => setDraft(p.days)}
              leftSection={active ? <span aria-hidden>✓</span> : undefined}
            >
              {p.label}
            </Button>
          );
        })}
      </Group>

      {/* แถวบันทึก — โผล่เฉพาะตอนมีการแก้ (dirty) */}
      {dirty && (
        <Group justify="space-between" mt={4}>
          <span className="text-xs text-warning">• มีการแก้ไข</span>
          <Group gap={6}>
            <Button
              size="sm"
              px="lg"
              variant="subtle"
              color="gray"
              onClick={reset}
              disabled={setWorkDays.isPending}
            >
              ยกเลิก
            </Button>
            <Button size="sm" px="lg" onClick={save} loading={setWorkDays.isPending}>
              บันทึก
            </Button>
          </Group>
        </Group>
      )}
    </div>
  );
}
