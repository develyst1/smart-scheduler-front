"use client";

import { useEffect, useState } from "react";
import {
  Modal,
  Button,
  NumberInput,
  Group,
  Stack,
  Alert,
  Paper,
  Text,
} from "@mantine/core";
import { Ticket, Info } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import StudentSelect, { type StudentSelectValue } from "@/components/common/StudentSelect";
import { useCreateVoucher } from "@/hooks/scheduler";
import { useT } from "@/lib/i18n";
import type { CreateVoucherResponse } from "@/types/api/contract";

interface Props {
  opened: boolean;
  onClose: () => void;
}

export default function CreateVoucherModal({ opened, onClose }: Props) {
  const t = useT();
  const create = useCreateVoucher();

  const [student, setStudent] = useState<StudentSelectValue | null>(null);
  const [totalHours, setTotalHours] = useState<number>(10);
  // จำนวนเดือนหมดอายุ — ตอนนี้เป็น display ฝั่ง FE เท่านั้น (ยังไม่ส่ง backend;
  // BE ยังคำนวณวันหมดอายุจากจำนวนชั่วโมงเอง ตาม contract เดิม)
  const [expiryMonths, setExpiryMonths] = useState<number>(6);
  const [result, setResult] = useState<CreateVoucherResponse | null>(null);

  useEffect(() => {
    if (!opened) {
      setStudent(null);
      setTotalHours(10);
      setExpiryMonths(6);
      setResult(null);
    }
  }, [opened]);

  const valid = student?.name.trim() && totalHours > 0 && expiryMonths > 0 && !create.isPending;

  const handleSubmit = async () => {
    if (!valid) return;
    const res = await create.mutateAsync({
      studentName: student?.name.trim() ?? "",
      studentId: student?.id,
      studentPhone: student?.phone,
      totalHours: totalHours as 5 | 10 | 15,
    });
    setResult(res);
    notify({
      title: t("voucher.issuedTitle"),
      description: t("voucher.issuedDesc", {
        name: res.voucher.student.name,
        hours: res.voucher.totalHours,
      }),
      color: "success",
    });
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2 font-semibold">
          <Ticket size={18} />
          {t("voucher.title")}
        </span>
      }
      size="md"
      centered
    >
      {result ? (
        <Stack gap="md">
          <Paper withBorder p="md" radius="md">
            <Text fw={600}>{result.voucher.student.name}</Text>
            <Text size="sm" c="dimmed" mt={4}>
              {t("voucher.summaryLine", {
                hours: result.voucher.totalHours,
                remaining: result.voucher.remaining,
              })}
            </Text>
            <Text size="xs" c="dimmed" mt={2}>
              {t("voucher.provisionalExpiry", { date: result.voucher.expiryDate })}
            </Text>
            <Text size="xs" c="dimmed" mt={2}>
              {t("voucher.setValidity", { months: expiryMonths })}
            </Text>
          </Paper>
          <Button onClick={onClose}>{t("common.close")}</Button>
        </Stack>
      ) : (
        <Stack gap="md">
          <Alert color="blue" icon={<Info size={16} />} variant="light">
            {t("voucher.infoAlert")}
          </Alert>

          <StudentSelect value={student} onChange={setStudent} required />

          <Group grow align="flex-start">
            <NumberInput
              label={t("voucher.hoursField")}
              value={totalHours}
              onChange={(v) => setTotalHours(typeof v === "number" ? v : 0)}
              min={1}
              step={1}
              allowDecimal={false}
              suffix={t("voucher.hoursFieldSuffix")}
              required
            />
            <NumberInput
              label={t("voucher.validityField")}
              value={expiryMonths}
              onChange={(v) => setExpiryMonths(typeof v === "number" ? v : 0)}
              min={1}
              step={1}
              allowDecimal={false}
              suffix={t("voucher.validityFieldSuffix")}
              required
            />
          </Group>

          <Group justify="flex-end">
            <Button variant="subtle" color="gray" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button loading={create.isPending} disabled={!valid} onClick={handleSubmit}>
              {t("voucher.issueBtn")}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
