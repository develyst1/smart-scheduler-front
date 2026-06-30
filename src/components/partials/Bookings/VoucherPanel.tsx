"use client";

import { Card, Table, Progress, Text, Badge, Group } from "@mantine/core";
import { Ticket } from "lucide-react";
import { MANTINE_COLOR } from "@/lib/ui/colors";
import type { VoucherSummary } from "@/types/api/contract";

// TODO: ต่อ API จริง (GET /vouchers) — ตอนนี้ใช้ mock ฝั่ง FE ก่อน
const MOCK_VOUCHERS: VoucherSummary[] = [
  {
    id: "v1",
    totalHours: 10,
    usedHours: 4,
    remaining: 6,
    expiryDate: "2026-12-15",
    student: { id: "s1", name: "น้องมิ้น", nickname: "มิ้น" },
  },
  {
    id: "v2",
    totalHours: 5,
    usedHours: 5,
    remaining: 0,
    expiryDate: "2026-09-01",
    student: { id: "s2", name: "น้องเอิร์ธ", nickname: "เอิร์ธ" },
  },
  {
    id: "v3",
    totalHours: 15,
    usedHours: 2,
    remaining: 13,
    expiryDate: "2027-03-30",
    student: { id: "s3", name: "น้องพลอย", nickname: "พลอย" },
  },
];

function RemainingBadge({ remaining }: { remaining: number }) {
  if (remaining === 0)
    return (
      <Badge color={MANTINE_COLOR.danger} variant="light" radius="sm">
        ใช้หมด
      </Badge>
    );
  return (
    <Badge color={MANTINE_COLOR.success} variant="light" radius="sm">
      ใช้ได้
    </Badge>
  );
}

export default function VoucherPanel() {
  const vouchers = MOCK_VOUCHERS;

  if (vouchers.length === 0) {
    return (
      <Card padding="xl">
        <Group justify="center" c="dimmed" gap="xs">
          <Ticket size={18} />
          <Text size="sm">ยังไม่มีวอยเชอร์</Text>
        </Group>
      </Card>
    );
  }

  return (
    <Card padding={0}>
      <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>นักเรียน</Table.Th>
            <Table.Th>ชั่วโมงรวม</Table.Th>
            <Table.Th>ใช้ไป / เหลือ</Table.Th>
            <Table.Th>หมดอายุ</Table.Th>
            <Table.Th>สถานะ</Table.Th>
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
                <Table.Td>{v.totalHours} ชม.</Table.Td>
                <Table.Td style={{ minWidth: 160 }}>
                  <div className="mb-1 flex justify-between text-xs text-default-500">
                    <span>ใช้ {v.usedHours}</span>
                    <span>เหลือ {v.remaining}</span>
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
