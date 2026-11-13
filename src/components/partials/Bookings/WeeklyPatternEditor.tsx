"use client";

import { ActionIcon, Button, Group, Select, Stack, Text } from "@mantine/core";
import { Plus, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useWorkDays } from "@/lib/scheduler/useWorkDays";
import { PATTERN_MAX, PATTERN_TIMES, emptyPatternRow, patternIssue, type PatternRow } from "@/lib/scheduler/weekly-pattern";

/**
 * 🔴 **TASK-970 (REQ-5016 F1, SPEC-109 §3.1) — the weekly-pattern editor: rows of day · time · coach, add / remove.** Shared by the course SALE (`CreatePlanFlow`) and the CHANGE-PATTERN dialog.
 *
 * 🔑 It only edits the rows. Nothing is sent from here, and it counts and expands nothing: the dates a pattern makes are the SERVER's (`/courses/preview`, `/courses/:id/change-pattern/preview`), shown by
 * the plan beside it. Times are every 30 minutes (`PATTERN_TIMES`, the sale's opening hours). Two or more complete rows are a pattern; ONE row is a normal weekly class (the caller sends today's fields) — the line says so. A row left
 * half-filled, two rows on the same day and time, or more than 21 rows is said in words (`patternIssue`) and the caller sends nothing while it stands.
 */
export default function WeeklyPatternEditor({
  rows,
  onChange,
  teachers,
  seedTeacherId,
  disabled = false,
  hideHints = false,
}: {
  rows: PatternRow[];
  onChange: (rows: PatternRow[]) => void;
  /** The coaches a row may name. */
  teachers: { id: string; name: string; nickname?: string }[];
  /** A new row opens on this coach (the course's main one) — a convenience; every field can still be changed. */
  seedTeacherId?: string | null;
  disabled?: boolean;
  /** TASK-980 F4: true = do not show the two help lines (`weeklyPattern.hint`, `weeklyPattern.oneRow`). The change-pattern dialog passes it; the sale form does not. */
  hideHints?: boolean;
}) {
  const t = useT();
  const { options: dayOptions } = useWorkDays();
  const issue = patternIssue(rows);
  const set = (i: number, patch: Partial<PatternRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <Stack gap="xs" data-pattern-editor={rows.length}>
      {!hideHints && (
        <Text size="xs" c="dimmed">
          {t("weeklyPattern.hint")}
        </Text>
      )}
      {rows.map((r, i) => (
        <Group key={i} gap="xs" wrap="nowrap" align="flex-end" data-pattern-row={i}>
          <Select
            label={i === 0 ? t("weeklyPattern.day") : undefined}
            aria-label={t("weeklyPattern.day")}
            data={dayOptions}
            value={r.weekday === null ? null : String(r.weekday)}
            onChange={(v) => set(i, { weekday: v === null ? null : Number(v) })}
            allowDeselect={false}
            disabled={disabled}
            comboboxProps={{ withinPortal: true }}
            w={90}
            data-pattern-day={i}
          />
          <Select
            label={i === 0 ? t("weeklyPattern.time") : undefined}
            aria-label={t("weeklyPattern.time")}
            data={PATTERN_TIMES.map((s) => ({ value: s, label: s }))}
            value={r.startTime}
            onChange={(v) => set(i, { startTime: v })}
            allowDeselect={false}
            searchable
            disabled={disabled}
            comboboxProps={{ withinPortal: true }}
            w={100}
            data-pattern-time={i}
          />
          <Select
            label={i === 0 ? t("weeklyPattern.coach") : undefined}
            aria-label={t("weeklyPattern.coach")}
            data={teachers.map((tc) => ({ value: tc.id, label: tc.nickname || tc.name }))}
            value={r.teacherId}
            onChange={(v) => set(i, { teacherId: v })}
            allowDeselect={false}
            searchable
            disabled={disabled}
            comboboxProps={{ withinPortal: true }}
            className="min-w-0 flex-1"
            data-pattern-coach={i}
          />
          <ActionIcon variant="subtle" color="gray" size="lg" aria-label={t("weeklyPattern.remove")} disabled={disabled || rows.length <= 1} onClick={() => onChange(rows.filter((_, j) => j !== i))} data-pattern-remove={i}>
            <X size={16} />
          </ActionIcon>
        </Group>
      ))}
      <Group justify="space-between" gap="xs">
        <Button
          size="compact-sm"
          variant="light"
          leftSection={<Plus size={14} />}
          disabled={disabled || rows.length >= PATTERN_MAX}
          onClick={() => onChange([...rows, emptyPatternRow({ teacherId: seedTeacherId ?? null })])}
          data-pattern-add
        >
          {t("weeklyPattern.add")}
        </Button>
        {issue ? (
          <Text size="xs" c="red" data-pattern-issue={issue}>
            {t(`weeklyPattern.${issue}`)}
          </Text>
        ) : rows.length === 1 && !hideHints ? (
          <Text size="xs" c="dimmed" data-pattern-one-row>
            {t("weeklyPattern.oneRow")}
          </Text>
        ) : null}
      </Group>
    </Stack>
  );
}
