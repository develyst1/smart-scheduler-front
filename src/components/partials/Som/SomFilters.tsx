"use client";

import { useState } from "react";
import dayjs from "dayjs";
import {
  ActionIcon,
  Group,
  Input,
  MultiSelect,
  SegmentedControl,
} from "@mantine/core";
import { DatePickerInput, MonthPickerInput } from "@mantine/dates";
import { ChevronLeft, ChevronRight, Tag } from "lucide-react";
import { useBadges } from "@/hooks/scheduler";
import { useI18n } from "@/lib/i18n";
import type { SomPeriod, SomQuery } from "@/types/app/som";

type Mode = SomPeriod["kind"];
type DraftRange = [string | null, string | null];

/**
 * The SOM dashboard's page-level filters: badge (branch) values + a time period, sitting together at the top. They
 * drive every section except Today, which is locked to today. The badge picker is the same grouped multi-select
 * the calendar uses (one group per badge type, active values only); empty = all branches.
 *
 * Period (client, 2026-11): All · Monthly · Custom range. Future dates are not selectable — the server refuses them
 * and there is nothing to report yet. A custom range only applies once BOTH ends are picked, so a half-picked range
 * leaves the current figures on screen.
 */
export function SomFilters({
  value,
  onChange,
}: {
  value: SomQuery;
  onChange: (q: SomQuery) => void;
}) {
  const { t } = useI18n();
  const { data: badgeTypes = [] } = useBadges();
  const [mode, setMode] = useState<Mode>(value.period.kind);
  const [lastMonth, setLastMonth] = useState(() => dayjs().format("YYYY-MM"));
  const [range, setRange] = useState<DraftRange>([null, null]);

  const badgeData = badgeTypes
    .filter((bt) => bt.active)
    .map((bt) => ({
      group: bt.name,
      items: bt.values
        .filter((v) => v.active)
        .map((v) => ({ value: v.id, label: v.label })),
    }))
    .filter((g) => g.items.length > 0);

  const setPeriod = (period: SomPeriod) => onChange({ ...value, period });
  const setMonth = (m: string) => {
    setLastMonth(m);
    setPeriod({ kind: "month", month: m });
  };
  const changeRange = (next: DraftRange) => {
    setRange(next);
    if (next[0] && next[1])
      setPeriod({
        kind: "range",
        from: dayjs(next[0]).format("YYYY-MM-DD"),
        to: dayjs(next[1]).format("YYYY-MM-DD"),
      });
  };
  const changeMode = (next: Mode) => {
    setMode(next);
    if (next === "all") setPeriod({ kind: "all" });
    if (next === "month") setMonth(lastMonth);
    if (next === "range") changeRange(range);
  };

  const month = dayjs(`${lastMonth}-01`);

  return (
    <Group gap="sm" align="flex-end" wrap="wrap">
      {badgeData.length > 0 && (
        <MultiSelect
          label={t("som.filterBranch")}
          placeholder={
            value.badgeValueIds.length > 0 ? undefined : t("som.allBranches")
          }
          value={value.badgeValueIds}
          onChange={(ids) => onChange({ ...value, badgeValueIds: ids })}
          data={badgeData}
          leftSection={<Tag size={15} />}
          size="sm"
          clearable
          searchable
          maxDropdownHeight={280}
          className="min-w-52 max-w-md grow"
          classNames={{ pillsList: "!flex-nowrap overflow-x-auto py-0.5" }}
        />
      )}
      <Input.Wrapper
        label={t("som.filterPeriod")}
        size="sm"
        labelProps={{ className: "block" }}
      >
        <SegmentedControl
          size="sm"
          value={mode}
          onChange={(v) => changeMode(v as Mode)}
          data={[
            { value: "all", label: t("som.periodAll") },
            { value: "month", label: t("som.periodMonth") },
            { value: "range", label: t("som.periodRange") },
          ]}
        />
      </Input.Wrapper>
      {mode === "month" && (
        <Group gap={4} align="flex-end" wrap="nowrap">
          <ActionIcon
            variant="default"
            size={36}
            onClick={() =>
              setMonth(month.subtract(1, "month").format("YYYY-MM"))
            }
            aria-label={t("som.prevMonth")}
          >
            <ChevronLeft size={16} />
          </ActionIcon>
          <MonthPickerInput
            label={t("som.filterMonth")}
            size="sm"
            value={`${lastMonth}-01`}
            onChange={(d) => d && setMonth(dayjs(d).format("YYYY-MM"))}
            valueFormat="MMM YYYY"
            maxDate={dayjs().endOf("month").format("YYYY-MM-DD")}
            popoverProps={{ withinPortal: true }}
            className="w-36"
          />
          <ActionIcon
            variant="default"
            size={36}
            disabled={lastMonth >= dayjs().format("YYYY-MM")}
            onClick={() => setMonth(month.add(1, "month").format("YYYY-MM"))}
            aria-label={t("som.nextMonth")}
          >
            <ChevronRight size={16} />
          </ActionIcon>
        </Group>
      )}
      {mode === "range" && (
        <DatePickerInput
          type="range"
          allowSingleDateInRange
          label={t("som.filterRange")}
          placeholder={t("som.filterRangeHint")}
          size="sm"
          value={range}
          onChange={changeRange}
          valueFormat="D MMM YYYY"
          maxDate={dayjs().format("YYYY-MM-DD")}
          popoverProps={{ withinPortal: true }}
          className="min-w-60"
        />
      )}
    </Group>
  );
}
