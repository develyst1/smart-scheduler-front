"use client";

import { NumberInput, Select, Stack, Text } from "@mantine/core";
import { useT } from "@/lib/i18n";
import { OTHER_KINDS, type OtherKind, type OtherScheduleDraft } from "@/lib/scheduler/other-schedule";
import type { TeacherView } from "@/types/app/scheduler";

/**
 * REQ-095 Stage 1 (TASK-395) — the three ECA · Free · KOL fields, shared by the OTHER create form, the series
 * dialog and the details editor: Kind (ECA / Free / KOL), Head count, and a Rate (฿) per teacher row (the primary
 * first, then each additional). 🔴 The rate's hint says the truth: stored for the backoffice, NOT posted here. The
 * conversion to satang happens once, in `other-schedule.ts`; these inputs hold baht as typed.
 */
export default function OtherScheduleFields({
  value,
  onChange,
  teacherIds,
  teachers,
  kindRequired = false,
}: {
  value: OtherScheduleDraft;
  onChange: (next: OtherScheduleDraft) => void;
  teacherIds: readonly string[];
  teachers: TeacherView[];
  kindRequired?: boolean;
}) {
  const t = useT();
  const nameOf = (id: string) => {
    const tc = teachers.find((x) => x.id === id);
    return tc ? tc.nickname || tc.name : id;
  };
  return (
    <Stack gap="sm">
      <Select
        label={t("booking.otherKind")}
        placeholder={t("booking.otherKindPick")}
        value={value.kind}
        onChange={(v) => onChange({ ...value, kind: (v as OtherKind | null) ?? null })}
        data={OTHER_KINDS.map((k) => ({ value: k, label: t(`booking.otherKind_${k}`) }))}
        allowDeselect={!kindRequired}
        required={kindRequired}
        className="max-w-xs"
      />
      <NumberInput
        label={t("booking.otherHeadCount")}
        value={value.headCount}
        onChange={(v) => onChange({ ...value, headCount: typeof v === "number" ? v : "" })}
        min={0}
        step={1}
        allowDecimal={false}
        className="max-w-xs"
      />
      {teacherIds.length > 0 && (
        <div>
          <Text size="sm" fw={500}>
            {t("booking.otherRate")}
          </Text>
          <Text size="xs" c="dimmed" mb={4}>
            {t("booking.otherRateHint")}
          </Text>
          <Stack gap={6}>
            {teacherIds.map((id, i) => (
              <NumberInput
                key={id}
                label={`${nameOf(id)}${i === 0 ? ` · ${t("booking.otherRatePrimary")}` : ""}`}
                value={value.ratesBaht[id] ?? ""}
                onChange={(v) => onChange({ ...value, ratesBaht: { ...value.ratesBaht, [id]: typeof v === "number" ? v : "" } })}
                min={0}
                step={1}
                allowDecimal={false}
                thousandSeparator=","
                prefix="฿"
                className="max-w-xs"
              />
            ))}
          </Stack>
        </div>
      )}
    </Stack>
  );
}
