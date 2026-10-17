"use client";

import dayjs from "dayjs";
import { ActionIcon, Group, MultiSelect } from "@mantine/core";
import { MonthPickerInput } from "@mantine/dates";
import { ChevronLeft, ChevronRight, Tag } from "lucide-react";
import { useBadges } from "@/hooks/scheduler";
import { useI18n } from "@/lib/i18n";
import type { SomQuery } from "@/types/app/som";

/**
 * The SOM dashboard's page-level filters (client, 2026-10-17): badge (branch) values + one month, sitting together
 * at the top. They drive every section except Today, which is locked to today. The badge picker is the same
 * grouped multi-select the calendar uses (one group per badge type, active values only); empty = all branches.
 * Future months are not selectable — there is nothing to report yet.
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

  const badgeData = badgeTypes
    .filter((bt) => bt.active)
    .map((bt) => ({
      group: bt.name,
      items: bt.values
        .filter((v) => v.active)
        .map((v) => ({ value: v.id, label: v.label })),
    }))
    .filter((g) => g.items.length > 0);

  const current = dayjs().format("YYYY-MM");
  const month = dayjs(`${value.month}-01`);
  const setMonth = (m: string) => onChange({ ...value, month: m });

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
      <Group gap={4} align="flex-end" wrap="nowrap">
        <ActionIcon
          variant="default"
          size={36}
          onClick={() => setMonth(month.subtract(1, "month").format("YYYY-MM"))}
          aria-label={t("som.prevMonth")}
        >
          <ChevronLeft size={16} />
        </ActionIcon>
        <MonthPickerInput
          label={t("som.filterMonth")}
          size="sm"
          value={`${value.month}-01`}
          onChange={(d) => d && setMonth(dayjs(d).format("YYYY-MM"))}
          valueFormat="MMM YYYY"
          maxDate={dayjs().endOf("month").format("YYYY-MM-DD")}
          popoverProps={{ withinPortal: true }}
          className="w-36"
        />
        <ActionIcon
          variant="default"
          size={36}
          disabled={value.month >= current}
          onClick={() => setMonth(month.add(1, "month").format("YYYY-MM"))}
          aria-label={t("som.nextMonth")}
        >
          <ChevronRight size={16} />
        </ActionIcon>
      </Group>
    </Group>
  );
}
