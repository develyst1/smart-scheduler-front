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

  useEffect(() => {
    if (!opened) {
      setReason("");
      setExpiry(null);
      setError(null);
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
        if (!expiry) return;
        await resume.mutateAsync({ courseId, expiryDate: expiry });
        notify({ title: t("endCourse.resumeDone"), color: "success" });
      }
      onDone?.();
      onClose();
    } catch (e) {
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
          <DatePickerInput
            label={t("endCourse.resumeExpiry")}
            value={expiry ? dayjs(expiry).toDate() : null}
            onChange={(v) => setExpiry(v ? dayjs(v).format("YYYY-MM-DD") : null)}
            valueFormat="D MMM YYYY"
            minDate={dayjs().toDate()}
            required
            popoverProps={{ withinPortal: true }}
          />
        )}

        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" color="gray" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            color={isDrop ? "yellow" : "green"}
            loading={busy}
            // Resume can't proceed without the new window the server requires — and the field says why.
            disabled={!courseId || (!isDrop && !expiry)}
            onClick={submit}
          >
            {t(isDrop ? "endCourse.dropConfirm" : "endCourse.resumeConfirm")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
