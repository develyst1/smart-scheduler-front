"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Group, Loader, Modal, Radio, Stack, Text, Textarea } from "@mantine/core";
import { AlertTriangle } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { useEndCourse, useEndVoucher, usePreviewEndCourse, usePreviewEndVoucher } from "@/hooks/scheduler";
import {
  END_COURSE_REASONS,
  type EndCoursePreview,
  type EndCourseReason,
  type EntitlementKind,
} from "@/types/app/scheduler";
import { useCan } from "@/hooks/scheduler/useMe";
import { formatDateDisplay, formatTimeDisplay } from "@/lib/ui/format";

interface Props {
  opened: boolean;
  /** REQ-103 (TASK-440) — ONE dialog for both entitlements: the course, or the whole voucher. `null` = nothing. */
  target: { kind: EntitlementKind; id: string } | null;
  onClose: () => void;
  /** Called after a successful cancel so the caller can close its own plan view. */
  onEnded?: () => void;
}

/** The two entitlements share the dialog's shape; only the words differ (and the voucher shows its frozen balance). */
const COPY = {
  course: { title: "endCourse.title", line: "endCourse.confirmLine", already: "endCourse.alreadyEnded", confirm: "endCourse.confirm", done: "endCourse.done" },
  voucher: { title: "voucher.endTitle", line: "voucher.endLine", already: "voucher.endAlready", confirm: "voucher.endConfirm", done: "voucher.endDone" },
} as const;

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
export default function EndCourseDialog({ opened, target, onClose, onEnded }: Props) {
  const t = useT();
  const can = useCan(); // REQ-092 Stage 3 — the submit is the act; hidden without its key
  const previewCourse = usePreviewEndCourse();
  const endCourseMut = useEndCourse();
  const previewVoucher = usePreviewEndVoucher();
  const endVoucherMut = useEndVoucher();
  // REQ-103 — the voucher pair has the course pair's shapes and key; the dialog picks the pair by the target's kind.
  const isVoucher = target?.kind === "voucher";
  const preview = isVoucher ? previewVoucher : previewCourse;
  const end = isVoucher ? endVoucherMut : endCourseMut;
  const copy = COPY[isVoucher ? "voucher" : "course"];
  const targetId = target?.id ?? null;

  const [data, setData] = useState<EndCoursePreview | null>(null);
  const [reason, setReason] = useState<EndCourseReason | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened || !targetId) {
      setData(null);
      setReason(null);
      setNote("");
      setError(null);
      return;
    }
    // Ask the server what it will remove, every time the dialog opens — a preview cached from a previous open
    // could describe a plan that has since changed.
    preview
      .mutateAsync(targetId)
      .then(setData)
      .catch((e) => setError(e instanceof ApiClientError ? e.message : t("plan.genericError")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, targetId]);

  const submit = async () => {
    if (!targetId || !reason) return;
    setError(null);
    try {
      if (isVoucher) await endVoucherMut.mutateAsync({ voucherId: targetId, reason, note: note.trim() || undefined });
      else await endCourseMut.mutateAsync({ courseId: targetId, reason, note: note.trim() || undefined });
      notify({ title: t(copy.done), color: "success" });
      onEnded?.();
      onClose();
    } catch (e) {
      // 409 ALREADY_ENDED / 400 REASON_REQUIRED etc. — the server's own words, not a generic failure.
      setError(e instanceof ApiClientError ? e.message : t("plan.genericError"));
    }
  };

  const alreadyEnded = data?.alreadyEnded === true;

  return (
    <Modal opened={opened} onClose={onClose} centered radius="lg" title={t(copy.title)}>
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
            {t(copy.already)}
          </Alert>
        ) : data ? (
          <>
            <Text fz="sm" className="tabular-nums">
              {t(copy.line, {
                program: data.program ?? "—",
                student: data.student?.nickname || data.student?.name || "—",
                n: data.removedSessions,
              })}
            </Text>
            {/* REQ-103 — the voucher's doomed draws listed (date · time · coach) and the balance the end FREEZES:
                the server's `remaining`, never a client subtraction. */}
            {isVoucher && data.sessions.length > 0 && (
              <Stack gap={2} className="tabular-nums" data-doomed>
                {data.sessions.map((s, i) => (
                  <Text key={i} fz="xs" c="dimmed">
                    {formatDateDisplay(s.date)} · {formatTimeDisplay(s.time)} · {s.teacher ?? "—"}
                  </Text>
                ))}
              </Stack>
            )}
            {isVoucher && typeof data.remaining === "number" && (
              <Text fz="sm" fw={600} className="tabular-nums" data-kept>
                {t("voucher.endKept", { n: data.remaining })}
              </Text>
            )}

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
          {!alreadyEnded && can("action:bookings.course-cancel") && (
            // Disabled until a reason is picked — and the reason for the disabling is stated, never left to guess.
            <Button
              color="red"
              loading={end.isPending}
              disabled={!reason || !data}
              onClick={submit}
              title={!reason ? t("endCourse.reasonRequired") : undefined}
            >
              {t(copy.confirm)}
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
