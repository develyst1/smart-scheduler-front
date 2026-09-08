"use client";

import { useEffect, useState } from "react";
import { Card, Button, Progress, Badge, RingProgress, Text, Group, Stack, Loader, Modal, SegmentedControl, TextInput, ActionIcon } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { LockKeyholeOpen, Lock, GraduationCap, Search, History, Ban, CalendarClock } from "lucide-react";
import { useSetCourseAdminUnlock, useCoursePackages } from "@/hooks/scheduler";
import { COURSE_STATUSES, type CourseStatus } from "@/types/app/scheduler";
import { isCourseWritable } from "@/lib/scheduler/course-lifecycle";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import { MANTINE_COLOR } from "@/lib/ui/colors";
import PagerBar from "@/components/common/PagerBar";
import CourseHistoryModal from "./CourseHistoryModal";
import EditExpiryDialog from "./EditExpiryDialog";
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
  // `isPlaceholderData` = the rows on screen belong to the PREVIOUS query key. See the spinner below.
  const { data, isLoading, isPlaceholderData } = useCoursePackages({
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
  // REQ-082 AC-1 (TASK-265) — the course whose expiry is being moved; `null` = the dialog is closed.
  const [expiryTarget, setExpiryTarget] = useState<CoursePackageView | null>(null);

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

      {/* 🔴 `isLoading` fires on the FIRST load only. Every switch after that — a status tab, a search, a page —
          is a new query key served by `keepPreviousData`, so `isLoading` stays false and the PREVIOUS status's
          courses sit on screen, unchanged, while the new ones are fetched. Nothing on the page moved: staff
          pressed `ยกเลิก (34)` and were shown 9 active courses with no sign that anything was happening.

          ⇒ the signal is `isPlaceholderData` — "what you are looking at is not what you asked for" — and it is
          the exact condition, not a proxy: a background refetch of the SAME key leaves it false, and that one
          genuinely needs no spinner.

          🚫 The old rows are NOT swapped for a spinner. Keeping them is the whole point of `keepPreviousData`
          (no collapse to an empty box, no scroll jump); they are dimmed and made unclickable so they read as
          on their way out rather than as the answer. `aria-busy` says the same thing to a screen reader. */}
      <div className="relative" aria-busy={isPlaceholderData}>
        {isPlaceholderData && (
          <div className="absolute inset-x-0 top-0 z-10 flex justify-center pt-20">
            <Loader size="md" />
          </div>
        )}
        <div
          className={
            isPlaceholderData ? "pointer-events-none opacity-40 transition-opacity" : "transition-opacity"
          }
        >
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
                    {/* 🔴 SPEC-076 / REQ-082 AC-1 (TASK-265) — editable on ANY course, and deliberately NOT
                        lifecycle-gated. TASK-264 left the endpoint ungated for the same reason: REQ-084's
                        resume warning points the admin at THIS control on a course that is `DROPPED` at that
                        moment, so a gate would aim the warning at a control that refuses.
                        ⚠️ This is the one place today where TASK-262's *"gate the control on lifecycle"*
                        instinct does NOT apply, and it is deliberate. */}
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="sm"
                      ml={6}
                      aria-label={t("expiry.edit")}
                      onClick={() => setExpiryTarget(c)}
                    >
                      <CalendarClock size={14} />
                    </ActionIcon>
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

              {/* 🔴 REQ-084 AC-C / TASK-262 — **the second surface the sweep found.** These were gated on
                  `leaveLocked` / `adminUnlocked` alone — on the LEAVE state, never on the course's lifecycle —
                  so a `DROPPED` (or ended) course still offered ปลดล็อก. `updateCourse` runs through
                  `assertCourseWritable` (`scheduler.service.ts:3224`) and refuses it, which makes this the same
                  defect as AC-A wearing a different button: **a control offered for a call the server rejects.**
                  Same predicate as the plan modal's, so the two cannot drift apart. */}
              {isCourseWritable(c.status) &&
                (c.leaveLocked ? (
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
                ))}
            </Stack>
          </Card>
        );
          })}
        </div>
      )}

      {/* Inside the dimmed region: paging is one of the switches that triggers it, so the pager must not stay
          live while the page it belongs to is being replaced. */}
      <PagerBar total={total} page={page} limit={PAGE_SIZE} onPage={setPage} />
        </div>
      </div>

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

      {/* REQ-082 AC-1 — reachable for every course the filter can show, DROPPED included (see the control). */}
      <EditExpiryDialog course={expiryTarget} onClose={() => setExpiryTarget(null)} />
    </Stack>
  );
}
