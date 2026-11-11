"use client";

import { Card, Group, SimpleGrid, Stack, Text } from "@mantine/core";
import { DonutChart } from "@mantine/charts";
import { useI18n } from "@/lib/i18n";
import {
  SOM_UNKNOWN_KEY,
  type ActivityPackage,
  type ActivityPackages,
} from "@/types/app/som";

/**
 * Activity chart (ขวัญ, backend spec 2026-11-11): one pie per activity — active courses by package size and the
 * 1 HR children of the last 3 months, vouchers excluded — with the activity's 1st Trials shown on their own,
 * outside the pie and outside its total. Every active activity is listed (0 included), so each card keeps its place.
 * A slice's colour follows its package, never its position: courses share one hue, darker the bigger the
 * package; 1 HR has its own. Renders the API's numbers as-is.
 */
export function ActivityPackagesSection({ data }: { data: ActivityPackages }) {
  const { t } = useI18n();

  const pkgLabel = (p: ActivityPackage) =>
    p.kind === "COURSE"
      ? t("som.pkgCourse", { size: p.size })
      : t("som.pkgSingle");
  const pkgColor = (p: ActivityPackage) => {
    if (p.kind === "SINGLE_SESSION") return "teal.6";
    if (p.size >= 10) return "indigo.8";
    if (p.size >= 6) return "indigo.6";
    return "indigo.4";
  };
  const colorVar = (c: string) => `var(--mantine-color-${c.replace(".", "-")})`;

  if (data.activities.length === 0) {
    return (
      <Card withBorder padding="md">
        <Text size="sm" c="dimmed">
          {t("som.noData")}
        </Text>
      </Card>
    );
  }

  return (
    <Stack gap="xs">
      <Text size="xs" c="gray.7">
        {t("som.pkgHint")}
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
        {data.activities.map((a) => {
          const slices = a.packages
            .filter((p) => p.count > 0)
            .map((p) => ({
              name: pkgLabel(p),
              value: p.count,
              color: pkgColor(p),
            }));
          const name =
            a.key === SOM_UNKNOWN_KEY ? t("som.unknown") : a.label || a.key;
          return (
            <Card key={a.key} withBorder padding="md">
              <Text fw={600} size="sm" mb="xs">
                {name}
              </Text>
              <Group gap="md" wrap="nowrap" align="center">
                {a.total > 0 ? (
                  <DonutChart
                    data={slices}
                    size={110}
                    thickness={16}
                    withTooltip
                    tooltipDataSource="segment"
                    chartLabel={String(a.total)}
                    className="shrink-0"
                  />
                ) : (
                  <div className="flex h-[110px] w-[110px] shrink-0 items-center justify-center rounded-full border-[16px] border-muted-100">
                    <Text size="sm" c="dimmed">
                      0
                    </Text>
                  </div>
                )}
                <Stack gap={4} className="min-w-0 grow">
                  {a.packages.map((p) => (
                    <Group
                      key={p.kind === "COURSE" ? `c${p.size}` : "single"}
                      justify="space-between"
                      gap="xs"
                      wrap="nowrap"
                    >
                      <Group gap={6} wrap="nowrap" className="min-w-0">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: colorVar(pkgColor(p)) }}
                        />
                        <Text size="xs">{pkgLabel(p)}</Text>
                      </Group>
                      <Text
                        size="xs"
                        fw={600}
                        className="shrink-0 tabular-nums"
                      >
                        {p.count}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              </Group>
              {/* 1st Trial sits apart from the pie — it is not one of the activity's packages, nor in its total. */}
              <Group
                justify="space-between"
                mt="sm"
                pt="xs"
                className="border-t border-muted-200"
              >
                <Text size="xs" c="dimmed">
                  {t("som.pkgFirstTrial")}
                </Text>
                <Text size="xs" fw={600} className="tabular-nums">
                  {a.firstTrial}
                </Text>
              </Group>
            </Card>
          );
        })}
      </SimpleGrid>
    </Stack>
  );
}
