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
import { leaveBody, leaveDefaultTicks } from "@/lib/scheduler/teacher-scope";
import { StatusChip } from "@/components/common/BookingBadges";

/**
 * REQ-097 C-2 (TASK-406/407) — a LINKED teacher reports their OWN leave: a date (default today), MY sessions that day
 * from the scoped calendar (the server already returns only mine — `GET /calendar`, in the allowed set), ticked by
 * default except an ATTENDED one (the server's `409 SESSION_DELIVERED` if ticked), a reason (3..200 — the server's
 * sentence on refusal), ONE call `POST /teachers/me/leave`. The families of the ticked sessions are told and the
 * make-ups re-owed BY THE SERVER; the line here only says so. A refusal keeps the ticks and the text.
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

  const toggle = (id: string, on: boolean) => setTicks({ date, ids: on ? [...ticked, id] : ticked.filter((x) => x !== id) });

  const submit = async () => {
    setError(null);
    try {
      const res = await leave.mutateAsync(leaveBody(date, allIds, ticked, reason));
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
        <DatePickerInput
          label={t("teacherLeave.date")}
          value={date}
          onChange={(v) => v && setDate(dayjs(v).format("YYYY-MM-DD"))}
          valueFormat="D MMM YYYY"
          popoverProps={{ withinPortal: true }}
        />
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
          <Button color="orange" loading={leave.isPending} disabled={ticked.length === 0 || reason.trim().length === 0} onClick={() => void submit()}>
            {t("teacherLeave.submit", { n: ticked.length })}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
