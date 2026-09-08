"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Group, Modal, Select, Stack, Text, Textarea } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { AlertTriangle } from "lucide-react";
import dayjs from "dayjs";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { useDropCourse, useResumeCourse } from "@/hooks/scheduler";
import { formatDateDisplay } from "@/lib/ui/format";
import { TIME_SLOTS } from "@/types/app/scheduler";
import type { ResumeCourseResponse } from "@/types/api/contract";
import { defaultResumeDate, resumeDefaultTime } from "@/lib/scheduler/resume-defaults";

interface Props {
  opened: boolean;
  mode: "drop" | "resume";
  courseId: string | null;
  /** For the sentence — the same facts the plan already has, so nothing is re-counted or invented. */
  program: string | null;
  student: string | null;
  /** Live sessions currently on the schedule; only meaningful for `drop`. */
  remaining: number;
  /**
   * 🔴 TASK-288 §1 — **this course's OWN slot**, from its own session rows. The re-plan form opens on it, so
   * *"the same slot, later"* is the one-click answer and moving the lesson is a deliberate act.
   * ⚠️ A `17:00` course resumed on the creation form's `10:00` default came back at `10:00`, silently — the
   * defaults were right for CREATION and wrong for a RE-PLAN, where the course already has a slot.
   */
  courseStartTime?: string | null;
  /** 0–6, from the course's own session dates. Used to land the default date on the same weekday. */
  courseWeekday?: number | null;
  onClose: () => void;
  /** Called once the act has happened AND the admin has read the outcome — never before (TASK-288 §2). */
  onDone?: () => void;
}

/**
 * TASK-199 — **pause** a course, and bring it back.
 *
 * A pause is deliberately *not* a cancel: the sessions leave the schedule but the course keeps its `size` and
 * its history. So this dialog is reassuring where `EndCourseDialog` is grave, and it does not demand a reason
 * from a closed list, because a pause has no closed set of causes the way an early ending does.
 *
 * ⚠️ **It no longer "resumes onto the same slot"** — TASK-287 made resume a RE-PLAN, and this component's own
 * comment used to say otherwise. What it does now is open the re-plan on the course's own slot as a *default*
 * (TASK-288 §1), which is a different promise and a weaker one.
 *
 * 🔴 There is **no `/drop/preview`** on the server. Rather than invent a count, the pause sentence uses the
 * number of live sessions the caller already has on screen — and says nothing the server hasn't.
 */
export default function DropResumeDialog({
  opened,
  mode,
  courseId,
  program,
  student,
  remaining,
  courseStartTime,
  courseWeekday,
  onClose,
  onDone,
}: Props) {
  const t = useT();
  const drop = useDropCourse();
  const resume = useResumeCourse();

  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  /**
   * 🔴 TASK-287 — resume is a **RE-PLAN**, so it asks the scheduling question course creation asks
   * (owner: *"เอาเหมือนตอนสร้างคอร์สเลย"*). Same two fields, same defaults as `CreateCourseModal`.
   * 🚫 **No weekday input** — the server derives it from the date (`weekdayOf(startDate)`), exactly as course
   * creation does, and sending one would be silently stripped by zod.
   */
  const [startDate, setStartDate] = useState(() => defaultResumeDate(courseWeekday));
  const [startTime, setStartTime] = useState(resumeDefaultTime(courseStartTime));
  /** What the re-plan actually did — read from the response, never computed (TASK-287 §7). */
  const [result, setResult] = useState<ResumeCourseResponse | null>(null);

  // 🔴 TASK-288 §1 — seeded on OPEN, not once at mount: the plan (and therefore the course's own slot) may not
  // have loaded when this component first mounted, and a default that arrives too late is the same defect.
  useEffect(() => {
    if (opened) {
      setStartDate(defaultResumeDate(courseWeekday));
      setStartTime(resumeDefaultTime(courseStartTime));
      return;
    }
    setReason("");
    setError(null);
    setResult(null);
  }, [opened, courseStartTime, courseWeekday]);

  /**
   * 🔴 TASK-288 §2 — the act happened; the admin has now read what it did. **This is the ONLY place `onDone`
   * is called**, and that is the fix: it used to fire the moment the mutation returned, and `onDone` closes the
   * PLAN modal, which unmounted this dialog before its summary could render.
   */
  const finish = () => {
    onDone?.();
    onClose();
  };

  const submit = async () => {
    if (!courseId) return;
    setError(null);
    try {
      if (mode === "drop") {
        await drop.mutateAsync({ courseId, reason: reason.trim() || undefined });
        notify({ title: t("endCourse.dropDone"), color: "success" });
        finish();
        return;
      } else {
        // 🔴 TASK-287 — the schedule is ALWAYS sent. `{}` is refused server-side now, deliberately: that empty
        // path is what produced DEF-2's non-determinism.
        const res = await resume.mutateAsync({ courseId, startDate, startTime });
        notify({ title: t("endCourse.resumeDone"), color: "success" });
        // 🔑 The re-plan MOVED things — where the course now ends, and possibly its expiry. The dialog holds
        // open to state both, because an expiry that shifts silently is exactly what REQ-082's audit trail
        // exists to make answerable. ⚠️ Nothing here is a gate; the only control left is Close.
        //
        // 🔴 TASK-288 §2 — `onDone` is NOT called here. It closes the plan modal, which unmounts this dialog:
        // calling it beside `setResult` meant the summary was set on a component that was already going away,
        // and what @Tanya saw was the unmount, not a short-lived dialog. `finish()` runs on Close instead.
        setResult(res);
        return;
      }
    } catch (e) {
      // 🧹 TASK-287 §6 — the `EXPIRY_REQUIRED` prompt-and-retry handler that used to live here is DELETED: the
      // code is gone from the backend entirely (the expiry is derived now, so there is no expiry request left
      // to be wrong). A handler for a code that can never arrive is a path nobody can test.
      //
      // A resume regenerates real sessions, so it can clash (SLOT_TAKEN) or be refused (COURSE_ENDED / already
      // dropped). Those are the server's words — it knows which slot and why, and this dialog does not.
      setError(e instanceof ApiClientError ? e.message : t("plan.genericError"));
    }
  };

  const busy = drop.isPending || resume.isPending;
  const isDrop = mode === "drop";

  return (
    <Modal
      opened={opened}
      // TASK-288 §2 — dismissing AFTER the act still has to tell the caller it happened, or the plan behind
      // this dialog keeps showing the pre-resume schedule.
      onClose={result ? finish : onClose}
      centered
      radius="lg"
      title={t(isDrop ? "endCourse.dropTitle" : "endCourse.resumeTitle")}
    >
      <Stack gap="md">
        {error && (
          <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
            {error}
          </Alert>
        )}

        <Text fz="sm" className="tabular-nums">
          {isDrop
            ? t("endCourse.dropLine", { program: program ?? "—", student: student ?? "—", n: remaining })
            : t("endCourse.resumeLine", { program: program ?? "—", student: student ?? "—" })}
        </Text>

        {isDrop ? (
          // Free text, and optional — the BE keeps it that way on purpose: a pause has no closed set of causes.
          <Textarea
            label={t("endCourse.dropReason")}
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
            autosize
            minRows={2}
            maxRows={4}
          />
        ) : result ? (
          /* 🔑 TASK-287 §2 — what the re-plan DID, stated from the response. 🚫 Neither number is computed
             here: `lastSession` and `expiryDate` are the server's, and `expiryExtended` is what separates
             *"the expiry moved because the course moved"* from a number that changed on its own. */
          <Stack gap={4}>
            <Text fz="sm">{t("endCourse.resumeCreated", { n: result.createdSessions })}</Text>
            {result.lastSession && (
              <Text fz="sm">
                {t("endCourse.resumeLastSession", { date: formatDateDisplay(result.lastSession) })}
              </Text>
            )}
            <Text fz="sm" fw={result.expiryExtended ? 600 : 400}>
              {t(result.expiryExtended ? "endCourse.resumeExpiryMoved" : "endCourse.resumeExpirySame", {
                date: formatDateDisplay(result.expiryDate),
              })}
            </Text>
          </Stack>
        ) : (
          /* 🔴 TASK-287 §1 — the scheduling question, and it is course creation's question.
             ⚠️ These two inputs are COPIED from `CreateCourseModal` (same labels `course.firstDate` /
             `course.time`, same `TIME_SLOTS`, same `valueFormat`, same defaults) rather than extracted into a
             shared component: there they sit inline in a 400-line form whose teacher filter and preview both
             depend on `startDate`, so lifting them out is a refactor of the enrolment flow, not an import.
             **Deploy night is not when to untangle that** — see the Question in TASK-287. Staff see identical
             controls either way, which is what *"เอาเหมือนตอนสร้างคอร์สเลย"* is actually about.
             🚫 **No weekday input** — the server derives it from the date, exactly as course creation does. */
          <Group grow align="flex-start">
            <DatePickerInput
              label={t("course.firstDate")}
              value={startDate}
              onChange={(v) => v && setStartDate(v)}
              valueFormat="D MMM YYYY"
              minDate={new Date()}
              required
              popoverProps={{ withinPortal: true }}
            />
            <Select
              label={t("course.time")}
              value={startTime}
              onChange={(v) => v && setStartTime(v)}
              data={TIME_SLOTS.map((slot) => ({ value: slot, label: slot }))}
              allowDeselect={false}
              searchable
            />
          </Group>
        )}

        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" color="gray" onClick={result ? finish : onClose}>
            {t(result ? "common.close" : "common.cancel")}
          </Button>
          {/* Once the re-plan has happened there is nothing left to submit — only what it did, to read. */}
          {!result && (
            <Button
              color={isDrop ? "yellow" : "green"}
              loading={busy}
              // Both fields are required by the API, so both gate the button — and nothing else does.
              disabled={!courseId || (!isDrop && (!startDate || !startTime))}
              onClick={submit}
            >
              {t(isDrop ? "endCourse.dropConfirm" : "endCourse.resumeConfirm")}
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
