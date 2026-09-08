"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Group, Loader, Modal, ScrollArea, Select, Stack, Text, Textarea } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { AlertTriangle } from "lucide-react";
import dayjs from "dayjs";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { useDropCourse, usePreviewEndCourse, useResumeCourse } from "@/hooks/scheduler";
import { formatDateDisplay } from "@/lib/ui/format";
import { TIME_SLOTS, type EndCoursePreview } from "@/types/app/scheduler";
import type { ResumeCourseResponse } from "@/types/api/contract";
import { defaultResumeDate, resumeDefaultTime } from "@/lib/scheduler/resume-defaults";

interface Props {
  opened: boolean;
  mode: "drop" | "resume";
  courseId: string | null;
  /** For the sentence — the same facts the plan already has, so nothing is re-counted or invented. */
  program: string | null;
  student: string | null;
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
 * 🔴 **The number in the pause sentence is the SERVER's** (TASK-291). It used to be the caller's live-session
 * count, and this comment used to justify that with *"there is no `/drop/preview` on the server"* — **true about
 * the route and wrong about the fact.** There is no `/drop/preview`, but `POST /courses/:id/cancel/preview`
 * answers exactly this question, because **a pause and an early ending cancel the same set**: both call
 * `endableSessions` (`course-plan.ts`), one definition of *"still ahead of the family"*.
 * ⚠️ **The route is NAMED for cancel and that is not a mistake here** — see the call site below.
 */
export default function DropResumeDialog({
  opened,
  mode,
  courseId,
  program,
  student,
  courseStartTime,
  courseWeekday,
  onClose,
  onDone,
}: Props) {
  const t = useT();
  const drop = useDropCourse();
  const resume = useResumeCourse();
  const previewPause = usePreviewEndCourse();

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
  /**
   * 🔴 TASK-291 — **what the pause will actually remove, in the server's own number.**
   *
   * The sentence used to say `remaining`, the caller's `sessions.filter(x => x.status !== "SICK_LEAVE")`.
   * On @Tanya's course that read **9** where the pause cancels **4**: an EXCLUSION list on the screen against
   * the server's INCLUSION list (`PENDING · CONFIRMED · EXTENDED`). **They agreed while every row was live and
   * diverged the moment anything was cancelled** — so the number was wrong about the ACT, not merely about the
   * list under it, in the one sentence the admin acts on.
   *
   * 🚫 **The fix is NOT to copy those three statuses here.** There is no live-status list anywhere on the front
   * end today, and a second copy of it is the drift this would be repeating rather than fixing.
   */
  const [pausePreview, setPausePreview] = useState<EndCoursePreview | null>(null);

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
   * 🔴 TASK-291 — ask the server what the pause will remove, **every time the pause face opens.**
   *
   * ⚠️ **The route is named `/cancel/preview` and it is the right one anyway.** A pause and an early ending
   * cancel the same set — `previewCourseEnd` and `dropCourse` both call `endableSessions`, so this is the same
   * question, not a coincidence to be exploited. **The name is under-descriptive, not wrong**, and renaming a
   * route is a contract change (@Sober, TASK-291 §1). 🚫 It writes nothing.
   *
   * Re-asked on every open rather than cached: a count from a previous open can describe a plan that has since
   * changed, and this one is read immediately before an act that cancels sessions.
   */
  useEffect(() => {
    if (!opened || mode !== "drop" || !courseId) {
      setPausePreview(null);
      return;
    }
    previewPause
      .mutateAsync(courseId)
      .then(setPausePreview)
      .catch((e) => setError(e instanceof ApiClientError ? e.message : t("plan.genericError")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, mode, courseId]);

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
      /**
       * 🔴 TASK-291 §2 — **the body scrolls, so the primary action can always be reached.**
       *
       * @Sober's reason is not the viewport: *"a dialog whose primary action can be unreachable is a dialog that
       * cannot be VERIFIED"* — and this one GREW when the resume summary panel was added, which is the state
       * @Tanya could not complete a check on.
       *
       * ⚠️ **Correction worth having: Mantine v9 already caps `.mantine-Modal-content` at
       * `calc(100dvh - 2 * 5dvh)` with `overflow-y: auto`, so this dialog was never unscrollable.** This makes
       * the body its own scroll region instead of the whole content, which is the documented answer and, more
       * to the point, states the intent where the next person edits the dialog. 🚫 Nothing restructured.
       */
      scrollAreaComponent={ScrollArea.Autosize}
      radius="lg"
      /**
       * 🔴 TASK-293 §1 — @Porter's defect, in his words: *"the one dialog whose whole job is to say 'here is
       * what I DID' opens by sounding like 'may I?'"* — **"Resume this course?"** over a body in the past tense
       * with only a `Close` button. The plan behind the dialog is already updated; the title was the last thing
       * on screen still claiming otherwise.
       *
       * ✅ **`endCourse.resumeDone` already IS his replacement, word for word** — it is the toast fired the
       * moment the re-plan lands. 🚫 **So it is reused, not copied.** Two strings saying one thing is the drift
       * class this week has been spent on, and the toast and the title are the same sentence about the same
       * fact. *(The Thai says it too: `กลับมาเรียนแล้ว`.)*
       *
       * ⚠️ **`isDrop` is tested FIRST on purpose.** `result` is only ever set on the resume face today, but the
       * pause face's title is asked BEFORE its act and must stay a question — writing the branch this way makes
       * that structural rather than incidental.
       */
      title={t(isDrop ? "endCourse.dropTitle" : result ? "endCourse.resumeDone" : "endCourse.resumeTitle")}
    >
      <Stack gap="md">
        {error && (
          <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
            {error}
          </Alert>
        )}

        {/* 🔴 TASK-291 — the pause sentence waits for the server's number and has **no fallback of its own**.
            A count that appears and then corrects itself is the same defect wearing a delay, and a `?? 0` here
            would be a client-invented figure in the sentence this whole task exists to make true. If the
            preview fails, the Alert above carries the server's words and the confirm button stays disabled. */}
        {isDrop ? (
          pausePreview ? (
            <Text fz="sm" className="tabular-nums">
              {t("endCourse.dropLine", {
                program: program ?? "—",
                student: student ?? "—",
                n: pausePreview.removedSessions,
              })}
            </Text>
          ) : previewPause.isPending ? (
            <Group justify="center" py="md">
              <Loader size="sm" />
            </Group>
          ) : null
        ) : (
          <Text fz="sm" className="tabular-nums">
            {t("endCourse.resumeLine", { program: program ?? "—", student: student ?? "—" })}
          </Text>
        )}

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
            {/* 🔴 TASK-295 §4(c) — `required`, which `First session date` beside it has always had. **Both are
                mandatory to the API** (`validation.ts:697`), and while this field was rendering EMPTY the form
                was saying the opposite. @Porter: *"the form told them they could."*

                🔴 **`searchable` REMOVED — @Tanya's Round 13, and it is the other half of DEF-5.** She reported
                *"a HIDDEN third input still carrying `10:00:00`, so the field the admin edits is not the field
                submitted"*, and *"it fails on a hand-typed value too"*. There is no third input — **there is
                exactly one resume submitter in this repo** — but a `searchable` Select renders **a search box
                whose text is NOT the value**: type `13:00`, do not pick the filtered option, and the search box
                reverts on blur while `startTime` stays what it was. ⇒ **her sentence is exactly right about the
                symptom and the DOM she read; only the cause was the control rather than a stray field.**
                🔑 **Nine options do not need a search box, and with the field rendering EMPTY it read as one
                that had to be typed into.** ⚠️ After the value fix this would no longer error — **it would
                submit the wrong time silently**, which is worse.
                📌 `CreateCourseModal`'s copy keeps it, ruled by @Sober: **a new course has no server value to
                mismatch, so the mechanism is absent there.** */}
            <Select
              label={t("course.time")}
              value={startTime}
              onChange={(v) => v && setStartTime(v)}
              data={TIME_SLOTS.map((slot) => ({ value: slot, label: slot }))}
              allowDeselect={false}
              required
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
              // 🔴 TASK-291 — plus: **a pause cannot be confirmed before the server has said how many.** The
              // admin is agreeing to a number; there must be one, and it must not be ours.
              disabled={!courseId || (isDrop ? !pausePreview : !startDate || !startTime)}
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
