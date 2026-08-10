"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { Textarea, Tooltip } from "@mantine/core";
import { AlertTriangle, Ban, CalendarPlus, Check, Pencil, Ticket, UserMinus, X } from "lucide-react";
import dayjs from "dayjs";
import { notify } from "@/lib/ui/notify";
import { useT } from "@/lib/i18n";
import { ApiClientError } from "@/lib/api/client";
import { StatusChip } from "@/components/common/BookingBadges";
import { bookableOnDate } from "@/lib/scheduler/work-days";
import {
  useAddExtraSession,
  useApplyPlanChange,
  useCancelBooking,
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
}

type EditTarget =
  | { kind: "move"; session: PlanSession }
  | { kind: "insert" }
  | { kind: "extra" } // SPEC-033 — a charged single-session, out of quota
  | null;

export default function PlanModal({ opened, onClose, entitlementId, mode = "edit", initialPlan, onConfirm }: Props) {
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
  const previewMut = usePreviewPlanChange();
  const applyMut = useApplyPlanChange();

  useEffect(() => {
    if (!opened) {
      setEdit(null);
      setError(null);
      setCancelTarget(null);
      setPending(null);
    }
  }, [opened]);

  useEffect(() => {
    if (isCreate && plan) setDraft(plan.sessions);
  }, [isCreate, plan]);

  const isCourse = plan?.kind === "course";
  const sessions = isCreate ? draft : (plan?.sessions ?? []);
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

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={plan ? t("plan.title", { name: plan.student?.name ?? "—" }) : t("plan.loading")}
      centered
      radius="lg"
      size="xl"
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

          {error && (
            <Alert color="red" icon={<AlertTriangle size={16} />} withCloseButton onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <SessionTable
            sessions={sessions}
            onEdit={(session) => {
              setError(null);
              setEdit({ kind: "move", session });
            }}
            onMarkAbsence={
              isCourse && !isCreate
                ? (s) => requestChange({ kind: "mark-absence", bookingId: s.id, planned: true })
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

          {isCourse && !isCreate && (
            <Group justify="space-between" wrap="wrap" gap="xs">
              <Text fz="xs" c="dimmed">
                {t("plan.owedHint", { n: (plan.summary.kind === "course" ? plan.summary.owedCount : 0) })}
              </Text>
              <Group gap="xs">
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
              <ConfirmCreateButton sessions={draft} onConfirm={onConfirm} onError={setError} onDone={onClose} />
            </Group>
          )}
        </Stack>
      )}
    </Modal>
  );
}

function SummaryBar({ plan }: { plan: EntitlementPlan }) {
  const t = useT();
  const end = plan.liveEndDate ? dayjs(plan.liveEndDate).format("D MMM YY") : t("plan.noLiveEnd");
  return (
    <div className="rounded-xl border border-default-200 bg-default-50/40 p-3">
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
        <Text fz="sm" c="dimmed">
          {t("plan.endsOn", { date: end })}
        </Text>
      </Group>
    </div>
  );
}

function SessionTable({
  sessions,
  onEdit,
  onMarkAbsence,
  onCancelSession,
}: {
  sessions: PlanSession[];
  onEdit: (s: PlanSession) => void;
  /** Edit mode, course only: mark a planned absence (goes through the preview-confirm). */
  onMarkAbsence?: (s: PlanSession) => void;
  /** Edit mode: cancel a session (delivered → reason-prompt; live → plain). Absent in create mode. */
  onCancelSession?: (s: PlanSession) => void;
}) {
  const t = useT();

  if (sessions.length === 0) {
    return <Text c="dimmed" fz="sm">{t("plan.noSessions")}</Text>;
  }

  return (
    <Table.ScrollContainer minWidth={560}>
      <Table verticalSpacing="xs" fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t("plan.colDate")}</Table.Th>
            <Table.Th>{t("plan.colTime")}</Table.Th>
            <Table.Th>{t("plan.colTeacher")}</Table.Th>
            <Table.Th>{t("plan.colSubject")}</Table.Th>
            <Table.Th>{t("plan.colStatus")}</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sessions.map((s) => {
            const locked = isDeliveredStatus(s.status);
            const isExtra = s.bookingType === "SINGLE_SESSION"; // SPEC-033 — a charged extra, not a plan row
            return (
              <Table.Tr key={s.id} className={locked ? "opacity-60" : ""}>
                <Table.Td className="font-num">{dayjs(s.date).format("D MMM")}</Table.Td>
                <Table.Td className="font-num">{s.startTime.slice(0, 5)}</Table.Td>
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
                <Table.Td>
                  <Group gap={4} justify="flex-end" wrap="nowrap">
                    {locked ? (
                      // Delivered: edit/move stay blocked; only cancel-with-reason (TASK-105).
                      <Text fz="xs" c="dimmed">{t("plan.locked")}</Text>
                    ) : (
                      <>
                        <Button size="compact-xs" variant="subtle" color="gray" leftSection={<Pencil size={12} />} onClick={() => onEdit(s)}>
                          {t("plan.edit")}
                        </Button>
                        {onMarkAbsence && !isExtra && (
                          <Button
                            size="compact-xs"
                            variant="subtle"
                            color="orange"
                            leftSection={<UserMinus size={12} />}
                            onClick={() => onMarkAbsence(s)}
                          >
                            {t("plan.markAbsence")}
                          </Button>
                        )}
                      </>
                    )}
                    {onCancelSession && (locked || isLiveStatus(s.status)) && (
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        color="red"
                        leftSection={<Ban size={12} />}
                        onClick={() => onCancelSession(s)}
                      >
                        {t("plan.cancelSession")}
                      </Button>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
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
  const [date, setDate] = useState<string>(seed?.date ?? dayjs().format("YYYY-MM-DD"));
  const [startTime, setStartTime] = useState<string>(seed?.startTime ?? TIME_SLOTS[0]);
  const [teacherId, setTeacherId] = useState<string | null>(seed?.teacher?.id ?? null);
  const [subjectId, setSubjectId] = useState<string | null>(seed?.subject?.id ?? null);

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
          subjectId: subjectId ?? undefined,
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
            setSubjectId(null);
          }}
          data={dayTeachers.map((tc) => ({ value: tc.id, label: tc.nickname }))}
          searchable
        />
        <Select
          label={t("plan.colSubject")}
          placeholder={t("plan.pickSubject")}
          value={subjectId}
          onChange={setSubjectId}
          data={subjectOptions.map((s) => ({ value: s.id, label: s.name }))}
          disabled={!teacherId}
        />
      </Group>

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
}: {
  sessions: PlanSession[];
  onConfirm?: (sessions: PlanSession[]) => Promise<void>;
  onError: (msg: string | null) => void;
  onDone: () => void;
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
  return (
    <Button color="green" loading={busy} onClick={submit}>
      {t("plan.confirmCreate")}
    </Button>
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
      <div className="max-h-[200px] overflow-auto rounded-md border border-default-100">
        <Table fz="xs" verticalSpacing={4}>
          <Table.Tbody>
            {preview.resultingSessions.map((s) => (
              <Table.Tr key={s.id}>
                <Table.Td className="font-num">{dayjs(s.date).format("D MMM")}</Table.Td>
                <Table.Td className="font-num">{s.startTime.slice(0, 5)}</Table.Td>
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
