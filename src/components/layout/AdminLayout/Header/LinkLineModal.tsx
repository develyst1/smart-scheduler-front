"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Group, Loader, Modal, Stack, Text } from "@mantine/core";
import { AlertTriangle } from "lucide-react";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { useReadMyLineLink, useRequestLineLinkCode } from "@/hooks/scheduler/useMe";
import { expiryMinutes, groupCode, type LineLinkCode } from "@/lib/users/line-link";

/** How often an open dialog with a live code re-reads `/me`, so "linked" shows up without a reload once the code is typed in LINE. */
export const LINK_POLL_MS = 3000;

/**
 * TASK-726 (FE) ← TASK-725 (BE) — **"Link LINE" from the header**: the signed-in web user asks for a one-time code and types it in
 * the shop's LINE chat. Every word here is ✅ APPROVED by the owner 2026-10-11 — COPY-REVIEW-2026-09-29.md:599.
 *
 * 🔴 **The code is asked for when the dialog OPENS, never on render** — this component is mounted (closed) in every page's header, so a
 * request on mount would mint (and replace) a live code for everyone who merely loaded a page. The earlier code stops working the
 * moment a new one is issued, which is why «ขอรหัสใหม่» is a button and not an effect.
 * 🔴 **The code is never logged and never kept beyond this dialog's state:** it is read from the mutation, put in state, and the
 * mutation is `reset()` so the query client's mutation cache does not hold it too; closing the dialog clears the state.
 * 🚫 A coach account never reaches this dialog (the header does not offer the item; the server refuses it anyway).
 * 📌 If the account is ALREADY linked the dialog opens on the linked state and does not mint a code by itself; «ขอรหัสใหม่» is there
 * to link a different LINE account (the server replaces the earlier one).
 */
export default function LinkLineModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const t = useT();
  const request = useRequestLineLinkCode();
  const readLink = useReadMyLineLink();
  /** The server's answer to "is my account linked?", read when the dialog OPENS (and while a code is on screen). `null` = not known yet. */
  const [linked, setLinked] = useState<boolean | null>(null);

  /** The live code, plus whether the account was ALREADY linked when it was issued (so a later `lineLinked` can be told apart from a new link). */
  const [issued, setIssued] = useState<(LineLinkCode & { wasLinked: boolean }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const asked = useRef(false);

  const getCode = async (wasLinked: boolean) => {
    setError(null);
    setBusy(true);
    try {
      const r = await request.mutateAsync();
      setIssued({ ...r, wasLinked });
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : (e as Error).message);
    } finally {
      request.reset();
      setBusy(false);
    }
  };

  // On OPEN: ask the server whether the account is linked FIRST, then one code request unless it is. On close: forget everything.
  useEffect(() => {
    if (!opened) {
      asked.current = false;
      setIssued(null);
      setLinked(null);
      setError(null);
      return;
    }
    if (asked.current) return;
    asked.current = true;
    void (async () => {
      try {
        const l = await readLink();
        setLinked(l);
        if (!l) await getCode(false);
      } catch (e) {
        setError(e instanceof ApiClientError ? e.message : (e as Error).message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  // While a code is on screen and the account is not linked yet, re-ask the server so the linked state appears by itself.
  const expiresInSeconds = issued?.expiresInSeconds ?? 0;
  useEffect(() => {
    if (!opened || !issued || issued.wasLinked || linked === true) return;
    const poll = setInterval(() => void readLink().then(setLinked, () => {}), LINK_POLL_MS);
    const stop = setTimeout(() => clearInterval(poll), expiresInSeconds * 1000);
    return () => {
      clearInterval(poll);
      clearTimeout(stop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, issued, linked, expiresInSeconds]);

  // A code issued to an account that was NOT linked, and the account now is ⇒ the link happened: show that, drop the code.
  const justLinked = !!issued && !issued.wasLinked && linked === true;
  const showCode = !!issued && !justLinked;

  return (
    <Modal opened={opened} onClose={onClose} centered title={t("header.linkLineTitle")} data-link-line-dialog>
      <Stack gap="sm">
        {error && (
          <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
            {error}
          </Alert>
        )}

        {linked === true && !showCode && (
          <Text fw={500} data-link-line-linked>
            {t("header.linkLineLinked")}
          </Text>
        )}

        {showCode && issued && (
          <>
            <Text size="sm">{t("header.linkLineInstruction")}</Text>
            <Text ta="center" ff="monospace" fw={700} fz={32} style={{ letterSpacing: "0.15em" }} data-link-line-code>
              {groupCode(issued.code)}
            </Text>
            <Text size="xs" c="dimmed" ta="center">
              {t("header.linkLineExpires", { minutes: String(expiryMinutes(issued.expiresInSeconds)) })}
            </Text>
          </>
        )}

        {((busy && !issued) || (linked === null && !error)) && <Loader size="sm" mx="auto" />}

        <Group justify="flex-end" gap="sm">
          <Button variant="default" loading={busy && !!issued} disabled={busy} onClick={() => void getCode(linked === true)} data-link-line-new>
            {t("header.linkLineNewCode")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
