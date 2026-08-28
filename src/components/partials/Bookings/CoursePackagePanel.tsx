"use client";

import { useEffect, useState } from "react";
import { Card, Button, Progress, Badge, RingProgress, Text, Group, Stack, Loader, Modal, SegmentedControl, TextInput } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { LockKeyholeOpen, Lock, GraduationCap, Search, History, Ban } from "lucide-react";
import { useSetCourseAdminUnlock, useCoursePackages } from "@/hooks/scheduler";
import { COURSE_STATUSES, type CourseStatus } from "@/types/app/scheduler";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import { MANTINE_COLOR } from "@/lib/ui/colors";
import PagerBar from "@/components/common/PagerBar";
import CourseHistoryModal from "./CourseHistoryModal";
import { useT } from "@/lib/i18n";
import type { CoursePackageView } from "@/types/app/scheduler";

/** One place mapping lifecycle → colour, so the four states can't drift apart across screens. */
const COURSE_STATUS_COLOR: Record<CourseStatus, string> = {
  ACTIVE: "green",
  // A pause is not a failure and not an ending — amber reads as "on hold", distinct from CANCELLED's red and
  // EXPIRED's grey, so the four existing states keep their meanings.
  DROPPED: "yellow",
  COMPLETED: "blue",
  EXPIRED: "gray",
  CANCELLED: "red",
};

const PAGE_SIZE = 9;

export default function CoursePackagePanel({ onManage }: { onManage: (id: string) => void }) {
  const t = useT();
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [debounced]);
  // REQ-036 B3 (TASK-189) — default ACTIVE, so a cancelled course drops out of the everyday view but stays
  // findable. The filter goes to the SERVER, so paging and counts are true — TASK-186 filtered the current page
  // client-side, which miscounted across pages; that predicate is deleted, not left to rot.
  const [status, setStatus] = useState<CourseStatus>("ACTIVE");
  useEffect(() => setPage(1), [status]);
  const { data, isLoading } = useCoursePackages({
    q: debounced.trim() || undefined,
    status,
    page,
    limit: PAGE_SIZE,
  });
  const courses = data?.items ?? [];
  const total = data?.total ?? 0;
  // AC-B6 — the server's counts, over the search-filtered set before paging; they partition the unfiltered total.
  const counts = data?.counts;
  const setUnlock = useSetCourseAdminUnlock();

  // คอร์ส + ทิศทาง (unlock/relock) ที่รอการยืนยันใน modal
  const [pending, setPending] = useState<{ course: CoursePackageView; unlock: boolean } | null>(null);
  // คอร์สที่กำลังเปิดดูประวัติการตัดคอร์ส (TASK-120)
  const [historyId, setHistoryId] = useState<string | null>(null);

  const runUnlock = async () => {
    if (!pending) return;
    const { course: c, unlock } = pending;
    setPending(null);
    try {
      await setUnlock.mutateAsync({ id: c.id, unlocked: unlock });
      notify(
        unlock
          ? {
              title: t("course.unlockedTitle"),
              description: t("course.unlockedDesc", { student: c.studentName }),
              color: "warning",
            }
          : {
              title: t("course.relockedTitle"),
              description: t("course.relockedDesc", { student: c.studentName }),
              color: "default",
            },
      );
    } catch (e) {
      const msg =
        e instanceof ApiClientError
          ? e.message
          : t(unlock ? "course.unlockFailGeneric" : "course.relockFailGeneric");
      notify({
        title: t(unlock ? "course.unlockFailTitle" : "course.relockFailTitle"),
        description: msg,
        color: "danger",
      });
    }
  };

  return (
    <Stack gap="md">
      <Group gap="sm" wrap="wrap" align="center">
        <TextInput
          placeholder={t("bookings.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          leftSection={<Search size={16} />}
          className="max-w-md grow"
        />
        <SegmentedControl
          value={status}
          onChange={(v) => setStatus(v as CourseStatus)}
          data={COURSE_STATUSES.map((s) => ({
            value: s,
            // The count comes from the BE so the chips say what switching would actually find — a client
            // recount is the disagreement this task exists to remove.
            label: counts ? `${t(`course.status.${s}`)} (${counts[s]})` : t(`course.status.${s}`),
          }))}
        />
      </Group>
      {isLoading ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 text-sm text-muted-500">
          <Loader size="md" />
          {t("common.loading")}
        </div>
      ) : courses.length === 0 ? (
        <Card padding="xl">
          <Group justify="center" c="dimmed" gap="xs">
            <GraduationCap size={18} />
            {/* The empty state has to name WHICH view is empty — "no courses" under an Inactive filter
                would read as "nothing was ever cancelled", which is a different claim. */}
            <Text size="sm">
              {debounced.trim()
                ? t("bookings.noMatch")
                : status === "ACTIVE"
                  ? t("course.empty")
                  : t("course.emptyStatus", { status: t(`course.status.${status}`) })}
            </Text>
          </Group>
        </Card>
      ) : (
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
                  <p className="text-xs text-muted-400">
                    {t("course.summary", { size: c.size, expiry: c.expiryDate })}
                  </p>
                  {c.subject?.name && (
                    <p className="mt-0.5 text-xs text-muted-400">
                      {t("course.program")}:{" "}
                      <span className="font-medium text-muted-600">{c.subject.name}</span>
                    </p>
                  )}
                </div>
                {/* 🔴 TASK-189 — LIFECYCLE comes from the server's ONE `status` field. The FE no longer computes
                    "is it over": that second computation is exactly what let a cancelled course show a green
                    `ปกติ`. Quota state (leave-lock / special-unlock) is ORTHOGONAL and stays its own indicator —
                    a locked course is still ACTIVE — so the two are shown side by side, never collapsed. */}
                <Group gap={6} wrap="nowrap">
                  <Badge
                    color={COURSE_STATUS_COLOR[c.status]}
                    variant="light"
                    leftSection={c.status === "CANCELLED" ? <Ban size={13} /> : undefined}
                  >
                    {c.status === "CANCELLED" && c.endReason
                      ? t("course.endedWithReason", { reason: t(`endCourse.${c.endReason}`) })
                      : t(`course.status.${c.status}`)}
                  </Badge>
                  {c.leaveLocked ? (
                    <Badge color="red" variant="light" leftSection={<Lock size={13} />}>
                      {t("course.locked")}
                    </Badge>
                  ) : c.adminUnlocked ? (
                    <Badge color="orange" variant="light">
                      {t("course.specialUnlock")}
                    </Badge>
                  ) : null}
                </Group>
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
                  <div className="mb-1 flex justify-between text-xs text-muted-500">
                    <span>{t("course.leaveQuota")}</span>
                    <span>{t("course.leftN", { n: c.leaveRemaining })}</span>
                  </div>
                  <Progress
                    size="md"
                    radius="xl"
                    value={(c.leaveUsed / c.leaveQuota) * 100}
                    color={leaveColor}
                  />
                  <p className="mt-1.5 text-[11px] text-muted-400">
                    {t("course.usage", { used: c.leaveUsed, quota: c.leaveQuota, week: c.maxWeek })}
                  </p>
                </div>
              </Group>

              <Group gap="xs" grow>
                <Button
                  size="xs"
                  variant="light"
                  color="blue"
                  leftSection={<GraduationCap size={15} />}
                  onClick={() => onManage(c.id)}
                >
                  {t("plan.manage")}
                </Button>
                <Button
                  size="xs"
                  variant="light"
                  color="gray"
                  leftSection={<History size={15} />}
                  onClick={() => setHistoryId(c.id)}
                >
                  {t("history.button")}
                </Button>
              </Group>

              {c.leaveLocked ? (
                <Button
                  size="xs"
                  color="orange"
                  variant="light"
                  fullWidth
                  leftSection={<LockKeyholeOpen size={15} />}
                  loading={setUnlock.isPending && setUnlock.variables?.id === c.id}
                  onClick={() => setPending({ course: c, unlock: true })}
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
                    onClick={() => setPending({ course: c, unlock: false })}
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
      )}

      <PagerBar total={total} page={page} limit={PAGE_SIZE} onPage={setPage} />

      <Modal
        opened={pending !== null}
        onClose={() => setPending(null)}
        centered
        title={
          pending?.unlock ? t("course.unlockConfirmTitle") : t("course.relockConfirmTitle")
        }
      >
        <Stack gap="lg">
          <Text size="sm">
            {pending
              ? t(pending.unlock ? "course.unlockConfirmMsg" : "course.relockConfirmMsg", {
                  student: pending.course.studentName,
                })
              : null}
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setPending(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              color={pending?.unlock ? "orange" : "gray"}
              leftSection={pending?.unlock ? <LockKeyholeOpen size={15} /> : <Lock size={15} />}
              loading={setUnlock.isPending}
              onClick={runUnlock}
            >
              {t("common.confirm")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <CourseHistoryModal courseId={historyId} onClose={() => setHistoryId(null)} />
    </Stack>
  );
}
