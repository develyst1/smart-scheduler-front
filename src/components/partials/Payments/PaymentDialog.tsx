"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Group, Modal, NumberInput, Stack } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { AlertTriangle } from "lucide-react";
import { useT } from "@/lib/i18n";
import { DEFAULT_PAYMENT_METHOD, type Payment, type PaymentMethod, type PaymentRefType } from "@/types/payments";
import { useCreatePayment, useUpdatePayment } from "./hooks";
import { apiSentence } from "./api-sentence";
import PaymentMethodSelect from "./PaymentMethodSelect";

/** Today's calendar date in Asia/Bangkok, `YYYY-MM-DD` (the date money "comes in" is a Bangkok date). */
export const todayBangkok = (): string => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());

interface Props {
  opened: boolean;
  onClose: () => void;
  refType: PaymentRefType;
  refId: string;
  /** Present ⇒ edit that row; absent ⇒ add an installment. */
  payment?: Payment;
}

/**
 * Edit one payment (date received, amount, method) or add an installment. Every row's amount is editable (SPEC-099 §8.9);
 * the API refuses a sum above the course fee with its own sentence, which is shown here as it arrives.
 * A save sends only what changed.
 */
export default function PaymentDialog({ opened, onClose, refType, refId, payment }: Props) {
  const t = useT();
  const update = useUpdatePayment(refType, refId);
  const create = useCreatePayment(refType, refId);
  const [paidOn, setPaidOn] = useState<string | null>(null);
  const [baht, setBaht] = useState<string | number>("");
  const [method, setMethod] = useState<PaymentMethod>(DEFAULT_PAYMENT_METHOD);
  const [errors, setErrors] = useState<{ paidOn?: string; amount?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);

  // Re-seed every time the dialog opens (or points at another row).
  useEffect(() => {
    if (!opened) return;
    setPaidOn(payment ? payment.paidOn : todayBangkok());
    setBaht(payment ? payment.amountMinor / 100 : "");
    setMethod(payment ? payment.method : DEFAULT_PAYMENT_METHOD);
    setErrors({});
    setFailure(null);
  }, [opened, payment?.id]);

  const pending = update.isPending || create.isPending;

  const save = async () => {
    const next: typeof errors = {};
    if (!paidOn) next.paidOn = t("paymentRecord.chooseDate");
    const minor = Math.round(Number(baht) * 100);
    if (!(baht !== "" && minor > 0)) next.amount = t("paymentRecord.amountAbove0");
    setErrors(next);
    if (Object.keys(next).length > 0 || !paidOn) return;
    setFailure(null);
    try {
      if (payment) {
        // Only what changed: a method edit never re-sends the amount or the date.
        const patch: { method?: PaymentMethod; paidOn?: string; amountMinor?: number } = {};
        if (method !== payment.method) patch.method = method;
        if (paidOn !== payment.paidOn) patch.paidOn = paidOn;
        if (minor !== payment.amountMinor) patch.amountMinor = minor;
        if (Object.keys(patch).length > 0) await update.mutateAsync({ id: payment.id, patch });
      } else {
        await create.mutateAsync({ refType, refId, paidOn, amountMinor: minor, method });
      }
      onClose();
    } catch (e) {
      // The API's own sentence (e.g. "the installments add up to more than the course fee"); a transport error gets the generic line.
      setFailure(apiSentence(e) ?? t("paymentRecord.saveError"));
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={payment ? t("paymentRecord.method") : t("paymentRecord.addInstallment")} centered>
      <Stack>
        <Group grow align="flex-start">
          <DatePickerInput
            label={t("paymentRecord.dateReceived")}
            value={paidOn}
            onChange={(v) => {
              setPaidOn(v);
              setErrors((e) => ({ ...e, paidOn: undefined }));
            }}
            valueFormat="DD/MM/YY"
            error={errors.paidOn}
          />
          <NumberInput
            label={t("paymentRecord.amount")}
            value={baht}
            onChange={(v) => {
              setBaht(v);
              setErrors((e) => ({ ...e, amount: undefined }));
            }}
            error={errors.amount}
            min={0}
            allowDecimal={false}
            allowNegative={false}
            hideControls
            suffix=" ฿"
            thousandSeparator=","
          />
        </Group>
        <PaymentMethodSelect value={method} onChange={setMethod} />
        {failure && (
          <Alert color="red" icon={<AlertTriangle size={16} />} variant="light" role="alert">
            {failure}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} loading={pending}>
            {t("common.save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
