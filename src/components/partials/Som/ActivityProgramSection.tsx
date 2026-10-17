"use client";

import { Card, Group, SimpleGrid, Stack, Table, Text } from "@mantine/core";
import { DonutChart } from "@mantine/charts";
import { useI18n } from "@/lib/i18n";
import { SOM_UNKNOWN_KEY, type ActivityProgram, type Breakdown } from "@/types/app/som";

// Same calm palette the Overview activity donut uses; unknown is always gray. A category keeps its color in
// all three donuts and the table (color follows the row, not the slice) — so the table doubles as the legend.
const PALETTE = ["blue", "teal", "grape", "orange", "cyan", "indigo", "lime", "pink"];

interface Row {
  key: string;
  label: string;
  color: string;
  course?: number;
  voucher?: number;
  singleSession?: number;
  typeTotal?: number;
  firstTrial?: number;
  total?: number;
}

/**
 * Activity / Program — active classes by category (Surfskate, Inline skate, Bike, Balance Play, Other…):
 * three donuts (Type = Course + Voucher + 1 HR · 1st Trial · Total = Type + 1st Trial), then a compact
 * table whose Type cell spells out its Course / Voucher / 1 HR parts.
 * Until the API ships `activityProgram`, the live `sportShare` feeds the Total donut + column; every other
 * figure is "—" and the Type / 1st Trial donuts show "No data yet".
 */
export function ActivityProgramSection({ data, legacy }: { data?: ActivityProgram; legacy: Breakdown }) {
  const { t } = useI18n();

  const labelOf = (key: string, label?: string | null) => (key === SOM_UNKNOWN_KEY ? t("som.unknown") : label || key);
  const colorOf = (key: string, i: number) => (key === SOM_UNKNOWN_KEY ? "gray.4" : `${PALETTE[i % PALETTE.length]}.6`);
  const colorVar = (c: string) => `var(--mantine-color-${c.replace(".", "-")})`;

  const rows: Row[] = data
    ? data.categories.map((c, i) => ({ ...c, label: labelOf(c.key, c.label), color: colorOf(c.key, i) }))
    : legacy.buckets.map((b, i) => ({ key: b.key, label: labelOf(b.key, b.label), color: colorOf(b.key, i), total: b.count }));

  const num = (v?: number) => (v === undefined ? t("common.none") : v);

  return (
    <Card withBorder padding="md">
      <Text size="xs" c="dimmed">
        {t("som.activityHint")}
      </Text>

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm" my="md">
        <CategoryDonut title={t("som.actCol.type")} subtitle={t("som.activityTypeHint")} pick={(r) => r.typeTotal} />
        <CategoryDonut title={t("som.actCol.firstTrial")} subtitle={t("som.activityTrialHint")} pick={(r) => r.firstTrial} />
        <CategoryDonut title={t("som.actCol.total")} subtitle={t("som.activityTotalHint")} pick={(r) => r.total} />
      </SimpleGrid>

      {/* Per-category table — also the legend for the donuts above */}
      <Table.ScrollContainer type="native" minWidth={480}>
        <Table verticalSpacing="xs" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("som.actCol.category")}</Table.Th>
              <Table.Th ta="right">
                {t("som.actCol.type")}
                <Text component="span" size="xs" c="dimmed" fw={400} className="block">
                  {t("som.activityTypeHint")}
                </Text>
              </Table.Th>
              <Table.Th ta="right">{t("som.actCol.firstTrial")}</Table.Th>
              <Table.Th ta="right">{t("som.actCol.total")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text size="sm" c="dimmed" ta="center">
                    {t("som.noData")}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              rows.map((r) => (
                <Table.Tr key={r.key}>
                  <Table.Td className={r.key === SOM_UNKNOWN_KEY ? "align-top text-muted-400" : "align-top font-medium"}>
                    <Group gap={8} wrap="nowrap">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorVar(r.color) }} />
                      {r.label}
                    </Group>
                  </Table.Td>
                  <Table.Td ta="right" className="align-top tabular-nums">
                    {num(r.typeTotal)}
                    {r.typeTotal !== undefined && (
                      <Text component="span" size="xs" c="dimmed" className="block whitespace-nowrap">
                        {t("som.activityTypeParts", {
                          course: num(r.course),
                          voucher: num(r.voucher),
                          single: num(r.singleSession),
                        })}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td ta="right" className="align-top tabular-nums">
                    {num(r.firstTrial)}
                  </Table.Td>
                  <Table.Td ta="right" className="align-top font-semibold tabular-nums">
                    {num(r.total)}
                  </Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Card>
  );

  function CategoryDonut({
    title,
    subtitle,
    pick,
  }: {
    title: string;
    subtitle: string;
    pick: (r: Row) => number | undefined;
  }) {
    const slices = rows
      .map((r) => ({ name: r.label, value: pick(r) ?? 0, color: r.color }))
      .filter((s) => s.value > 0);
    const sliceTotal = slices.reduce((s, x) => s + x.value, 0);
    return (
      <Stack gap="xs" align="center" className="rounded-md bg-muted-50 p-3">
        {sliceTotal === 0 ? (
          <div className="flex h-[120px] w-[120px] items-center justify-center rounded-full border-[18px] border-muted-100">
            <Text size="xs" c="dimmed" ta="center">
              {t("som.noData")}
            </Text>
          </div>
        ) : (
          <DonutChart
            data={slices}
            size={120}
            thickness={18}
            withTooltip
            tooltipDataSource="segment"
            chartLabel={String(sliceTotal)}
          />
        )}
        <div className="text-center">
          <Text fw={600} size="sm">
            {title}
          </Text>
          <Text size="xs" c="dimmed">
            {subtitle}
          </Text>
        </div>
      </Stack>
    );
  }
}
