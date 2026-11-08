"use client";

import { useState } from "react";
import { Alert, Badge, Button, Card, Center, Group, Loader, Stack, Text, Title } from "@mantine/core";
import { AlertTriangle } from "lucide-react";
import { useT } from "@/lib/i18n";
import { DEFAULT_PAYMENT_METHOD, type Payment, type PaymentRefType } from "@/types/payments";
import { apiSentence } from "./api-sentence";
import { PAYMENTS_LIVE } from "./config";
import { usePayments } from "./hooks";
import InstallmentTable from "./InstallmentTable";
import PaymentDialog from "./PaymentDialog";

interface Props {
  refType: PaymentRefType;
  refId: string;
  /** The plan's name and its student, as the final UI's card shows them. Both optional (the plan modal already shows them). */
  title?: string;
  subtitle?: string;
  /** The ship gate (`PAYMENTS_LIVE`). Only a test passes it; callers leave it out. */
  live?: boolean;
}

/**
 * 🔴 SHIP GATE: with `PAYMENTS_LIVE` false this is `null` and NOTHING below runs — no hook, no query, no call. The outer
 * component is the only place that decides it, so there is no way to render half of the card or to fire a request by accident.
 */
export default function PaymentCard({ live = PAYMENTS_LIVE, ...props }: Props) {
  if (!live) return null;
  return <PaymentCardBody {...props} />;
}

/**
 * The Payment card (SPEC-099 §8 + §8.9, TASK-876): the payment method with Edit and a "Paid" badge, then the Installment
 * table with Course Fee and Remaining. It shows payments only, never a revenue figure (the API sends none).
 * States: loading · error + Retry · a course with no payment row (sold before this shipped: "Transfer (default)", no Edit,
 * nothing to add to) · a sale with no fee (rows only, no Add).
 */
function PaymentCardBody({ refType, refId, title, subtitle }: Omit<Props, "live">) {
  const t = useT();
  const query = usePayments(refType, refId);
  // `null` = closed, "add" = a new installment, a Payment = editing that row.
  const [dialog, setDialog] = useState<Payment | "add" | null>(null);

  const heading = (
    <Title order={4} fz={16} fw={600}>
      {t("paymentRecord.title")}
    </Title>
  );

  if (query.isLoading) {
    return (
      <Stack gap="xs">
        {heading}
        <Card padding="md">
          <Center h={96} role="status" aria-label={t("paymentRecord.loading")}>
            <Loader size="sm" />
          </Center>
        </Card>
      </Stack>
    );
  }
  if (query.isError) {
    return (
      <Stack gap="xs">
        {heading}
        <Card padding="md">
          <Alert color="red" icon={<AlertTriangle size={16} />} variant="light" role="alert">
            <Stack gap="xs" align="flex-start">
              <Text size="sm">{apiSentence(query.error) ?? t("paymentRecord.loadError")}</Text>
              <Button size="compact-sm" variant="default" onClick={() => query.refetch()}>
                {t("paymentRecord.retry")}
              </Button>
            </Stack>
          </Alert>
        </Card>
      </Stack>
    );
  }

  const rows = query.data?.payments ?? [];
  const feeMinor = query.data?.feeMinor ?? null;
  const remainingMinor = query.data?.remainingMinor ?? null;
  const first = rows.find((r) => r.n === 1);
  const method = first?.method ?? DEFAULT_PAYMENT_METHOD;

  return (
    <Stack gap="md">
      {heading}
      <Card padding="md">
        <Group justify="space-between" wrap="wrap">
          <div>
            {title && <Text fw={600}>{title}</Text>}
            {subtitle && (
              <Text size="sm" c="dimmed">
                {subtitle}
              </Text>
            )}
          </div>
          <Group gap="sm">
            <Text size="sm" c="dimmed">
              {t("paymentRecord.method")}
            </Text>
            <Badge variant="light" tt="none">
              {first ? t(`paymentRecord.methods.${method}`) : t("paymentRecord.transferDefault")}
            </Badge>
            {first && (
              <Button size="compact-sm" variant="default" onClick={() => setDialog(first)} className="min-h-[44px] sm:min-h-0">
                {t("paymentRecord.edit")}
              </Button>
            )}
            {first && (
              <Badge variant="light" color="green" tt="none">
                {t("paymentRecord.paid")}
              </Badge>
            )}
          </Group>
        </Group>
      </Card>

      <Card padding="md">
        <InstallmentTable
          rows={rows}
          feeMinor={feeMinor}
          remainingMinor={remainingMinor}
          onEdit={setDialog}
          // Adding needs a row to split and a fee to split it from; otherwise the API refuses (409 NO_FEE).
          onAdd={first && feeMinor !== null ? () => setDialog("add") : undefined}
        />
      </Card>

      <PaymentDialog
        opened={dialog !== null}
        onClose={() => setDialog(null)}
        refType={refType}
        refId={refId}
        payment={dialog !== null && dialog !== "add" ? dialog : undefined}
      />
    </Stack>
  );
}
