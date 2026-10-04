"use client";

import { useState } from "react";
import { Alert, Button, Group, Modal, NumberInput, Select, Stack, Switch, Text } from "@mantine/core";
import { AlertTriangle, Repeat } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { useSwapGroupTeacher } from "@/hooks/scheduler";
import { useCan } from "@/hooks/scheduler/useMe";
import { TeacherOption, teacherSelectData } from "@/components/common/TeacherOption";
import { bahtToMinor } from "@/lib/scheduler/discount";
import { COACH_RATE_KEY } from "@/lib/scheduler/duo";
import { bookableOnDate } from "@/lib/scheduler/work-days";
import type { Booking, TeacherView } from "@/types/app/scheduler";

/**
 * REQ-095 Stage 2a (TASK-398) — swap the teacher on a GROUP row: a teacher picker + `From this date on` ⇒ ONE
 * `PATCH /bookings/:id/group-teacher { teacherId, fromHereOn }`; the seats follow server-side; `409 SLOT_TAKEN`
 * names the date (the server's sentence, shown as is). 🔴 @Jason's build note: the swap sends NO message to families
 * or the coach — the dialog says so in one line. Behind `action:calendar.booking-edit`.
 *
 * 🔴 **TASK-632 (BE) → TASK-634 — ONE optional field: the incoming coach's rate for this series.**
 * **Why it exists:** TASK-632 correctly refuses a swap it cannot price, and it prices the incoming coach from what
 * **this series has already paid them** ⇒ 🔑 **a coach NEW to the series can never be priced, and a coach new to the
 * series is exactly what a cover IS.** *The refusal is right; a refusal with no answer is not.*
 * ✅ **OPTIONAL and it stays optional:** the server fills it from the series' own memory whenever it can, so most swaps
 * need nothing typed. 🚫 **Never pre-filled** — *a pre-filled wrong rate is how this whole defect started*, and the
 * only rates this screen could reach belong to the OUTGOING coach, which is the exact number that was being paid to
 * the wrong person.
 * ⚠️ **Gated on `action:bookings.coach-rate` (key 59) — the same key the Other-series cover box uses, and the one the
 * server's gate reads off the BODY.** **Hidden without it, never greyed**, and then 🚫 no `rateMinor` can ride.
 */
export default function GroupSwapDialog({ booking, teachers, opened, onClose }: { booking: Booking; teachers: TeacherView[]; opened: boolean; onClose: () => void }) {
  const t = useT();
  const swap = useSwapGroupTeacher();
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [fromHereOn, setFromHereOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 🔴 TASK-634 — empty by default and empty by rule: 🚫 nothing seeds this, ever. */
  const [rateBaht, setRateBaht] = useState<number | "">("");
  const can = useCan();
  const canRate = can(COACH_RATE_KEY);
  const choices = teachers.filter((tc) => tc.id !== booking.teacherId && bookableOnDate(tc, booking.date));
  const incoming = teachers.find((tc) => tc.id === teacherId);

  const submit = async () => {
    if (!teacherId) return;
    setError(null);
    try {
      // 🔑 ONE body, and the rate joins it only when the admin typed one AND may price a coach. 🚫 Never `undefined`:
      // the server's key-59 gate reads the BODY, so a present-but-empty key would cost an ordinary swap a permission.
      const rateMinor = canRate && rateBaht !== "" ? bahtToMinor(rateBaht) : undefined;
      await swap.mutateAsync({ id: booking.id, input: { teacherId, fromHereOn, ...(rateMinor != null ? { rateMinor } : {}) } });
      notify({ title: t("booking.groupSwapOk"), color: "success" });
      onClose();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : (e as Error).message);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} centered title={t("booking.groupSwapTitle", { name: booking.group?.name ?? booking.displayName })}>
      <Stack gap="sm">
        {error && (
          <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
            {error}
          </Alert>
        )}
        <Select
          label={t("booking.teacher")}
          placeholder={t("course.pickTeacher")}
          value={teacherId}
          onChange={setTeacherId}
          data={teacherSelectData(choices)}
          renderOption={({ option, checked }) => <TeacherOption option={option} checked={checked} teachers={teachers} />}
          allowDeselect={false}
          searchable
          comboboxProps={{ withinPortal: true }}
        />
        <Switch label={t("booking.groupSwapFromHereOn")} checked={fromHereOn} onChange={(e) => setFromHereOn(e.currentTarget.checked)} />
        {/* 🔴 TASK-634 — the optional rate. **Hidden without key 59, never greyed**, and 🚫 it is NOT marked `required`:
            the server answers from the series' own memory whenever it can, and most swaps type nothing here.
            🚫 `value` is the admin's own input and nothing else — no carried rate, no outgoing coach's number. */}
        {canRate && (
          <NumberInput
            label={t("booking.groupSwapRate", { name: incoming?.nickname ?? "" })}
            description={t("booking.groupSwapRateHint")}
            value={rateBaht}
            onChange={(v) => setRateBaht(typeof v === "number" ? v : "")}
            min={0}
            step={50}
            allowDecimal={false}
            allowNegative={false}
            suffix=" ฿"
            className="max-w-xs"
            data-group-swap-rate={rateBaht === "" ? "none" : bahtToMinor(rateBaht)}
          />
        )}
        {/* TASK-397's ruling: no notice exists for a swap; the words are the owner's to write later. Say so. */}
        <Text size="xs" c="dimmed">
          {t("booking.groupSwapNoNotice")}
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button leftSection={<Repeat size={15} />} loading={swap.isPending} disabled={!teacherId} onClick={submit}>
            {t("booking.groupSwap")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
