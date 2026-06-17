"use client";

import { Card, CardBody, Button, Progress, Chip, addToast } from "@heroui/react";
import { LockKeyholeOpen, Lock } from "lucide-react";
import { useAdminUnlockCourse, useCoursePackages } from "@/hooks/scheduler";
import type { CoursePackageView } from "@/types/app/scheduler";

export default function CoursePackagePanel() {
  const { data: courses = [] } = useCoursePackages();
  const unlock = useAdminUnlockCourse();

  const handleUnlock = async (c: CoursePackageView) => {
    await unlock.mutateAsync(c.id);
    addToast({
      title: "ปลดล็อกการลาแล้ว (กรณีพิเศษ)",
      description: `${c.studentName} สามารถเลื่อนตารางเพิ่มได้`,
      color: "warning",
    });
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {courses.map((c) => (
        <Card key={c.id} shadow="sm">
          <CardBody className="gap-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold">{c.studentName}</p>
                <p className="text-xs text-default-400">คอร์ส {c.size} ครั้ง · หมดอายุ {c.expiryDate}</p>
              </div>
              {c.leaveLocked ? (
                <Chip size="sm" color="danger" variant="flat" startContent={<Lock size={13} />}>
                  ล็อก
                </Chip>
              ) : c.adminUnlocked ? (
                <Chip size="sm" color="warning" variant="flat">
                  ปลดล็อกพิเศษ
                </Chip>
              ) : (
                <Chip size="sm" color="success" variant="flat">
                  ปกติ
                </Chip>
              )}
            </div>

            <div>
              <div className="mb-1 flex justify-between text-xs text-default-500">
                <span>เรียนไปแล้ว</span>
                <span>
                  {c.usedSessions}/{c.size} ครั้ง
                </span>
              </div>
              <Progress
                aria-label="ความคืบหน้าคอร์ส"
                size="sm"
                value={(c.usedSessions / c.size) * 100}
                color="primary"
              />
            </div>

            <div>
              <div className="mb-1 flex justify-between text-xs text-default-500">
                <span>สิทธิ์การลา</span>
                <span>
                  ใช้ไป {c.leaveUsed}/{c.leaveQuota} · เหลือ {c.leaveRemaining}
                </span>
              </div>
              <Progress
                aria-label="โควตาการลา"
                size="sm"
                value={(c.leaveUsed / c.leaveQuota) * 100}
                color={c.leaveLocked ? "danger" : c.leaveRemaining === 0 ? "warning" : "success"}
              />
              <p className="mt-1 text-[11px] text-default-400">
                ขยายตารางได้ถึงสัปดาห์ที่ {c.maxWeek}
              </p>
            </div>

            {c.leaveLocked && (
              <Button
                size="sm"
                color="warning"
                variant="flat"
                startContent={<LockKeyholeOpen size={15} />}
                isLoading={unlock.isPending}
                onPress={() => handleUnlock(c)}
              >
                ปลดล็อก (แอดมิน)
              </Button>
            )}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
