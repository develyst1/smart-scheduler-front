"use client";

import { useState } from "react";
import { Alert, Button, Group, Modal, NumberInput, SegmentedControl, Select, Stack, Switch, Text, TextInput } from "@mantine/core";
import { AlertTriangle, ShoppingCart } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { ApiClientError, errorProblems } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import StudentSelect, { type StudentSelectValue } from "@/components/common/StudentSelect";
import DiscountSection from "@/components/common/DiscountSection";
import MultiDateField from "@/components/partials/Calendar/Modal/MultiDateField";
import { discountPayload, emptyDiscount, evaluateDiscount, type DiscountDraft } from "@/lib/scheduler/discount";
import { useCampPrices, useSellCamp } from "@/hooks/scheduler/useCamp";
import { CAMP_HALVES, CAMP_KINDS, CAMP_PLANS, type CampHalf, type CampKind, type CampPlan } from "@/lib/camp/units";
import { formatPriceMinor } from "@/types/app/pricing";
import type { CampWeek } from "@/types/api/contract";

/**
 * REQ-095 Stage 3a (TASK-402) — sell a camp package: kind × plan (DAILY ⇒ a `days` number), the price FROM THE CARD
 * (`GET /camp/prices` — never a constant; a daily price × days), the EXISTING discount block (early bird = a discount
 * with its reason — no special field, no date rule), an optional first week + dates + half ⇒ ONE `POST /camp/packages`.
 * Behind `action:camp.sell`; the discount also needs `action:sales.discount` (the block hides itself). 🚫 No client rule.
 */
export default function SellCampDialog({
  opened,
  onClose,
  student: preset,
  weeks,
  weekPreset,
}: {
  opened: boolean;
  onClose: () => void;
  student?: StudentSelectValue | null;
  /** The OPEN weeks the first-week picker offers (the roster passes its own; the card passes the month's). */
  weeks: CampWeek[];
  weekPreset?: CampWeek | null;
}) {
  const t = useT();
  const sell = useSellCamp();
  const { data: prices } = useCampPrices(opened);
  const [student, setStudent] = useState<StudentSelectValue | null>(preset ?? null);
  const [kind, setKind] = useState<CampKind>("FULL");
  const [plan, setPlan] = useState<CampPlan>("FULL_WEEK");
  const [days, setDays] = useState<number | "">(1);
  const [note, setNote] = useState("");
  const [discount, setDiscount] = useState<DiscountDraft>(emptyDiscount());
  const [problems, setProblems] = useState<string[]>([]);
  const [firstWeekOn, setFirstWeekOn] = useState(!!weekPreset);
  const [weekId, setWeekId] = useState<string | null>(weekPreset?.id ?? null);
  const [dates, setDates] = useState<string[]>([]);
  const [half, setHalf] = useState<CampHalf>(kind === "HALF" ? "AM" : "FULL");
  const [error, setError] = useState<string | null>(null);

  // The price: the card's item for this kind × plan; a DAILY item is per day, so × days. Nothing here is a number of its own.
  const item = prices?.items.find((i) => i.kind === kind && i.plan === plan);
  const fullMinor = item ? (plan === "DAILY" && typeof days === "number" ? item.priceMinor * days : item.priceMinor) : 0;
  const discountEval = evaluateDiscount(discount, fullMinor);
  const week = weeks.find((w) => w.id === weekId) ?? null;
  const ready = !!student?.id && !!item && (plan !== "DAILY" || typeof days === "number") && discountEval.problemKeys.length === 0 && (!firstWeekOn || (!!week && dates.length > 0));

  const submit = async () => {
    if (!student?.id || !ready) return;
    setError(null);
    setProblems([]);
    try {
      const res = await sell.mutateAsync({
        studentId: student.id,
        kind,
        plan,
        days: plan === "DAILY" && typeof days === "number" ? days : undefined,
        discount: discountPayload(discount, fullMinor),
        note: note.trim() || undefined,
        firstWeek: firstWeekOn && week && dates.length > 0 ? { weekId: week.id, dates, half } : undefined,
      });
      notify({ title: t("camp.soldOk", { n: String(typeof res.planned === "number" ? res.planned : res.planned.length) }), color: "success" });
      onClose();
    } catch (e) {
      setProblems(errorProblems(e));
      setError(e instanceof ApiClientError ? e.message : (e as Error).message);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} centered size="lg" title={t("camp.sellTitle")}>
      <Stack gap="sm">
        {error && (
          <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
            {error}
          </Alert>
        )}
        <StudentSelect value={student} onChange={setStudent} required />
        <Group grow align="flex-start">
          <SegmentedControl value={kind} onChange={(v) => { setKind(v as CampKind); setHalf(v === "HALF" ? "AM" : "FULL"); }} data={CAMP_KINDS.map((k) => ({ value: k, label: t(`camp.kind_${k}`) }))} />
          <SegmentedControl value={plan} onChange={(v) => setPlan(v as CampPlan)} data={CAMP_PLANS.map((p) => ({ value: p, label: t(`camp.plan_${p}`) }))} />
        </Group>
        {plan === "DAILY" && (
          <NumberInput label={t("camp.days")} value={days} onChange={(v) => setDays(typeof v === "number" ? v : "")} min={1} max={30} step={1} allowDecimal={false} className="max-w-xs" />
        )}
        <Text size="sm">
          {t("camp.price")}: <strong>{item ? `฿${formatPriceMinor(fullMinor)}` : "—"}</strong>
          {item && plan === "DAILY" && typeof days === "number" && <span className="text-muted-500"> ({`฿${formatPriceMinor(item.priceMinor)} × ${days}`})</span>}
        </Text>
        {item && <DiscountSection fullMinor={fullMinor} value={discount} onChange={setDiscount} serverProblems={problems} />}
        <TextInput label={t("camp.note")} value={note} onChange={(e) => setNote(e.currentTarget.value)} />
        <Switch label={t("camp.firstWeek")} checked={firstWeekOn} onChange={(e) => setFirstWeekOn(e.currentTarget.checked)} />
        {firstWeekOn && (
          <>
            <Select
              label={t("camp.week")}
              value={weekId}
              onChange={(v) => { setWeekId(v); setDates([]); }}
              data={weeks.filter((w) => w.status === "OPEN").map((w) => ({ value: w.id, label: `${w.name} · ${w.startDate} → ${w.endDate}` }))}
              allowDeselect={false}
              searchable
            />
            {kind === "HALF" && (
              <SegmentedControl value={half} onChange={(v) => setHalf(v as CampHalf)} data={CAMP_HALVES.filter((h) => h !== "FULL").map((h) => ({ value: h, label: h }))} className="max-w-xs" />
            )}
            {week && <MultiDateField value={dates} onChange={setDates} minDate={week.startDate} maxDate={week.endDate} />}
          </>
        )}
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button leftSection={<ShoppingCart size={15} />} loading={sell.isPending} disabled={!ready} onClick={submit}>
            {t("camp.sell")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
