"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Group, Modal, NumberInput, Stack, Text } from "@mantine/core";
import { Plus, Wallet } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { useT } from "@/lib/i18n";
import { useSetFreelanceBudget, useTopUpFreelanceBudget } from "@/hooks/scheduler";
import { ApiClientError } from "@/lib/api/client";
import type { TeacherView } from "@/types/app/scheduler";

const toSatang = (baht: number | string) => Math.round(Number(baht) * 100);
const baht = (satang: number) => (satang / 100).toLocaleString("th-TH");

export default function FreelanceBudgetControls({ teacher }: { teacher: TeacherView }) {
  const t = useT();
  const setBudget = useSetFreelanceBudget();
  const topUp = useTopUpFreelanceBudget();
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [topUpOpen, setTopUpOpen] = useState(false);

  return (
    <>
      <Group gap={6} mt={8} justify="flex-end">
        <Button size="compact-xs" variant="light" color="gray" leftSection={<Wallet size={13} />} onClick={() => setBudgetOpen(true)}>
          {t("teachers.setBudget")}
        </Button>
        <Button size="compact-xs" variant="light" color="green" leftSection={<Plus size={13} />} onClick={() => setTopUpOpen(true)}>
          {t("teachers.topUp")}
        </Button>
      </Group>

      {budgetOpen && (
        <SetBudgetModal
          teacher={teacher}
          onClose={() => setBudgetOpen(false)}
          submit={(input) => setBudget.mutateAsync({ id: teacher.id, input })}
          pending={setBudget.isPending}
        />
      )}
      {topUpOpen && (
        <TopUpModal
          teacher={teacher}
          onClose={() => setTopUpOpen(false)}
          submit={(amountMinor) => topUp.mutateAsync({ id: teacher.id, amountMinor })}
          pending={topUp.isPending}
        />
      )}
    </>
  );
}

function SetBudgetModal({
  teacher,
  onClose,
  submit,
  pending,
}: {
  teacher: TeacherView;
  onClose: () => void;
  submit: (input: { monthlyBudgetMinor: number; rateMinor: number; reorderMinor: number | null }) => Promise<unknown>;
  pending: boolean;
}) {
  const t = useT();
  const [budget, setBudget] = useState<number | string>(teacher.budgetMinor != null ? teacher.budgetMinor / 100 : 0);
  const [rate, setRate] = useState<number | string>(teacher.hourlyRate ?? 0);
  const [warn, setWarn] = useState<number | string>(teacher.reorderMinor != null ? teacher.reorderMinor / 100 : "");

  const onSubmit = async () => {
    if (Number(budget) <= 0 || Number(rate) <= 0) {
      notify({ title: t("teachers.fieldMonthlyBudget"), color: "warning" });
      return;
    }
    try {
      await submit({
        monthlyBudgetMinor: toSatang(budget),
        rateMinor: toSatang(rate),
        reorderMinor: warn === "" ? null : toSatang(warn),
      });
      notify({ title: t("teachers.budgetSaved"), description: teacher.nickname, color: "success" });
      onClose();
    } catch (e) {
      notify({ title: "ผิดพลาด", description: e instanceof ApiClientError ? e.message : "บันทึกไม่สำเร็จ", color: "danger" });
    }
  };

  return (
    <Modal opened onClose={onClose} title={t("teachers.budgetModalTitle")} centered radius="lg" size="lg">
      <Stack gap="md">
        <Group grow>
          <NumberInput label={t("teachers.fieldMonthlyBudget")} value={budget} onChange={setBudget} min={0} thousandSeparator="," leftSection={<span className="text-xs text-muted-400">฿</span>} />
          <NumberInput label={t("teachers.fieldRate")} value={rate} onChange={setRate} min={0} thousandSeparator="," leftSection={<span className="text-xs text-muted-400">฿</span>} />
        </Group>
        <NumberInput label={t("teachers.fieldNearCap")} value={warn} onChange={setWarn} min={0} thousandSeparator="," leftSection={<span className="text-xs text-muted-400">฿</span>} />
        <Alert variant="light" color="blue">
          <Text fz="sm">{t("teachers.budgetEditNote")}</Text>
        </Alert>
        <Group justify="flex-end" mt="sm">
          <Button variant="subtle" color="gray" onClick={onClose}>{t("common.cancel")}</Button>
          <Button color="green" onClick={onSubmit} loading={pending}>{t("common.save")}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function TopUpModal({
  teacher,
  onClose,
  submit,
  pending,
}: {
  teacher: TeacherView;
  onClose: () => void;
  submit: (amountMinor: number) => Promise<unknown>;
  pending: boolean;
}) {
  const t = useT();
  const [amount, setAmount] = useState<number | string>(0);

  useEffect(() => setAmount(0), [teacher.id]);

  const addSatang = toSatang(amount);
  const nextRemaining = (teacher.remainingMinor ?? 0) + addSatang;

  const onSubmit = async () => {
    if (addSatang <= 0) {
      notify({ title: t("teachers.topUpAmount"), color: "warning" });
      return;
    }
    try {
      await submit(addSatang);
      notify({ title: t("teachers.toppedUp"), description: `${teacher.nickname} · +฿${baht(addSatang)}`, color: "success" });
      onClose();
    } catch (e) {
      notify({ title: "ผิดพลาด", description: e instanceof ApiClientError ? e.message : "บันทึกไม่สำเร็จ", color: "danger" });
    }
  };

  return (
    <Modal opened onClose={onClose} title={t("teachers.topUpTitle")} centered radius="lg">
      <Stack gap="md">
        <NumberInput label={t("teachers.topUpAmount")} value={amount} onChange={setAmount} min={0} thousandSeparator="," leftSection={<span className="text-xs text-muted-400">฿</span>} />
        <Text fz="sm" c="dimmed">
          {t("teachers.budgetRemaining")}: <span className="tabular-nums">฿{baht(nextRemaining)}</span>
        </Text>
        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onClose}>{t("common.cancel")}</Button>
          <Button color="green" onClick={onSubmit} loading={pending}>{t("teachers.topUp")}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
