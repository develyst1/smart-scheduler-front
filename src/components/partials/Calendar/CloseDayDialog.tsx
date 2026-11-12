"use client";

import { useState } from "react";
import dayjs from "dayjs";
import { Alert, Button, Group, Modal, Select, Stack, Textarea } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { AlertTriangle } from "lucide-react";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { notify } from "@/lib/ui/notify";
import { useCloseDays } from "@/hooks/scheduler/useClosedDays";
import type { ClosedDayReason } from "@/types/api/contract";

const REASONS: ClosedDayReason[] = ["HOLIDAY", "VENUE_CLOSED", "WEATHER", "OTHER"];

/**
 * 🔴 **TASK-960 (SPEC-105 §5, REQ-5013 option B) — close a whole day (or a range): one `POST /closed-days`.** Fields one per row: From · To (optional) · Reason · Note (required for
 * «อื่นๆ»). 🔑 **Past dates are DISABLED in the pickers** (today is allowed), and the button waits while the note is missing — nothing is sent for a refusal the screen can see; the server's
 * own refusals (`PAST_DATE` · `NOTE_REQUIRED` · `RANGE_TOO_LONG`) still show in the red notice, in its words. After Save a toast says how many days were closed and how many classes are
 * still on them (they are in Attention), plus how many days were already closed. 🚫 Closing sends no message to anyone and moves no class.
 */
export default function CloseDayDialog({ opened, initialDate, onClose }: { opened: boolean; initialDate: string; onClose: () => void }) {
  const t = useT();
  const close = useCloseDays();
  const today = dayjs().format("YYYY-MM-DD");
  const [from, setFrom] = useState(initialDate && initialDate >= today ? initialDate : today);
  const [to, setTo] = useState("");
  const [reason, setReason] = useState<ClosedDayReason>("HOLIDAY");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const noteMissing = reason === "OTHER" && note.trim() === "";
  const noFrom = from === "";

  const submit = async () => {
    setError(null);
    if (noteMissing || noFrom) return;
    try {
      const res = await close.mutateAsync({
        from,
        ...(to && to > from ? { to } : {}),
        reason,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      const done = t("closedDay.toastDone", { n: res.created.length, m: res.classesOnThem });
      notify({ title: res.alreadyClosed.length > 0 ? done + t("closedDay.toastAlready", { k: res.alreadyClosed.length }) : done, color: "success" });
      onClose();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : (e as Error).message);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t("closedDay.dialogTitle")} centered size="md" data-close-day-dialog>
      <Stack gap="sm">
        {error && (
          <Alert color="red" variant="light" icon={<AlertTriangle size={15} />} data-close-day-error>
            {error}
          </Alert>
        )}
        <DatePickerInput
          label={t("closedDay.from")}
          value={from || null}
          minDate={today}
          onChange={(v) => v && setFrom(dayjs(v).format("YYYY-MM-DD"))}
          valueFormat="D MMM YYYY"
          popoverProps={{ withinPortal: true }}
          data-close-day-from
        />
        <DatePickerInput
          label={t("closedDay.to")}
          value={to || null}
          minDate={from >= today ? from : today}
          onChange={(v) => setTo(v ? dayjs(v).format("YYYY-MM-DD") : "")}
          valueFormat="D MMM YYYY"
          clearable
          popoverProps={{ withinPortal: true }}
          data-close-day-to
        />
        <Select
          label={t("closedDay.reason")}
          data={REASONS.map((r) => ({ value: r, label: t(`closedDay.reason${r}`) }))}
          value={reason}
          onChange={(v) => v && setReason(v as ClosedDayReason)}
          allowDeselect={false}
          comboboxProps={{ withinPortal: true }}
          data-close-day-reason
        />
        <Textarea
          label={t("closedDay.note")}
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          autosize
          minRows={2}
          required={reason === "OTHER"}
          error={noteMissing ? t("closedDay.noteRequired") : undefined}
          data-close-day-note
        />
        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button color="red" loading={close.isPending} disabled={noteMissing || noFrom} onClick={() => void submit()} data-close-day-submit>
            {t("closedDay.save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
