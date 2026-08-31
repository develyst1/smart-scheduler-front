"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Group, Modal, Radio, Stack, Text, Textarea } from "@mantine/core";
import { AlertTriangle, Wallet } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { formatDateDisplay } from "@/lib/ui/format";
import { formatPriceMinor } from "@/types/app/pricing";
import { useCancelBooking, usePostedSale } from "@/hooks/scheduler";
import { END_COURSE_REASONS, type Booking, type EndCourseReason } from "@/types/app/scheduler";

interface Props {
  opened: boolean;
  booking: Booking | null;
  onClose: () => void;
  /** Called after a successful cancel so the caller can close the booking view behind it. */
  onCancelled?: () => void;
}

/**
 * REQ-074 / TASK-212 — cancel a **1HR or voucher** booking with a reason.
 *
 * 🔴 **The same three reasons as REQ-036, deliberately.** `END_COURSE_REASONS` and the `endCourse.<reason>` labels
 * are imported rather than restated: a second list would let the two drift, and "why did we lose this" has to be
 * answerable across both cancel paths with one vocabulary. The server enforces the same closed set — a free-text
 * reason can't be reported on, which is the whole point of the enum.
 *
 * The optional note is where the nuance goes. Confirm stays disabled until a reason is picked, and the screen says
 * why rather than leaving a dead button.
 */
export default function CancelBookingDialog({ opened, booking, onClose, onCancelled }: Props) {
  const t = useT();
  const cancel = useCancelBooking();
  // SPEC-069 / TASK-222 — `enabled` is the dialog's own `opened`, so a dialog nobody opens never queries.
  const postedSale = usePostedSale(booking?.id, opened);
  const [reasonCode, setReasonCode] = useState<EndCourseReason | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) {
      setReasonCode(null);
      setNote("");
      setError(null);
    }
  }, [opened]);

  const submit = async () => {
    if (!booking || !reasonCode) return;
    setError(null);
    try {
      await cancel.mutateAsync({ id: booking.id, reason: note.trim() || undefined, reasonCode });
      notify({ title: t("cancelBooking.done"), color: "success" });
      onCancelled?.();
      onClose();
    } catch (e) {
      // The server refuses with its own words (e.g. a missing reasonCode on a type that requires one) — show them.
      setError(e instanceof ApiClientError ? e.message : t("plan.genericError"));
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} centered radius="lg" title={t("cancelBooking.title")}>
      <Stack gap="md">
        {error && (
          <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
            {error}
          </Alert>
        )}

        <Text fz="sm">
          {t("cancelBooking.line", {
            // TASK-227 — what the booking is CALLED. An อื่นๆ cancel confirmation naming a student it does not
            // have (or an em dash) is how staff cancel the wrong thing. `displayName` is never blank by contract,
            // so the `"—"` remains only for the no-booking render.
            student: booking?.displayName || "—",
            date: booking?.date ?? "—",
            time: booking?.startTime ?? "—",
          })}
        </Text>

        {/* 🔴 SPEC-069 / TASK-222 — what cancelling LEAVES BEHIND, above the reason picker because it changes
            what staff do next, not how they label it. Three states, all visible; the third is the requirement.

            It never disables Confirm. This is a warning, not a gate — the owner has twice refused to let the
            system move or block money as a side effect of a staff action (REQ-036, the ADMIN_ERROR cancels).
            Staff cancel; the band makes sure they know what it leaves in the books. */}
        {postedSale.isFetching && (
          <Text fz="xs" c="dimmed">
            {t("cancelBooking.postedChecking")}
          </Text>
        )}
        {postedSale.isError && (
          <Alert
            color="orange"
            variant="light"
            icon={<AlertTriangle size={16} />}
            title={t("cancelBooking.postedUnknownTitle")}
          >
            {t("cancelBooking.postedUnknown")}
          </Alert>
        )}
        {!postedSale.isError && postedSale.data && (
          <Alert
            color="orange"
            variant="light"
            icon={<Wallet size={16} />}
            title={t("cancelBooking.postedTitle")}
          >
            {/* 🔴 `amountMinor` is rendered, never re-derived. `discountMinor` is already NEGATIVE, so
                `listMinor - discountMinor` reads HIGHER than the truth — on a warning whose entire job is the
                number (SA ruling, TASK-221 → TASK-222). Satang → baht goes through `formatPriceMinor`, the
                repo's single converter, because this codebase has already shipped one 100× unit bug (TASK-169). */}
            {t("cancelBooking.posted", {
              amount: formatPriceMinor(postedSale.data.amountMinor),
              date: formatDateDisplay(postedSale.data.postedAt.slice(0, 10)),
            })}
          </Alert>
        )}

        <Radio.Group
          label={t("endCourse.reasonLabel")}
          value={reasonCode ?? ""}
          onChange={(v) => setReasonCode(v as EndCourseReason)}
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

        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" color="gray" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button color="red" loading={cancel.isPending} disabled={!reasonCode} onClick={submit}>
            {t("cancelBooking.confirm")}
          </Button>
        </Group>

        {!reasonCode && (
          <Text fz="xs" c="dimmed">
            {t("endCourse.reasonRequired")}
          </Text>
        )}
      </Stack>
    </Modal>
  );
}
