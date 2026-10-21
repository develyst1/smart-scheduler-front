"use client";

import { useState } from "react";
import dayjs from "dayjs";
import { Alert, Badge, Button, Checkbox, Group, Loader, Modal, Stack, Text, Textarea } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { AlertTriangle } from "lucide-react";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { notify } from "@/lib/ui/notify";
import { formatDateWithDay, formatTimeDisplay } from "@/lib/ui/format";
import { calendarDayBookings } from "@/lib/api/mappers";
import { useCalendar, useReportOwnLeave, useReportTeacherLeave } from "@/hooks/scheduler";
import { isAdvanceLeaveDate, isAdvanceResult, leaveBody, leaveDefaultTicks } from "@/lib/scheduler/teacher-scope";
import { StatusChip } from "@/components/common/BookingBadges";
import TeacherPick from "./LeaveTeacherPick";
import LeaveClassRow, { LeaveCannotNote, LeaveContinuesRow } from "../LeaveClassRow";
import LeaveWillDo from "./LeaveWillDo";
import LeaveSameDayResult from "./LeaveSameDayResult";
import LeaveClassOpener from "../LeaveClassOpener";
import { leaveRangeIssue, rangeIssueFromError } from "./leave-range";
import type { LeaveDayClass, OwnLeaveResult } from "@/types/api/contract";

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
/**
 * 🔴 **TASK-817 (BE) → TASK-818 — three changes, all on the ADMIN door except the last:**
 *  1. **A DATE RANGE** (From – To, one reason): `To` is optional, blank = the one day. The answer lists PER DAY its classes and whether it was new.
 *  2. **A sensible default date:** from the Teachers menu the date starts EMPTY (`initialDate=""`: 🚫 never "tomorrow" — an admin who has not chosen a
 *     date has not asked for one); from the calendar it is the day being viewed, and `pickTeacher` adds the teacher choice that menu already made.
 *  3. **Say what saving will do, before saving:** the own door counts what the dialog already holds (the session list / the ticks); the admin door
 *     does not hold the teacher's classes (the calendar read is the ADMIN's own day), so it says what it does NOT know yet — the list follows the save.
 */
export default function ReportLeaveDialog({
  opened,
  initialDate,
  onClose,
  subject: fixedSubject,
  pickTeacher = false,
}: {
  opened: boolean;
  initialDate: string;
  onClose: () => void;
  /** 🔴 TASK-611 — whose leave this is. **Omitted = the signed-in teacher's own**, which is the pre-existing door. */
  subject?: { id: string; name: string };
  /** 🔴 TASK-818 — the admin door WITHOUT a fixed teacher (the calendar's "Record teacher leave"): the dialog asks whose leave it is. */
  pickTeacher?: boolean;
}) {
  const t = useT();
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  // 🔑 `subject` below is WHOSE leave this is: the fixed one, or the teacher the admin picked. Absent on an admin door (`choosing`) = not chosen yet.
  const subject = fixedSubject ?? picked;
  const onBehalf = fixedSubject != null || pickTeacher;
  const choosing = onBehalf && !subject;
  const leave = useReportOwnLeave();
  const adminLeave = useReportTeacherLeave();
  const [date, setDate] = useState(initialDate);
  // 🔴 TASK-818 — the optional END of an admin range. "" = one day. Never set on the teacher's own door (one day, as the server has it).
  const [dateTo, setDateTo] = useState("");
  const noDate = date === "";
  const isRange = onBehalf && dateTo !== "" && dateTo > date;
  const rangeDays = isRange ? dayjs(dateTo).diff(dayjs(date), "day") + 1 : 1;
  // 🔴 TASK-822 (F1) — the range's two refusals (end before start · over 31 days), said HERE before any request, in the viewer's language; the button waits while one stands.
  const rangeIssue = onBehalf && date !== "" ? leaveRangeIssue(date, dateTo) : null;
  // 🔴 TASK-822 (F2) — "Open" on a class of the result: the real booking modal (the admin's door only).
  const [openClass, setOpenClass] = useState<LeaveDayClass | null>(null);
  // 🔴 TASK-829 — a teacher's own SAME-DAY answer that involved a co-taught class stays ON SCREEN (continues · cancelled · left as it is) instead of closing on a toast.
  const [sameDay, setSameDay] = useState<OwnLeaveResult | null>(null);
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
    // 🔴 TASK-818 — and the two WAITS (no date yet · no teacher chosen yet): nothing is sent, nothing is refused in words either.
    if (noDate || choosing || rangeIssue) return;
    try {
      // 🔑 ONE body builder for both doors — `leaveBody` is unchanged and needed no new shape. On the admin door the act
      // is always the advance one, so it carries `{ date, reason }` and 🚫 never `sessionIds`.
      // 🔴 TASK-818 — a RANGE is `{ from, to, reason }` (the server's body; one reason for every day).
      const body = leaveBody(date, allIds, ticked, reason, advance);
      const res = subject
        ? isRange
          ? await adminLeave.mutateAsync({ teacherId: subject.id, from: date, to: dateTo, reason: reason.trim() })
          : await adminLeave.mutateAsync({ teacherId: subject.id, ...body })
        : await leave.mutateAsync(body);
      // 🔑 Which act ran is read from the ANSWER, never re-derived from the date we sent.
      if (res.mode === "advance-range") {
        setDone(res);
        return;
      }
      // 🔴 TASK-829 (REQ-125 K1) — the same-day answer carries `continues` / `toHandle` ONLY when a co-taught class was involved: then show what happened (a class left as it is must not vanish
      // behind a toast). A sole-teacher-only day has neither key and falls through to today's toast + close, unchanged.
      if (!isAdvanceResult(res) && ((res.continues?.length ?? 0) > 0 || (res.toHandle?.length ?? 0) > 0)) {
        setSameDay(res);
        return;
      }
      if (isAdvanceResult(res)) {
        setDone(res);
        return;
      }
      notify({ title: t("teacherLeave.done", { n: res.cancelled, families: res.familiesNotified }), color: "success" });
      onClose();
    } catch (e) {
      // 🔴 TASK-822 (F1) — the server's real range sentence rides in `details` (its message is one generic line): show the approved text in OUR language instead.
      const issue = rangeIssueFromError(e);
      setError(issue ? t(issue) : e instanceof ApiClientError ? e.message : (e as Error).message);
    }
  };

  return (
    <>
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      size="md"
      title={subject ? t("teacherLeave.adminTitle", { name: subject.name }) : onBehalf ? t("teacherLeave.recordTeacherLeave") : t("teacherLeave.title")}
    >
      <Stack gap="sm">
        {error && (
          <Alert color="red" icon={<AlertTriangle size={15} />} variant="light">
            {error}
          </Alert>
        )}
        {sameDay ? (
          <LeaveSameDayResult res={sameDay} rows={rows} onClose={onClose} />
        ) : done?.mode === "advance-range" ? (
          <RangeResult done={done} name={subject?.name ?? ""} onClose={onClose} onOpenClass={setOpenClass} />
        ) : done ? (
          /* 🔴 TASK-588 — the advance result, in @Jason's §15 order: the day is blocked · these classes are already booked
             and an ADMIN will handle them · 🔑 NOTHING HAS BEEN CANCELLED. The last clause is the one that matters. */
          <Stack gap="sm" data-leave-advance={done.bookings?.length ?? 0}>
            {/* 🔴 TASK-651 (F4) — chosen by `subject`, exactly as `adminNothingCancelled` already is. 🔑 The admin's
                result said *you are recorded as away* and *an admin will handle them* to the admin who just acted. */}
            <Text fw={600}>
              {subject
                ? t("teacherLeave.adminAdvanceTitle", { date: date, name: subject.name })
                : t("teacherLeave.advanceTitle", { date: date })}
            </Text>
            {done.alreadyRecorded && (
              <Text size="xs" c="dimmed" data-leave-already>
                {t("teacherLeave.advanceAlready")}
              </Text>
            )}
            <Text size="sm">
              {subject ? t("teacherLeave.adminAdvanceBlocked", { name: subject.name }) : t("teacherLeave.advanceBlocked")}
            </Text>
            {(done.bookings?.length ?? 0) > 0 ? (
              <>
                <Text size="sm">
                  {subject
                    ? t("teacherLeave.adminAdvanceClasses", { n: done.bookings?.length ?? 0, name: subject.name })
                    : t("teacherLeave.advanceClasses", { n: done.bookings?.length ?? 0 })}
                </Text>
                <Stack gap={2}>
                  {(done.bookings ?? []).map((b) => (
                    <div key={b.id}>
                      <LeaveClassRow c={b} onOpen={onBehalf ? setOpenClass : undefined} />
                      {subject && done.toHandle?.some((x) => x.bookingId === b.id) && <LeaveCannotNote name={subject.name} startTime={b.startTime} />}
                    </div>
                  ))}
                </Stack>
              </>
            ) : (done.continues?.length ?? 0) > 0 ? null : (
              <Text size="sm" c="dimmed">
                {subject ? t("teacherLeave.adminAdvanceNoClasses", { name: subject.name }) : t("teacherLeave.advanceNoClasses")}
              </Text>
            )}
            {/* 🔴 TASK-828 — co-taught classes the leave took the teacher OFF: they continue with the others, nothing to do. */}
            {(done.continues?.length ?? 0) > 0 && (
              <Stack gap={2} data-leave-continues-list={done.continues?.length}>
                {done.continues?.map((c) => (
                  <LeaveContinuesRow key={c.bookingId} c={c} />
                ))}
              </Stack>
            )}
            {/* 🔑 Never a toast, never abbreviated: a teacher who believes their classes were cancelled will not turn up.
                🔴 TASK-611 — and for the ADMIN it is worse, so the sentence is written for whoever is reading: *an admin who
                believes the families were told will not phone them, and the admin was the one about to act.* */}
            <Alert color="orange" variant="light" icon={<AlertTriangle size={15} />} data-leave-nothing-cancelled>
              {subject ? t("teacherLeave.adminNothingCancelled") : t("teacherLeave.advanceNothingCancelled")}
            </Alert>
            {/**
              * 🔴 **TASK-611 §2 — the defect this replaces was mine, and it was the same error as the line above it.**
              * This used to render on `subject &&` — i.e. on every admin use — so for an **unlinked** coach the screen
              * said *"{name} has been told about this day"* and **it was false.** 🔑 *I wrote the admin's "nothing has
              * been cancelled" because an admin who believes the families were told will not phone them — and then the
              * next line made the admin believe the COACH was told. Same consequence, same reader.*
              * ▶️ **It is read from the ANSWER's count now, never re-derived from which door was used.** And the THIRD
              * state is deliberate: **`undefined` = we were not told whether the notice went, so the screen says
              * nothing about it** — 🚫 printing either sentence there would be a guess wearing a fact's clothes.
              */}
            {subject && typeof done.teacherNotified === "number" && (
              <Text
                size="xs"
                c={done.teacherNotified > 0 ? "dimmed" : "orange"}
                data-leave-teacher-told={done.teacherNotified > 0 ? "yes" : "no"}
              >
                {done.teacherNotified > 0
                  ? t("teacherLeave.adminDoneTeacherTold", { name: subject.name })
                  : t("teacherLeave.adminDoneTeacherNotTold", { name: subject.name })}
              </Text>
            )}
            <Group justify="flex-end">
              <Button onClick={onClose}>{t("common.close")}</Button>
            </Group>
          </Stack>
        ) : (
        <>
        {pickTeacher && !fixedSubject && <TeacherPick value={picked} onPick={setPicked} />}
        <DatePickerInput
          label={t("teacherLeave.date")}
          value={date || null}
          onChange={(v) => {
            if (!v) return;
            const next = dayjs(v).format("YYYY-MM-DD");
            setDate(next);
            // 🔻 TASK-822: the end is no longer dropped silently when the start moves past it — it stays, and the refusal below says why (a hidden change is worse than a shown one).
          }}
          valueFormat="D MMM YYYY"
          popoverProps={{ withinPortal: true }}
          data-leave-date-from
        />
        {onBehalf && (
          <DatePickerInput
            label={t("teacherLeave.dateTo")}
            value={dateTo || null}
            minDate={date ? dayjs(date).add(1, "day").format("YYYY-MM-DD") : undefined}
            onChange={(v) => setDateTo(v ? dayjs(v).format("YYYY-MM-DD") : "")}
            valueFormat="D MMM YYYY"
            clearable
            popoverProps={{ withinPortal: true }}
            data-leave-date-to
          />
        )}
        {rangeIssue && (
          <Alert color="red" variant="light" icon={<AlertTriangle size={15} />} data-leave-range-refused={rangeIssue}>
            {t(rangeIssue)}
          </Alert>
        )}
        {/* 🔴 TASK-611 — the admin door's refusal, and it NAMES WHAT TO DO INSTEAD. 🚫 Never a bare "not allowed":
            *a reason with no next step is a dead end with a caption.* */}
        {refusedForAdmin && !noDate && (
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
          choosing || rangeIssue ? null : (
          <Alert color="blue" variant="light" data-leave-advance-notice>
            {isRange && subject ? t("teacherLeave.adminRangeHint", { name: subject.name, n: rangeDays }) : subject ? t("teacherLeave.adminHint", { name: subject.name }) : t("teacherLeave.advanceHint")}
          </Alert>
          )
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
                      <StatusChip status={r.status} isMakeup={r.isMakeup} />
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
        {/* 🔴 TASK-651 item 3 (F5) — `!subject` added. The line promises the TICKED sessions' families are told, and
            🔑 **the cancel act happens only on the TEACHER's own door**: on the admin door a today date makes `advance`
            false, so it appeared on a screen with NO ticks — and one where today is refused anyway.
            📌 My TASK-595 comment already said this line belongs to the cancel act only; **this is the second door
            that comment did not cover** — *a rule written down for one door does not travel to the next by itself.* */}
        {!advance && !onBehalf && (
          <Text size="xs" c="orange" data-leave-cancel-warning>
            {t("teacherLeave.warning")}
          </Text>
        )}
        {/* 🔴 TASK-818 (P7) → TASK-828 (REQ-125 ruling B) — what saving WILL do, said BEFORE it is done, from the server's PREVIEW (whether a co-taught class continues depends on
            whether another teacher remains — not something the calendar rows say): the split counts live in `LeaveWillDo`. */}
        <LeaveWillDo
          ready={!noDate && !choosing && !rangeIssue && !isLoading}
          adminFor={onBehalf ? subject : null}
          date={date}
          to={isRange ? dateTo : date}
          advance={advance}
          ticked={ticked}
          ownRows={rows}
        />
        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          {/* 🔑 On an advance date there are no ticks to count, so the ticks cannot gate the act and the label cannot
              promise a number of cancellations. Only the reason gates it — the server's own requirement. */}
          <Button
            color="orange"
            loading={leave.isPending || adminLeave.isPending}
            disabled={refusedForAdmin || noDate || choosing || rangeIssue !== null || (!advance && ticked.length === 0) || reason.trim().length === 0}
            data-leave-submit
            onClick={() => void submit()}
          >
            {subject
              ? isRange
                ? t("teacherLeave.adminSubmitRange", { name: subject.name, n: rangeDays })
                : t("teacherLeave.adminSubmit", { name: subject.name })
              : choosing
                ? t("teacherLeave.recordTeacherLeave")
                : advance
                ? t("teacherLeave.submitAdvance")
                : t("teacherLeave.submit", { n: ticked.length })}
          </Button>
        </Group>
        </>
        )}
      </Stack>
    </Modal>
    {/* 🔴 TASK-822 (F2) — "Open" on a class of the result: the real booking modal, on that class (the same opener as the panel's). */}
    {openClass && <LeaveClassOpener classId={openClass.id} date={openClass.date} onClose={() => setOpenClass(null)} />}
    </>
  );
}

/**
 * 🔴 **TASK-817 (BE) → TASK-818 — the RANGE result, PER DAY** (the server's own list, in date order): was the day new or already on record (skipped — its
 * first entry stands), and the live classes booked on it. 🔑 The two sentences an admin must not get wrong are the SAME approved ones as the single day's
 * result: NOTHING HAS BEEN CANCELLED, and whether the TEACHER was told (read from the COUNT; absent = say nothing).
 */
function RangeResult({ done, name, onClose, onOpenClass }: { done: OwnLeaveResult; name: string; onClose: () => void; onOpenClass: (c: LeaveDayClass) => void }) {
  const t = useT();
  const days = done.days ?? [];
  return (
    <Stack gap="sm" data-leave-range={days.length}>
      <Text fw={600}>{t("teacherLeave.adminAdvanceTitle", { date: `${formatDateWithDay(done.from)} – ${formatDateWithDay(done.to)}`, name })}</Text>
      <Text size="sm">{t("teacherLeave.adminAdvanceBlocked", { name })}</Text>
      <Stack gap="xs">
        {days.map((d) => (
          <div key={d.date} data-leave-range-day={d.date} data-leave-range-already={d.alreadyRecorded ? "yes" : "no"}>
            <Group gap="xs">
              <Text size="sm" fw={500} className="tabular-nums">
                {formatDateWithDay(d.date)}
              </Text>
              <Badge size="sm" variant="light" color={d.alreadyRecorded ? "gray" : "blue"}>
                {d.alreadyRecorded ? t("teacherLeave.rangeDayAlready") : t("teacherLeave.rangeDayNew")}
              </Badge>
              <Text size="xs" c="dimmed">
                {d.bookings.length > 0 ? t("teacherLeave.rangeDayClasses", { n: d.bookings.length }) : t("teacherLeave.rangeDayNone")}
              </Text>
            </Group>
            {d.bookings.map((b) => (
              <div key={b.id}>
                <LeaveClassRow c={b} onOpen={onOpenClass} />
                {d.toHandle?.some((x) => x.bookingId === b.id) && <LeaveCannotNote name={name} startTime={b.startTime} />}
              </div>
            ))}
            {d.continues?.map((c) => (
              <LeaveContinuesRow key={c.bookingId} c={c} />
            ))}
          </div>
        ))}
      </Stack>
      <Alert color="orange" variant="light" icon={<AlertTriangle size={15} />} data-leave-nothing-cancelled>
        {t("teacherLeave.adminNothingCancelled")}
      </Alert>
      {typeof done.teacherNotified === "number" && (
        <Text size="xs" c={done.teacherNotified > 0 ? "dimmed" : "orange"} data-leave-teacher-told={done.teacherNotified > 0 ? "yes" : "no"}>
          {done.teacherNotified > 0 ? t("teacherLeave.adminDoneTeacherTold", { name }) : t("teacherLeave.adminDoneTeacherNotTold", { name })}
        </Text>
      )}
      <Group justify="flex-end">
        <Button onClick={onClose}>{t("common.close")}</Button>
      </Group>
    </Stack>
  );
}
