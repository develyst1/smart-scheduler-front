"use client";

import { useState } from "react";
import dayjs from "dayjs";
import { Alert, Button, Checkbox, Group, Loader, Modal, Stack, Text, Textarea } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { AlertTriangle } from "lucide-react";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { notify } from "@/lib/ui/notify";
import { formatTimeDisplay } from "@/lib/ui/format";
import { calendarDayBookings } from "@/lib/api/mappers";
import { useCalendar, useReportOwnLeave } from "@/hooks/scheduler";
import { isAdvanceLeaveDate, isAdvanceResult, leaveBody, leaveDefaultTicks } from "@/lib/scheduler/teacher-scope";
import { StatusChip } from "@/components/common/BookingBadges";
import type { OwnLeaveResult } from "@/types/api/contract";

/**
 * REQ-097 C-2 (TASK-406/407) — a LINKED teacher reports their OWN leave: a date (default today), MY sessions that day
 * from the scoped calendar (the server already returns only mine — `GET /calendar`, in the allowed set), ticked by
 * default except an ATTENDED one (the server's `409 SESSION_DELIVERED` if ticked), a reason (3..200 — the server's
 * sentence on refusal), ONE call `POST /teachers/me/leave`. The families of the ticked sessions are told and the
 * make-ups re-owed BY THE SERVER; the line here only says so. A refusal keeps the ticks and the text.
 *
 * 🔴 **TASK-582 (BE) → TASK-588 — ONE dialog, TWO acts.** A date **after today** is the ADVANCE act: the whole day is
 * recorded, its live classes are **listed**, and 🚫 **nothing is cancelled and nobody is told.** ⇒ **the chooser is not
 * shown at all on such a date** — 🔑 *not disabled: a tick there would mean "cancel this one", and nothing is being
 * cancelled, so a greyed chooser would still be offering a meaning the act does not have.* **Today and the past keep the
 * old screen exactly, ticks and all.**
 * ⚠️ **And the advance result says the thing a teacher must not get wrong: NOTHING HAS BEEN CANCELLED.** *A teacher who
 * believes their classes were cancelled will not turn up.*
 */
export default function ReportLeaveDialog({ opened, initialDate, onClose }: { opened: boolean; initialDate: string; onClose: () => void }) {
  const t = useT();
  const leave = useReportOwnLeave();
  const [date, setDate] = useState(initialDate);
  const { data: calendar, isLoading } = useCalendar(date, "day");
  const rows = calendar ? calendarDayBookings(calendar, date) : [];
  const allIds = rows.map((r) => r.id);
  // Ticks are seeded per DATE: a new date ⇒ the default set for its rows; a user's un-tick survives a refetch of the same date.
  const [ticks, setTicks] = useState<{ date: string; ids: string[] } | null>(null);
  const ticked = ticks && ticks.date === date && ticks.ids.every((id) => allIds.includes(id)) ? ticks.ids : leaveDefaultTicks(rows);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** 🔴 TASK-588 — the advance answer stays ON SCREEN: it carries the list an admin has to handle, which a toast eats. */
  const [done, setDone] = useState<OwnLeaveResult | null>(null);
  // 🔑 The server's own comparison (`date > today`, Bangkok). The call site owns "today"; see `isAdvanceLeaveDate` for why
  // a copy is acceptable here and why both ways of being wrong are safe.
  const advance = isAdvanceLeaveDate(date, dayjs().format("YYYY-MM-DD"));

  const toggle = (id: string, on: boolean) => setTicks({ date, ids: on ? [...ticked, id] : ticked.filter((x) => x !== id) });

  const submit = async () => {
    setError(null);
    try {
      const res = await leave.mutateAsync(leaveBody(date, allIds, ticked, reason, advance));
      // 🔑 Which act ran is read from the ANSWER, never re-derived from the date we sent.
      if (isAdvanceResult(res)) {
        setDone(res);
        return;
      }
      notify({ title: t("teacherLeave.done", { n: res.cancelled, families: res.familiesNotified }), color: "success" });
      onClose();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : (e as Error).message);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} centered size="md" title={t("teacherLeave.title")}>
      <Stack gap="sm">
        {error && (
          <Alert color="red" icon={<AlertTriangle size={15} />} variant="light">
            {error}
          </Alert>
        )}
        {done ? (
          /* 🔴 TASK-588 — the advance result, in @Jason's §15 order: the day is blocked · these classes are already booked
             and an ADMIN will handle them · 🔑 NOTHING HAS BEEN CANCELLED. The last clause is the one that matters. */
          <Stack gap="sm" data-leave-advance={done.bookings?.length ?? 0}>
            <Text fw={600}>{t("teacherLeave.advanceTitle", { date: date })}</Text>
            {done.alreadyRecorded && (
              <Text size="xs" c="dimmed" data-leave-already>
                {t("teacherLeave.advanceAlready")}
              </Text>
            )}
            <Text size="sm">{t("teacherLeave.advanceBlocked")}</Text>
            {(done.bookings?.length ?? 0) > 0 ? (
              <>
                <Text size="sm">{t("teacherLeave.advanceClasses", { n: done.bookings?.length ?? 0 })}</Text>
                <Stack gap={2}>
                  {(done.bookings ?? []).map((b) => (
                    <Text key={b.id} size="sm" className="tabular-nums">
                      {formatTimeDisplay(b.startTime)} – {formatTimeDisplay(b.endTime)}
                    </Text>
                  ))}
                </Stack>
              </>
            ) : (
              <Text size="sm" c="dimmed">
                {t("teacherLeave.advanceNoClasses")}
              </Text>
            )}
            {/* 🔑 Never a toast, never abbreviated: a teacher who believes their classes were cancelled will not turn up. */}
            <Alert color="orange" variant="light" icon={<AlertTriangle size={15} />} data-leave-nothing-cancelled>
              {t("teacherLeave.advanceNothingCancelled")}
            </Alert>
            <Group justify="flex-end">
              <Button onClick={onClose}>{t("common.close")}</Button>
            </Group>
          </Stack>
        ) : (
        <>
        <DatePickerInput
          label={t("teacherLeave.date")}
          value={date}
          onChange={(v) => v && setDate(dayjs(v).format("YYYY-MM-DD"))}
          valueFormat="D MMM YYYY"
          popoverProps={{ withinPortal: true }}
        />
        {/* 🔴 The chooser is ABSENT on an advance date, not disabled — a tick there would mean "cancel this one", and the
            act cancels nothing. What the day already holds is shown AFTER the act, from the server's own list. */}
        {advance ? (
          <Alert color="blue" variant="light" data-leave-advance-notice>
            {t("teacherLeave.advanceHint")}
          </Alert>
        ) : (
        <div>
          <Text size="sm" fw={500} mb={4}>
            {t("teacherLeave.sessions")}
          </Text>
          {isLoading ? (
            <Loader size="xs" />
          ) : rows.length === 0 ? (
            <Text size="sm" c="dimmed">
              {t("teacherLeave.noSessions")}
            </Text>
          ) : (
            <Stack gap={4} data-leave-rows={rows.length}>
              {rows.map((r) => (
                <Checkbox
                  key={r.id}
                  checked={ticked.includes(r.id)}
                  onChange={(e) => toggle(r.id, e.currentTarget.checked)}
                  label={
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums">{formatTimeDisplay(r.startTime)}</span>
                      <span className="truncate">{r.displayName}</span>
                      <StatusChip status={r.status} />
                    </span>
                  }
                />
              ))}
            </Stack>
          )}
        </div>
        )}
        <Textarea
          label={t("teacherLeave.reason")}
          placeholder={t("teacherLeave.reasonHint")}
          value={reason}
          onChange={(e) => setReason(e.currentTarget.value)}
          autosize
          minRows={2}
          required
        />
        <Text size="xs" c="orange">
          {t("teacherLeave.warning")}
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          {/* 🔑 On an advance date there are no ticks to count, so the ticks cannot gate the act and the label cannot
              promise a number of cancellations. Only the reason gates it — the server's own requirement. */}
          <Button
            color="orange"
            loading={leave.isPending}
            disabled={(!advance && ticked.length === 0) || reason.trim().length === 0}
            data-leave-submit
            onClick={() => void submit()}
          >
            {advance ? t("teacherLeave.submitAdvance") : t("teacherLeave.submit", { n: ticked.length })}
          </Button>
        </Group>
        </>
        )}
      </Stack>
    </Modal>
  );
}
