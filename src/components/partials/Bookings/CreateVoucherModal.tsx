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
import { Ticket, Info, AlertTriangle } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import StudentSelect, { type StudentSelectValue } from "@/components/common/StudentSelect";
import { useCreateVoucher, useSellablePackages } from "@/hooks/scheduler";
import { ApiClientError, errorProblems } from "@/lib/api/client";
import DiscountSection from "@/components/common/DiscountSection";
import { discountPayload, emptyDiscount, evaluateDiscount, type DiscountDraft } from "@/lib/scheduler/discount";
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
  const [error, setError] = useState<string | null>(null);
  // REQ-063 — the voucher's list price now comes from the server (TASK-164), never a second FE copy.
  const { data: card } = useSellablePackages();
  const [discount, setDiscount] = useState<DiscountDraft>(emptyDiscount());
  const [discountProblems, setDiscountProblems] = useState<string[]>([]);
  const fullMinor = card?.voucherItems.find((v) => v.hours === totalHours)?.priceMinor ?? 0;
  const discountEval = evaluateDiscount(discount, fullMinor);

  useEffect(() => {
    if (!opened) {
      setStudent(null);
      setTotalHours(10);
      setExpiryMonths(6);
      setResult(null);
      setError(null);
      setDiscount(emptyDiscount());
      setDiscountProblems([]);
    }
  }, [opened]);

  const valid =
    student?.name.trim() &&
    totalHours > 0 &&
    expiryMonths > 0 &&
    !create.isPending &&
    discountEval.problemKeys.length === 0;

  const handleSubmit = async () => {
    if (!valid) return;
    setError(null);
    setDiscountProblems([]);
    try {
      const res = await create.mutateAsync({
        studentName: student?.name.trim() ?? "",
        studentId: student?.id,
        studentPhone: student?.phone,
        totalHours: totalHours as 5 | 10 | 15,
        discount: discountPayload(discount, fullMinor),
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
    } catch (e) {
      // e.g. a suspended household can't be sold to (TASK-058) → show the backend message, not a dead button.
      // REQ-063: DISCOUNT_REFUSED carries an ARRAY — render every entry, not just the headline.
      setDiscountProblems(errorProblems(e));
      if (e instanceof ApiClientError) setError(e.message);
      else throw e;
    }
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
      size="lg"
      centered
      styles={{ body: { minHeight: 340, display: "flex", flexDirection: "column" } }}
    >
      {result ? (
        <Stack gap="md" style={{ flex: 1 }}>
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
          <Button onClick={onClose} mt="auto">{t("common.close")}</Button>
        </Stack>
      ) : (
        <Stack gap="md" style={{ flex: 1 }}>
          <Alert color="blue" icon={<Info size={16} />} variant="light">
            {t("voucher.infoAlert")}
          </Alert>

          <StudentSelect value={student} onChange={setStudent} required />

          {error && (
            <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
              {error}
            </Alert>
          )}

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

          {/* REQ-063 — the full price follows the hour bucket, so it re-reads whenever the hours change. */}
          {fullMinor > 0 && (
            <DiscountSection
              fullMinor={fullMinor}
              value={discount}
              onChange={setDiscount}
              serverProblems={discountProblems}
            />
          )}

          <Group justify="flex-end" mt="auto">
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
