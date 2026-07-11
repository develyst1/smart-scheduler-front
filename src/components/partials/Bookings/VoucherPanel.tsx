"use client";

import { Card, Table, Progress, Text, Badge, Group, Loader } from "@mantine/core";
import { Ticket } from "lucide-react";
import { MANTINE_COLOR } from "@/lib/ui/colors";
import { useVouchers } from "@/hooks/scheduler";
import { useT } from "@/lib/i18n";

function RemainingBadge({ remaining }: { remaining: number }) {
  const t = useT();
  if (remaining === 0)
    return (
      <Badge color={MANTINE_COLOR.danger} variant="light" radius="sm">
        {t("voucher.used")}
      </Badge>
    );
  return (
    <Badge color={MANTINE_COLOR.success} variant="light" radius="sm">
      {t("voucher.usable")}
    </Badge>
  );
}

export default function VoucherPanel() {
  const t = useT();
  const { data: vouchers = [], isLoading } = useVouchers();

  if (isLoading) {
    return (
      <Card padding="xl">
        <Group justify="center" c="dimmed" gap="xs">
          <Loader size="sm" />
          <Text size="sm">{t("voucher.panelLoading")}</Text>
        </Group>
      </Card>
    );
  }

  if (vouchers.length === 0) {
    return (
      <Card padding="xl">
        <Group justify="center" c="dimmed" gap="xs">
          <Ticket size={18} />
          <Text size="sm">{t("voucher.empty")}</Text>
        </Group>
      </Card>
    );
  }

  return (
    <Card padding={0}>
      <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t("voucher.colStudent")}</Table.Th>
            <Table.Th>{t("voucher.colTotal")}</Table.Th>
            <Table.Th>{t("voucher.colUsage")}</Table.Th>
            <Table.Th>{t("voucher.colExpiry")}</Table.Th>
            <Table.Th>{t("voucher.colStatus")}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {vouchers.map((v) => {
            const usedPct = v.totalHours > 0 ? (v.usedHours / v.totalHours) * 100 : 0;
            return (
              <Table.Tr key={v.id}>
                <Table.Td>
                  <Text fw={500}>{v.student.name}</Text>
                  {v.student.nickname && (
                    <Text size="xs" c="dimmed">
                      {v.student.nickname}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>{v.totalHours} {t("voucher.hoursShort")}</Table.Td>
                <Table.Td style={{ minWidth: 160 }}>
                  <div className="mb-1 flex justify-between text-xs text-default-500">
                    <span>{t("voucher.usedN", { n: v.usedHours })}</span>
                    <span>{t("voucher.leftN", { n: v.remaining })}</span>
                  </div>
                  <Progress
                    size="sm"
                    radius="xl"
                    value={usedPct}
                    color={v.remaining === 0 ? MANTINE_COLOR.warning : "blue"}
                  />
                </Table.Td>
                <Table.Td>{v.expiryDate}</Table.Td>
                <Table.Td>
                  <RemainingBadge remaining={v.remaining} />
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Card>
  );
}
