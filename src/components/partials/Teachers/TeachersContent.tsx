"use client";

import { Card, Switch, Loader, Button, Group, Stack } from "@mantine/core";
import { PowerOff, Power } from "lucide-react";
import { TeacherTypeChip } from "@/components/common/BookingBadges";
import { notify } from "@/lib/ui/notify";
import {
  useTeachers,
  useToggleTeacher,
  useToggleTeacherType,
} from "@/hooks/scheduler";
import type { Teacher, TeacherType } from "@/types/app/scheduler";
import { TEACHER_TYPE_LABEL } from "@/types/app/scheduler";

const GROUP_ORDER: TeacherType[] = ["FULL_TIME", "PART_TIME", "FREELANCE"];

export default function TeachersContent() {
  const { data: teachers = [], isLoading } = useTeachers();
  const toggle = useToggleTeacher();
  const toggleType = useToggleTeacherType();

  if (isLoading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-sm text-default-500">
        <Loader size="md" />
        กำลังโหลด...
      </div>
    );
  }

  const handleToggle = (t: Teacher) =>
    toggle.mutate({ id: t.id, active: !t.active });

  const handleToggleType = (type: TeacherType, active: boolean) => {
    toggleType.mutate({ type, active });
    notify({
      title: `${active ? "เปิด" : "ปิด"}รับงานครู ${TEACHER_TYPE_LABEL[type]} ทั้งหมด`,
      description: active ? undefined : "ครูกลุ่มนี้จะไม่แสดงในตารางจองของเดือนนี้",
      color: active ? "success" : "default",
    });
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-default-500">
        จัดลำดับการรับงาน: Full-time / Part-time (เหมาจ่าย) ก่อน แล้วจึงกระจายงานให้ Freelance ·
        ปิดสิทธิ์รับงานเพื่อไม่ให้ครูแสดงในตารางจอง
      </p>

      {GROUP_ORDER.map((type) => {
        const group = teachers.filter((t) => t.type === type);
        if (group.length === 0) return null;
        const allActive = group.every((t) => t.active);

        return (
          <Card key={type} withBorder shadow="sm" radius="md" padding="md">
            <Group justify="space-between" mb="sm">
              <div className="flex items-center gap-2">
                <TeacherTypeChip type={type} size="md" />
                <span className="text-sm text-default-400">{group.length} คน</span>
              </div>
              <Button
                size="xs"
                variant="light"
                color={allActive ? "gray" : "green"}
                leftSection={allActive ? <PowerOff size={15} /> : <Power size={15} />}
                onClick={() => handleToggleType(type, !allActive)}
              >
                {allActive ? "ปิดทั้งกลุ่ม" : "เปิดทั้งกลุ่ม"}
              </Button>
            </Group>
            <Stack gap="xs">
              {group.map((t) => (
                <div
                  key={t.id}
                  className={`flex items-center justify-between rounded-xl border border-default-100 p-3 transition-colors hover:bg-default-100/60 ${
                    t.active ? "" : "opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-default-100 to-default-200 text-sm font-semibold text-default-600">
                      {t.nickname.slice(0, 2)}
                    </span>
                    <div>
                      <p className="font-medium">{t.name}</p>
                      <p className="text-xs text-default-400">
                        ({t.nickname}) · {t.subjects.join(", ")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs ${t.active ? "text-success" : "text-default-400"}`}>
                      {t.active ? "รับงาน" : "ปิดรับงาน"}
                    </span>
                    <Switch
                      checked={t.active}
                      onChange={() => handleToggle(t)}
                      aria-label={`สลับสถานะ ${t.name}`}
                    />
                  </div>
                </div>
              ))}
            </Stack>
          </Card>
        );
      })}
    </div>
  );
}
