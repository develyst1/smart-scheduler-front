"use client";

import { useEffect, useState } from "react";
import {
  Modal,
  Button,
  NumberInput,
  TextInput,
  Group,
  Stack,
  Alert,
  Paper,
  Text,
} from "@mantine/core";
import { Ticket, Info } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { useCreateVoucher } from "@/hooks/scheduler";
import type { CreateVoucherResponse } from "@/types/api/contract";

interface Props {
  opened: boolean;
  onClose: () => void;
}

export default function CreateVoucherModal({ opened, onClose }: Props) {
  const create = useCreateVoucher();

  const [studentName, setStudentName] = useState("");
  const [totalHours, setTotalHours] = useState<number>(10);
  // จำนวนเดือนหมดอายุ — ตอนนี้เป็น display ฝั่ง FE เท่านั้น (ยังไม่ส่ง backend;
  // BE ยังคำนวณวันหมดอายุจากจำนวนชั่วโมงเอง ตาม contract เดิม)
  const [expiryMonths, setExpiryMonths] = useState<number>(6);
  const [result, setResult] = useState<CreateVoucherResponse | null>(null);

  useEffect(() => {
    if (!opened) {
      setStudentName("");
      setTotalHours(10);
      setExpiryMonths(6);
      setResult(null);
    }
  }, [opened]);

  const valid = studentName.trim() && totalHours > 0 && expiryMonths > 0 && !create.isPending;

  const handleSubmit = async () => {
    if (!valid) return;
    const res = await create.mutateAsync({
      studentName: studentName.trim(),
      totalHours: totalHours as 5 | 10 | 15,
    });
    setResult(res);
    notify({
      title: "ออกวอยเชอร์แล้ว",
      description: `${res.voucher.student.name} · ${res.voucher.totalHours} ชม.`,
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
          ออกวอยเชอร์ชั่วโมง
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
              {result.voucher.totalHours} ชม. · เหลือ {result.voucher.remaining} ชม.
            </Text>
            <Text size="xs" c="dimmed" mt={2}>
              วันหมดอายุชั่วคราว: {result.voucher.expiryDate} (นับจากวันจองครั้งแรก)
            </Text>
            <Text size="xs" c="dimmed" mt={2}>
              ตั้งอายุ: {expiryMonths} เดือน (ยังไม่ผูก backend)
            </Text>
          </Paper>
          <Button onClick={onClose}>ปิด</Button>
        </Stack>
      ) : (
        <Stack gap="md">
          <Alert color="blue" icon={<Info size={16} />} variant="light">
            วอยเชอร์ไม่ล็อกครู/เวลา — นักเรียนใช้จองทีหลังผ่านปฏิทิน · อายุนับจากวันจองครั้งแรก
          </Alert>

          <TextInput
            label="ชื่อนักเรียน"
            placeholder="เช่น น้องมิ้น"
            value={studentName}
            onChange={(e) => setStudentName(e.currentTarget.value)}
            required
          />

          <Group grow align="flex-start">
            <NumberInput
              label="จำนวนชั่วโมง"
              value={totalHours}
              onChange={(v) => setTotalHours(typeof v === "number" ? v : 0)}
              min={1}
              step={1}
              allowDecimal={false}
              suffix=" ชม."
              required
            />
            <NumberInput
              label="หมดอายุ (เดือน)"
              value={expiryMonths}
              onChange={(v) => setExpiryMonths(typeof v === "number" ? v : 0)}
              min={1}
              step={1}
              allowDecimal={false}
              suffix=" เดือน"
              required
            />
          </Group>

          <Group justify="flex-end">
            <Button variant="subtle" color="gray" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button loading={create.isPending} disabled={!valid} onClick={handleSubmit}>
              ออกวอยเชอร์
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
