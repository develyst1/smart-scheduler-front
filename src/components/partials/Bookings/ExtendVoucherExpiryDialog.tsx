"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Group, List, Loader, Modal, Stack, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { AlertTriangle, Info, CalendarClock } from "lucide-react";
import dayjs from "dayjs";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { usePreviewVoucherExpiry, useUpdateVoucherExpiry } from "@/hooks/scheduler";
import ExpiryWarningAlert from "@/components/common/ExpiryWarningAlert";
import { formatDateDisplay, formatTimeDisplay } from "@/lib/ui/format";
import { isSameDate, movesEarlier, refusalAnswerKey } from "@/lib/scheduler/voucher-expiry";
import type { ExpiryWarning, VoucherExpiryPreview, VoucherSummary } from "@/types/api/contract";

/** The same cap the course's blocks use — a longer list stops being read. */
const MAX_LISTED = 5;

/**
 * 🔴 TASK-568 (BE) → TASK-572 (REQ-110 item 3) — **extend a voucher's expiry.**
 *
 * 🔑 **The course expiry edit's shape, on purpose: warn, and still save.** The preview is information; 🚫 no warning it
 * reports disables anything. ⚠️ **What is different here is that this entitlement can REFUSE** — and a refusal is not a
 * warning:
 *
 * - **The two refusals arrive at the PREVIEW**, because the server runs ONE `voucherExpiryDecision` for both calls. So the
 *   admin reads *why not* before pressing anything, and a Save pressed anyway would only meet the same 409.
 * - 🔑 **They are ANSWERS, not failures.** The server's sentence is shown **verbatim** — each one names its own reason,
 *   and a generic "could not save" would throw that away — with **what to do instead** added underneath.
 * - 🚫 **An unrecognised code gets no suggestion** (`refusalAnswerKey` answers `null`): a suggestion invented for a
 *   refusal we do not understand is worse than none, because the admin would act on it.
 *
 * 🔕 **Nobody is told by this change, and the dialog SAYS so.** *The audience is deliberately none; a screen implying the
 * family has been notified would be a lie — and saying nothing at all lets an admin assume it.*
 *
 * 🚫 Nothing here computes a warning or a refusal. Every number is the server's one `expiryImpact`, and the cut list is
 * the same DTO the course's blocks render.
 */
export default function ExtendVoucherExpiryDialog({
  voucher,
  onClose,
}: {
  voucher: VoucherSummary | null;
  onClose: () => void;
}) {
  const t = useT();
  const preview = usePreviewVoucherExpiry();
  const update = useUpdateVoucherExpiry();
  const [expiry, setExpiry] = useState<string | null>(null);
  const [previewed, setPreviewed] = useState<VoucherExpiryPreview | null>(null);
  /** The server's 409 — its code (for what-to-do) and its sentence (shown as it came). */
  const [refusal, setRefusal] = useState<{ code: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<ExpiryWarning | null>(null);
  const [saved, setSaved] = useState(false);
  /** The date on screen RIGHT NOW — what an answer has to be about to be shown (the course dialog's guard). */
  const wanted = useRef<string | null>(null);
  wanted.current = expiry;

  useEffect(() => {
    // Seeded with the voucher's own expiry: the admin is moving a date, not choosing one from nothing.
    setExpiry(voucher?.expiryDate ?? null);
    setPreviewed(null);
    setRefusal(null);
    setError(null);
    setWarning(null);
    setSaved(false);
  }, [voucher?.id, voucher?.expiryDate]);

  /**
   * Ask what this date WOULD do, for every date that differs from the current one.
   *
   * 🔑 **The answer is shown only if it is about the date on screen** — the response echoes the expiry it was asked
   * about, so a slow answer for an earlier pick cannot land on a later one. That guard is the server's statement of what
   * it answered, not this component's bookkeeping.
   */
  useEffect(() => {
    if (!voucher || !expiry || isSameDate(voucher.expiryDate, expiry) || saved) {
      setPreviewed(null);
      return;
    }
    setRefusal(null);
    preview
      .mutateAsync({ voucherId: voucher.id, expiryDate: expiry })
      .then((p) => {
        if (p.expiryWarning.expiryDate === wanted.current) setPreviewed(p);
      })
      .catch((e) => {
        if (e instanceof ApiClientError && e.status === 409) setRefusal({ code: e.code, message: e.message });
        else setError(e instanceof ApiClientError ? e.message : t("plan.genericError"));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voucher?.id, expiry, saved]);

  const submit = async () => {
    // 🔑 Two guards, as ever: this return AND the button's `disabled`. 🔴 `refusal` blocks here because it is the
    // SERVER's refusal of this very date — 🚫 never because a warning said something.
    if (!voucher || !expiry || refusal || isSameDate(voucher.expiryDate, expiry)) return;
    setError(null);
    try {
      const res = await update.mutateAsync({ voucherId: voucher.id, expiryDate: expiry });
      notify({ title: t("voucherExpiry.savedTitle"), description: voucher.student.name, color: "success" });
      if (res.expiryWarning?.warn) {
        // Saved. The dialog stays open ONLY to show what fell outside — this warning in a toast is a warning nobody reads.
        setWarning(res.expiryWarning);
        setSaved(true);
        return;
      }
      onClose();
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 409) setRefusal({ code: e.code, message: e.message });
      else setError(e instanceof ApiClientError ? e.message : t("plan.genericError"));
    }
  };

  const changed = !!voucher && !!expiry && !isSameDate(voucher.expiryDate, expiry);
  const answerKey = refusalAnswerKey(refusal?.code);

  return (
    <Modal
      opened={voucher !== null}
      onClose={onClose}
      centered
      radius="lg"
      title={t("voucherExpiry.title", { student: voucher?.student.name ?? "" })}
      data-voucher-expiry={saved ? "saved" : refusal ? "refused" : "ask"}
    >
      <Stack gap="md">
        {error && (
          <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
            {error}
          </Alert>
        )}

        <Text fz="sm" c="dimmed">
          {t("expiry.current", { date: formatDateDisplay(voucher?.expiryDate ?? "") })}
        </Text>

        {!saved && (
          <DatePickerInput
            label={t("expiry.newDate")}
            value={expiry ? dayjs(expiry).toDate() : null}
            onChange={(v) => {
              setExpiry(v ? dayjs(v).format("YYYY-MM-DD") : null);
              // A new date is a new question: last date's answer — and last date's refusal — are not about this one.
              setPreviewed(null);
              setRefusal(null);
            }}
            valueFormat="D MMM YYYY"
            popoverProps={{ withinPortal: true }}
            required
          />
        )}

        {/* 🔴 The refusal: the server's sentence VERBATIM, and what to do instead under it. Not red, not a failure
            banner — this is the answer to a question the admin asked, and it arrived before anything was saved. */}
        {refusal && !saved && (
          <Alert
            color="yellow"
            variant="light"
            icon={<Info size={16} />}
            title={t("voucherExpiry.refusedTitle")}
            data-voucher-refusal={refusal.code}
          >
            <Stack gap={4}>
              <Text fz="sm">{refusal.message}</Text>
              {answerKey && (
                <Text fz="sm" data-voucher-answer>
                  {t(answerKey)}
                </Text>
              )}
            </Stack>
          </Alert>
        )}

        {/* ⚠️ The word on the button would be a lie for an earlier date. 🚫 Not a gate — the admin may shorten it. */}
        {!saved && !refusal && movesEarlier(voucher?.expiryDate, expiry) && (
          <Text fz="xs" c="orange" data-voucher-earlier>
            {t("voucherExpiry.earlier")}
          </Text>
        )}

        {/* BEFORE saving: only for a date that differs, only once the server has answered about THAT date, and only
            when it did not refuse. 🚫 Owns no button and disables nothing. */}
        {!saved && !refusal && changed && (
          previewed ? (
            <VoucherExpiryPreviewBlock warning={previewed.expiryWarning} />
          ) : preview.isPending ? (
            <Group gap="xs">
              <Loader size="xs" />
              <Text fz="xs" c="dimmed">
                {t("expiry.previewChecking")}
              </Text>
            </Group>
          ) : null
        )}

        {/* The post-save warning — `ExpiryWarningAlert`'s second caller, for the same reason it stayed shared. */}
        <ExpiryWarningAlert warning={warning} />

        {/* 🔕 Who hears about this: nobody. Said plainly, in both states, because silence lets an admin assume a notice. */}
        <Text fz="xs" c="dimmed" data-voucher-audience>
          {t("voucherExpiry.audience")}
        </Text>

        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" color="gray" onClick={onClose}>
            {t(saved ? "common.close" : "common.cancel")}
          </Button>
          {!saved && (
            <Button
              loading={update.isPending}
              // 🚫 NOT disabled by a warning — AC-4 is warn-and-still-save. Disabled only when there is nothing to send
              // (no date, or the date it already has) or when 🔴 the SERVER has refused this date.
              disabled={!voucher || !expiry || !changed || Boolean(refusal)}
              onClick={submit}
              leftSection={<CalendarClock size={14} />}
              data-voucher-save
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
 * What the chosen date WOULD do, for a voucher. 🚫 Deliberately not `ExpiryWarningAlert`: that component says *the date
 * has been saved*, which here would be false — the same reason the course's pre-save block is its own.
 * 🚫 **No leave line, and its absence is structural:** a voucher has no plan and no leave quota, so the server's answer
 * carries no `leaveRoom` to render. *Not an omission — there is nothing there.*
 */
function VoucherExpiryPreviewBlock({ warning }: { warning: ExpiryWarning }) {
  const t = useT();
  const listed = warning.outside.slice(0, MAX_LISTED);
  const rest = warning.outsideCount - listed.length;
  const date = formatDateDisplay(warning.expiryDate);

  return (
    <Alert
      color={warning.warn ? "orange" : "blue"}
      variant="light"
      icon={warning.warn ? <AlertTriangle size={16} /> : <Info size={16} />}
      title={t("expiry.previewTitle")}
      data-voucher-preview={warning.warn ? "cuts" : "clear"}
    >
      <Stack gap={4}>
        {/* 🔑 The course's own sentences, reused rather than rewritten: one question, one wording, two entitlements. */}
        <Text fz="sm">
          {warning.warn ? t("expiry.previewCuts", { n: warning.outsideCount, date }) : t("expiry.previewClear", { date })}
        </Text>
        {warning.warn && (
          <List size="sm" withPadding>
            {listed.map((s, i) => (
              <List.Item key={s.id ?? `${s.date}-${i}`}>
                {formatDateDisplay(s.date)}
                {s.startTime ? ` · ${formatTimeDisplay(s.startTime)}` : ""}
              </List.Item>
            ))}
          </List>
        )}
        {rest > 0 && (
          <Text fz="xs" c="dimmed">
            {t("expiry.warnMore", { n: rest })}
          </Text>
        )}
        <Text fz="xs" c="dimmed">
          {t("expiry.previewNotSaved")}
        </Text>
      </Stack>
    </Alert>
  );
}
