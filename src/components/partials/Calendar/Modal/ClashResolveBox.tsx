"use client";

import { useState } from "react";
import { Alert, Button, Group, Select, Stack, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { AlertTriangle, ArrowLeftRight, Move } from "lucide-react";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { notify } from "@/lib/ui/notify";
import { useCan } from "@/hooks/scheduler/useMe";
import { useResolveClashMove, useResolveClashSwapCoach } from "@/hooks/scheduler";
import { clashDoors, clashPartner, isClash, moveBody, moveReady, type MoveDraft } from "@/lib/scheduler/group-clash";
import { TeacherOption, teacherSelectData } from "@/components/common/TeacherOption";
import { TIME_SLOTS, type Booking, type TeacherView } from "@/types/app/scheduler";

/**
 * REQ-105 / SPEC-091 (TASK-453/457) — the CLASH box, rendered on EITHER half of the pair (the yielded group block or
 * the Private standing in its hour): they are one coach-hour with two classes on it, and both doors act on that pair.
 *
 * ① **Move the private** is offered FIRST — the owner's default; it needs the PRIVATE's id, which is why the box is
 *    given the rows on screen and finds the partner by coach + date + start (`clashPartner`, pure).
 * ② **Swap the group's coach** moves the group session instead; the Private keeps this coach.
 *
 * 🔴 A refusal (`409 SLOT_TAKEN` — including *"…the group is still on it"* — or `409 NOT_IN_CLASH` on a stale screen)
 * is the server's own sentence and **leaves the clash exactly as it was**: nothing is refetched, nothing typed is lost,
 * no local state pretends the clash is gone. Both doors sit behind `action:calendar.booking-edit` (hidden, never disabled).
 * 🚫 The clash itself is never derived here — `group.clash` is the server's verdict.
 */
export default function ClashResolveBox({ booking, rows, teachers }: { booking: Booking; rows: readonly Booking[]; teachers: TeacherView[] }) {
  const t = useT();
  const can = useCan();
  const move = useResolveClashMove();
  const swap = useResolveClashSwapCoach();
  const [mode, setMode] = useState<"move" | "swap" | null>(null);
  const [draft, setDraft] = useState<MoveDraft>({ teacherId: null, date: null, startTime: null });
  const [to, setTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The pair on this coach-hour: the clashing GROUP block and the Private standing in it.
  const pair = clashPartner(booking, rows);
  const groupRow = pair.find((r) => r.bookingType === "GROUP" && isClash(r)) ?? null;
  const privateRow = pair.find((r) => r.bookingType !== "GROUP") ?? null;
  const doors = clashDoors({ edit: can("action:calendar.booking-edit") }, groupRow ?? { group: null });
  if (!groupRow) return null;

  const busy = move.isPending || swap.isPending;
  const runMove = async () => {
    if (!privateRow || !moveReady(draft)) return;
    setError(null);
    try {
      await move.mutateAsync({ bookingId: privateRow.id, body: moveBody(draft) });
      notify({ title: t("clash.movedOk"), color: "success" });
      setMode(null);
    } catch (e) {
      // 🔴 The clash stands: the server's sentence, and not one line of local state changes.
      setError(e instanceof ApiClientError ? e.message : (e as Error).message);
    }
  };
  const runSwap = async () => {
    if (!to) return;
    setError(null);
    try {
      await swap.mutateAsync({ bookingId: groupRow.id, teacherId: to });
      notify({ title: t("clash.swappedOk"), color: "success" });
      setMode(null);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : (e as Error).message);
    }
  };

  return (
    <Stack gap="xs" className="rounded-lg border border-orange-400/60 bg-orange-50 p-3" data-clash-box={groupRow.id}>
      <Group gap={6} wrap="nowrap">
        <AlertTriangle size={15} className="shrink-0 text-orange-700" />
        <Text size="sm" fw={600} className="text-orange-900">
          {t("clash.title")}
        </Text>
      </Group>
      {/* Which coach-hour, and which two classes — the pair named, not just "a clash". */}
      <Text size="xs" c="dimmed">
        {t("clash.pairLine", { group: groupRow.group?.name ?? groupRow.displayName, student: privateRow?.displayName ?? "—" })}
      </Text>
      {error && (
        <Alert color="red" icon={<AlertTriangle size={15} />} variant="light">
          {error}
        </Alert>
      )}
      {mode === null && (
        <Group gap="xs">
          {doors.movePrivate && (
            <Button size="compact-xs" variant="light" color="orange" leftSection={<Move size={12} />} onClick={() => setMode("move")} disabled={!privateRow} data-clash-move>
              {t("clash.movePrivate")}
            </Button>
          )}
          {doors.swapCoach && (
            <Button size="compact-xs" variant="subtle" color="gray" leftSection={<ArrowLeftRight size={12} />} onClick={() => setMode("swap")} data-clash-swap>
              {t("clash.swapCoach")}
            </Button>
          )}
        </Group>
      )}
      {mode === "move" && (
        <Stack gap={6}>
          <Text size="xs" c="dimmed">
            {t("clash.moveHint")}
          </Text>
          <Group grow align="flex-end" gap="xs">
            <Select
              size="xs"
              label={t("course.teacher")}
              data={teacherSelectData(teachers.filter((x) => x.bookable))}
              value={draft.teacherId}
              onChange={(v) => setDraft({ ...draft, teacherId: v })}
              searchable
              clearable
              renderOption={({ option, checked }) => <TeacherOption option={option} checked={checked} teachers={teachers} />}
            />
            <DatePickerInput size="xs" label={t("booking.date")} value={draft.date} onChange={(v) => setDraft({ ...draft, date: v })} valueFormat="D MMM YYYY" clearable popoverProps={{ withinPortal: true }} />
            <Select size="xs" label={t("booking.time")} data={TIME_SLOTS.map((slot) => ({ value: slot, label: slot }))} value={draft.startTime} onChange={(v) => setDraft({ ...draft, startTime: v })} clearable />
          </Group>
          <Group justify="flex-end" gap="xs">
            <Button size="compact-xs" variant="default" onClick={() => setMode(null)}>
              {t("common.cancel")}
            </Button>
            <Button size="compact-xs" color="orange" loading={busy} disabled={!moveReady(draft) || !privateRow} onClick={() => void runMove()}>
              {t("clash.moveConfirm")}
            </Button>
          </Group>
        </Stack>
      )}
      {mode === "swap" && (
        <Stack gap={6}>
          <Select
            size="xs"
            label={t("clash.swapTo")}
            data={teacherSelectData(teachers.filter((x) => x.bookable && x.id !== groupRow.teacherId))}
            value={to}
            onChange={setTo}
            searchable
            renderOption={({ option, checked }) => <TeacherOption option={option} checked={checked} teachers={teachers} />}
          />
          <Group justify="flex-end" gap="xs">
            <Button size="compact-xs" variant="default" onClick={() => setMode(null)}>
              {t("common.cancel")}
            </Button>
            <Button size="compact-xs" color="orange" loading={busy} disabled={!to} onClick={() => void runSwap()}>
              {t("clash.swapConfirm")}
            </Button>
          </Group>
        </Stack>
      )}
    </Stack>
  );
}
