"use client";

import { useState } from "react";
import dayjs from "dayjs";
import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { notify } from "@/lib/ui/notify";
import { formatDateWithDay, formatTimeDisplay } from "@/lib/ui/format";
import { StatusChip } from "@/components/common/BookingBadges";
import { useReopenDay } from "@/hooks/scheduler/useClosedDays";
import type { ClosedDayRow, LeaveDayClass } from "@/types/api/contract";
import { leaveClassWhat, leaveClassWho } from "./LeaveClassRow";

/** The reason as the strip and the panel say it: the three fixed reasons by name, OTHER = the note the admin typed. */
export const closedReasonText = (t: (key: string, vars?: Record<string, string | number>) => string, row: Pick<ClosedDayRow, "reason" | "note">): string =>
  row.reason === "OTHER" ? (row.note ?? "").trim() || t("closedDay.reasonOTHER") : t(`closedDay.reason${row.reason}`);

/**
 * 🔴 **TASK-960 (SPEC-105 §5) — the panel a closed day's chip opens: the date, the reason, who closed it and when, the classes STILL on it (who · what · when · status) each with
 * "Open" (hands the admin to the booking modal, as `LeaveDayPanel` does), and "Open the day again".**
 *
 * 🔑 **It shows and it re-opens the DAY; it never changes a CLASS.** Nothing is moved or cancelled from here. Re-opening restores nothing and tells no one, and the confirm says so in
 * the approved words. ⚠️ A day that has begun cannot be re-opened (the server's 400 `PAST_DATE`), so the button is not offered for a past date; a refusal is shown in the error toast.
 */
export default function ClosedDayPanel({
  opened,
  onClose,
  row,
  onOpenClass,
}: {
  opened: boolean;
  onClose: () => void;
  row: ClosedDayRow;
  onOpenClass: (c: LeaveDayClass) => void;
}) {
  const t = useT();
  const reopen = useReopenDay();
  const [confirm, setConfirm] = useState(false);
  const canReopen = row.date >= dayjs().format("YYYY-MM-DD");
  // formatted BEFORE it reaches `t()` (the shape sweep's rule, TASK-340): a DTO date never goes into a sentence raw
  const dateText = formatDateWithDay(row.date);
  const atText = dayjs(row.createdAt).format("D MMM YYYY HH:mm");

  const doReopen = async () => {
    try {
      await reopen.mutateAsync(row.date);
      notify({ title: t("closedDay.reopenDone"), color: "success" });
      setConfirm(false);
      onClose();
    } catch (e) {
      notify({ title: t("closedDay.reopenFailTitle"), description: e instanceof ApiClientError ? e.message : (e as Error).message, color: "danger" });
      setConfirm(false);
    }
  };

  return (
    <>
      <Modal opened={opened} onClose={onClose} title={t("closedDay.panelTitle", { date: dateText })} size="lg" centered data-closed-panel={row.date}>
        <Stack gap="md">
          <Text size="sm">
            <b>{t("closedDay.panelReason")}:</b> {closedReasonText(t, row)}
          </Text>
          <Text size="sm" c="dimmed" data-closed-by>
            {t("closedDay.panelBy", { by: row.createdBy, at: atText })}
          </Text>
          {row.bookings.length === 0 ? (
            <Text size="sm" c="dimmed" data-closed-no-classes>
              {t("closedDay.panelNoClasses")}
            </Text>
          ) : (
            <Stack gap={4} data-closed-classes={row.bookings.length}>
              <Text size="xs" c="dimmed">
                {t("closedDay.panelClasses", { n: row.bookings.length })}
              </Text>
              {row.bookings.map((c) => (
                <ClosedClassRow key={c.id} c={c} onOpen={onOpenClass} openLabel={t("closedDay.open")} />
              ))}
            </Stack>
          )}
          {canReopen && (
            <Group justify="flex-end">
              <Button color="red" variant="light" size="xs" onClick={() => setConfirm(true)} data-closed-reopen={row.date}>
                {t("closedDay.reopen")}
              </Button>
            </Group>
          )}
        </Stack>
      </Modal>
      {confirm && (
        <Modal opened onClose={() => setConfirm(false)} title={t("closedDay.reopen")} centered data-closed-reopen-confirm>
          <Stack gap="md">
            <Text size="sm" data-closed-reopen-text>
              {t("closedDay.reopenConfirm")}
            </Text>
            <Group justify="flex-end">
              <Button variant="subtle" onClick={() => setConfirm(false)}>
                {t("common.cancel")}
              </Button>
              <Button color="red" loading={reopen.isPending} onClick={() => void doReopen()} data-closed-reopen-yes>
                {t("closedDay.reopen")}
              </Button>
            </Group>
          </Stack>
        </Modal>
      )}
    </>
  );
}

/** One class still on the closed day: time · who · what · status · "Open" (its own words — the leave row's TH label is «เปิดดู», this one is «เปิด»). */
function ClosedClassRow({ c, onOpen, openLabel }: { c: LeaveDayClass; onOpen: (c: LeaveDayClass) => void; openLabel: string }) {
  return (
    <Group gap="xs" wrap="nowrap" data-closed-class={c.id}>
      <Text size="sm" className="tabular-nums" w={96}>
        {formatTimeDisplay(c.startTime)} – {formatTimeDisplay(c.endTime)}
      </Text>
      <Text size="sm" className="min-w-0 flex-1 truncate">
        {[leaveClassWho(c), leaveClassWhat(c)].filter(Boolean).join(" · ")}
      </Text>
      <StatusChip status={c.status} />
      <Button size="compact-xs" variant="light" onClick={() => onOpen(c)} data-closed-class-open={c.id}>
        {openLabel}
      </Button>
    </Group>
  );
}
