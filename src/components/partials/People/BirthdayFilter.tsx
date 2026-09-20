"use client";

import { Button, Group, NumberInput, Popover, Select, Stack, Switch, Text } from "@mantine/core";
import { Cake, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { EMPTY_BIRTHDAY, MONTHS, birthdayActive, isYear, type BirthdayState } from "@/lib/people/birthday-filter";

/**
 * REQ-099 (TASK-415) — the `Birthday` control: a popover with a month range (from · to, month names in the current
 * language; a wrap like Nov → Feb is allowed — the server orders it) and a `No DOB recorded` switch that greys the
 * range — the two are exclusive, mirroring the server's rule (the server still decides). `Clear` returns to the
 * families view. The button reads what is set. TASK-417: an optional `Year` box under each month (blank = any year;
 * both or neither ride — one filled is not a query); the server's `400` (a backwards dated range) shows as its sentence.
 */
export default function BirthdayFilter({ value, onChange, error }: { value: BirthdayState; onChange: (s: BirthdayState) => void; error?: string | null }) {
  const { lang, t } = useI18n();
  const monthName = (m: number) => new Date(2000, m - 1, 1).toLocaleDateString(lang === "th" ? "th-TH" : "en-GB", { month: "short" });
  const data = MONTHS.map((m) => ({ value: String(m), label: monthName(m) }));
  const active = birthdayActive(value);
  const yr = (y: number | null | undefined) => (isYear(y) ? ` ${y}` : "");
  const label = value.noDob
    ? t("people.birthdayNoDob")
    : active
      ? `${monthName(value.from as number)}${yr(value.yearFrom)} → ${monthName(value.to as number)}${yr(value.yearTo)}`
      : t("people.birthday");
  const yearBox = (key: "yearFrom" | "yearTo") => (
    <NumberInput
      label={t("people.birthdayYear")}
      placeholder={t("people.birthdayAnyYear")}
      value={value[key] ?? ""}
      onChange={(v) => onChange({ ...value, [key]: typeof v === "number" ? v : null })}
      disabled={value.noDob}
      min={1900}
      max={2100}
      allowDecimal={false}
      allowNegative={false}
      hideControls
      size="xs"
    />
  );

  return (
    <Group gap={4} wrap="nowrap">
      <Popover position="bottom-start" withinPortal shadow="md" width={280}>
        <Popover.Target>
          <Button size="sm" radius="md" variant={active ? "filled" : "default"} leftSection={<Cake size={15} />} data-birthday={active ? "on" : "off"}>
            {label}
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="sm">
            <Text size="xs" c="dimmed">
              {t("people.birthdayHint")}
            </Text>
            <Group gap="xs" grow>
              <Select
                label={t("people.birthdayFrom")}
                data={data}
                value={value.from === null ? null : String(value.from)}
                onChange={(v) => onChange({ ...value, from: v ? Number(v) : null })}
                disabled={value.noDob}
                allowDeselect={false}
              />
              <Select
                label={t("people.birthdayTo")}
                data={data}
                value={value.to === null ? null : String(value.to)}
                onChange={(v) => onChange({ ...value, to: v ? Number(v) : null })}
                disabled={value.noDob}
                allowDeselect={false}
              />
            </Group>
            <Group gap="xs" grow>
              {yearBox("yearFrom")}
              {yearBox("yearTo")}
            </Group>
            {error && (
              <Text size="xs" c="red">
                {error}
              </Text>
            )}
            <Switch size="sm" label={t("people.birthdayNoDob")} checked={value.noDob} onChange={(e) => onChange({ ...value, noDob: e.currentTarget.checked })} />
          </Stack>
        </Popover.Dropdown>
      </Popover>
      {active && (
        <Button size="sm" radius="md" variant="subtle" color="gray" leftSection={<X size={13} />} onClick={() => onChange(EMPTY_BIRTHDAY)} aria-label={t("people.birthdayClear")}>
          {t("people.birthdayClear")}
        </Button>
      )}
    </Group>
  );
}
