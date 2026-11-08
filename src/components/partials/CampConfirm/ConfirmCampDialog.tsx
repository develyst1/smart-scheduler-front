"use client";

import { useState } from "react";
import { Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { notify } from "@/lib/ui/notify";
import { formatDateDisplay } from "@/lib/ui/format";
import { useConfirmCamp } from "@/hooks/scheduler/useCamp";
import { amountText, confirmBody, refusalWords, todayBkk } from "@/lib/camp/camp-confirm";
import PaymentMethodSelect from "@/components/partials/Payments/PaymentMethodSelect";
import { DEFAULT_PAYMENT_METHOD, type PaymentMethod } from "@/types/payments";
import type { CampPackage } from "@/types/api/contract";

/**
 * TASK-901 / SPEC-099 §11 (D3 = B) — «Confirm camp»: Date received (default today) · Amount (read-only: the server's net sale) · Payment Method (default Transfer).
 * ONE `POST /camp/packages/:id/confirm`; the revenue counts from the day it is pressed. The badge flips when the packages are re-read.
 * 409 `ALREADY_CONFIRMED` / `NO_FEE` show their words and keep the dialog open. Mounted only behind `action:camp.sell` (by `CampConfirmBlock`).
 */
export default function ConfirmCampDialog({ pkg, opened, onClose }: { pkg: CampPackage; opened: boolean; onClose: () => void }) {
  const t = useT();
  const confirm = useConfirmCamp();
  const [received, setReceived] = useState<string | null>(todayBkk());
  const [method, setMethod] = useState<PaymentMethod>(DEFAULT_PAYMENT_METHOD);

  const submit = async () => {
    if (!received) return;
    try {
      const res = await confirm.mutateAsync({ packageId: pkg.id, body: confirmBody(received, method) });
      notify({ title: t("campConfirm.confirmedOn", { date: formatDateDisplay(res.confirmedOn) }), description: amountText(res.amountMinor), color: "success" });
      onClose();
    } catch (e) {
      const code = e instanceof ApiClientError ? e.code : undefined;
      notify({ title: t("campConfirm.confirm"), description: refusalWords(code, t, e instanceof Error ? e.message : "—"), color: "danger" });
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} centered title={t("campConfirm.confirm")}>
      <Stack>
        <Text size="sm" fw={500}>
          {t(`camp.kind_${pkg.kind}`)} · {t(`camp.plan_${pkg.plan}`)}
        </Text>
        <Group grow align="flex-start">
          <DatePickerInput label={t("paymentRecord.dateReceived")} value={received} onChange={(v) => setReceived(v)} valueFormat="D MMM YYYY" required />
          <TextInput label={t("paymentRecord.amount")} value={amountText(pkg.amountMinor)} readOnly data-camp-amount />
        </Group>
        <PaymentMethodSelect value={method} onChange={setMethod} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} loading={confirm.isPending} disabled={!received}>
            {t("campConfirm.confirm")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
