"use client";

import { Button, Card, Group, Stack, Text } from "@mantine/core";
import { Printer, QrCode } from "lucide-react";
import { useT } from "@/lib/i18n";
import { QrPanel } from "@/components/common/QrDialog";
import { shopfrontUrl } from "@/lib/checkin/shopfront";

/**
 * REQ-108 §3 (TASK-478) — the printable shop-front QR. A shop-wide artefact, so Settings is its home.
 *
 * 🔑 The URL is built by the pure `shopfrontUrl` from **`NEXT_PUBLIC_API_URL`** — the same env value the backend's
 * `PUBLIC_CHECKIN_BASE_URL` points at — never a second literal typed here, or the day the host moves the poster and
 * this panel disagree and the printed QR is wrong.
 *
 * 📌 **The URL is printed in TEXT under the QR**, and that is not decoration: it is what a parent types when a camera
 * refuses to focus, and what the shop reads back over the phone.
 */
export default function ShopfrontQrPanel() {
  const t = useT();
  const url = shopfrontUrl(process.env.NEXT_PUBLIC_API_URL);
  return (
    <Card padding="lg" withBorder data-shopfront-qr>
      <Stack gap="sm">
        <Group gap="xs">
          <QrCode size={18} />
          <Text fw={600}>{t("shopCheckin.qrTitle")}</Text>
        </Group>
        <Text size="sm" c="dimmed">
          {t("shopCheckin.qrHint")}
        </Text>
        <QrPanel url={url} subtitle={t("shopCheckin.title")} />
        <Group justify="flex-end">
          <Button size="xs" variant="light" leftSection={<Printer size={14} />} onClick={() => window.print()}>
            {t("shopCheckin.printBtn")}
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
