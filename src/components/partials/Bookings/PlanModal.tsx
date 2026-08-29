"use client";

import { useEffect, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Center,
  Group,
  Input,
  Loader,
  Menu,
  Modal,
  Select,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { Textarea, Tooltip } from "@mantine/core";
import { AlertTriangle, Ban, CalendarPlus, Check, MoreHorizontal, PauseCircle, Pencil, PlayCircle, Ticket, UserMinus, X } from "lucide-react";
import dayjs from "dayjs";
import { notify } from "@/lib/ui/notify";
import { formatDateDisplay } from "@/lib/ui/format";
import { useT } from "@/lib/i18n";
import { ApiClientError } from "@/lib/api/client";
import { StatusChip } from "@/components/common/BookingBadges";
import { bookableOnDate } from "@/lib/scheduler/work-days";
import {
  useAddExtraSession,
  useApplyPlanChange,
  useCancelBooking,
  useConfirmCourse,
  useSetAttendeeNote,
  useEntitlementPlan,
  useMoveBooking,
  usePreviewPlanChange,
  useSlotAvailability,
  useTeachers,
} from "@/hooks/scheduler";
import {
  TIME_SLOTS,
  isDeliveredStatus,
  type BookingStatus,
  type EntitlementPlan,
  type PlanChange,
  type PlanPreview,
  type PlanSession,
} from "@/types/app/scheduler";
import StickyScrollArea from "@/components/common/StickyScrollArea";
import EndCourseDialog from "./EndCourseDialog";
import { useConfirm } from "@/components/common/useConfirm";
import DropResumeDialog from "./DropResumeDialog";
import AttendeeNoteInput from "@/components/common/AttendeeNoteInput";

/** PENDING / CONFIRMED / EXTENDED — a live session that can be plainly cancelled (re-owes, no reason). */
const isLiveStatus = (s: string) => s === "PENDING" || s === "CONFIRMED" || s === "EXTENDED";

interface Props {
  opened: boolean;
  onClose: () => void;
  /** Edit mode: the course/voucher entitlement id to fetch + edit. */
  entitlementId: string | null;
  mode?: "edit" | "create";
  /** Create mode: a pre-generated plan to render + confirm (TASK-098 wraps this). */
  initialPlan?: EntitlementPlan;
  /** Create mode: overrides the confirm action; receives the (possibly edited) sessions. */
  onConfirm?: (sessions: PlanSession[]) => Promise<void>;
  /** SPEC-049 create mode — the 1-based weeks currently declared absent (owner's state, BE-echoed). */
  absentWeeks?: number[];
  /** SPEC-049 create mode — toggle one weekly row's planned-absence mark; the owner re-runs the BE preview. */
  onToggleAbsent?: (weekIndex: number) => void | Promise<void>;
  /** True while that preview is in flight — the plan on screen is stale until it lands. */
  previewPending?: boolean;
  /** AC-3 — the BE says this plan runs past MAX_WEEK; refuse before the user commits. */
  exceedsCeiling?: boolean;
}

type EditTarget =
  | { kind: "move"; session: PlanSession }
  | { kind: "insert" }
  | { kind: "extra" } // SPEC-033 — a charged single-session, out of quota
  | null;

export default function PlanModal({
  opened,
  onClose,
  entitlementId,
  mode = "edit",
  initialPlan,
  onConfirm,
  absentWeeks = [],
  onToggleAbsent,
  previewPending = false,
  exceedsCeiling = false,
}: Props) {
  const t = useT();
  const isCreate = mode === "create";
  const query = useEntitlementPlan(entitlementId, opened && !isCreate);
  const plan: EntitlementPlan | undefined = isCreate ? initialPlan : query.data;

  const [edit, setEdit] = useState<EditTarget>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PlanSession | null>(null); // TASK-105 (edit mode)
  const [pending, setPending] = useState<{ change: PlanChange; preview: PlanPreview } | null>(null); // TASK-115
  // Create mode edits a LOCAL draft (preview rows have no bookings yet); confirm sends the whole set to
  // POST /courses. Edit mode goes straight to the server (plan.sessions is the source of truth).
  const [draft, setDraft] = useState<PlanSession[]>([]);
  // REQ-036 — ending the course lives on the course's OWN plan, so it can only ever act on this one course.
  const [endOpen, setEndOpen] = useState(false);
  // TASK-199 — pause / resume. One dialog, two modes; `null` = closed.
  const [dropMode, setDropMode] = useState<"drop" | "resume" | null>(null);
  // TASK-202 — confirm every PENDING session at once. `skips` is kept in state because a skip is a fact the
  // admin must see: "10 confirmed" when 9 were is worse than 9 and the reason.
  const confirmCourseMut = useConfirmCourse();
  const [skips, setSkips] = useState<{ id: string; reason?: string }[]>([]);
  const previewMut = usePreviewPlanChange();
  const applyMut = useApplyPlanChange();

  useEffect(() => {
    if (!opened) {
      setEdit(null);
      setError(null);
      setCancelTarget(null);
      setPending(null);
      setEndOpen(false);
      setDropMode(null);
      setSkips([]);
    }
  }, [opened]);

  useEffect(() => {
    if (isCreate && plan) setDraft(plan.sessions);
  }, [isCreate, plan]);

  const isCourse = plan?.kind === "course";
  const sessions = isCreate ? draft : (plan?.sessions ?? []);
  // SPEC-049 — which weekly row is this? The BE builds (and previews) a course as the `size` weekly rows in
  // order, then the appended make-ups, and `CreatePlanFlow` maps that order straight into the draft. So a row's
  // 1-based week is its position, and anything past `size` is a make-up (→ 0 = "not a declarable week").
  const courseSize = plan?.summary.kind === "course" ? plan.summary.size : 0;
  const weekIndexOf = (s: PlanSession) => {
    const i = sessions.findIndex((x) => x.id === s.id);
    return i >= 0 && i < courseSize ? i + 1 : 0;
  };
  // What the BE says this plan now is — the preview headline (AC-1). Live = everything that isn't a declared
  // absence; the end date is the plan's own last live row, never FE-computed from the absence count.
  const liveSessions = sessions.filter((x) => x.status !== "SICK_LEAVE");
  const createPreviewLine = t("plan.createPreview", {
    n: liveSessions.length,
    d: absentWeeks.length,
    date: formatDateDisplay(plan?.liveEndDate ?? liveSessions[liveSessions.length - 1]?.date ?? ""),
  });
  const applyLocalEdit = (s: PlanSession) =>
    setDraft((prev) => prev.map((x) => (x.id === s.id ? s : x)));

  // TASK-115 — a course plan change (move / insert / mark-absence) dry-runs first, shows the diff, then applies.
  const requestChange = async (change: PlanChange) => {
    if (!plan) return;
    setError(null);
    setEdit(null);
    try {
      const preview = await previewMut.mutateAsync({ courseId: plan.id, change });
      setPending({ change, preview });
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t("plan.genericError"));
    }
  };
  const confirmChange = async () => {
    if (!plan || !pending) return;
    try {
      await applyMut.mutateAsync({ courseId: plan.id, change: pending.change });
      notify({ title: t("plan.changeApplied"), color: "success" });
      setPending(null);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t("plan.genericError"));
      setPending(null);
    }
  };
  const insertable = plan?.insertable !== false; // undefined (voucher/create) → allow; explicit false → disable
  const courseStatus = plan?.summary.kind === "course" ? plan.summary.status : undefined;
  // TASK-199 — a PAUSED course is as unwritable as a cancelled one, but it is not over: it gets a resume action
  // instead of nothing. Both read the server's status; neither re-derives "is it over" (TASK-189's rule).
  const courseDropped = courseStatus === "DROPPED";
  const courseEnded =
    courseStatus === "CANCELLED" || (plan?.summary.kind === "course" && !!plan.summary.endedAt);
  const courseWritable = !courseEnded && !courseDropped;
  const pendingCount = sessions.filter((s) => s.status === "PENDING").length;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={plan ? t("plan.title", { name: plan.student?.name ?? "—" }) : t("plan.loading")}
      centered
      radius="lg"
      size="1100px"
    >
      {!isCreate && query.isLoading ? (
        <Center h={200}>
          <Loader color="green" />
        </Center>
      ) : !isCreate && query.isError ? (
        <Alert color="red" icon={<AlertTriangle size={16} />}>
          {t("plan.loadError")}
        </Alert>
      ) : !plan ? null : (
        <Stack gap="md">
          <SummaryBar plan={plan} />

          {/* Every skip, with the SERVER's reason — the point of the endpoint returning per-session results. */}
          {skips.length > 0 && (
            <Alert color="orange" icon={<AlertTriangle size={16} />} variant="light" withCloseButton onClose={() => setSkips([])}>
              <Stack gap={2}>
                <Text fz="sm" fw={600}>{t("plan.confirmCourseSkipped", { n: skips.length })}</Text>
                {skips.map((s) => (
                  <Text key={s.id} fz="sm">
                    {s.reason ?? t("plan.genericError")}
                  </Text>
                ))}
              </Stack>
            </Alert>
          )}

          {error && (
            <Alert color="red" icon={<AlertTriangle size={16} />} withCloseButton onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <SessionTable
            sessions={sessions}
            onEdit={
              !courseWritable
                ? undefined
                : (session) => {
                    setError(null);
                    setEdit({ kind: "move", session });
                  }
            }
            onMarkAbsence={
              !isCourse
                ? undefined
                : isCreate
                  ? // SPEC-049 — create mode has no bookings yet: the "absence" is a declared week, so this
                    // toggles the week and the owner re-runs the BE preview. Free of quota by decision (B).
                    onToggleAbsent
                    ? (s) => onToggleAbsent(weekIndexOf(s))
                    : undefined
                  : (s) => requestChange({ kind: "mark-absence", bookingId: s.id, planned: true })
            }
            absenceLabelFor={
              isCourse && isCreate
                ? (s) =>
                    // Only the weekly chain can be declared absent — an appended make-up is the CONSEQUENCE of
                    // one, and offering it there would let staff chase their own tail.
                    weekIndexOf(s) === 0
                      ? null
                      : absentWeeks.includes(weekIndexOf(s))
                        ? t("plan.plannedAbsenceUndo")
                        : t("plan.plannedAbsence")
                : undefined
            }
            onCancelSession={
              !isCreate
                ? (session) => {
                    setError(null);
                    setCancelTarget(session);
                  }
                : undefined
            }
          />

          {isCourse && isCreate && (
            <Stack gap="xs">
              {/* AC-1 — n sessions · absent d · ends {date}, BEFORE saving. */}
              <Group gap="xs" wrap="wrap">
                <Text fz="sm" fw={500} className="tabular-nums">
                  {createPreviewLine}
                </Text>
                {previewPending && <Loader size="xs" />}
              </Group>
              {/* AC-3 — the ceiling is a refusal with its reason, never a silent trim. */}
              {exceedsCeiling && (
                <Alert color="orange" icon={<AlertTriangle size={16} />} variant="light">
                  {t("plan.ceilingRefusal", {
                    max: plan.summary.kind === "course" ? plan.summary.maxWeek : 0,
                  })}
                </Alert>
              )}
            </Stack>
          )}

          {/* REQ-036 — an ended course is offered no write action at all. TASK-185's server guard is the real
              protection; this exists so staff aren't handed a button whose only outcome is a 409. */}
          {isCourse && !isCreate && courseEnded && (
            <Text fz="sm" c="dimmed">
              {t("course.endedNoWrites")}
            </Text>
          )}

          {/* A paused course offers exactly one action: bring it back. Everything that would write to the
              schedule stays hidden — the server refuses it anyway (COURSE_DROPPED), so offering it would only
              hand staff a button that 409s. */}
          {isCourse && !isCreate && courseDropped && (
            <Group justify="space-between" wrap="wrap" gap="xs">
              <Text fz="sm" c="dimmed">
                {t("course.droppedNoWrites")}
              </Text>
              <Button
                variant="light"
                color="green"
                size="xs"
                leftSection={<PlayCircle size={14} />}
                onClick={() => {
                  setError(null);
                  setDropMode("resume");
                }}
              >
                {t("endCourse.resume")}
              </Button>
            </Group>
          )}

          {isCourse && !isCreate && courseWritable && (
            <Group justify="space-between" wrap="wrap" gap="xs">
              <Text fz="xs" c="dimmed">
                {t("plan.owedHint", { n: (plan.summary.kind === "course" ? plan.summary.owedCount : 0) })}
              </Text>
              <Group gap="xs">
                {/* REQ-036 — destructive and irreversible, so it is coloured as such, sits apart from the
                    add-a-session actions, and opens a SERVER-powered confirm rather than acting on the click. */}
                {/* TASK-202 — only meaningful while something is still PENDING, so it is not rendered otherwise:
                    a button whose only outcome is "0 confirmed" teaches staff to ignore it. */}
                {pendingCount > 0 && (
                  <Button
                    variant="light"
                    color="blue"
                    size="xs"
                    leftSection={<Check size={14} />}
                    loading={confirmCourseMut.isPending}
                    onClick={async () => {
                      setError(null);
                      setSkips([]);
                      try {
                        const res = await confirmCourseMut.mutateAsync(plan.id);
                        setSkips(res.results.filter((r) => r.outcome === "skipped"));
                        notify({
                          title: t("plan.confirmCourseDone", { n: res.confirmed }),
                          color: res.skipped > 0 ? "default" : "success",
                        });
                      } catch (e) {
                        setError(e instanceof ApiClientError ? e.message : t("plan.genericError"));
                      }
                    }}
                  >
                    {t("plan.confirmCourse", { n: pendingCount })}
                  </Button>
                )}
                {/* TASK-199 — a PAUSE sits beside the cancel but is visibly not it: amber, not red, because it
                    keeps the course, its slot and its size and can be undone. Cancel stays the grave one. */}
                <Button
                  variant="light"
                  color="yellow"
                  size="xs"
                  leftSection={<PauseCircle size={14} />}
                  onClick={() => {
                    setError(null);
                    setDropMode("drop");
                  }}
                >
                  {t("endCourse.drop")}
                </Button>
                <Button
                  variant="light"
                  color="red"
                  size="xs"
                  leftSection={<Ban size={14} />}
                  onClick={() => {
                    setError(null);
                    setEndOpen(true);
                  }}
                >
                  {t("endCourse.action")}
                </Button>
                {/* SPEC-033 — visibly separate from Insert: a charged single-session, not a quota reschedule. */}
                <Tooltip label={t("plan.extraHint")} withArrow multiline w={220}>
                  <Button
                    variant="light"
                    color="grape"
                    size="xs"
                    leftSection={<Ticket size={14} />}
                    onClick={() => {
                      setError(null);
                      setEdit({ kind: "extra" });
                    }}
                  >
                    {t("plan.extra")}
                  </Button>
                </Tooltip>
                <Tooltip label={insertable ? t("plan.insertHint") : t("plan.insertDisabled")} withArrow multiline w={220}>
                  <Button
                    variant="light"
                    size="xs"
                    leftSection={<CalendarPlus size={14} />}
                    disabled={!insertable}
                    onClick={() => {
                      setError(null);
                      setEdit({ kind: "insert" });
                    }}
                  >
                    {t("plan.insert")}
                  </Button>
                </Tooltip>
              </Group>
            </Group>
          )}

          {!isCourse && !isCreate && (
            <Text fz="xs" c="dimmed">
              {t("plan.voucherNote")}
            </Text>
          )}

          {edit && (
            <SessionEditor
              plan={plan}
              target={edit}
              onCancel={() => setEdit(null)}
              onDone={() => setEdit(null)}
              onError={setError}
              onLocalSave={isCreate ? (s) => { applyLocalEdit(s); setEdit(null); } : undefined}
              onPreviewApply={!isCreate && isCourse ? requestChange : undefined}
            />
          )}

          {pending && (
            <PlanDiffConfirm
              preview={pending.preview}
              onConfirm={confirmChange}
              onCancel={() => setPending(null)}
              busy={applyMut.isPending}
            />
          )}

          {cancelTarget && (
            <CancelSessionDialog
              session={cancelTarget}
              onClose={() => setCancelTarget(null)}
              onError={setError}
            />
          )}

          {isCreate && (
            <Group justify="flex-end" mt="sm">
              <Button variant="subtle" color="gray" onClick={onClose}>
                {t("common.cancel")}
              </Button>
              <ConfirmCreateButton
                sessions={draft}
                onConfirm={onConfirm}
                onError={setError}
                onDone={onClose}
                disabled={exceedsCeiling || previewPending}
                disabledHint={
                  exceedsCeiling
                    ? t("plan.ceilingRefusal", {
                        max: plan.summary.kind === "course" ? plan.summary.maxWeek : 0,
                      })
                    : undefined
                }
              />
            </Group>
          )}
        </Stack>
      )}

      {/* REQ-036 — one course only, opened from its own plan. On success the plan re-reads (owed → 0, remaining
          sessions gone) via the mutation's invalidation, and we close this modal behind it. */}
      <EndCourseDialog
        opened={endOpen}
        courseId={isCourse && !isCreate ? (plan?.id ?? null) : null}
        onClose={() => setEndOpen(false)}
        onEnded={onClose}
      />

      {/* The sentence uses the plan's OWN live-session count — there is no `/drop/preview`, and inventing a
          number here would be worse than using the one already on screen. */}
      <DropResumeDialog
        opened={dropMode !== null}
        mode={dropMode ?? "drop"}
        courseId={isCourse && !isCreate ? (plan?.id ?? null) : null}
        program={plan?.sessions[0]?.subject?.name ?? null}
        student={plan?.student?.nickname || plan?.student?.name || null}
        remaining={liveSessions.length}
        onClose={() => setDropMode(null)}
        onDone={onClose}
      />
    </Modal>
  );
}

function SummaryBar({ plan }: { plan: EntitlementPlan }) {
  const t = useT();
  // 🔴 REQ-036 — an ENDED course has no live sessions, which the generic branch below renders as "ยังไม่มีคาบ"
  // (never started). That is the opposite of the truth: the sessions were forfeited on purpose. Say so.
  const ended = plan.summary.kind === "course" ? plan.summary.endedAt : null;
  const endedReason = plan.summary.kind === "course" ? plan.summary.endReason : null;
  const end = plan.liveEndDate ? dayjs(plan.liveEndDate).format("D MMM YY") : t("plan.noLiveEnd");
  return (
    <div className="rounded-xl border border-muted-200 bg-muted-50/40 p-3">
      <Group justify="space-between" gap="xs">
        <Group gap="xs">
          <Badge variant="light" color={plan.kind === "course" ? "blue" : "grape"}>
            {t(plan.kind === "course" ? "plan.course" : "plan.voucher")}
          </Badge>
          {plan.summary.kind === "course" ? (
            <>
              <Text fz="sm">{t("plan.size", { size: plan.summary.size })}</Text>
              <Text fz="sm" c="dimmed">
                · {t("plan.leave", { used: plan.summary.leaveUsed, quota: plan.summary.leaveQuota })}
              </Text>
              {plan.summary.owedCount > 0 && (
                <Badge color="orange" variant="light">
                  {t("plan.owed", { n: plan.summary.owedCount })}
                </Badge>
              )}
            </>
          ) : (
            <Text fz="sm">
              {t("plan.hoursLeft", { remaining: plan.summary.hoursRemaining, total: plan.summary.totalHours })}
            </Text>
          )}
        </Group>
        {ended ? (
          <Text fz="sm" c="red" fw={600}>
            {endedReason
              ? t("course.endedPlanHeader", { reason: t(`endCourse.${endedReason}`) })
              : t("course.ended")}
          </Text>
        ) : (
          <Text fz="sm" c="dimmed">
            {t("plan.endsOn", { date: end })}
          </Text>
        )}
      </Group>
    </div>
  );
}

function SessionTable({
  sessions,
  onEdit,
  onMarkAbsence,
  absenceLabelFor,
  onCancelSession,
}: {
  sessions: PlanSession[];
  /** Absent ⇒ the row offers no edit at all (REQ-036: an ended course is read-only). */
  onEdit?: (s: PlanSession) => void;
  /** Edit mode, course only: mark a planned absence (goes through the preview-confirm). */
  onMarkAbsence?: (s: PlanSession) => void;
  /** Per-row label for that action — `null` hides it on this row (SPEC-049: create mode offers it only on the
   *  weekly-chain rows, never on an appended make-up, and its wording differs from the edit-mode one). */
  absenceLabelFor?: (s: PlanSession) => string | null;
  /** Edit mode: cancel a session (delivered → reason-prompt; live → plain). Absent in create mode. */
  onCancelSession?: (s: PlanSession) => void;
}) {
  const t = useT();

  if (sessions.length === 0) {
    return <Text c="dimmed" fz="sm">{t("plan.noSessions")}</Text>;
  }

  return (
    <StickyScrollArea minWidth={640}>
      <Table verticalSpacing="xs" fz="sm" className="whitespace-nowrap">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t("plan.colDate")}</Table.Th>
            <Table.Th>{t("plan.colTime")}</Table.Th>
            <Table.Th>{t("plan.colTeacher")}</Table.Th>
            <Table.Th>{t("plan.colSubject")}</Table.Th>
            <Table.Th>{t("plan.colStatus")}</Table.Th>
            <Table.Th data-pin="action" />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sessions.map((s) => {
            const locked = isDeliveredStatus(s.status);
            const isExtra = s.bookingType === "SINGLE_SESSION"; // SPEC-033 — a charged extra, not a plan row
            return (
              <Table.Tr key={s.id} className={locked ? "opacity-60" : ""}>
                <Table.Td className="tabular-nums">{formatDateDisplay(s.date)}</Table.Td>
                <Table.Td className="tabular-nums">{s.startTime.slice(0, 5)}</Table.Td>
                <Table.Td>{s.teacher?.nickname ?? "—"}</Table.Td>
                <Table.Td>{s.subject?.name ?? "—"}</Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    <StatusChip status={s.status as BookingStatus} />
                    {isExtra && (
                      <Badge size="xs" variant="light" color="grape">
                        {t("plan.extraBadge")}
                      </Badge>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td data-pin="action">
                  <SessionActions
                    session={s}
                    locked={locked}
                    isExtra={isExtra}
                    onEdit={onEdit}
                    onMarkAbsence={onMarkAbsence}
                    absenceLabel={absenceLabelFor ? absenceLabelFor(s) : undefined}
                    onCancelSession={onCancelSession}
                  />
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </StickyScrollArea>
  );
}

/** Per-row actions collapsed into a single dropdown so the row stays uncluttered on narrow screens.
 *  Delivered rows expose only cancel-with-reason (TASK-105); live rows get edit / mark-absence / cancel. */
function SessionActions({
  session,
  locked,
  isExtra,
  onEdit,
  onMarkAbsence,
  absenceLabel,
  onCancelSession,
}: {
  session: PlanSession;
  locked: boolean;
  isExtra: boolean;
  onEdit?: (s: PlanSession) => void;
  onMarkAbsence?: (s: PlanSession) => void;
  /** `undefined` = use the default wording; `null` = this row doesn't offer the action at all. */
  absenceLabel?: string | null;
  onCancelSession?: (s: PlanSession) => void;
}) {
  const t = useT();
  const canEdit = !locked && !!onEdit;
  const canMarkAbsence = !locked && !!onMarkAbsence && !isExtra && absenceLabel !== null;
  const canCancel = !!onCancelSession && (locked || isLiveStatus(session.status));

  if (!canEdit && !canMarkAbsence && !canCancel) {
    // Delivered with no cancel handler (create mode) — nothing actionable.
    return <Text fz="xs" c="dimmed" ta="right">{t("plan.locked")}</Text>;
  }

  return (
    <Group justify="flex-end" wrap="nowrap">
      <Menu position="bottom-end" withArrow shadow="md" width={180}>
        <Menu.Target>
          <ActionIcon variant="subtle" color="gray" aria-label={t("plan.actionsMenu")}>
            <MoreHorizontal size={16} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {canEdit && (
            <Menu.Item leftSection={<Pencil size={14} />} onClick={() => onEdit?.(session)}>
              {t("plan.edit")}
            </Menu.Item>
          )}
          {canMarkAbsence && (
            <Menu.Item
              leftSection={<UserMinus size={14} />}
              onClick={() => onMarkAbsence?.(session)}
            >
              {absenceLabel ?? t("plan.markAbsence")}
            </Menu.Item>
          )}
          {canCancel && (
            <>
              {(canEdit || canMarkAbsence) && <Menu.Divider />}
              <Menu.Item
                color="red"
                leftSection={<Ban size={14} />}
                onClick={() => onCancelSession?.(session)}
              >
                {t("plan.cancelSession")}
              </Menu.Item>
            </>
          )}
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}

/** The shared per-session editor (move an existing session, or insert a make-up) with the
 *  availability + clash view — the same surface the create flow (TASK-098) reuses. */
function SessionEditor({
  plan,
  target,
  onCancel,
  onDone,
  onError,
  onLocalSave,
  onPreviewApply,
}: {
  plan: EntitlementPlan;
  target: Exclude<EditTarget, null>;
  onCancel: () => void;
  onDone: () => void;
  onError: (msg: string | null) => void;
  /** Create mode: apply the edit to the local draft instead of the server. */
  onLocalSave?: (session: PlanSession) => void;
  /** Course edit mode: route move/insert through the preview-confirm flow (TASK-115). */
  onPreviewApply?: (change: PlanChange) => void | Promise<void>;
}) {
  const t = useT();
  const { data: teachers = [] } = useTeachers();
  const move = useMoveBooking();
  const extra = useAddExtraSession();
  const [submitting, setSubmitting] = useState(false);

  const seed = target.kind === "move" ? target.session : null;
  // REQ-068 AC-3 — ONE session's note. Saved through its own endpoint (`PATCH /bookings/:id/note`), which is the
  // structural reason a note edit can't notify a teacher or touch the other sessions of the course.
  // REQ-073 (3) — an extra session CHARGES. Money is the one consequence a second click can't take back.
  const { confirm: askConfirm, confirmDialog } = useConfirm();
  const noteMut = useSetAttendeeNote();
  const [attendeeNote, setAttendeeNote] = useState(seed?.attendeeNote ?? "");
  const [noteSaving, setNoteSaving] = useState(false);
  const [date, setDate] = useState<string>(seed?.date ?? dayjs().format("YYYY-MM-DD"));
  const [startTime, setStartTime] = useState<string>(seed?.startTime ?? TIME_SLOTS[0]);
  const [teacherId, setTeacherId] = useState<string | null>(seed?.teacher?.id ?? null);
  const [subjectId, setSubjectId] = useState<string | null>(seed?.subject?.id ?? null);

  // SPEC-042 (REQ-053) + SPEC-045 (REQ-054) — a course IS one program: the subject is fixed when the course is
  // created, and the course's program is *derived* from its sessions, so a per-session subject edit silently
  // re-writes what the family bought and what REQ-013/014 report. Locked on **any** course session row — an edit of
  // an existing one (REQ-053, BE refuses too via TASK-134) **and** a create-mode draft row (REQ-054: the program is
  // chosen once, at course level, in `CreatePlanFlow`; the draft row inherits it and must not diverge).
  // Insert / extra / voucher / single / trial legitimately pick a program and stay editable.
  const courseSubjectLocked = plan.kind === "course" && target.kind === "move";

  const avail = useSlotAvailability(date, startTime, !!date && !!startTime);

  const dayTeachers = teachers.filter((tc) => bookableOnDate(tc, date));
  const selTeacher = teachers.find((tc) => tc.id === teacherId);
  const subjectOptions = selTeacher?.subjectOptions ?? [];

  const submit = async () => {
    onError(null);
    // Create mode: no bookings exist yet — mutate the local draft row, don't call the server.
    if (onLocalSave && target.kind === "move") {
      if (!teacherId || !subjectId) return onError(t("plan.pickTeacherSubject"));
      onLocalSave({
        ...target.session,
        date,
        startTime,
        teacher: selTeacher ? { id: selTeacher.id, name: selTeacher.name, nickname: selTeacher.nickname } : target.session.teacher,
        subject: subjectOptions.find((s) => s.id === subjectId) ?? target.session.subject,
      });
      return;
    }
    // Extra (SPEC-033) — a charged single-session; applied directly (it doesn't change the plan → no preview).
    if (target.kind === "extra") {
      if (!teacherId || !subjectId) return onError(t("plan.pickTeacherSubject"));
      if (
        !(await askConfirm({
          title: t("confirmAction.extraTitle"),
          message: t("confirmAction.extraMsg"),
          confirmLabel: t("plan.extra"),
          color: "grape",
        }))
      )
        return;
      try {
        setSubmitting(true);
        await extra.mutateAsync({ courseId: plan.id, input: { teacherId, subjectId, date, startTime } });
        notify({ title: t("plan.extraAdded"), color: "success" });
        onDone();
      } catch (e) {
        onError(e instanceof ApiClientError ? e.message : t("plan.genericError"));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Course move/insert → the preview-confirm flow (TASK-115). Editor closes; PlanModal shows the diff.
    if (onPreviewApply) {
      if (target.kind === "insert") {
        if (!teacherId || !subjectId) return onError(t("plan.pickTeacherSubject"));
        setSubmitting(true);
        await onPreviewApply({ kind: "insert", teacherId, subjectId, date, startTime });
      } else {
        setSubmitting(true);
        await onPreviewApply({
          kind: "move",
          bookingId: target.session.id,
          teacherId: teacherId ?? undefined,
          // SPEC-042 — a course session's subject is not ours to send; omitted, not merely disabled in the UI.
          subjectId: courseSubjectLocked ? undefined : (subjectId ?? undefined),
          date,
          startTime,
        });
      }
      setSubmitting(false);
      onDone();
      return;
    }

    // Voucher session move → the existing per-booking move (no course reconcile → no preview).
    if (target.kind === "move") {
      try {
        setSubmitting(true);
        await move.mutateAsync({ id: target.session.id, patch: { teacherId: teacherId ?? undefined, subjectId: subjectId ?? undefined, date, startTime } });
        notify({ title: t("plan.changeApplied"), color: "success" });
        onDone();
      } catch (e) {
        onError(e instanceof ApiClientError ? e.message : t("plan.genericError"));
      } finally {
        setSubmitting(false);
      }
    }
  };

  const busy = submitting || move.isPending || extra.isPending;

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
      {confirmDialog}
      <Text fw={600} fz="sm" mb="xs">
        {target.kind === "insert"
          ? t("plan.insertSession")
          : target.kind === "extra"
            ? t("plan.extraSession")
            : t("plan.editSession")}
      </Text>
      <Group grow align="flex-start" wrap="wrap">
        <Select
          label={t("plan.colDate")}
          value={date}
          onChange={(v) => setDate(v ?? date)}
          data={nextDates().map((d) => ({ value: d, label: dayjs(d).format("ddd D MMM") }))}
          allowDeselect={false}
        />
        <Select
          label={t("plan.colTime")}
          value={startTime}
          onChange={(v) => setStartTime(v ?? startTime)}
          data={TIME_SLOTS.map((s) => ({ value: s, label: s }))}
          allowDeselect={false}
        />
      </Group>
      <Group grow align="flex-start" wrap="wrap" mt="xs">
        <Select
          label={t("plan.colTeacher")}
          placeholder={t("plan.pickTeacher")}
          value={teacherId}
          onChange={(v) => {
            setTeacherId(v);
            // Changing teacher normally invalidates the subject (it comes from that teacher's programs) — but on a
            // locked course row the subject is the COURSE's, not the teacher's, so clearing it here would blank the
            // read-only value and (in create mode) fail `onLocalSave`'s "pick a teacher and subject" guard.
            if (!courseSubjectLocked) setSubjectId(null);
          }}
          data={dayTeachers.map((tc) => ({ value: tc.id, label: tc.nickname }))}
          searchable
        />
        {courseSubjectLocked ? (
          <Input.Wrapper
            label={t("plan.colSubject")}
            description={t("plan.courseSubjectLocked")}
          >
            <Text fz="sm" fw={500} mt={4}>
              {seed?.subject?.name ?? "—"}
            </Text>
          </Input.Wrapper>
        ) : (
          <Select
            label={t("plan.colSubject")}
            placeholder={t("plan.pickSubject")}
            value={subjectId}
            onChange={setSubjectId}
            data={subjectOptions.map((s) => ({ value: s.id, label: s.name }))}
            disabled={!teacherId}
          />
        )}
      </Group>

      {/* REQ-068 — per-session note. Only on an EXISTING session: a create-mode draft row has no booking id yet,
          and the note endpoint is keyed by booking. Saved on its own button so it is unmistakably one session's
          note, not part of the move being composed above it. */}
      {target.kind === "move" && !onLocalSave && (
        <div className="mt-3">
          <AttendeeNoteInput value={attendeeNote} onChange={setAttendeeNote} disabled={noteSaving} />
          <Group justify="flex-end" mt="xs">
            <Button
              size="xs"
              variant="light"
              loading={noteSaving}
              disabled={(seed?.attendeeNote ?? "") === attendeeNote}
              onClick={async () => {
                setNoteSaving(true);
                try {
                  // `null` clears it; a trimmed string sets it. Only this booking id is touched (AC-3).
                  await noteMut.mutateAsync({
                    id: target.session.id,
                    attendeeNote: attendeeNote.trim() || null,
                  });
                  notify({ title: t("attendeeNote.saved"), color: "success" });
                } catch (e) {
                  onError(e instanceof ApiClientError ? e.message : t("plan.genericError"));
                } finally {
                  setNoteSaving(false);
                }
              }}
            >
              {t("common.save")}
            </Button>
          </Group>
        </div>
      )}

      {/* availability + clash view */}
      <div className="mt-2">
        <Text fz="xs" c="dimmed" mb={4}>{t("plan.availabilityTitle")}</Text>
        {avail.isLoading ? (
          <Loader size="xs" />
        ) : avail.data ? (
          <Group gap={6} wrap="wrap">
            {avail.data.teachers.map((st) => (
              <Badge
                key={st.teacher.id}
                variant={st.teacher.id === teacherId ? "filled" : "light"}
                color={st.available ? "green" : st.reason === "NO_BUDGET" ? "orange" : "red"}
                style={{ cursor: st.available ? "pointer" : "default" }}
                onClick={() => st.available && setTeacherId(st.teacher.id)}
              >
                {st.teacher.nickname}
                {st.reason === "BOOKED" && st.clash ? ` · ${t("plan.booked", { who: st.clash.student ?? "?" })}` : ""}
                {st.reason === "NO_BUDGET" ? ` · ${t("plan.noBudget")}` : ""}
              </Badge>
            ))}
          </Group>
        ) : null}
      </div>

      <Group justify="flex-end" mt="sm" gap="xs">
        <Button size="xs" variant="subtle" color="gray" leftSection={<X size={13} />} onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button size="xs" color="green" leftSection={<Check size={13} />} loading={busy} onClick={submit}>
          {t("common.save")}
        </Button>
      </Group>
    </div>
  );
}

function ConfirmCreateButton({
  sessions,
  onConfirm,
  onError,
  onDone,
  disabled = false,
  disabledHint,
}: {
  sessions: PlanSession[];
  onConfirm?: (sessions: PlanSession[]) => Promise<void>;
  onError: (msg: string | null) => void;
  onDone: () => void;
  /** AC-3 — a plan past MAX_WEEK can't be saved; the reason is already on screen above the button. */
  disabled?: boolean;
  disabledHint?: string;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!onConfirm) return;
    onError(null);
    setBusy(true);
    try {
      await onConfirm(sessions);
      onDone();
    } catch (e) {
      onError(e instanceof ApiClientError ? e.message : t("plan.genericError"));
    } finally {
      setBusy(false);
    }
  };
  const button = (
    <Button color="green" loading={busy} disabled={disabled} onClick={submit}>
      {t("plan.confirmCreate")}
    </Button>
  );
  // A disabled button with no stated reason is the anti-pattern; the ceiling Alert says why, and the tooltip
  // repeats it where the pointer actually is.
  return disabled && disabledHint ? (
    <Tooltip label={disabledHint} withArrow multiline w={260}>
      <span>{button}</span>
    </Tooltip>
  ) : (
    button
  );
}

/** Cancel a session (TASK-105). Delivered (ATTENDED/NO_SHOW) → a reason is REQUIRED (undo a mis-marked
 *  attendance, audited); a live session → plain cancel (the server re-owes a make-up). On refusal the server's
 *  reason (REASON_REQUIRED / CANCEL_AT_CEILING / …) is shown inline. */
function CancelSessionDialog({
  session,
  onClose,
  onError,
}: {
  session: PlanSession;
  onClose: () => void;
  onError: (msg: string | null) => void;
}) {
  const t = useT();
  const cancel = useCancelBooking();
  const delivered = isDeliveredStatus(session.status);
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async () => {
    setLocalError(null);
    if (delivered && !reason.trim()) {
      setLocalError(t("plan.cancelReasonRequired"));
      return;
    }
    try {
      await cancel.mutateAsync({ id: session.id, reason: delivered ? reason.trim() : undefined });
      notify({ title: t("plan.cancelled"), color: "success" });
      onError(null);
      onClose();
    } catch (e) {
      // Keep the dialog open so the admin sees the server's exact refusal (REASON_REQUIRED / ceiling / clash).
      setLocalError(e instanceof ApiClientError ? e.message : t("plan.genericError"));
    }
  };

  return (
    <Modal opened onClose={onClose} title={t("plan.cancelTitle")} centered radius="lg">
      <Stack gap="md">
        <Text fz="sm">
          {dayjs(session.date).format("D MMM")} {session.startTime.slice(0, 5)} ·{" "}
          {session.teacher?.nickname ?? "—"} · {session.subject?.name ?? "—"}
        </Text>
        <Text fz="xs" c="dimmed">
          {delivered ? t("plan.cancelDeliveredNote") : t("plan.cancelLiveNote")}
        </Text>
        {delivered && (
          <Textarea
            label={t("plan.cancelReasonLabel")}
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
            autosize
            minRows={2}
            required
          />
        )}
        {localError && (
          <Alert color="red" icon={<AlertTriangle size={16} />}>
            {localError}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button color="red" leftSection={<Ban size={14} />} loading={cancel.isPending} onClick={submit}>
            {t("plan.cancelConfirm")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** Plan-diff preview (TASK-115) — the owner's "บอกว่าแผนจะเป็นแบบนี้นะ": show the resulting plan + new end +
 *  how many sessions append/cancel BEFORE committing. Backed by the dry-run (preview == apply). */
function PlanDiffConfirm({
  preview,
  onConfirm,
  onCancel,
  busy,
}: {
  preview: PlanPreview;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const t = useT();
  const end = preview.liveEndDate ? dayjs(preview.liveEndDate).format("D MMM YY") : t("plan.noLiveEnd");
  return (
    <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3">
      <Text fw={600} fz="sm" mb={4}>
        {t("plan.diffTitle")}
      </Text>
      <Text fz="xs" c="dimmed" mb="xs">
        {t("plan.diffSummary", {
          appended: preview.moves.appended.length,
          cancelled: preview.moves.cancelled.length,
          end,
        })}
      </Text>
      <div className="max-h-[200px] overflow-auto rounded-md border border-muted-100">
        <Table fz="xs" verticalSpacing={4}>
          <Table.Tbody>
            {preview.resultingSessions.map((s) => (
              <Table.Tr key={s.id}>
                <Table.Td className="tabular-nums">{formatDateDisplay(s.date)}</Table.Td>
                <Table.Td className="tabular-nums">{s.startTime.slice(0, 5)}</Table.Td>
                <Table.Td>{s.teacher?.nickname ?? "—"}</Table.Td>
                <Table.Td>
                  <StatusChip status={s.status as BookingStatus} />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </div>
      <Group justify="flex-end" mt="sm" gap="xs">
        <Button size="xs" variant="subtle" color="gray" leftSection={<X size={13} />} onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button size="xs" color="green" leftSection={<Check size={13} />} loading={busy} onClick={onConfirm}>
          {t("plan.diffConfirm")}
        </Button>
      </Group>
    </div>
  );
}

/** The next ~10 weeks of selectable dates (kept simple; the server enforces the real ceiling). */
function nextDates(): string[] {
  const out: string[] = [];
  const start = dayjs();
  for (let i = 0; i < 70; i++) out.push(start.add(i, "day").format("YYYY-MM-DD"));
  return out;
}
