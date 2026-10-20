"use client";

import { useState, type ReactNode } from "react";
import {
  Card,
  Group,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { ChartTip } from "./ChartTip";
import {
  SOM_UNKNOWN_KEY,
  type Breakdown,
  type BreakdownBucket,
  type SomReport,
} from "@/types/app/som";

const EMPTY: Breakdown = { buckets: [], known: 0, unknown: 0, total: 0 };
/** Ranked lists (nationality, address) show this many rows before "Show all". */
const TOP_N = 5;
const GENDER_COLOR: Record<string, string> = {
  female: "grape.5",
  male: "teal.5",
  other: "gray.5",
};
const colorVar = (c: string) => `var(--mantine-color-${c.replace(".", "-")})`;

/**
 * Demographics — one chart per kind of data (client pick, 2026-10-17):
 * Gender = one 100% bar · Age = vertical columns over the fixed 1-2 … 55+ ladder · Nationality and
 * Address (Province / District toggle) = ranked bars, top 5 + "Show all". "Not specified" is never a bar —
 * it sits in the coverage line so the bars compare known values only. Renders the API's buckets as-is.
 */
export function DemographicsSection({
  demo,
}: {
  demo: SomReport["demographics"];
}) {
  const { t } = useI18n();
  const [addrView, setAddrView] = useState<"province" | "district">("province");

  const known = (d: Breakdown) =>
    d.buckets.filter((b) => b.key !== SOM_UNKNOWN_KEY);
  const pct = (n: number, d: Breakdown) =>
    d.known > 0 ? Math.round((n / d.known) * 100) : 0;
  const label = (b: BreakdownBucket) => {
    if (b.label) return b.label;
    if (b.key === "male") return t("som.genderMale");
    if (b.key === "female") return t("som.genderFemale");
    if (b.key === "other") return t("som.genderOther");
    return b.key;
  };

  const tip = (name: string, n: number, p: number) =>
    t("som.chartTip", { name, n, pct: p });

  const address =
    addrView === "district" ? (demo.district ?? EMPTY) : demo.province;

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
      {/* Gender — one 100% bar */}
      <Panel title={t("som.genderTitle")} data={demo.gender}>
        {(() => {
          const rows = known(demo.gender).filter((b) => b.count > 0);
          return (
            <>
              <div className="flex h-3.5 overflow-hidden rounded bg-muted-100">
                {rows.map((b) => (
                  <ChartTip
                    key={b.key}
                    label={tip(label(b), b.count, pct(b.count, demo.gender))}
                  >
                    <div
                      style={{
                        width: `${pct(b.count, demo.gender)}%`,
                        backgroundColor: colorVar(
                          GENDER_COLOR[b.key] ?? "blue.5",
                        ),
                      }}
                    />
                  </ChartTip>
                ))}
              </div>
              <Group gap="md" mt="xs">
                {rows.map((b) => (
                  <Group key={b.key} gap={6} wrap="nowrap">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{
                        backgroundColor: colorVar(
                          GENDER_COLOR[b.key] ?? "blue.5",
                        ),
                      }}
                    />
                    <Text size="xs">
                      {label(b)}{" "}
                      <span className="tabular-nums text-muted-500">
                        {b.count} · {pct(b.count, demo.gender)}%
                      </span>
                    </Text>
                  </Group>
                ))}
              </Group>
            </>
          );
        })()}
      </Panel>

      {/* Nationality — ranked bars */}
      <Panel title={t("som.nationalityTitle")} data={demo.nationality}>
        <RankedBars data={demo.nationality} />
      </Panel>

      {/* Age — vertical columns, every band kept (0 included) so the ladder reads in order */}
      <Panel title={t("som.ageBandTitle")} data={demo.ageBand} wide>
        {(() => {
          const rows = known(demo.ageBand);
          const max = Math.max(1, ...rows.map((b) => b.count));
          return (
            <div className="overflow-x-auto">
              <div
                className="flex min-w-[420px] items-end gap-2"
                style={{ height: 120 }}
              >
                {rows.map((b) => (
                  // The whole column is the hover target, so a short (or 0) bar is still easy to hit.
                  <ChartTip
                    key={b.key}
                    label={tip(label(b), b.count, pct(b.count, demo.ageBand))}
                  >
                    <div className="flex h-full flex-1 cursor-default flex-col items-center justify-end gap-1 rounded hover:bg-muted-50">
                      <Text size="xs" c="dimmed" className="tabular-nums">
                        {b.count}
                      </Text>
                      <div
                        className="w-full rounded-t"
                        style={{
                          height: `${(b.count / max) * 90}px`,
                          minHeight: b.count > 0 ? 2 : 0,
                          backgroundColor: colorVar("blue.5"),
                        }}
                      />
                    </div>
                  </ChartTip>
                ))}
              </div>
              <div className="mt-1 flex min-w-[420px] gap-2 border-t border-muted-200 pt-1">
                {rows.map((b) => (
                  <Text
                    key={b.key}
                    size="xs"
                    c="dimmed"
                    ta="center"
                    className="flex-1 whitespace-nowrap"
                  >
                    {label(b)}
                  </Text>
                ))}
              </div>
            </div>
          );
        })()}
      </Panel>

      {/* Address — Province / District toggle, ranked bars; a district row expands to its แขวง/ตำบล. */}
      <Panel
        title={t("som.addressTitle")}
        data={address}
        wide
        headerRight={
          <SegmentedControl
            size="xs"
            value={addrView}
            onChange={(v) => setAddrView(v as "province" | "district")}
            data={[
              { value: "province", label: t("som.provinceTitle") },
              { value: "district", label: t("som.districtTitle") },
            ]}
          />
        }
      >
        <RankedBars
          key={addrView}
          data={address}
          drill={
            addrView === "district" ? demo.subdistrictByDistrict : undefined
          }
        />
      </Panel>
    </SimpleGrid>
  );
}

// Module-level so children (RankedBars' state) aren't remounted on every parent render.
function Panel({
  title,
  data,
  wide,
  headerRight,
  children,
}: {
  title: string;
  data: Breakdown;
  wide?: boolean;
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Card
      withBorder
      padding="md"
      className={wide ? "md:col-span-2" : undefined}
    >
      <Group justify="space-between" gap="xs" mb="sm" align="flex-start">
        <div>
          <Text fw={600} size="sm">
            {title}
          </Text>
          <Text size="xs" c="dimmed">
            {t("som.coverage", { known: data.known, total: data.total })}
            {data.unknown > 0 &&
              ` · ${t("som.unknownCount", { n: data.unknown })}`}
          </Text>
        </div>
        {headerRight}
      </Group>
      {data.known === 0 ? (
        <Text size="sm" c="dimmed">
          {t("som.noData")}
        </Text>
      ) : (
        children
      )}
    </Card>
  );
}

// Module-level (not nested) so its own "Show all" / expanded state survives the parent re-rendering.
// `drill` (District only): sub-breakdowns keyed by the row's key — a row that has one gets a chevron and expands
// in place to its sub-areas (แขวง/ตำบล); several rows can be open at once. A row missing from `drill` has no data.
function RankedBars({
  data,
  drill,
}: {
  data: Breakdown;
  drill?: Record<string, Breakdown>;
}) {
  const { t } = useI18n();
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const rows = data.buckets.filter(
    (b) => b.key !== SOM_UNKNOWN_KEY && b.count > 0,
  );
  const shown = all ? rows : rows.slice(0, TOP_N);
  const max = Math.max(1, ...rows.map((b) => b.count));
  const toggle = (key: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Stack gap={6}>
      {shown.map((b) => {
        const p = data.known > 0 ? Math.round((b.count / data.known) * 100) : 0;
        const sub = drill?.[b.key];
        const expanded = !!sub && open.has(b.key);
        const tip = t("som.chartTip", {
          name: b.label || b.key,
          n: b.count,
          pct: p,
        });
        const cols = drill
          ? "grid-cols-[1rem_minmax(0,9rem)_minmax(0,1fr)_auto]"
          : "grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto]";
        const rowBody = (
          <>
            {drill && (
              <span className="flex justify-center text-muted-400">
                {sub &&
                  (expanded ? (
                    <ChevronDown size={14} aria-hidden />
                  ) : (
                    <ChevronRight size={14} aria-hidden />
                  ))}
              </span>
            )}
            <Text size="sm">{b.label || b.key}</Text>
            <Bar value={b.count} max={max} color="blue.5" />
            <Text size="xs" c="dimmed" className="w-16 text-right tabular-nums">
              {b.count} · {p}%
            </Text>
          </>
        );
        return (
          <div key={b.key}>
            <ChartTip label={tip}>
              {sub ? (
                <UnstyledButton
                  onClick={() => toggle(b.key)}
                  aria-expanded={expanded}
                  className={`grid w-full ${cols} items-center gap-3 rounded text-left hover:bg-muted-50`}
                >
                  {rowBody}
                </UnstyledButton>
              ) : (
                <div
                  className={`grid cursor-default ${cols} items-center gap-3 rounded hover:bg-muted-50`}
                >
                  {rowBody}
                </div>
              )}
            </ChartTip>
            {expanded && sub && <SubRows data={sub} />}
          </div>
        );
      })}
      {rows.length > TOP_N && (
        <UnstyledButton
          onClick={() => setAll((v) => !v)}
          className="self-start text-xs text-primary"
        >
          {all ? t("som.showLess") : t("som.showAll", { n: rows.length })}
        </UnstyledButton>
      )}
    </Stack>
  );
}

// One district's sub-areas, indented under its row. Every sub-area is shown (the API sends them all, largest
// first); "Not specified" is shown dimmed when it has anyone. % = share of the district's own total.
function SubRows({ data }: { data: Breakdown }) {
  const { t } = useI18n();
  const rows = data.buckets.filter((b) => b.count > 0);
  const max = Math.max(1, ...rows.map((b) => b.count));
  if (rows.length === 0) {
    return (
      <Text size="xs" c="dimmed" className="mb-1 ml-7 mt-1">
        {t("som.noData")}
      </Text>
    );
  }
  return (
    <Stack gap={4} className="mb-2 ml-7 mt-1 border-l border-muted-200 pl-3">
      {rows.map((b) => {
        const unknown = b.key === SOM_UNKNOWN_KEY;
        const name = unknown ? t("som.unknown") : b.label || b.key;
        const p = data.total > 0 ? Math.round((b.count / data.total) * 100) : 0;
        return (
          <ChartTip
            key={b.key}
            label={t("som.chartTip", { name, n: b.count, pct: p })}
          >
            <div className="grid cursor-default grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto] items-center gap-3 rounded hover:bg-muted-50">
              <Text size="xs" c={unknown ? "dimmed" : undefined}>
                {name}
              </Text>
              <Bar
                value={b.count}
                max={max}
                color={unknown ? "gray.4" : "blue.3"}
                thin
              />
              <Text
                size="xs"
                c="dimmed"
                className="w-16 text-right tabular-nums"
              >
                {b.count} · {p}%
              </Text>
            </div>
          </ChartTip>
        );
      })}
    </Stack>
  );
}

function Bar({
  value,
  max,
  color,
  thin,
}: {
  value: number;
  max: number;
  color: string;
  thin?: boolean;
}) {
  return (
    <div
      className={`${thin ? "h-1.5" : "h-2"} overflow-hidden rounded bg-muted-100`}
    >
      <div
        className="h-full rounded"
        style={{
          width: `${(value / max) * 100}%`,
          backgroundColor: colorVar(color),
        }}
      />
    </div>
  );
}
