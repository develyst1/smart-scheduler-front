"use client";

import { useState } from "react";
import { Alert, Button, Group, List, Loader, Menu, Modal, Stack, Text, Textarea } from "@mantine/core";
import { AlertTriangle, Undo2 } from "lucide-react";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { notify } from "@/lib/ui/notify";
import { useCan } from "@/hooks/scheduler/useMe";
import { useUndoBooking, useUndoPreview } from "@/hooks/scheduler";
import { UNDO_BODY_KEYS, UNDO_LABEL_KEYS, undoDoor, undoKind } from "@/lib/scheduler/undo";
import { canConfirm, previewLines, previewNothingElse, previewState, refusalOf } from "@/lib/scheduler/undo-preview";
import type { Booking } from "@/types/app/scheduler";

/**
 * SPEC-094 (TASK-492 BE → TASK-518 FE → 🔴 TASK-531 the fix) — **the admin Undo, one control in two places.**
 *
 * 🔴 **Why this is a HOOK and not one component (TASK-531 D4).** The first build returned the menu item and its \`Modal\`
 * from one component, and the host put that component **inside \`<Menu.Dropdown>\`**. Clicking the item closes the menu,
 * Mantine unmounts the dropdown's children, and **the dialog went with it — every time, before it could paint.** No
 * dialog, no request, no error: a control that did nothing. **A dialog's lifetime must not be owned by the menu that
 * opens it.** So the hook holds the state, and hands back two elements the host places in two different lifetimes: the
 * item inside the dropdown, the dialog **outside the \`<Menu>\`**.
 *
 * 🔑 **The label names what happens to THIS row** — attendance · check-in · leave — and where nothing is undoable both
 * elements are \`null\`: no control at all, not a greyed one.
 * 🔴 **The refusals are the point of the dialog.** The server names each one (\`UNDO_DAY_SETTLED\`, \`UNDO_SLOT_TAKEN\` with
 * the hour AND who holds it, \`UNDO_LEAVE_CHARGE_UNKNOWN\`, \`UNDO_ALREADY_CHANGED\`, …) and **its sentence is shown
 * verbatim**; \`UNDO_LEAVE_CHARGE_UNKNOWN\` is CORRECT BY DESIGN on an old row and must not read as a bug. **A refusal
 * never renders as a success** (TASK-483). 🚫 **No optimistic update:** nothing changes until the server has answered.
 */
export function useUndoControl(booking: Booking, onDone?: () => void, scoped = false): { menuItem: React.ReactNode; dialog: React.ReactNode } {
  const t = useT();
  const can = useCan();
  const undo = useUndoBooking();
  const [open, setOpen] = useState(false);
  // 🔴 TASK-547 — the FORECAST (`GET /bookings/:id/undo-preview`, the act's own `planUndo` with nothing written), asked
  // **only while the dialog is open**: a preview per row would be hundreds of privileged reads on a month grid.
  const preview = useUndoPreview(booking.id, open);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const kind = undoKind(booking);
  // 📌 The key is asked as a LITERAL, not through `UNDO_KEY`: `action-gate.test.ts` sweeps `src` for `can("action:…")`
  // literals to find every door in the product, and a door that asks through a constant is a door that sweep cannot see.
  // 🚫 A LINKED (teacher) account is refused by the server outright (`403 SCOPE_TEACHER`), so the door must not be
  // there at all: a control whose only outcome is a refusal is the thing TASK-518 set out to avoid. The host passes its
  // own `scoped`, exactly as `canStatus = canAttend && !scoped` does beside it.
  const shown = !scoped && undoDoor(can("action:calendar.undo"), booking) && kind !== null;
  if (!shown || !kind) return { menuItem: null, dialog: null };

  const state = previewState(preview.data, preview.isLoading, preview.isError);

  const run = async () => {
    // 🚫 The failure path is NOT skipped because the forecast was clean: `UNDO_PLAN_WOULD_CHANGE` is decided after the
    // act's writes, so a refusal here is the act knowing more — not a contradiction of the preview.
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

  return {
    menuItem: (
      <Menu.Item leftSection={<Undo2 size={16} />} onClick={() => setOpen(true)} data-undo-control={kind}>
        {t(UNDO_LABEL_KEYS[kind])}
      </Menu.Item>
    ),
    dialog: (
      <Modal opened={open} onClose={() => setOpen(false)} centered title={t(`undo.${kind}Title`)} data-undo-dialog={kind}>
        <Stack gap="sm">
          {error && (
            <Alert color="red" icon={<AlertTriangle size={15} />} variant="light" data-undo-error>
              {error}
            </Alert>
          )}
          {/* What is INVARIANT: what the act does to this row, and who is told. 🔑 The quota, the make-up and the expiry are
              NOT here any more — they are the preview's to state, because this body was shown for every leave and the
              quota-and-make-up promise is false on a creation-declared, over-quota, 1-hour or voucher leave. */}
          <Text size="sm">{t(UNDO_BODY_KEYS[kind])}</Text>

          {/* ── the forecast ───────────────────────────────────────────────────────────────────────────────────── */}
          {state === "loading" && (
            <Group gap="xs" data-undo-preview="loading">
              <Loader size="xs" />
              <Text size="sm" c="dimmed">
                {t("undo.previewLoading")}
              </Text>
            </Group>
          )}
          {/* 🚫 A failed check never renders as a confident body: it says we could not check, and the act still decides. */}
          {state === "failed" && (
            <Alert color="yellow" variant="light" icon={<AlertTriangle size={15} />} data-undo-preview="failed">
              {t("undo.previewFailed")}
            </Alert>
          )}
          {/* 🔴 The server's own sentence, under a heading of ours. The confirm is blocked: the act's read half already said no. */}
          {state === "refused" && (
            <Alert color="red" variant="light" icon={<AlertTriangle size={15} />} title={t("undo.previewRefused")} data-undo-preview="refused">
              {refusalOf(preview.data)}
            </Alert>
          )}
          {state === "ready" && (
            <div data-undo-preview="ready">
              <Text size="sm" fw={500}>
                {t("undo.previewHeading")}
              </Text>
              {previewNothingElse(preview.data) ? (
                <Text size="sm" c="dimmed">
                  {t("undo.previewNothingElse")}
                </Text>
              ) : (
                <List size="sm" spacing={2} mt={4}>
                  {previewLines(preview.data).map((line) => (
                    <List.Item key={line.key}>{t(line.key, line.vars)}</List.Item>
                  ))}
                </List>
              )}
              {/* 🔑 The sentence that makes a post-click refusal a normal outcome instead of a contradiction. */}
              <Text size="xs" c="dimmed" mt={4}>
                {t("undo.previewForecast")}
              </Text>
            </div>
          )}
          <Textarea label={t("undo.reasonLabel")} value={reason} onChange={(e) => setReason(e.currentTarget.value)} autosize minRows={2} maxRows={4} />
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            {/* 🚫 Blocked ONLY by a refusal the act itself produced. `loading` waits out a 200 ms read; a FAILED preview does
                not block — a preview outage must not stop a legitimate undo, and the act is the authority either way. */}
            <Button color="orange" loading={undo.isPending} disabled={!canConfirm(state)} onClick={() => void run()} data-undo-confirm>
              {t("undo.confirm")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    ),
  };
}
