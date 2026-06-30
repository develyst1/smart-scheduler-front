"use client";

import { Button, Group, MultiSelect } from "@mantine/core";
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

export default function TeacherWorkDaysSelect({ teacherId, nickname, workDays }: Props) {
  const setWorkDays = useSetTeacherWorkDays();
  const current = workDays?.length ? workDays : [...ALL_WORK_DAYS];
  const value = current.map(String);

  const save = (days: number[]) => {
    if (days.length === 0) {
      notify({ title: "เลือกอย่างน้อย 1 วัน", color: "warning" });
      return;
    }
    setWorkDays.mutate(
      { id: teacherId, workDays: days },
      {
        onSuccess: () =>
          notify({
            title: "บันทึกวันที่มาสอนแล้ว",
            description: `${nickname} · ${formatWorkDaysLabel(days)}`,
            color: "success",
          }),
      },
    );
  };

  return (
    <div className="mt-2 space-y-2">
      <MultiSelect
        size="xs"
        label="วันที่มาสอน"
        description="ปฏิทินจะแสดงครูเฉพาะวันที่เลือก"
        data={WORK_DAY_OPTIONS}
        value={value}
        onChange={(v) => save(v.map(Number))}
        disabled={setWorkDays.isPending}
        clearable={false}
        maxDropdownHeight={200}
      />
      <Group gap={6} wrap="wrap">
        {WORK_DAY_PRESETS.map((p) => (
          <Button
            key={p.label}
            size="compact-xs"
            variant="light"
            color="gray"
            disabled={setWorkDays.isPending}
            onClick={() => save(p.days)}
          >
            {p.label}
          </Button>
        ))}
      </Group>
    </div>
  );
}
