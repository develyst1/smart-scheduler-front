"use client";

import { useState } from "react";
import { Alert, Button, Group, Menu, Modal, Stack, Text, Textarea } from "@mantine/core";
import { AlertTriangle, Undo2 } from "lucide-react";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { notify } from "@/lib/ui/notify";
import { useCan } from "@/hooks/scheduler/useMe";
import { useUndoBooking } from "@/hooks/scheduler";
import { UNDO_BODY_KEYS, UNDO_LABEL_KEYS, undoDoor, undoKind } from "@/lib/scheduler/undo";
import type { Booking } from "@/types/app/scheduler";

/**
 * SPEC-094 (TASK-492 BE → TASK-518 FE) — **the admin Undo, ONE control in two places** (the session roster's modal and
 * the plan editor's row menu). The API shipped and nothing could press it; this is that button.
 *
 * 🔑 **The label names what happens to THIS row** — attendance · check-in · leave — and where nothing is undoable the
 * control is **absent**, not greyed: a disabled button invites "why?" and the honest answer is better said by absence.
 * 🔴 **The refusals are the point of the dialog.** The server names each one (`UNDO_DAY_SETTLED`, `UNDO_SLOT_TAKEN` with
 * the hour AND who holds it, `UNDO_LEAVE_CHARGE_UNKNOWN`, `UNDO_ALREADY_CHANGED`, …) and **its sentence is shown
 * verbatim** — the re-booked-hour case is the only version an admin can act on, and `UNDO_LEAVE_CHARGE_UNKNOWN` is
 * CORRECT BY DESIGN on an old row and must not read as a bug. **A refusal never renders as a success** (TASK-483).
 * 🚫 **No optimistic update:** nothing on screen changes until the server has answered. This moves money.
 */
export default function UndoControl({ booking, onDone, as = "menu" }: { booking: Booking; onDone?: () => void; as?: "menu" | "button" }) {
  const t = useT();
  const can = useCan();
  const undo = useUndoBooking();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const kind = undoKind(booking);
  // The door: the 60th key AND something to undo. Ungranted ⇒ no control at all, never a control that fails.
  // 📌 The key is asked as a LITERAL here, not through `UNDO_KEY`, and that is deliberate: `action-gate.test.ts` sweeps
  // `src` for `can("action:…")` literals to find every door in the product, and a door that asks through a constant is
  // a door that sweep cannot see — it landed in the "keys with no FE site" list while being perfectly wired. The
  // constant stays for the pure rules and the tests; the SITE says its key out loud, like every other site.
  if (!undoDoor(can("action:calendar.undo"), booking) || !kind) return null;

  const run = async () => {
    setError(null);
    try {
      await undo.mutateAsync({ bookingId: booking.id, reason });
      notify({ title: t("undo.done"), color: "default" });
      setOpen(false);
      setReason("");
      onDone?.();
    } catch (e) {
      // 🔴 The server's own sentence, verbatim: it names the day, the hour and its holder, or why the charge is unknown.
      // Nothing is closed, nothing typed is lost, and the row on screen is untouched — the undo did not happen.
      setError(e instanceof ApiClientError ? e.message : (e as Error).message);
    }
  };

  const label = t(UNDO_LABEL_KEYS[kind]);
  return (
    <>
      {as === "menu" ? (
        <Menu.Item leftSection={<Undo2 size={16} />} onClick={() => setOpen(true)} data-undo-control={kind}>
          {label}
        </Menu.Item>
      ) : (
        <Button size="xs" variant="light" leftSection={<Undo2 size={14} />} onClick={() => setOpen(true)} data-undo-control={kind}>
          {label}
        </Button>
      )}
      <Modal opened={open} onClose={() => setOpen(false)} centered title={t(`undo.${kind}Title`)} data-undo-dialog={kind}>
        <Stack gap="sm">
          {error && (
            <Alert color="red" icon={<AlertTriangle size={15} />} variant="light" data-undo-error>
              {error}
            </Alert>
          )}
          {/* The body varies with the state exactly as the label does — and the LEAVE one says the coach IS told. */}
          <Text size="sm">{t(UNDO_BODY_KEYS[kind])}</Text>
          <Textarea label={t("undo.reasonLabel")} value={reason} onChange={(e) => setReason(e.currentTarget.value)} autosize minRows={2} maxRows={4} />
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button color="orange" loading={undo.isPending} onClick={() => void run()}>
              {t("undo.confirm")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
