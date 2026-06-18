"use client";

import { Card, Button, Progress, Badge, RingProgress, Text, Group, Stack } from "@mantine/core";
import { LockKeyholeOpen, Lock } from "lucide-react";
import { useAdminUnlockCourse, useCoursePackages } from "@/hooks/scheduler";
import { notify } from "@/lib/ui/notify";
import { MANTINE_COLOR } from "@/lib/ui/colors";
import type { CoursePackageView } from "@/types/app/scheduler";

export default function CoursePackagePanel() {
  const { data: courses = [] } = useCoursePackages();
  const unlock = useAdminUnlockCourse();

  const handleUnlock = async (c: CoursePackageView) => {
    await unlock.mutateAsync(c.id);
    notify({
      title: "ปลดล็อกการลาแล้ว (กรณีพิเศษ)",
      description: `${c.studentName} สามารถเลื่อนตารางเพิ่มได้`,
      color: "warning",
    });
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {courses.map((c) => {
        const leaveColor = c.leaveLocked
          ? MANTINE_COLOR.danger
          : c.leaveRemaining === 0
            ? MANTINE_COLOR.warning
            : MANTINE_COLOR.success;

        return (
          <Card key={c.id} padding="lg">
            <Stack gap="md">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">{c.studentName}</p>
                  <p className="text-xs text-default-400">
                    คอร์ส {c.size} ครั้ง · หมดอายุ {c.expiryDate}
                  </p>
                </div>
                {c.leaveLocked ? (
                  <Badge color="red" variant="light" leftSection={<Lock size={13} />}>
                    ล็อก
                  </Badge>
                ) : c.adminUnlocked ? (
                  <Badge color="orange" variant="light">
                    ปลดล็อกพิเศษ
                  </Badge>
                ) : (
                  <Badge color="green" variant="light">
                    ปกติ
                  </Badge>
                )}
              </div>

              <Group gap="lg" wrap="nowrap">
                <RingProgress
                  size={92}
                  thickness={9}
                  roundCaps
                  sections={[{ value: (c.usedSessions / c.size) * 100, color: "blue" }]}
                  label={
                    <div className="text-center">
                      <Text size="lg" fw={700} lh={1}>
                        {c.usedSessions}/{c.size}
                      </Text>
                      <Text size="xs" c="dimmed">
                        ครั้ง
                      </Text>
                    </div>
                  }
                />

                <div className="flex-1">
                  <div className="mb-1 flex justify-between text-xs text-default-500">
                    <span>สิทธิ์การลา</span>
                    <span>เหลือ {c.leaveRemaining}</span>
                  </div>
                  <Progress
                    size="md"
                    radius="xl"
                    value={(c.leaveUsed / c.leaveQuota) * 100}
                    color={leaveColor}
                  />
                  <p className="mt-1.5 text-[11px] text-default-400">
                    ใช้ไป {c.leaveUsed}/{c.leaveQuota} · ขยายได้ถึงสัปดาห์ที่ {c.maxWeek}
                  </p>
                </div>
              </Group>

              {c.leaveLocked && (
                <Button
                  size="xs"
                  color="orange"
                  variant="light"
                  fullWidth
                  leftSection={<LockKeyholeOpen size={15} />}
                  loading={unlock.isPending}
                  onClick={() => handleUnlock(c)}
                >
                  ปลดล็อก (แอดมิน)
                </Button>
              )}
            </Stack>
          </Card>
        );
      })}
    </div>
  );
}
