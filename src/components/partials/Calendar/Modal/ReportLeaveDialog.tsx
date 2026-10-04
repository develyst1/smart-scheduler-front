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
import { useCalendar, useReportOwnLeave, useReportTeacherLeave } from "@/hooks/scheduler";
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
/**
 * 🔴 **TASK-608 (BE) → TASK-611 — the SECOND CALLER: an admin records a teacher's leave on their behalf.**
 *
 * 🔑 **`subject` is the whole widening.** Absent ⇒ **this is the teacher's own door, byte for byte as it was**: same
 * hook, same body, same screen, no subject anywhere. Present ⇒ the admin door, onto **the same act** — @Jason's service
 * asks the future-vs-today fork in ONE place for both callers, so there is no second meaning to drift.
 *
 * 🔴 **The admin door takes a date AFTER TODAY and nothing else, and that is @Sober's decision, not a gap.** The
 * today/past branch is the CANCELLING act and it needs a ticked list of **that teacher's** sessions — but the calendar
 * read this dialog uses is scoped to **whoever asked**, so on an admin's screen it would list the ADMIN's day and
 * present it as the teacher's. 🚫 *A screen that shows the wrong person's sessions and offers to cancel them is worse
 * than one that refuses.* ⇒ on the admin door the chooser is never rendered at all and a today/past date is refused
 * **with the alternative named**.
 */
export default function ReportLeaveDialog({
  opened,
  initialDate,
  onClose,
  subject,
}: {
  opened: boolean;
  initialDate: string;
  onClose: () => void;
  /** 🔴 TASK-611 — whose leave this is. **Omitted = the signed-in teacher's own**, which is the pre-existing door. */
  subject?: { id: string; name: string };
}) {
  const t = useT();
  const onBehalf = true;
  const leave = useReportOwnLeave();
  const adminLeave = useReportTeacherLeave();
  const [date, setDate] = useState(initialDate);
  // 🔴 The read is scoped to whoever asked ⇒ on the ADMIN door it would be the admin's own day. It is not asked for at
  // all there (`enabled: !onBehalf`): 🔑 *not fetched and ignored — a request whose answer must never be shown should
  // not be made.*
  const { data: calendar, isLoading } = useCalendar(date, "day", false, !onBehalf);
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
  // 🔴 TASK-611 — the admin door's one reduction, asked from the SAME comparison the act uses. 🚫 Not a second rule.
  const refusedForAdmin = onBehalf && !advance;

  const toggle = (id: string, on: boolean) => setTicks({ date, ids: on ? [...ticked, id] : ticked.filter((x) => x !== id) });

  const submit = async () => {
    setError(null);
    // 🚫 The two guards (TASK-564's lesson): the button is disabled AND nothing is sent on a date this door refuses.
    if (refusedForAdmin) return;
    try {
      // 🔑 ONE body builder for both doors — `leaveBody` is unchanged and needed no new shape. On the admin door the act
      // is always the advance one, so it carries `{ date, reason }` and 🚫 never `sessionIds`.
      const body = leaveBody(date, allIds, ticked, reason, advance);
      const res = subject ? await adminLeave.mutateAsync({ teacherId: subject.id, ...body }) : await leave.mutateAsync(body);
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
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      size="md"
      title={subject ? t("teacherLeave.adminTitle", { name: subject.name }) : t("teacherLeave.title")}
    >
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
            {/* 🔑 Never a toast, never abbreviated: a teacher who believes their classes were cancelled will not turn up.
                🔴 TASK-611 — and for the ADMIN it is worse, so the sentence is written for whoever is reading: *an admin who
                believes the families were told will not phone them, and the admin was the one about to act.* */}
            <Alert color="orange" variant="light" icon={<AlertTriangle size={15} />} data-leave-nothing-cancelled>
              {subject ? t("teacherLeave.adminNothingCancelled") : t("teacherLeave.advanceNothingCancelled")}
            </Alert>
            {subject && (
              <Text size="xs" c="dimmed" data-leave-teacher-told>
                {t("teacherLeave.adminDoneTeacherTold", { name: subject.name })}
              </Text>
            )}
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
        {/* 🔴 TASK-611 — the admin door's refusal, and it NAMES WHAT TO DO INSTEAD. 🚫 Never a bare "not allowed":
            *a reason with no next step is a dead end with a caption.* */}
        {refusedForAdmin && (
          <Alert color="yellow" variant="light" icon={<AlertTriangle size={15} />} data-leave-admin-refused>
            <Text size="sm">{t("teacherLeave.adminPastRefused")}</Text>
            <Text size="sm" fw={600} mt={4}>
              {t("teacherLeave.adminPastRefusedAction")}
            </Text>
          </Alert>
        )}
        {/* 🔴 The chooser is ABSENT on an advance date, not disabled — a tick there would mean "cancel this one", and the
            act cancels nothing. What the day already holds is shown AFTER the act, from the server's own list.
            🔴 TASK-611 — and on the ADMIN door it is absent on EVERY date, because the rows would be the admin's own. */}
        {advance ? (
          <Alert color="blue" variant="light" data-leave-advance-notice>
            {subject ? t("teacherLeave.adminHint", { name: subject.name }) : t("teacherLeave.advanceHint")}
          </Alert>
        ) : onBehalf ? null : (
        <div data-leave-chooser>
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
        {/* 🔴 TASK-595 — this line belongs to the CANCEL act ONLY. It says the ticked sessions' families will be told and
            the make-ups added; on an advance date 🚫 nothing is cancelled, nobody is told and no make-up is owed, so on a
            future date it described an act that was not happening — directly contradicting the blue hint above it.
            🔑 TASK-588 removed the chooser and reworded the button; this sentence sat outside both. */}
        {!advance && (
          <Text size="xs" c="orange" data-leave-cancel-warning>
            {t("teacherLeave.warning")}
          </Text>
        )}
        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          {/* 🔑 On an advance date there are no ticks to count, so the ticks cannot gate the act and the label cannot
              promise a number of cancellations. Only the reason gates it — the server's own requirement. */}
          <Button
            color="orange"
            loading={leave.isPending || adminLeave.isPending}
            disabled={refusedForAdmin || (!advance && ticked.length === 0) || reason.trim().length === 0}
            data-leave-submit
            onClick={() => void submit()}
          >
            {subject
              ? t("teacherLeave.adminSubmit", { name: subject.name })
              : advance
                ? t("teacherLeave.submitAdvance")
                : t("teacherLeave.submit", { n: ticked.length })}
          </Button>
        </Group>
        </>
        )}
      </Stack>
    </Modal>
  );
}
