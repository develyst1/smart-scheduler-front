"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Group, Loader, Modal, ScrollArea, Select, Stack, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { AlertTriangle } from "lucide-react";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { useTeachers } from "@/hooks/scheduler";
// 🔑 straight from the hooks file, NOT the barrel: other test files stub `@/hooks/scheduler` with a hand-written export list (process-global), and a named import the stub lacks
// is a link error that kills the whole `bun test` run (not a failing test). `useTeachers` is in every such stub already (the pause/resume dialog needs it).
import { useChangeTeacherTime, usePreviewChangeTeacherTime } from "@/hooks/scheduler/useScheduler";
import { TeacherOption, teacherSelectData } from "@/components/common/TeacherOption";
import { resumeTeacherOptions } from "@/lib/scheduler/resume-teacher";
import { defaultResumeDate, resumeDefaultTime } from "@/lib/scheduler/resume-defaults";
import { TIME_SLOTS } from "@/types/app/scheduler";
import type { ChangeTeacherTimePreview } from "@/types/api/contract";
import { useCan } from "@/hooks/scheduler/useMe";

interface Props {
  opened: boolean;
  courseId: string | null;
  /** The sentence's facts — the plan already has them; nothing is re-counted here. */
  program: string | null;
  student: string | null;
  /** The course's OWN slot and current teacher, off its own rows — the form opens on them (zero taps to keep). */
  courseStartTime?: string | null;
  courseWeekday?: number | null;
  courseTeacherId?: string | null;
  courseSubject?: { id: string; name: string } | null;
  onClose: () => void;
  /** Called once the act has happened (the plan behind this dialog is already re-read). */
  onDone?: () => void;
}

/**
 * 🔴 **TASK-838 (REQ-127) — "เปลี่ยนครู / เวลา ทั้งคอร์ส": ONE act that moves the course's remaining live sessions to a new teacher, day and time.**
 *
 * 🔑 The pickers are `DropResumeDialog`'s (start date · time · teacher, pre-set to the course's own slot and teacher), and the request body is the resume's three fields —
 * but **`teacherId` is ALWAYS sent**: the act exists to say who teaches the rest.
 * 🔴 **The `{n}` in the sentence is the SERVER's** (`…/change-teacher-time/preview`, a dry run that writes nothing), re-asked whenever the inputs change; the confirm waits for it. 🚫 No client count.
 * 📌 Every refusal — a clash on a date (`SLOT_TAKEN`), an ended or paused course — is the server's own sentence, and the whole act rolls back. No new words here: the title is the button's approved text,
 * the sentence is the approved line, confirm / cancel are the common ones. On success the plan refreshes and "ยืนยันทั้งคอร์ส" (already on the plan) is the next step.
 */
export default function ChangeTeacherTimeDialog({
  opened,
  courseId,
  program,
  student,
  courseStartTime,
  courseWeekday,
  courseTeacherId = null,
  courseSubject = null,
  onClose,
  onDone,
}: Props) {
  const t = useT();
  const can = useCan(); // the submit is the act; hidden without its key
  const preview = usePreviewChangeTeacherTime();
  const change = useChangeTeacherTime();
  const { data: teachers = [] } = useTeachers();

  const [startDate, setStartDate] = useState(() => defaultResumeDate(courseWeekday));
  const [startTime, setStartTime] = useState(resumeDefaultTime(courseStartTime));
  const [teacherId, setTeacherId] = useState<string | null>(courseTeacherId);
  const [answer, setAnswer] = useState<ChangeTeacherTimePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Set only when the act left CONFIRMED sessions to confirm again — the dialog then stays open to say so (see `submit`). */
  const [reconfirm, setReconfirm] = useState<number | null>(null);
  const teacherOptions = resumeTeacherOptions(teachers, courseTeacherId, startDate, courseSubject);

  // seeded on OPEN (the plan may not have loaded when this mounted)
  useEffect(() => {
    if (!opened) return;
    setStartDate(defaultResumeDate(courseWeekday));
    setStartTime(resumeDefaultTime(courseStartTime));
    setTeacherId(courseTeacherId);
    setError(null);
  }, [opened, courseStartTime, courseWeekday, courseTeacherId]);

  // 🔑 the dry run — on open and whenever an input changes. A late answer to an OLD input never replaces the answer for the current one.
  const seq = useRef(0);
  useEffect(() => {
    if (!opened || !courseId || !teacherId || !startDate || !startTime) {
      setAnswer(null);
      return;
    }
    const mine = ++seq.current;
    setAnswer(null);
    setError(null); // a refusal belongs to the inputs that earned it
    preview
      .mutateAsync({ courseId, startDate, startTime, teacherId })
      .then((r) => mine === seq.current && setAnswer(r))
      .catch((e) => mine === seq.current && setError(e instanceof ApiClientError ? e.message : t("plan.genericError")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, courseId, startDate, startTime, teacherId]);

  const submit = async () => {
    if (!courseId || !teacherId) return;
    setError(null);
    try {
      const res = await change.mutateAsync({ courseId, startDate, startTime, teacherId });
      // 🔴 The act sends NO message: a CONFIRMED session returns to PENDING (its confirmation was of the OLD slot) and `needsReconfirm` counts them. Until an admin runs "ยืนยันทั้งคอร์ส"
      // the family and the coach keep the old schedule — so, exactly as the start-change dialog does, say it where the admin is looking, with the SAME approved strings. At 0: nothing.
      if ((res?.needsReconfirm ?? 0) > 0) {
        setReconfirm(res.needsReconfirm ?? 0);
        return;
      }
      onDone?.();
      onClose();
    } catch (e) {
      // SLOT_TAKEN (naming the date) · ended / paused course …: the server's words; nothing was written.
      setError(e instanceof ApiClientError ? e.message : t("plan.genericError"));
    }
  };

  const finish = () => {
    onDone?.();
    onClose();
  };

  // The act happened and left sessions to confirm again: the orange alert of the start-change dialog, with the SAME approved keys (`courseStart.reconfirm*` — not copies).
  if (reconfirm !== null) {
    return (
      <Modal opened={opened} onClose={finish} centered radius="lg" title={t("plan.changeRest")}>
        <Stack gap="md">
          <Alert color="orange" variant="light" icon={<AlertTriangle size={16} />} title={t("courseStart.reconfirmTitle", { n: reconfirm })} data-change-reconfirm={reconfirm}>
            {t("courseStart.reconfirmBody")}
          </Alert>
          <Group justify="flex-end">
            <Button variant="default" onClick={finish}>
              {t("common.close")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    );
  }

  return (
    <Modal opened={opened} onClose={onClose} centered radius="lg" scrollAreaComponent={ScrollArea.Autosize} title={t("plan.changeRest")}>
      <Stack gap="md">
        {error && (
          <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
            {error}
          </Alert>
        )}

        {answer ? (
          <Text fz="sm" className="tabular-nums" data-change-line>
            {t("plan.changeRestLine", { n: answer.n })}
          </Text>
        ) : !error ? (
          <Group justify="center" py="xs">
            <Loader size="sm" />
          </Group>
        ) : null}
        {program || student ? (
          <Text fz="xs" c="dimmed">
            {[program, student].filter(Boolean).join(" · ")}
          </Text>
        ) : null}

        <Group grow align="flex-start">
          <DatePickerInput
            label={t("course.firstDate")}
            value={startDate}
            onChange={(v) => v && setStartDate(v)}
            valueFormat="D MMM YYYY"
            minDate={new Date()}
            required
            popoverProps={{ withinPortal: true }}
            styles={{ input: { textAlign: "left" } }}
          />
          <Select
            label={t("course.time")}
            value={startTime}
            onChange={(v) => v && setStartTime(v)}
            data={TIME_SLOTS.map((slot) => ({ value: slot, label: slot }))}
            allowDeselect={false}
            required
          />
        </Group>
        <Select
          label={t("booking.teacher")}
          placeholder={t("course.pickTeacher")}
          value={teacherId}
          onChange={setTeacherId}
          data={teacherSelectData(teacherOptions)}
          renderOption={({ option, checked }) => <TeacherOption option={option} checked={checked} teachers={teachers} />}
          allowDeselect={false}
          comboboxProps={{ withinPortal: true }}
        />

        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" color="gray" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          {can("action:bookings.course-plan") && (
            <Button
              color="blue"
              loading={change.isPending}
              // a number the server has not said yet is not one to agree to: the confirm waits for the preview of THESE inputs
              disabled={!courseId || !teacherId || !startDate || !startTime || !answer}
              onClick={submit}
            >
              {t("common.confirm")}
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
