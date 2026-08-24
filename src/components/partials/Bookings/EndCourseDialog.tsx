"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Group, Loader, Modal, Radio, Stack, Text, Textarea } from "@mantine/core";
import { AlertTriangle } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { useEndCourse, usePreviewEndCourse } from "@/hooks/scheduler";
import {
  END_COURSE_REASONS,
  type EndCoursePreview,
  type EndCourseReason,
} from "@/types/app/scheduler";

interface Props {
  opened: boolean;
  courseId: string | null;
  onClose: () => void;
  /** Called after a successful cancel so the caller can close its own plan view. */
  onEnded?: () => void;
}

/**
 * REQ-036 — end a course early.
 *
 * 🔴 **The numbers in this dialog come from the server** (`POST /courses/:id/cancel/preview`), never from a client
 * re-count of the plan (R2). The two have disagreed before, and this action **cannot be undone** — so the sentence
 * staff read before committing has to be the server's own account of what it is about to delete.
 *
 * The reason is a **choice of three**, not free text: a typed reason can't be reported on, and "why did we lose this
 * course" is the question the whole record exists to answer. The optional note is where the nuance goes.
 */
export default function EndCourseDialog({ opened, courseId, onClose, onEnded }: Props) {
  const t = useT();
  const preview = usePreviewEndCourse();
  const end = useEndCourse();

  const [data, setData] = useState<EndCoursePreview | null>(null);
  const [reason, setReason] = useState<EndCourseReason | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened || !courseId) {
      setData(null);
      setReason(null);
      setNote("");
      setError(null);
      return;
    }
    // Ask the server what it will remove, every time the dialog opens — a preview cached from a previous open
    // could describe a plan that has since changed.
    preview
      .mutateAsync(courseId)
      .then(setData)
      .catch((e) => setError(e instanceof ApiClientError ? e.message : t("plan.genericError")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, courseId]);

  const submit = async () => {
    if (!courseId || !reason) return;
    setError(null);
    try {
      await end.mutateAsync({ courseId, reason, note: note.trim() || undefined });
      notify({ title: t("endCourse.done"), color: "success" });
      onEnded?.();
      onClose();
    } catch (e) {
      // 409 ALREADY_ENDED / 400 REASON_REQUIRED etc. — the server's own words, not a generic failure.
      setError(e instanceof ApiClientError ? e.message : t("plan.genericError"));
    }
  };

  const alreadyEnded = data?.alreadyEnded === true;

  return (
    <Modal opened={opened} onClose={onClose} centered radius="lg" title={t("endCourse.title")}>
      <Stack gap="md">
        {error && (
          <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
            {error}
          </Alert>
        )}

        {preview.isPending && !data ? (
          <Group justify="center" py="md">
            <Loader size="sm" />
          </Group>
        ) : alreadyEnded ? (
          // Jason's additive `alreadyEnded` — say so plainly instead of offering a button that 409s.
          <Alert color="orange" icon={<AlertTriangle size={16} />} variant="light">
            {t("endCourse.alreadyEnded")}
          </Alert>
        ) : data ? (
          <>
            <Text fz="sm" className="tabular-nums">
              {t("endCourse.confirmLine", {
                program: data.program ?? "—",
                student: data.student?.nickname || data.student?.name || "—",
                n: data.removedSessions,
              })}
            </Text>

            <Radio.Group
              label={t("endCourse.reasonLabel")}
              value={reason ?? ""}
              onChange={(v) => setReason(v as EndCourseReason)}
              required
            >
              <Stack gap="xs" mt="xs">
                {END_COURSE_REASONS.map((r) => (
                  <Radio key={r} value={r} label={t(`endCourse.${r}`)} />
                ))}
              </Stack>
            </Radio.Group>

            <Textarea
              label={t("endCourse.noteLabel")}
              value={note}
              onChange={(e) => setNote(e.currentTarget.value)}
              autosize
              minRows={2}
              maxRows={4}
            />
          </>
        ) : null}

        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" color="gray" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          {!alreadyEnded && (
            // Disabled until a reason is picked — and the reason for the disabling is stated, never left to guess.
            <Button
              color="red"
              loading={end.isPending}
              disabled={!reason || !data}
              onClick={submit}
              title={!reason ? t("endCourse.reasonRequired") : undefined}
            >
              {t("endCourse.confirm")}
            </Button>
          )}
        </Group>

        {!alreadyEnded && !reason && data && (
          <Text fz="xs" c="dimmed">
            {t("endCourse.reasonRequired")}
          </Text>
        )}
      </Stack>
    </Modal>
  );
}
