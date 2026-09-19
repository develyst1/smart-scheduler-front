"use client";

import { useState } from "react";
import { Alert, Button, Group, Loader, Modal, SegmentedControl, Select, Stack, Text } from "@mantine/core";
import { AlertTriangle, Ticket } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import StudentSelect, { type StudentSelectValue } from "@/components/common/StudentSelect";
import { useCampPackages, useRedeemCamp } from "@/hooks/scheduler/useCamp";
import { CAMP_HALVES, creditLabel, type CampHalf } from "@/lib/camp/units";
import MultiDateField from "@/components/partials/Calendar/Modal/MultiDateField";
import type { CampWeek } from "@/types/api/contract";

/**
 * REQ-095 Stage 3a (TASK-402) — redeem camp days INTO a week: pick a child with credit ⇒ their package ⇒ tick dates (the
 * SHARED multi-date picker, limited to the week's own dates) + the half ⇒ ONE `POST /camp/packages/:id/days`. A refusal
 * names the date (`CAMP_FULL` · `CAMP_NO_CREDIT` · `CAMP_DAY_TAKEN` · `CAMP_WEEK_CLOSED`) and the ticks STAY. Behind
 * `action:camp.redeem`. 🚫 No client rule: the credit is shown, not judged.
 */
export default function RedeemDialog({ opened, week, student: preset, onClose }: { opened: boolean; week: CampWeek; student?: StudentSelectValue | null; onClose: () => void }) {
  const t = useT();
  const redeem = useRedeemCamp();
  const [student, setStudent] = useState<StudentSelectValue | null>(preset ?? null);
  const { data: packages = [], isLoading } = useCampPackages(student?.id ?? null);
  const [packageId, setPackageId] = useState<string | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [half, setHalf] = useState<CampHalf>("FULL");
  const [error, setError] = useState<string | null>(null);
  const withCredit = packages.filter((p) => p.credit > 0);
  const chosen = withCredit.find((p) => p.id === packageId) ?? (withCredit.length === 1 ? withCredit[0] : undefined);
  const ready = !!chosen && dates.length > 0;

  const submit = async () => {
    if (!chosen) return;
    setError(null);
    try {
      const res = await redeem.mutateAsync({ packageId: chosen.id, weekId: week.id, dates, half });
      notify({ title: t("camp.redeemedOk", { n: String(typeof res.planned === "number" ? res.planned : res.planned.length) }), color: "success" });
      onClose();
    } catch (e) {
      // the sentence names the date; the ticks stay so the admin un-ticks it and retries
      setError(e instanceof ApiClientError ? e.message : (e as Error).message);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} centered size="lg" title={t("camp.redeemTitle", { week: week.name })}>
      <Stack gap="sm">
        {error && (
          <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
            {error}
          </Alert>
        )}
        <StudentSelect value={student} onChange={(v) => { setStudent(v); setPackageId(null); }} required />
        {student?.id &&
          (isLoading ? (
            <Loader size="xs" />
          ) : withCredit.length === 0 ? (
            <Text size="sm" c="dimmed">
              {t("camp.noCredit")}
            </Text>
          ) : (
            <Select
              label={t("camp.package")}
              value={chosen?.id ?? null}
              onChange={setPackageId}
              data={withCredit.map((p) => ({ value: p.id, label: `${t(`camp.kind_${p.kind}`)} · ${t(`camp.plan_${p.plan}`)} · ${t("camp.daysLeft", { n: creditLabel(p.credit) })}` }))}
              allowDeselect={false}
            />
          ))}
        <SegmentedControl value={half} onChange={(v) => setHalf(v as CampHalf)} data={CAMP_HALVES.map((h) => ({ value: h, label: h === "FULL" ? t("camp.halfFull") : h }))} className="max-w-xs" />
        <MultiDateField value={dates} onChange={setDates} minDate={week.startDate} maxDate={week.endDate} />
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button leftSection={<Ticket size={15} />} loading={redeem.isPending} disabled={!ready} onClick={submit}>
            {t("camp.redeem", { n: String(dates.length) })}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
