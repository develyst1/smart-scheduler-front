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
import { AlertTriangle, CalendarPlus, Check, Pencil, UserMinus, X } from "lucide-react";
import dayjs from "dayjs";
import { notify } from "@/lib/ui/notify";
import { useT } from "@/lib/i18n";
import { ApiClientError } from "@/lib/api/client";
import { StatusChip } from "@/components/common/BookingBadges";
import { bookableOnDate } from "@/lib/scheduler/work-days";
import {
  useApplyPlanChange,
  useEntitlementPlan,
  useMoveBooking,
  useSlotAvailability,
  useTeachers,
} from "@/hooks/scheduler";
import {
  TIME_SLOTS,
  isDeliveredStatus,
  type BookingStatus,
  type EntitlementPlan,
  type PlanSession,
} from "@/types/app/scheduler";

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

type EditTarget = { kind: "move"; session: PlanSession } | { kind: "insert" } | null;

export default function PlanModal({ opened, onClose, entitlementId, mode = "edit", initialPlan, onConfirm }: Props) {
  const t = useT();
  const isCreate = mode === "create";
  const query = useEntitlementPlan(entitlementId, opened && !isCreate);
  const plan: EntitlementPlan | undefined = isCreate ? initialPlan : query.data;

  const [edit, setEdit] = useState<EditTarget>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) {
      setEdit(null);
      setError(null);
    }
  }, [opened]);

  const isCourse = plan?.kind === "course";

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
            plan={plan}
            onEdit={(session) => {
              setError(null);
              setEdit({ kind: "move", session });
            }}
            canMarkAbsence={isCourse && !isCreate}
          />

          {isCourse && !isCreate && (
            <Group justify="space-between">
              <Text fz="xs" c="dimmed">
                {t("plan.owedHint", { n: (plan.summary.kind === "course" ? plan.summary.owedCount : 0) })}
              </Text>
              <Button
                variant="light"
                size="xs"
                leftSection={<CalendarPlus size={14} />}
                onClick={() => {
                  setError(null);
                  setEdit({ kind: "insert" });
                }}
              >
                {t("plan.insert")}
              </Button>
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
            />
          )}

          {isCreate && (
            <Group justify="flex-end" mt="sm">
              <Button variant="subtle" color="gray" onClick={onClose}>
                {t("common.cancel")}
              </Button>
              <ConfirmCreateButton plan={plan} onConfirm={onConfirm} onError={setError} onDone={onClose} />
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
  plan,
  onEdit,
  canMarkAbsence,
}: {
  plan: EntitlementPlan;
  onEdit: (s: PlanSession) => void;
  canMarkAbsence?: boolean;
}) {
  const t = useT();
  const apply = useApplyPlanChange();

  if (plan.sessions.length === 0) {
    return <Text c="dimmed" fz="sm">{t("plan.noSessions")}</Text>;
  }

  const doMarkAbsence = async (s: PlanSession) => {
    try {
      await apply.mutateAsync({ courseId: plan.id, change: { kind: "mark-absence", bookingId: s.id, planned: true } });
      notify({ title: t("plan.absenceMarked"), color: "success" });
    } catch (e) {
      notify({ title: t("common.error"), description: e instanceof ApiClientError ? e.message : t("plan.genericError"), color: "danger" });
    }
  };

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
          {plan.sessions.map((s) => {
            const locked = isDeliveredStatus(s.status);
            return (
              <Table.Tr key={s.id} className={locked ? "opacity-60" : ""}>
                <Table.Td className="font-num">{dayjs(s.date).format("D MMM")}</Table.Td>
                <Table.Td className="font-num">{s.startTime.slice(0, 5)}</Table.Td>
                <Table.Td>{s.teacher?.nickname ?? "—"}</Table.Td>
                <Table.Td>{s.subject?.name ?? "—"}</Table.Td>
                <Table.Td>
                  <StatusChip status={s.status as BookingStatus} />
                </Table.Td>
                <Table.Td>
                  {locked ? (
                    <Text fz="xs" c="dimmed">{t("plan.locked")}</Text>
                  ) : (
                    <Group gap={4} justify="flex-end" wrap="nowrap">
                      <Button size="compact-xs" variant="subtle" color="gray" leftSection={<Pencil size={12} />} onClick={() => onEdit(s)}>
                        {t("plan.edit")}
                      </Button>
                      {canMarkAbsence && (
                        <Button
                          size="compact-xs"
                          variant="subtle"
                          color="orange"
                          leftSection={<UserMinus size={12} />}
                          loading={apply.isPending}
                          onClick={() => doMarkAbsence(s)}
                        >
                          {t("plan.markAbsence")}
                        </Button>
                      )}
                    </Group>
                  )}
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
}: {
  plan: EntitlementPlan;
  target: Exclude<EditTarget, null>;
  onCancel: () => void;
  onDone: () => void;
  onError: (msg: string | null) => void;
}) {
  const t = useT();
  const { data: teachers = [] } = useTeachers();
  const apply = useApplyPlanChange();
  const move = useMoveBooking();

  const seed = target.kind === "move" ? target.session : null;
  const [date, setDate] = useState<string>(seed?.date ?? dayjs().format("YYYY-MM-DD"));
  const [startTime, setStartTime] = useState<string>(seed?.startTime ?? TIME_SLOTS[0]);
  const [teacherId, setTeacherId] = useState<string | null>(seed?.teacher?.id ?? null);
  const [subjectId, setSubjectId] = useState<string | null>(seed?.subject?.id ?? null);

  const avail = useSlotAvailability(date, startTime, !!date && !!startTime);

  const dayTeachers = teachers.filter((tc) => bookableOnDate(tc, date));
  const selTeacher = teachers.find((tc) => tc.id === teacherId);
  const subjectOptions = selTeacher?.subjectOptions ?? [];

  const isCourse = plan.kind === "course";

  const submit = async () => {
    onError(null);
    try {
      if (target.kind === "insert") {
        if (!teacherId || !subjectId) return onError(t("plan.pickTeacherSubject"));
        await apply.mutateAsync({ courseId: plan.id, change: { kind: "insert", teacherId, subjectId, date, startTime } });
        notify({ title: t("plan.inserted"), color: "success" });
      } else if (isCourse) {
        // course move → the shared atomic gate
        await apply.mutateAsync({
          courseId: plan.id,
          change: { kind: "move", bookingId: target.session.id, teacherId: teacherId ?? undefined, subjectId: subjectId ?? undefined, date, startTime },
        });
        notify({ title: t("plan.changeApplied"), color: "success" });
      } else {
        // voucher session move → the existing per-booking move (no course reconcile)
        await move.mutateAsync({ id: target.session.id, patch: { teacherId: teacherId ?? undefined, subjectId: subjectId ?? undefined, date, startTime } });
        notify({ title: t("plan.changeApplied"), color: "success" });
      }
      onDone();
    } catch (e) {
      // Surface the server's exact refusal reason (busy teacher, ceiling, too-late change, over-cap…).
      onError(e instanceof ApiClientError ? e.message : t("plan.genericError"));
    }
  };

  const busy = apply.isPending || move.isPending;

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
      <Text fw={600} fz="sm" mb="xs">
        {target.kind === "insert" ? t("plan.insertSession") : t("plan.editSession")}
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
  plan,
  onConfirm,
  onError,
  onDone,
}: {
  plan: EntitlementPlan;
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
      await onConfirm(plan.sessions);
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

/** The next ~10 weeks of selectable dates (kept simple; the server enforces the real ceiling). */
function nextDates(): string[] {
  const out: string[] = [];
  const start = dayjs();
  for (let i = 0; i < 70; i++) out.push(start.add(i, "day").format("YYYY-MM-DD"));
  return out;
}
