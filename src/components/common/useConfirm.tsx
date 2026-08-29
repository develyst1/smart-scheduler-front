"use client";

import { useCallback, useRef, useState } from "react";
import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useT } from "@/lib/i18n";

export interface ConfirmOptions {
  /** Modal title. */
  title: string;
  /** One line saying what will happen. Keep it to the consequence, not the mechanism. */
  message?: string;
  /** Confirm button label — say the verb ("Cancel booking"), never "OK". */
  confirmLabel?: string;
  color?: string;
  /**
   * 🔴 The CHEAP variant (REQ-073). `มาเรียน` must not be taxed: on 2026-08-23 **15 real sessions went NO_SHOW**
   * because staff pressed confirm and never pressed มาเรียน. A light dialog is one line, focused primary button,
   * Enter to confirm — so the extra click costs a keystroke, not a read. Heavy dialogs (reason enums, named blast
   * radius) stay for cancel / pause / charge.
   */
  light?: boolean;
}

/**
 * REQ-073 / TASK-216 — ONE confirm primitive for every action that is hard to undo, reaches a human, or moves money.
 *
 * Imperative on purpose: `if (!(await confirm({...}))) return;` reads at the call site as the guard it is, so wiring
 * an action costs one line and nobody is tempted to hand-roll a second dialog with its own wording.
 *
 * It deliberately does **not** offer a reason field. Actions that need one already have their own richer dialog
 * (cancel course / pause / cancel booking); this is the shape for "are you sure", not for "why".
 */
export function useConfirm() {
  const t = useT();
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    setOpts(options);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpts(null);
  };

  const dialog = (
    <Modal
      opened={opts !== null}
      // Esc and the backdrop both mean "no" — a dismissed confirm must never read as consent.
      onClose={() => settle(false)}
      centered
      radius="lg"
      size={opts?.light ? "sm" : "md"}
      title={opts?.title}
    >
      <Stack gap="md">
        {opts?.message && <Text fz="sm">{opts.message}</Text>}
        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" color="gray" onClick={() => settle(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            color={opts?.color}
            // Focused so Enter confirms without reaching for the mouse — the whole point of the light variant.
            autoFocus
            onClick={() => settle(true)}
          >
            {opts?.confirmLabel ?? t("common.confirm")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );

  return { confirm, confirmDialog: dialog };
}
