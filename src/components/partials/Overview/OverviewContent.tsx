"use client";

import { useMemo, useState, type ReactNode } from "react";
import dayjs from "dayjs";
import "dayjs/locale/th";
import {
  Card,
  Group,
  Pagination,
  Progress,
  RingProgress,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { AreaChart, DonutChart, Sparkline } from "@mantine/charts";
import {
  Users,
  CheckCircle2,
  Bell,
  Clock,
  CalendarOff,
  Ban,
  TrendingUp,
  Coins,
  UserPlus,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { TeacherTypeChip } from "@/components/common/BookingBadges";
import { badgeColorVar } from "@/lib/ui/badge-colors";
import { MANTINE_COLOR } from "@/lib/ui/colors";
import { useI18n } from "@/lib/i18n";
import { useOverview } from "@/hooks/scheduler";
import { SOM_UNKNOWN_KEY, type Breakdown, type BreakdownBucket } from "@/types/app/som";
import type { OverviewScope, ScopePreset, TrendPoint, NewCustomerFunnel, CustomerSpend } from "@/types/app/overview";
import type { BookingType } from "@/types/app/scheduler";

// Resolve a preset (or custom range) into concrete inclusive from/to dates.
function resolveScope(preset: ScopePreset, from: string, to: string): OverviewScope {
  const today = dayjs();
  switch (preset) {
    case "today":
      return { preset, from: today.format("YYYY-MM-DD"), to: today.format("YYYY-MM-DD") };
    case "week":
      return { preset, from: today.startOf("week").format("YYYY-MM-DD"), to: today.endOf("week").format("YYYY-MM-DD") };
    case "month":
      return { preset, from: today.startOf("month").format("YYYY-MM-DD"), to: today.endOf("month").format("YYYY-MM-DD") };
    default:
      return { preset, from, to };
  }
}

const BOOKING_TYPE_COLOR: Record<BookingType, string> = {
  FIRST_TRIAL: "orange",
  SINGLE_SESSION: "gray",
  COURSE_PACKAGE: "blue",
  VOUCHER: "grape",
};

const ACTIVITY_PALETTE = ["blue", "teal", "grape", "orange", "cyan", "gray"];

export default function OverviewContent() {
  const { t, lang } = useI18n();
  const today = dayjs().format("YYYY-MM-DD");
  const [preset, setPreset] = useState<ScopePreset>("today");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const scope = useMemo(() => resolveScope(preset, from, to), [preset, from, to]);
  const { data } = useOverview(scope);
  const { pulse, operations: ops, business: biz, revenue: rev } = data;

  const fmtDateTime = (iso: string) =>
    dayjs(iso).locale(lang).format(lang === "th" ? "D MMM HH:mm น." : "D MMM YYYY, HH:mm");

  const rateColor = pulse.attendanceRate >= 80 ? "green" : pulse.attendanceRate >= 50 ? "orange" : "red";

  const statusDonut = [
    { name: t("bookingStatus.ATTENDED"), value: pulse.attended, color: "green.6" },
    { name: t("bookingStatus.CONFIRMED"), value: pulse.confirmed, color: "blue.6" },
    { name: t("bookingStatus.PENDING"), value: pulse.pending, color: "orange.6" },
    { name: t("bookingStatus.SICK_LEAVE"), value: pulse.onLeave, color: "gray.5" },
    { name: t("bookingStatus.CANCELLED"), value: pulse.cancelled, color: "red.6" },
  ].filter((s) => s.value > 0);

  const kpis: { label: string; value: number; icon: LucideIcon; color: string; series?: number[] }[] = [
    { label: t("reports.statTotalBooked"), value: pulse.totalBooked, icon: Users, color: "blue", series: pulse.trend.map((d) => d.booked) },
    { label: t("reports.statAttended"), value: pulse.attended, icon: CheckCircle2, color: "green", series: pulse.trend.map((d) => d.attended) },
    { label: t("reports.statConfirmed"), value: pulse.confirmed, icon: Bell, color: "cyan" },
    { label: t("reports.statPending"), value: pulse.pending, icon: Clock, color: "orange" },
    { label: t("reports.statOnLeave"), value: pulse.onLeave, icon: CalendarOff, color: "gray" },
    { label: t("reports.statCancelled"), value: pulse.cancelled, icon: Ban, color: "red" },
  ];

  const typeDonut = ops.byBookingType.map((b) => ({
    name: t(`bookingType.${b.type}`),
    value: b.count,
    color: `${BOOKING_TYPE_COLOR[b.type]}.6`,
  }));

  const activityDonut = biz.activityShare.buckets
    .filter((b) => b.count > 0 && b.key !== SOM_UNKNOWN_KEY)
    .map((b, i) => ({ name: b.label ?? b.key, value: b.count, color: `${ACTIVITY_PALETTE[i % ACTIVITY_PALETTE.length]}.6` }));

  const COURSE_SIZE_COLOR = ["blue", "teal", "grape", "orange"];
  const courseSizeDonut = biz.courseSizeSplit
    .filter((c) => c.count > 0)
    .map((c, i) => ({ name: `${c.size} ${t("overview.hoursUnit")}`, value: c.count, color: `${COURSE_SIZE_COLOR[i % COURSE_SIZE_COLOR.length]}.6` }));

  const funnel = biz.newCustomers;

  const genderDonut = biz.demographics.gender.buckets
    .filter((b) => b.count > 0)
    .map((b) => ({
      name: genderLabel(b.key),
      value: b.count,
      color: b.key === "male" ? "blue.6" : b.key === "female" ? "pink.6" : "gray.5",
    }));

  function genderLabel(key: string) {
    if (key === SOM_UNKNOWN_KEY) return t("som.unknown");
    if (key === "male") return t("som.genderMale");
    if (key === "female") return t("som.genderFemale");
    if (key === "other") return t("som.genderOther");
    return key;
  }

  const maxTeacher = ops.byTeacher.reduce((m, x) => Math.max(m, x.count), 0) || 1;
  const maxBadge = ops.byBadge.reduce((m, x) => Math.max(m, x.count), 0) || 1;

  return (
    <Stack gap="xl">
      {/* ── Header + time scope ─────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("overview.title")}</h1>
          <p className="text-sm text-default-500">{t("overview.subtitle")}</p>
          <p className="mt-0.5 text-xs text-default-400">
            {t("overview.scopeRange", {
              from: dayjs(scope.from).locale(lang).format("D MMM"),
              to: dayjs(scope.to).locale(lang).format("D MMM YYYY"),
            })}{" "}
            · {t("overview.generatedAt", { time: fmtDateTime(data.generatedAt) })}
          </p>
        </div>
        <Group gap="sm" align="flex-end">
          <SegmentedControl
            value={preset}
            onChange={(v) => setPreset(v as ScopePreset)}
            size="sm"
            data={[
              { label: t("overview.today"), value: "today" },
              { label: t("overview.thisWeek"), value: "week" },
              { label: t("overview.thisMonth"), value: "month" },
              { label: t("overview.custom"), value: "custom" },
            ]}
          />
          {preset === "custom" && (
            <Group gap="xs">
              <DatePickerInput
                aria-label={t("dashboard.from")}
                value={from}
                onChange={(v) => v && setFrom(v)}
                valueFormat="D MMM YYYY"
                size="sm"
                popoverProps={{ withinPortal: true }}
              />
              <DatePickerInput
                aria-label={t("dashboard.to")}
                value={to}
                onChange={(v) => v && setTo(v)}
                valueFormat="D MMM YYYY"
                size="sm"
                popoverProps={{ withinPortal: true }}
              />
            </Group>
          )}
        </Group>
      </div>

      {/* ══ Zone 1 · Pulse ═══════════════════════════════════ */}
      <section className="space-y-4">
        <ZoneHeading icon={TrendingUp} title={t("overview.zonePulse")} hint={t("overview.zonePulseHint")} />

        <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
          <Card withBorder radius="lg" padding="lg" className="flex items-center justify-center">
            <RingProgress
              size={168}
              thickness={13}
              roundCaps
              sections={[{ value: pulse.attendanceRate, color: rateColor }]}
              label={
                <div className="text-center">
                  <Text fz={32} fw={700} lh={1}>
                    {pulse.attendanceRate}%
                  </Text>
                  <Text size="xs" c="dimmed">
                    {t("reports.attendanceRate")}
                  </Text>
                  <Text size="xs" c="dimmed" className="font-num">
                    {pulse.attended}/{pulse.totalBooked}
                  </Text>
                </div>
              }
            />
          </Card>

          <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
            {kpis.map((k) => {
              const Icon = k.icon;
              return (
                <Card key={k.label} withBorder radius="lg" padding="md">
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <div className="min-w-0">
                      <p className="text-2xl font-bold leading-none tracking-tight tabular-nums">{k.value}</p>
                      <p className="mt-1 truncate text-xs text-default-400">{k.label}</p>
                    </div>
                    <ThemeIcon variant="light" color={k.color} size={36} radius="md">
                      <Icon size={18} />
                    </ThemeIcon>
                  </Group>
                  {k.series && k.series.length > 1 && (
                    <Sparkline
                      className="mt-2"
                      h={28}
                      data={k.series}
                      color={k.color}
                      fillOpacity={0.25}
                      strokeWidth={1.5}
                      curveType="monotone"
                    />
                  )}
                </Card>
              );
            })}
          </SimpleGrid>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Trend (multi-day scope only) */}
          {pulse.trend.length > 1 ? (
            <Card withBorder radius="lg" padding="lg">
              <Text size="sm" fw={600} mb="md">
                {t("overview.trendTitle")}
              </Text>
              <AreaChart
                h={220}
                data={pulse.trend.map((d: TrendPoint) => ({
                  date: dayjs(d.date).locale(lang).format("D MMM"),
                  [t("overview.trendBooked")]: d.booked,
                  [t("overview.trendAttended")]: d.attended,
                }))}
                dataKey="date"
                withDots={false}
                curveType="monotone"
                series={[
                  { name: t("overview.trendBooked"), color: "blue.5" },
                  { name: t("overview.trendAttended"), color: "green.5" },
                ]}
              />
            </Card>
          ) : (
            <DonutCard title={t("overview.statusTitle")} data={statusDonut} t={t} />
          )}

          {pulse.trend.length > 1 ? (
            <DonutCard title={t("overview.statusTitle")} data={statusDonut} t={t} />
          ) : (
            <DonutCard title={t("reports.byType")} data={typeDonut} unit={t("overview.unitSessions")} t={t} />
          )}
        </div>
      </section>

      {/* ══ Zone 2 · Operations ══════════════════════════════ */}
      <section className="space-y-4">
        <ZoneHeading icon={Users} title={t("overview.zoneOps")} hint={t("overview.zoneOpsHint")} />

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Teacher workload */}
          <Card withBorder radius="lg" padding="lg">
            <Text size="sm" fw={600} mb="md">
              {t("reports.workload")}
            </Text>
            {ops.byTeacher.length === 0 ? (
              <Text size="sm" c="dimmed">
                {t("reports.noSessions")}
              </Text>
            ) : (
              <Stack gap="sm">
                {ops.byTeacher.map((tc) => (
                  <div key={tc.teacherId} className="flex items-center gap-3">
                    <div className="flex w-36 shrink-0 items-center gap-2">
                      <span className="truncate text-sm font-medium">{tc.nickname}</span>
                      <TeacherTypeChip type={tc.type} />
                    </div>
                    <div className="min-w-0 grow">
                      <div
                        className="h-5 rounded"
                        style={{ width: `${Math.max(6, (tc.count / maxTeacher) * 100)}%`, backgroundColor: badgeColorVar("blue") }}
                      />
                    </div>
                    <span className="w-20 shrink-0 text-right text-xs text-default-500">
                      {t("reports.sessionsAttended", { count: tc.count, attended: tc.attended })}
                    </span>
                  </div>
                ))}
              </Stack>
            )}
          </Card>

          {/* Booking type mix on multi-day; badge distribution on single-day (trend takes zone-1 donut slot) */}
          {pulse.trend.length > 1 ? (
            <DonutCard title={t("reports.byType")} data={typeDonut} unit={t("overview.unitSessions")} t={t} />
          ) : (
            <Card withBorder radius="lg" padding="lg">
              <Text size="sm" fw={600} mb="md">
                {t("overview.branchTitle")}
              </Text>
              <BadgeBars badges={ops.byBadge} max={maxBadge} empty={t("dashboard.noData")} unit={t("overview.unitSessions")} />
            </Card>
          )}
        </div>

        {/* Badge distribution — full width when the compact slot is taken by booking-type */}
        {pulse.trend.length > 1 && (
          <Card withBorder radius="lg" padding="lg">
            <Text size="sm" fw={600} mb="md">
              {t("overview.branchTitle")}
            </Text>
            <BadgeBars badges={ops.byBadge} max={maxBadge} empty={t("dashboard.noData")} unit={t("overview.unitSessions")} />
          </Card>
        )}
      </section>

      {/* ══ Zone 3 · Business & Market ═══════════════════════ */}
      <section className="space-y-4">
        <ZoneHeading icon={TrendingUp} title={t("overview.zoneBiz")} hint={t("overview.zoneBizHint")} />

        {/* Existing customers */}
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
          <Stat label={t("som.byCourse")} value={biz.existingCustomers.byCourse} />
          <Stat label={t("som.byVoucher")} value={biz.existingCustomers.byVoucher} />
          <Stat label={t("som.byRecentTrial")} value={biz.existingCustomers.byRecentTrial} />
          <Stat label={t("som.totalCustomers")} value={biz.existingCustomers.total} accent />
        </SimpleGrid>

        {/* Structure of the existing base */}
        <div className="grid gap-4 lg:grid-cols-3">
          <DonutCard title={t("overview.courseSizeTitle")} data={courseSizeDonut} t={t} />
          <DonutCard title={t("overview.activityShareTitle")} data={activityDonut} t={t} />
          <DonutCard title={t("som.genderTitle")} data={genderDonut} t={t} />
        </div>

        {/* New-customer funnel this month → conversion → activity of the course bought */}
        <div className="grid gap-4 lg:grid-cols-2">
          <NewCustomerFunnelCard funnel={funnel} t={t} />
          <BreakdownCard title={t("overview.newCourseByActivityTitle")} data={biz.newCourseByActivity} t={t} labelOf={(b) => b.label ?? b.key} unknown={t("som.unknown")} />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <BreakdownCard title={t("som.ageBandTitle")} data={biz.demographics.ageBand} t={t} labelOf={(b) => b.label ?? b.key} unknown={t("som.unknown")} />
          <BreakdownCard title={t("som.provinceTitle")} data={biz.demographics.province} t={t} labelOf={(b) => b.label ?? b.key} unknown={t("som.unknown")} />
          <BreakdownCard title={t("som.nationalityTitle")} data={biz.demographics.nationality} t={t} labelOf={(b) => b.label ?? b.key} unknown={t("som.unknown")} />
        </div>
      </section>

      {/* ══ Zone 4 · Revenue & value ═════════════════════════ */}
      <section className="space-y-4">
        <ZoneHeading icon={Coins} title={t("overview.zoneRevenue")} hint={t("overview.zoneRevenueHint")} />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,220px)_1fr]">
          <Card withBorder radius="lg" padding="lg" className="flex flex-col justify-center">
            <Text size="xs" c="dimmed">
              {t("overview.totalRevenue")}
            </Text>
            <Text fw={700} fz={30} lh={1.1} className="font-num">
              {fmtBaht(rev.total)}
            </Text>
            <Text size="xs" c="dimmed" className="mt-1">
              {t("overview.scopeRange", {
                from: dayjs(scope.from).locale(lang).format("D MMM"),
                to: dayjs(scope.to).locale(lang).format("D MMM"),
              })}
            </Text>
          </Card>
          <MoneyBars title={t("overview.salesByCategory")} rows={rev.byCategory.map((c) => ({ key: c.key, label: c.label, value: c.revenue }))} t={t} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <MoneyBars title={t("overview.salesByActivity")} rows={rev.byActivity.map((a) => ({ key: a.key, label: a.label, value: a.revenue }))} t={t} />
          <MoneyBars
            title={t("overview.avgPerCourseTitle")}
            rows={rev.byActivity.map((a) => ({ key: a.key, label: a.label, value: a.avgPerCourse }))}
            color="teal"
            t={t}
          />
        </div>

        <TopCustomersTable rows={rev.topCustomers} t={t} />
      </section>
    </Stack>
  );
}

// ───────────────────────────── sub-components ─────────────────────────────

function ZoneHeading({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint: string }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-default-200 pb-2">
      <ThemeIcon variant="transparent" color="gray" size={22} className="shrink-0">
        <Icon size={18} />
      </ThemeIcon>
      <h2 className="text-sm font-semibold text-default-700">{title}</h2>
      <span className="text-xs text-default-400">{hint}</span>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <Card withBorder radius="lg" padding="sm">
      <Text size="xs" c="dimmed" className="truncate">
        {label}
      </Text>
      <Text fw={700} fz="xl" c={accent ? "blue" : undefined} className="font-num">
        {value}
      </Text>
    </Card>
  );
}

type TFn = ReturnType<typeof useI18n>["t"];

function DonutCard({ title, data, unit, t }: { title: string; data: { name: string; value: number; color: string }[]; unit?: string; t: TFn }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <Card withBorder radius="lg" padding="lg">
      <Text size="sm" fw={600} mb="md">
        {title}
      </Text>
      {total === 0 ? (
        <Text size="sm" c="dimmed">
          {t("dashboard.noData")}
        </Text>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <DonutChart
            data={data}
            size={140}
            thickness={22}
            withTooltip
            tooltipDataSource="segment"
            chartLabel={String(total)}
          />
          <Stack gap={6} className="min-w-0 grow">
            {data.map((d) => (
              <Group key={d.name} justify="space-between" gap="xs" wrap="nowrap">
                <Group gap={6} wrap="nowrap" className="min-w-0">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: `var(--mantine-color-${d.color.replace(".", "-")})` }} />
                  <Text size="sm" truncate>
                    {d.name}
                  </Text>
                </Group>
                <Text size="xs" c="dimmed" className="shrink-0 font-num">
                  {d.value}{unit ? ` ${unit}` : ""} · {Math.round((d.value / total) * 100)}%
                </Text>
              </Group>
            ))}
          </Stack>
        </div>
      )}
    </Card>
  );
}

function BadgeBars({ badges, max, empty, unit }: { badges: { valueId: string; label: string; color: string; count: number }[]; max: number; empty: string; unit?: string }) {
  if (badges.length === 0) return <Text size="sm" c="dimmed">{empty}</Text>;
  return (
    <div className="space-y-2.5">
      {badges.map((b) => (
        <div key={b.valueId} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-xs font-semibold text-default-800" title={b.label}>
            {b.label}
          </span>
          <div className="min-w-0 grow">
            <div className="h-5 rounded" style={{ width: `${Math.max(6, (b.count / max) * 100)}%`, backgroundColor: badgeColorVar(b.color) }} />
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums">
            {b.count}
            {unit ? <span className="ml-1 text-xs font-normal text-default-400">{unit}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

function BreakdownCard({
  title,
  data,
  labelOf,
  unknown,
  t,
}: {
  title: string;
  data: Breakdown;
  labelOf: (b: BreakdownBucket) => string;
  unknown: string;
  t: TFn;
}) {
  return (
    <Card withBorder radius="lg" padding="md">
      <Text fw={600} size="sm" mb={4}>
        {title}
      </Text>
      <Text size="xs" c="dimmed" mb="sm">
        {t("som.coverage", { known: data.known, total: data.total })}
      </Text>
      {data.total === 0 ? (
        <Text size="sm" c="dimmed">
          {t("som.noData")}
        </Text>
      ) : (
        <Stack gap={8}>
          {data.buckets
            .filter((b) => b.count > 0 || b.key === SOM_UNKNOWN_KEY)
            .map((b) => {
              const pct = data.total > 0 ? Math.round((b.count / data.total) * 100) : 0;
              const isUnknown = b.key === SOM_UNKNOWN_KEY;
              return (
                <div key={b.key}>
                  <Group justify="space-between" gap="xs" wrap="nowrap">
                    <Text size="sm" c={isUnknown ? "dimmed" : undefined} truncate>
                      {isUnknown ? unknown : labelOf(b)}
                    </Text>
                    <Text size="xs" c="dimmed" className="shrink-0 font-num">
                      {b.count} · {pct}%
                    </Text>
                  </Group>
                  <div className="mt-1 h-1.5 rounded-full bg-default-100">
                    <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: isUnknown ? "var(--mantine-color-gray-4)" : "var(--mantine-color-blue-5)" }} />
                  </div>
                </div>
              );
            })}
        </Stack>
      )}
    </Card>
  );
}

const bahtFmt = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 });
function fmtBaht(n: number) {
  return bahtFmt.format(n);
}

// Horizontal money bars, scaled to the row max, value shown in THB.
function MoneyBars({
  title,
  rows,
  color = "blue",
  t,
}: {
  title: string;
  rows: { key: string; label: string; value: number }[];
  color?: string;
  t: TFn;
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0) || 1;
  return (
    <Card withBorder radius="lg" padding="lg">
      <Text size="sm" fw={600} mb="md">
        {title}
      </Text>
      {rows.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t("dashboard.noData")}
        </Text>
      ) : (
        <Stack gap="sm">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center gap-3">
              <span className="w-28 shrink-0 truncate text-xs font-semibold text-default-800" title={r.label}>
                {r.label}
              </span>
              <div className="min-w-0 grow">
                <div className="h-5 rounded" style={{ width: `${Math.max(4, (r.value / max) * 100)}%`, backgroundColor: badgeColorVar(color) }} />
              </div>
              <span className="w-24 shrink-0 text-right text-xs font-semibold tabular-nums">{fmtBaht(r.value)}</span>
            </div>
          ))}
        </Stack>
      )}
    </Card>
  );
}

// New-customer funnel: acquisition split → conversion to a paid course.
function NewCustomerFunnelCard({ funnel, t }: { funnel: NewCustomerFunnel; t: TFn }) {
  const convertRate = funnel.total > 0 ? Math.round((funnel.convertedToCourse / funnel.total) * 100) : 0;
  return (
    <Card withBorder radius="lg" padding="lg">
      <Group gap={8} mb="md">
        <ThemeIcon variant="light" color="teal" size={28} radius="md">
          <UserPlus size={16} />
        </ThemeIcon>
        <Text size="sm" fw={600}>
          {t("overview.newCustomerTitle")}
        </Text>
      </Group>

      <Group align="flex-end" gap="xs" mb="md">
        <Text fw={700} fz={30} lh={1} className="font-num">
          {funnel.total}
        </Text>
        <Text size="xs" c="dimmed" mb={4}>
          {t("overview.newThisMonth")}
        </Text>
      </Group>

      {/* Acquisition split */}
      <SimpleGrid cols={2} spacing="xs" mb="md">
        <div className="rounded-lg bg-default-100/60 p-2.5">
          <Text size="xs" c="dimmed">
            {t("overview.viaRegister")}
          </Text>
          <Text fw={700} className="font-num">
            {funnel.viaRegister}
          </Text>
        </div>
        <div className="rounded-lg bg-default-100/60 p-2.5">
          <Text size="xs" c="dimmed">
            {t("overview.viaDirectSignup")}
          </Text>
          <Text fw={700} className="font-num">
            {funnel.viaDirectSignup}
          </Text>
        </div>
      </SimpleGrid>

      {/* Conversion */}
      <Group justify="space-between" gap="xs" mb={4} wrap="nowrap">
        <Group gap={6} wrap="nowrap">
          <ArrowRight size={14} className="text-default-400" />
          <Text size="sm">{t("overview.convertedToCourse")}</Text>
        </Group>
        <Text size="sm" fw={600} className="font-num">
          {funnel.convertedToCourse} · {convertRate}%
        </Text>
      </Group>
      <Progress value={convertRate} size="lg" radius="xl" color="teal" />
    </Card>
  );
}

const TOP_CUSTOMERS_PAGE_SIZE = 8;

function TopCustomersTable({ rows, t }: { rows: CustomerSpend[]; t: TFn }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / TOP_CUSTOMERS_PAGE_SIZE));
  // Clamp when the underlying data shrinks (e.g. scope change) so we never show an empty page.
  const current = Math.min(page, totalPages);
  const start = (current - 1) * TOP_CUSTOMERS_PAGE_SIZE;
  const pageRows = rows.slice(start, start + TOP_CUSTOMERS_PAGE_SIZE);

  return (
    <Card withBorder radius="lg" padding="lg">
      <Group justify="space-between" align="center" mb="md" wrap="nowrap">
        <Text size="sm" fw={600}>
          {t("overview.topCustomersTitle")}
        </Text>
        <Text size="xs" c="dimmed" className="shrink-0 font-num">
          {t("overview.rowRange", { from: rows.length === 0 ? 0 : start + 1, to: start + pageRows.length, total: rows.length })}
        </Text>
      </Group>
      <Table.ScrollContainer type="native" minWidth={520}>
        <Table verticalSpacing="xs" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={44} ta="right">
                #
              </Table.Th>
              <Table.Th>{t("overview.colCustomer")}</Table.Th>
              <Table.Th>{t("overview.colActivity")}</Table.Th>
              <Table.Th ta="right">{t("overview.colCourses")}</Table.Th>
              <Table.Th ta="right">{t("overview.colVisits")}</Table.Th>
              <Table.Th ta="right">{t("overview.colSpend")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {pageRows.map((c, i) => (
              <Table.Tr key={c.id}>
                <Table.Td ta="right" className="tabular-nums text-default-400">
                  {start + i + 1}
                </Table.Td>
                <Table.Td className="font-medium">{c.name}</Table.Td>
                <Table.Td>{c.activity}</Table.Td>
                <Table.Td ta="right" className="tabular-nums">
                  {c.courses}
                </Table.Td>
                <Table.Td ta="right" className="tabular-nums">
                  {c.visits}
                </Table.Td>
                <Table.Td ta="right" className="font-semibold tabular-nums">
                  {fmtBaht(c.spend)}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {totalPages > 1 && (
        <Group justify="flex-end" mt="md">
          <Pagination total={totalPages} value={current} onChange={setPage} size="sm" radius="md" withEdges />
        </Group>
      )}
    </Card>
  );
}
