"use client";

import { useEffect, useState } from "react";
import { Card, Button, Progress, Badge, RingProgress, Text, Group, Stack, Skeleton, Modal, SegmentedControl, TextInput, UnstyledButton } from "@mantine/core";
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
import { useLoadPhase } from "@/lib/ui/load-phase";
import { SKEL, SKEL_RADIUS } from "@/components/common/skeleton";
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
  // `isPlaceholderData` = the rows in `data` belong to the PREVIOUS query key. See `busy` below.
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
  /** Either there is nothing yet, or what we hold answers a question staff have already moved on from. */
  const busy = isLoading || isPlaceholderData;
  // 🔴 One shared rule for the wait (`lib/ui/load-phase.ts`): under ~200ms nothing is drawn at all, because a
  // skeleton that appears and vanishes inside the window a person reads as *instant* is a flash, not a signal.
  // `data !== undefined` — NOT `courses.length` — is what keeps a first load `quiet` instead of flashing the
  // empty state before the first page arrives.
  const phase = useLoadPhase(busy, data !== undefined);
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
          courses sat on screen, unchanged, while the new ones were fetched. Nothing on the page moved: staff
          pressed `ยกเลิก (34)` and were shown 9 active courses with no sign that anything was happening.

          ⇒ `busy` adds `isPlaceholderData` — "what you are looking at is not what you asked for". It is the
          exact condition, not a proxy: a background refetch of the SAME key leaves it false, and that one
          genuinely needs no spinner.

          🔴 The list is REMOVED while busy, not dimmed. Rows from the status you just left are the wrong
          answer to the question on screen, and a wrong answer at 40% opacity is still a wrong answer being
          read — worse, it is one that looks deliberate.

          🔴 A SKELETON rather than a centred spinner, and the difference is the two costs a spinner has here.
          (1) A spinner in a fixed box collapses a grid of nine cards to `h-64` and springs it back, taking the
          scroll position with it. (2) On a fast reply it appears and vanishes inside ~100ms — a flash, which is
          more distracting than either alternative. Placeholder cards in the SAME grid keep the height and read
          as "this shape, arriving" instead of as an event.
          ⚠️ So `keepPreviousData` no longer changes anything visible on this screen; it is left in the hook
          because the cached page still spares a refetch when staff switch back — and because `courses.length`
          is what lets the skeleton match the height that is on screen right now. */}
      {phase === "skeleton" ? (
        <CourseCardSkeletons count={courses.length || PAGE_SIZE} />
      ) : phase === "quiet" ? null : courses.length === 0 ? (
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
                    {t("course.sizeLine", { size: c.size })} ·{" "}
                    {/* 🔴 SPEC-076 / REQ-082 AC-1 (TASK-265) — editable on ANY course, and deliberately NOT
                        lifecycle-gated. TASK-264 left the endpoint ungated for the same reason: REQ-084's
                        resume warning points the admin at THIS control on a course that is `DROPPED` at that
                        moment, so a gate would aim the warning at a control that refuses.
                        ⚠️ This is the one place today where TASK-262's *"gate the control on lifecycle"*
                        instinct does NOT apply, and it is deliberate.

                        🔴 TASK-311 §1 (`REQ-085 §12.1`, the owner: *"ขวาบน ควรแก้ได้"*) — **the DATE is the
                        control now, not a 14px icon beside it.** Before this, `expires 12 Oct 26` was a label
                        and the only clickable thing was a subtle grey icon after it — the capability existed
                        and the screen did not say so. The dialog is unchanged; this is its same entry point,
                        grown to cover the words the owner reads. 🚫 Not moved: the icon stays, inside the
                        button, so it is one control and not two adjacent ones doing the same thing. */}
                    <UnstyledButton
                      onClick={() => setExpiryTarget(c)}
                      aria-label={t("expiry.edit")}
                      title={t("expiry.edit")}
                      className="inline-flex items-center gap-1 align-baseline text-xs text-muted-400 underline decoration-dotted underline-offset-2 hover:text-muted-600"
                    >
                      {t("course.expiresOn", { expiry: c.expiryDate })}
                      <CalendarClock size={14} />
                    </UnstyledButton>
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

      {/* Hidden with the list. Paging is one of the switches that triggers the wait, and a pager that keeps
          saying "page 2 of 4" over a skeleton is describing the result that just went away. */}
      {phase === "content" && <PagerBar total={total} page={page} limit={PAGE_SIZE} onPage={setPage} />}

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

/**
 * The loading state for the course grid — placeholder cards, not a spinner.
 *
 * 🔴 It mirrors the REAL card's boxes, at their real sizes: the two header lines, the badge, the `size={92}`
 * ring, the leave bar, the two footer buttons. That is what makes the swap to real data land in place instead
 * of reflowing — a generic grey rectangle would keep the flicker it exists to remove.
 *
 * ⚠️ **`count` is the caller's current row count**, not `PAGE_SIZE`: `keepPreviousData` still holds the page
 * being replaced, so asking for that many keeps the exact height already on screen and the scroll position with
 * it. `PAGE_SIZE` is the fallback for the first load, where there is nothing on screen to match.
 *
 * 🚫 Not exported. If a second list ever needs one it needs its OWN shape — a skeleton shared between two
 * different card layouts is a skeleton that fits neither.
 */
function CourseCardSkeletons({ count }: { count: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy aria-live="polite">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} padding="lg">
          <Stack gap="md">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <Skeleton height={SKEL.title} width="55%" radius={SKEL_RADIUS} />
                <Skeleton height={SKEL.meta} width="80%" mt={8} radius={SKEL_RADIUS} />
              </div>
              <Skeleton height={SKEL.badge} width={70} radius={SKEL_RADIUS} />
            </div>
            <Group gap="lg" wrap="nowrap">
              <Skeleton height={92} width={92} circle />
              <div className="flex-1">
                <Skeleton height={SKEL.meta} width="45%" radius={SKEL_RADIUS} />
                <Skeleton height={SKEL.meta} mt={8} radius="xl" />
                <Skeleton height={SKEL.meta} width="70%" mt={8} radius={SKEL_RADIUS} />
              </div>
            </Group>
            <Group gap="xs" grow>
              <Skeleton height={SKEL.button} radius={SKEL_RADIUS} />
              <Skeleton height={SKEL.button} radius={SKEL_RADIUS} />
            </Group>
          </Stack>
        </Card>
      ))}
    </div>
  );
}
