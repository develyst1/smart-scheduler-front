"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Group, List, Loader, Modal, Stack, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { AlertTriangle, Info } from "lucide-react";
import dayjs from "dayjs";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { usePreviewCourseExpiry, useUpdateCourseExpiry } from "@/hooks/scheduler";
import ExpiryWarningAlert from "@/components/common/ExpiryWarningAlert";
import { formatDateDisplay } from "@/lib/ui/format";
import type { ExpiryWarning } from "@/types/api/contract";
import type { CoursePackageView, ExpiryPreview } from "@/types/app/scheduler";

/** How many would-be-cut sessions to list before summarising the rest — the same cap `ExpiryWarningAlert` uses. */
const MAX_LISTED = 5;

/**
 * SPEC-076 / REQ-082 AC-1 + AC-4 (TASK-265) — move a course's expiry.
 *
 * 🔴 **AC-4 is the whole shape of this dialog: warn, and still save.** The save is not gated on anything a
 * warning says. 🚫 There is no confirm the admin cannot pass. The owner's rule is *warn, do not act*, and a
 * dialog you cannot get past is acting.
 *
 * 🔴 **TASK-311 / `REQ-085 §11.3` — it now asks BEFORE saving.** This dialog used to be commit-then-show: the
 * warning only existed after `PATCH` had written the date, and its own header said so as if that were the
 * design. It was the constraint. `POST /courses/:id/expiry/preview` (TASK-298) answers the same question from
 * the same `expiryDecision` the PATCH writes with, and writes nothing — so an EARLIER date now says what it
 * cuts off, and what it does to the family's leave room, while the admin can still change their mind.
 * 🚫 **Still not a gate.** The preview renders and the Save button does not read it. *They may still do it;
 * they may not do it blind.*
 *
 * 🚫 Nothing here computes a warning — the pre-save block is written from the preview's numbers, the post-save
 * one is rendered by `ExpiryWarningAlert` from the PATCH's response, and both come from one server function.
 */
export default function EditExpiryDialog({
  course,
  onClose,
}: {
  course: CoursePackageView | null;
  onClose: () => void;
}) {
  const t = useT();
  const update = useUpdateCourseExpiry();
  const preview = usePreviewCourseExpiry();
  const [expiry, setExpiry] = useState<string | null>(null);
  const [warning, setWarning] = useState<ExpiryWarning | null>(null);
  const [previewed, setPreviewed] = useState<ExpiryPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  /** The date the admin is looking at RIGHT NOW — what a preview answer has to match to be shown. */
  const wanted = useRef<string | null>(null);
  wanted.current = expiry;

  useEffect(() => {
    // Seeded with the course's current expiry, so the picker opens on what it is about to change rather than
    // on today — the admin is moving a date, not choosing one from nothing.
    setExpiry(course?.expiryDate ?? null);
    setWarning(null);
    setPreviewed(null);
    setError(null);
    setSaved(false);
  }, [course?.id, course?.expiryDate]);

  /**
   * 🔴 TASK-311 — ask the server what this date WOULD do, every time the admin lands on a different one.
   *
   * 🔑 **The answer is shown only if it is about the date on screen.** The response echoes the expiry it was
   * asked about (`contract.ts`: *"echoed, so a caller cannot report one and have decided another"*) — that is
   * exactly the guard against a slow answer for an earlier pick landing on a later one, and it uses the
   * server's statement of what it answered rather than this component's bookkeeping.
   */
  useEffect(() => {
    if (!course || !expiry || expiry === course.expiryDate || saved) {
      setPreviewed(null);
      return;
    }
    preview
      .mutateAsync({ courseId: course.id, expiryDate: expiry })
      .then((p) => {
        if (p.expiryWarning.expiryDate === wanted.current) setPreviewed(p);
      })
      .catch((e) => setError(e instanceof ApiClientError ? e.message : t("plan.genericError")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course?.id, expiry, saved]);

  const submit = async () => {
    if (!course || !expiry) return;
    setError(null);
    try {
      const res = await update.mutateAsync({ courseId: course.id, expiryDate: expiry });
      notify({ title: t("expiry.savedTitle"), description: course.studentName, color: "success" });
      if (res.expiryWarning?.warn) {
        // Saved. The dialog stays open **only** to show what fell outside — a warning this specific
        // disappearing into a toast is a warning nobody reads.
        setWarning(res.expiryWarning);
        setSaved(true);
        return;
      }
      onClose();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t("plan.genericError"));
    }
  };

  const changed = !!course && !!expiry && expiry !== course.expiryDate;

  return (
    <Modal
      opened={course !== null}
      onClose={onClose}
      centered
      radius="lg"
      title={t("expiry.title", { student: course?.studentName ?? "—" })}
    >
      <Stack gap="md">
        {error && (
          <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
            {error}
          </Alert>
        )}

        <Text fz="sm" c="dimmed">
          {t("expiry.current", { date: formatDateDisplay(course?.expiryDate ?? "") })}
        </Text>

        {!saved && (
          <DatePickerInput
            label={t("expiry.newDate")}
            value={expiry ? dayjs(expiry).toDate() : null}
            onChange={(v) => setExpiry(v ? dayjs(v).format("YYYY-MM-DD") : null)}
            valueFormat="D MMM YYYY"
            popoverProps={{ withinPortal: true }}
            required
          />
        )}

        {/* 🔴 TASK-311 / §11.3 — BEFORE saving. Rendered only for a date that differs from the current one, and
            only once the server has answered about THAT date. 🚫 Owns no button and disables nothing. */}
        {!saved && changed && (
          previewed ? (
            <ExpiryPreviewBlock preview={previewed} />
          ) : preview.isPending ? (
            <Group gap="xs">
              <Loader size="xs" />
              <Text fz="xs" c="dimmed">
                {t("expiry.previewChecking")}
              </Text>
            </Group>
          ) : null
        )}

        {/* The post-save warning — still `ExpiryWarningAlert`'s only caller (TASK-287). */}
        <ExpiryWarningAlert warning={warning} />

        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" color="gray" onClick={onClose}>
            {t(saved ? "common.close" : "common.cancel")}
          </Button>
          {!saved && (
            <Button
              loading={update.isPending}
              // 🚫 Disabled only when there is no date to send. **Never by a warning, before or after** — AC-4
              // is warn-and-still-save, and TASK-311's preview is information, not permission.
              disabled={!course || !expiry}
              onClick={submit}
            >
              {t("expiry.save")}
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}

/**
 * What the chosen date WOULD do — every number the server's, the sentence the screen's. 🚫 Deliberately not
 * `ExpiryWarningAlert`: that component says *"the date has been saved"*, which here would be false, and §3 of
 * the task keeps it rendering exactly what it renders.
 */
function ExpiryPreviewBlock({ preview }: { preview: ExpiryPreview }) {
  const t = useT();
  const { expiryWarning: w, leaveRoom: room } = preview;
  const listed = w.outside.slice(0, MAX_LISTED);
  const rest = w.outsideCount - listed.length;
  const date = formatDateDisplay(w.expiryDate);

  return (
    <Alert
      color={w.warn || !room.roomForAll ? "orange" : "blue"}
      variant="light"
      icon={w.warn ? <AlertTriangle size={16} /> : <Info size={16} />}
      title={t("expiry.previewTitle")}
    >
      <Stack gap={4}>
        <Text fz="sm">{w.warn ? t("expiry.previewCuts", { n: w.outsideCount, date }) : t("expiry.previewClear", { date })}</Text>
        {w.warn && (
          <List size="sm" withPadding>
            {listed.map((s, i) => (
              <List.Item key={s.id ?? `${s.date}-${i}`}>
                {formatDateDisplay(s.date)}
                {s.startTime ? ` · ${s.startTime}` : ""}
              </List.Item>
            ))}
          </List>
        )}
        {rest > 0 && (
          <Text fz="xs" c="dimmed">
            {t("expiry.warnMore", { n: rest })}
          </Text>
        )}
        {/* TASK-298 §5 — the SPENT case: a family with no leave left loses nothing, so no leave line at all. A
            leave warning stacked on the session warning would be a second alarm about nothing. */}
        {room.remainingLeave > 0 && (
          <Text fz="sm">
            {room.roomForAll
              ? t("expiry.previewLeaveOk", { remaining: room.remainingLeave })
              : t("expiry.previewLeaveTight", {
                  room: room.roomFor,
                  remaining: room.remainingLeave,
                  needed: formatDateDisplay(room.neededFor ?? ""),
                })}
          </Text>
        )}
        {/* Says in words that this is information, not a refusal — a warning that reads like a refusal is one. */}
        <Text fz="xs" c="dimmed">
          {t("expiry.previewNotSaved")}
        </Text>
      </Stack>
    </Alert>
  );
}
