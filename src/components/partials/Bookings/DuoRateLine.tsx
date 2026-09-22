"use client";

import { useState } from "react";
import { ActionIcon, Button, Group, NumberInput } from "@mantine/core";
import CourseDetailRow from "./CourseDetailRow";
import { Pencil } from "lucide-react";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { notify } from "@/lib/ui/notify";
import { rateChange } from "@/lib/scheduler/duo";

/**
 * REQ-095 §13 (TASK-421) → §13.3 (TASK-424) — a course's DEFAULT coach rate on its card, ANY course: `Default coach rate
 * n ฿ / session`, and (by `bookings.course-edit`) a pencil ⇒ the same baht box the New-course form has ⇒
 * `PATCH /courses/:id { classRateMinor }` ONLY when it changed (the pure `rateChange`; never null — the default is set,
 * not cleared, so there is no Clear here; the session popup owns the per-session override).
 */
export default function DuoRateLine({ rateMinor, editable, saving, onSave }: { rateMinor: number | null; editable: boolean; saving: boolean; onSave: (classRateMinor: number) => Promise<void> }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [baht, setBaht] = useState<number | "">(typeof rateMinor === "number" ? rateMinor / 100 : "");

  const save = async () => {
    const change = rateChange(baht, rateMinor);
    if (!change) {
      setEditing(false);
      return;
    }
    try {
      await onSave(change.classRateMinor);
      setEditing(false);
    } catch (e) {
      notify({ title: e instanceof ApiClientError ? e.message : (e as Error).message, color: "danger" });
    }
  };

  if (editing) {
    return (
      <Group gap="xs" align="flex-end" p="xs" className="border-b border-muted-200 last:border-b-0" data-duo-rate-edit>
        <NumberInput size="xs" label={t("course.defaultRate")} value={baht} onChange={(v) => setBaht(typeof v === "number" ? v : "")} min={0} step={50} allowDecimal={false} allowNegative={false} suffix=" ฿" className="max-w-40" />
        <Button size="xs" loading={saving} disabled={baht === ""} onClick={() => void save()}>
          {t("common.save")}
        </Button>
        <Button size="xs" variant="subtle" color="gray" onClick={() => setEditing(false)}>
          {t("common.cancel")}
        </Button>
      </Group>
    );
  }
  // A row of the card's details box; the pencil is a full-size target now (it was an 11px icon after the text).
  return (
    <CourseDetailRow
      label={t("course.defaultRate")}
      color="green"
      data-duo-rate={rateMinor ?? "none"}
      action={
        editable && (
          <ActionIcon size="lg" variant="default" aria-label={t("course.rateEdit")} onClick={() => setEditing(true)}>
            <Pencil size={16} />
          </ActionIcon>
        )
      }
    >
      {/* green, label and value — the card's one money-to-the-coach figure stands out from the other rows */}
      {t("course.rateValue", { baht: typeof rateMinor === "number" ? rateMinor / 100 : "—" })}
    </CourseDetailRow>
  );
}
