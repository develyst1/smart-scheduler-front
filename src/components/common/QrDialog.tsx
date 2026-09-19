"use client";

import { useState } from "react";
import dayjs from "dayjs";
import { Button, Group, Loader, Modal, Stack, Text } from "@mantine/core";
import { QRCodeSVG } from "qrcode.react";
import { Copy } from "lucide-react";
import { useT } from "@/lib/i18n";

/**
 * TASK-404 — THE check-in QR dialog, shared. 📌 Before this task the FE had no QR component at all (the session's
 * check-in link is minted and sent by the server over LINE; nothing on a screen drew it) — so this is the one, and
 * any later session QR mounts it rather than a second. It draws whatever `url` it is given (the server's; nothing
 * here composes a link), shows it as text with a copy button, and the expiry when the server sends one.
 */
export interface QrDialogProps {
  opened: boolean;
  onClose: () => void;
  title: string;
  /** A line under the title — who / when. */
  subtitle?: string;
  /** The server's URL; absent while loading. */
  url?: string | null;
  expiresAt?: string | null;
  loading?: boolean;
  error?: string | null;
}

export default function QrDialog({
  opened,
  onClose,
  title,
  ...panel
}: QrDialogProps) {
  return (
    <Modal opened={opened} onClose={onClose} centered size="sm" title={title}>
      <QrPanel {...panel} />
    </Modal>
  );
}

/** The dialog's body — exported so a test can render it without the portal. */
export function QrPanel({
  subtitle,
  url,
  expiresAt,
  loading,
  error,
}: Omit<QrDialogProps, "opened" | "onClose" | "title">) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* no clipboard (http, old webview) — the text is selectable below */
    }
  };
  return (
    <Stack gap="sm" align="center" data-qr-dialog>
      {subtitle && (
        <Text size="sm" c="dimmed" ta="center">
          {subtitle}
        </Text>
      )}
      {loading && <Loader size="sm" />}
      {error && (
        <Text size="sm" c="red" ta="center">
          {error}
        </Text>
      )}
      {url && (
        <>
          <div className="rounded-lg bg-white p-3" data-qr-url={url}>
            <QRCodeSVG value={url} size={220} level="M" includeMargin={false} />
          </div>
          <Text
            size="xs"
            c="dimmed"
            ta="center"
            className="break-all select-all"
          >
            {url}
          </Text>
          {expiresAt && (
            <Text size="xs" c="dimmed">
              {t("qr.expires", { at: dayjs(expiresAt).format("D MMM HH:mm") })}
            </Text>
          )}
          <Group gap="xs">
            <Button
              size="xs"
              variant="light"
              leftSection={<Copy size={13} />}
              onClick={() => void copy()}
            >
              {copied ? t("qr.copied") : t("qr.copy")}
            </Button>
          </Group>
        </>
      )}
    </Stack>
  );
}
