"use client";

import { Card, Button, Progress, Badge, RingProgress, Text, Group, Stack, Loader } from "@mantine/core";
import { LockKeyholeOpen, Lock, GraduationCap } from "lucide-react";
import { useSetCourseAdminUnlock, useCoursePackages } from "@/hooks/scheduler";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import { MANTINE_COLOR } from "@/lib/ui/colors";
import { useT } from "@/lib/i18n";
import type { CoursePackageView } from "@/types/app/scheduler";

export default function CoursePackagePanel() {
  const t = useT();
  const { data: courses = [], isLoading } = useCoursePackages();
  const setUnlock = useSetCourseAdminUnlock();

  const handleUnlock = async (c: CoursePackageView) => {
    try {
      await setUnlock.mutateAsync({ id: c.id, unlocked: true });
      notify({
        title: t("course.unlockedTitle"),
        description: t("course.unlockedDesc", { student: c.studentName }),
        color: "warning",
      });
    } catch (e) {
      const msg =
        e instanceof ApiClientError ? e.message : t("course.unlockFailGeneric");
      notify({ title: t("course.unlockFailTitle"), description: msg, color: "danger" });
    }
  };

  const handleRelock = async (c: CoursePackageView) => {
    try {
      await setUnlock.mutateAsync({ id: c.id, unlocked: false });
      notify({
        title: t("course.relockedTitle"),
        description: t("course.relockedDesc", { student: c.studentName }),
        color: "default",
      });
    } catch (e) {
      const msg =
        e instanceof ApiClientError ? e.message : t("course.relockFailGeneric");
      notify({ title: t("course.relockFailTitle"), description: msg, color: "danger" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-sm text-default-500">
        <Loader size="md" />
        {t("common.loading")}
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <Card padding="xl">
        <Group justify="center" c="dimmed" gap="xs">
          <GraduationCap size={18} />
          <Text size="sm">{t("course.empty")}</Text>
        </Group>
      </Card>
    );
  }

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
                    {t("course.summary", { size: c.size, expiry: c.expiryDate })}
                  </p>
                </div>
                {c.leaveLocked ? (
                  <Badge color="red" variant="light" leftSection={<Lock size={13} />}>
                    {t("course.locked")}
                  </Badge>
                ) : c.adminUnlocked ? (
                  <Badge color="orange" variant="light">
                    {t("course.specialUnlock")}
                  </Badge>
                ) : (
                  <Badge color="green" variant="light">
                    {t("course.normal")}
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
                        {t("course.sessionsUnit")}
                      </Text>
                    </div>
                  }
                />

                <div className="flex-1">
                  <div className="mb-1 flex justify-between text-xs text-default-500">
                    <span>{t("course.leaveQuota")}</span>
                    <span>{t("course.leftN", { n: c.leaveRemaining })}</span>
                  </div>
                  <Progress
                    size="md"
                    radius="xl"
                    value={(c.leaveUsed / c.leaveQuota) * 100}
                    color={leaveColor}
                  />
                  <p className="mt-1.5 text-[11px] text-default-400">
                    {t("course.usage", { used: c.leaveUsed, quota: c.leaveQuota, week: c.maxWeek })}
                  </p>
                </div>
              </Group>

              {c.leaveLocked ? (
                <Button
                  size="xs"
                  color="orange"
                  variant="light"
                  fullWidth
                  leftSection={<LockKeyholeOpen size={15} />}
                  loading={setUnlock.isPending && setUnlock.variables?.id === c.id}
                  onClick={() => handleUnlock(c)}
                >
                  {t("course.unlockBtn")}
                </Button>
              ) : (
                c.adminUnlocked && (
                  <Button
                    size="xs"
                    color="gray"
                    variant="light"
                    fullWidth
                    leftSection={<Lock size={15} />}
                    loading={setUnlock.isPending && setUnlock.variables?.id === c.id}
                    onClick={() => handleRelock(c)}
                  >
                    {t("course.relockBtn")}
                  </Button>
                )
              )}
            </Stack>
          </Card>
        );
      })}
    </div>
  );
}
