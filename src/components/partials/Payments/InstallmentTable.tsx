"use client";

import { Button, Group, Table, Text, Title } from "@mantine/core";
import { Plus } from "lucide-react";
import { useT } from "@/lib/i18n";
import { formatDateDisplay } from "@/lib/ui/format";
import { formatPriceMinor } from "@/types/app/pricing";
import type { Payment } from "@/types/payments";

interface Props {
  rows: Payment[];
  /** The API's numbers (SPEC-099 §8.9). Null ⇒ that line is not shown. Nothing here is summed. */
  feeMinor: number | null;
  remainingMinor: number | null;
  onEdit: (p: Payment) => void;
  /** Absent ⇒ no "Add an installment" (no payment row to add to, or the sale has no fee). */
  onAdd?: () => void;
}

/**
 * The Installment table (final UI): # · Date received · Amount · Payment Method, then "Course Fee" and "Remaining".
 * Installments split the fee; every figure is the API's.
 */
export default function InstallmentTable({ rows, feeMinor, remainingMinor, onEdit, onAdd }: Props) {
  const t = useT();
  return (
    <section aria-label={t("paymentRecord.installment")}>
      <Group justify="space-between" mb="xs">
        <Title order={4} fz={16} fw={600}>
          {t("paymentRecord.installment")}
        </Title>
        {onAdd && (
          <Button size="compact-sm" variant="light" leftSection={<Plus size={14} />} onClick={onAdd} className="min-h-[44px] sm:min-h-0">
            {t("paymentRecord.addInstallment")}
          </Button>
        )}
      </Group>
      {rows.length === 0 ? (
        <Text size="sm" c="dimmed" py="sm">
          {t("paymentRecord.noInstallments")}
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={420}>
          <Table verticalSpacing="sm" className="tabular-nums">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>#</Table.Th>
                <Table.Th>{t("paymentRecord.dateReceived")}</Table.Th>
                <Table.Th ta="right">{t("paymentRecord.amount")}</Table.Th>
                <Table.Th>{t("paymentRecord.method")}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((r) => (
                <Table.Tr key={r.id}>
                  <Table.Td>{r.n}</Table.Td>
                  <Table.Td className="whitespace-nowrap">{formatDateDisplay(r.paidOn)}</Table.Td>
                  <Table.Td ta="right" className="whitespace-nowrap">
                    {formatPriceMinor(r.amountMinor)}
                  </Table.Td>
                  <Table.Td>{t(`paymentRecord.methods.${r.method}`)}</Table.Td>
                  <Table.Td ta="right">
                    <Button
                      size="compact-sm"
                      variant="default"
                      onClick={() => onEdit(r)}
                      aria-label={`${t("paymentRecord.edit")} ${t("paymentRecord.method")} #${r.n}`}
                      className="min-h-[44px] sm:min-h-0"
                    >
                      {t("paymentRecord.edit")}
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
              {feeMinor !== null && (
                <Table.Tr>
                  <Table.Td colSpan={2} fw={700}>
                    {t("paymentRecord.courseFee")}
                  </Table.Td>
                  <Table.Td ta="right" fw={700} className="whitespace-nowrap">
                    {formatPriceMinor(feeMinor)}
                  </Table.Td>
                  <Table.Td colSpan={2} />
                </Table.Tr>
              )}
              {remainingMinor !== null && (
                <Table.Tr>
                  <Table.Td colSpan={2}>{t("paymentRecord.remaining")}</Table.Td>
                  <Table.Td ta="right" className="whitespace-nowrap">
                    {formatPriceMinor(remainingMinor)}
                  </Table.Td>
                  <Table.Td colSpan={2} />
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </section>
  );
}
