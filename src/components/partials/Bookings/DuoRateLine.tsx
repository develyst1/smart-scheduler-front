"use client";

import { useState } from "react";
import { ActionIcon, Button, Group, NumberInput, Text } from "@mantine/core";
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
      <Group gap="xs" align="flex-end" data-duo-rate-edit>
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
  return (
    <Text size="xs" c="teal" className="flex items-center gap-1" data-duo-rate={rateMinor ?? "none"}>
      {t("course.defaultRateLine", { baht: typeof rateMinor === "number" ? rateMinor / 100 : "—" })}
      {editable && (
        <ActionIcon size="xs" variant="subtle" color="gray" aria-label={t("course.rateEdit")} onClick={() => setEditing(true)}>
          <Pencil size={11} />
        </ActionIcon>
      )}
    </Text>
  );
}
