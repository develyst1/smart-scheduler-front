"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Group, Modal, Stack, Text, Textarea } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { AlertTriangle } from "lucide-react";
import dayjs from "dayjs";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { useDropCourse, useResumeCourse } from "@/hooks/scheduler";
import ExpiryWarningAlert from "@/components/common/ExpiryWarningAlert";
import type { ExpiryWarning } from "@/types/api/contract";

interface Props {
  opened: boolean;
  mode: "drop" | "resume";
  courseId: string | null;
  /** For the sentence — the same facts the plan already has, so nothing is re-counted or invented. */
  program: string | null;
  student: string | null;
  /** Live sessions currently on the schedule; only meaningful for `drop`. */
  remaining: number;
  onClose: () => void;
  onDone?: () => void;
}

/**
 * TASK-199 — **pause** a course, and bring it back.
 *
 * A pause is deliberately *not* a cancel: the sessions leave the schedule but the course keeps its `size`, its
 * slot and its history, and resume rebuilds on that same slot. So this dialog is reassuring where
 * `EndCourseDialog` is grave — it says the course **can** be resumed, and it does not demand a reason from a
 * closed list, because a pause has no closed set of causes the way an early ending does.
 *
 * 🔴 There is **no `/drop/preview`** on the server. Rather than invent a count, the sentence uses the number of
 * live sessions the caller already has on screen — and says nothing the server hasn't. If the two ever needed to
 * agree exactly, that would be a preview endpoint, not cleverer arithmetic here.
 */
export default function DropResumeDialog({
  opened,
  mode,
  courseId,
  program,
  student,
  remaining,
  onClose,
  onDone,
}: Props) {
  const t = useT();
  const drop = useDropCourse();
  const resume = useResumeCourse();

  const [reason, setReason] = useState("");
  const [expiry, setExpiry] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 🔴 TASK-265 §3 / Q2 — the resume is a plain confirm by default. The date field appears **only** when the
  // server has answered `EXPIRY_REQUIRED`, which is the owner's *"warn, do not act"* applied to his own prompt.
  const [needsExpiry, setNeedsExpiry] = useState(false);
  // The warning about a resume that has already succeeded (never a gate — see `ExpiryWarningAlert`).
  const [warning, setWarning] = useState<ExpiryWarning | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!opened) {
      setReason("");
      setExpiry(null);
      setError(null);
      setNeedsExpiry(false);
      setWarning(null);
      setDone(false);
    }
  }, [opened]);

  const submit = async () => {
    if (!courseId) return;
    setError(null);
    try {
      if (mode === "drop") {
        await drop.mutateAsync({ courseId, reason: reason.trim() || undefined });
        notify({ title: t("endCourse.dropDone"), color: "success" });
      } else {
        // 🔴 SPEC-076 / TASK-265 §3 — resume **without** a date is the normal case now. A date is sent only
        // after the server has said it needs one; asking up front is the blocking shape the owner rejected.
        const res = await resume.mutateAsync({ courseId, expiryDate: expiry ?? undefined });
        notify({ title: t("endCourse.resumeDone"), color: "success" });
        // The resume has ALREADY happened. If it left sessions outside the window, hold the dialog open to
        // show the warning rather than closing over it — closing would make it a toast nobody reads.
        if (res.expiryWarning?.warn) {
          setWarning(res.expiryWarning);
          setDone(true);
          onDone?.();
          return;
        }
      }
      onDone?.();
      onClose();
    } catch (e) {
      // ⚠️ `EXPIRY_REQUIRED` is a PROMPT, not an error. It means *"this resume needs a date"*, and its message
      // names how many sessions fall outside and the old expiry. Reveal the field and let the admin retry — an
      // error banner would read as a refusal of something they can simply answer.
      if (e instanceof ApiClientError && e.code === "EXPIRY_REQUIRED") {
        setNeedsExpiry(true);
        setError(e.message);
        return;
      }
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
      onClose={onClose}
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
        ) : (
          // 🔴 Q2 / §3 — shown ONLY after the server asked for it. Most resumes never see this field: the
          // dialog is a plain confirm, and becomes a date prompt in the one case that needs one.
          needsExpiry && (
            <DatePickerInput
              label={t("endCourse.resumeExpiry")}
              description={t("endCourse.resumeExpiryWhy")}
              value={expiry ? dayjs(expiry).toDate() : null}
              onChange={(v) => setExpiry(v ? dayjs(v).format("YYYY-MM-DD") : null)}
              valueFormat="D MMM YYYY"
              minDate={dayjs().toDate()}
              required
              popoverProps={{ withinPortal: true }}
            />
          )
        )}

        {/* One component, the same one the expiry control uses (TASK-265 §1). It never blocks anything. */}
        <ExpiryWarningAlert warning={warning} />

        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" color="gray" onClick={onClose}>
            {t(done ? "common.close" : "common.cancel")}
          </Button>
          {/* Once the resume has happened there is nothing left to submit — only the warning to read. */}
          {!done && (
            <Button
              color={isDrop ? "yellow" : "green"}
              loading={busy}
              // 🚫 Never disabled by the WARNING — only by the server's explicit "I need a date" prompt, and
              // then only until one is picked. AC-4's rule is warn-and-still-save.
              disabled={!courseId || (!isDrop && needsExpiry && !expiry)}
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
