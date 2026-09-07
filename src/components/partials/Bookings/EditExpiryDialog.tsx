"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Group, Modal, Stack, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { AlertTriangle } from "lucide-react";
import dayjs from "dayjs";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { useUpdateCourseExpiry } from "@/hooks/scheduler";
import ExpiryWarningAlert from "@/components/common/ExpiryWarningAlert";
import { formatDateDisplay } from "@/lib/ui/format";
import type { ExpiryWarning } from "@/types/api/contract";
import type { CoursePackageView } from "@/types/app/scheduler";

/**
 * SPEC-076 / REQ-082 AC-1 + AC-4 (TASK-265) — move a course's expiry.
 *
 * 🔴 **AC-4 is the whole shape of this dialog: warn, and still save.** The save is not gated on anything the
 * warning says — it *cannot* be, because **the warning only exists after the save**: `PATCH /courses/:id/expiry`
 * writes the new date and returns what that left outside it. So this asks, saves, and then shows what happened.
 *
 * 🚫 There is no confirm the admin cannot pass, and no pre-check. The owner's rule is *warn, do not act*, and a
 * dialog you cannot get past is acting. 🚫 Nothing here computes the warning — it is rendered from the response
 * by `ExpiryWarningAlert` — which since TASK-287 serves this path ALONE (the resume derives its expiry, so it
 * has nothing left to warn about).
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
  const [expiry, setExpiry] = useState<string | null>(null);
  const [warning, setWarning] = useState<ExpiryWarning | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Seeded with the course's current expiry, so the picker opens on what it is about to change rather than
    // on today — the admin is moving a date, not choosing one from nothing.
    setExpiry(course?.expiryDate ?? null);
    setWarning(null);
    setError(null);
    setSaved(false);
  }, [course?.id, course?.expiryDate]);

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

        {/* The warning — this is now its ONLY caller (TASK-287). */}
        <ExpiryWarningAlert warning={warning} />

        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" color="gray" onClick={onClose}>
            {t(saved ? "common.close" : "common.cancel")}
          </Button>
          {!saved && (
            <Button
              loading={update.isPending}
              // 🚫 Disabled only when there is no date to send. **Never by the warning** — AC-4 is
              // warn-and-still-save, and the warning does not exist until the save has already happened.
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
