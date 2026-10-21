"use client";

import { useState, type ReactNode } from "react";
import dayjs from "dayjs";
import "dayjs/locale/th";
import { Card, Stack, Text, Loader, SimpleGrid } from "@mantine/core";
import { useSomReport } from "@/hooks/scheduler";
import { useI18n } from "@/lib/i18n";
import { Lock } from "lucide-react";
import { NVR_BUCKETS, type NvrBucket, type SomQuery } from "@/types/app/som";
import { NvrDetailModal } from "./NvrDetailModal";
import { SomFilters } from "./SomFilters";
import { CoachCapacitySection } from "./CoachCapacitySection";
import { ActivityProgramSection } from "./ActivityProgramSection";
import { DemographicsSection } from "./DemographicsSection";

export default function SomContent() {
  const { t, lang } = useI18n();
  // Page-level filters: one month + badge (branch) values for every section but Today (locked to today).
  const [query, setQuery] = useState<SomQuery>(() => ({
    month: dayjs().format("YYYY-MM"),
    badgeValueIds: [],
  }));
  const { data, isLoading, isFetching } = useSomReport(query);
  const [nvrOpen, setNvrOpen] = useState<NvrBucket | null>(null);

  const monthLabel = dayjs(`${query.month}-01`)
    .locale(lang)
    .format("MMMM YYYY");

  const fmtDate = (iso: string) =>
    dayjs(iso)
      .locale(lang)
      .format(lang === "th" ? "D MMM" : "D MMM YYYY");
  const fmtMonth = (ym: string) =>
    dayjs(`${ym}-01`).locale(lang).format("MMM YYYY");
  const fmtDateTime = (iso: string) =>
    dayjs(iso)
      .locale(lang)
      .format(lang === "th" ? "D MMM HH:mm น." : "D MMM YYYY, HH:mm");

  // The title + filters stay put while loading, so changing a filter never makes them jump away.
  const header = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          {t("som.title")}
        </h1>
        <p className="text-sm text-muted-500">{t("som.subtitle")}</p>
        {data && (
          <p className="mt-0.5 text-xs text-muted-400">
            {t("som.generatedAt", { time: fmtDateTime(data.generatedAt) })}
            {isFetching && " · " + t("common.loading")}
          </p>
        )}
      </div>
      <SomFilters value={query} onChange={setQuery} />
    </div>
  );

  if (isLoading || !data) {
    return (
      <Stack gap="lg">
        {header}
        <div className="flex h-40 flex-col items-center justify-center gap-3 text-sm text-muted-500">
          <Loader size="md" />
          {t("common.loading")}
        </div>
      </Stack>
    );
  }

  const {
    existingCustomers: ec,
    newVsRenewing: nvr,
    demographics: demo,
    today,
  } = data;

  return (
    <Stack gap="lg">
      {header}

      {/* 1. Today */}
      <section>
        <SectionHeading scope={<TodayScope />}>
          {t("som.todayTitle")}
        </SectionHeading>
        <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
          {/* New contract only (§1). A missing / null field shows "—" — never the legacy `expected`, which the
              server keeps at its old value. */}
          <Stat label={t("som.confirmed")} value={today.confirmed ?? "—"} />
          <Stat label={t("som.attended")} value={today.attended} accent />
          <Stat
            label={t("som.attendanceRate")}
            value={
              today.attendanceRate != null ? `${today.attendanceRate}%` : "—"
            }
          />
        </SimpleGrid>
      </section>

      {/* 2. Existing customers */}
      <section>
        <SectionHeading scope={monthLabel}>
          {t("som.existingTitle")}
        </SectionHeading>
        <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }} spacing="sm">
          {/* New contract only (§2). A missing / null field shows "—" — never the legacy fields, which the server
              keeps at their old, buggy values (Active Course counted ended/paused courses, Trial counted cancellations). */}
          <Stat label={t("som.byCourse")} value={ec.activeCourse ?? "—"} />
          <Stat label={t("som.byVoucher")} value={ec.activeVoucher ?? "—"} />
          <Stat
            label={t("som.byRecentTrial")}
            value={ec.recentFirstTrial ?? "—"}
          />
          <Stat
            label={t("som.byRecentSingle")}
            value={ec.recentSingleSession ?? "—"}
          />
          <Stat
            label={t("som.totalCustomers")}
            value={ec.totalCustomers ?? "—"}
            accent
          />
        </SimpleGrid>
        <p className="mt-1.5 text-xs text-muted-400">
          {ec.recentFrom && ec.recentTo
            ? t("som.trialRange", {
                from: fmtMonth(ec.recentFrom),
                to: fmtMonth(ec.recentTo),
              })
            : t("som.trialWindow", { date: fmtDate(ec.recentTrialSince) })}
        </p>
      </section>

      {/* 3. New vs renewing */}
      <section>
        <SectionHeading scope={monthLabel}>
          {t("som.newVsRenewingTitle")}
        </SectionHeading>
        {/* Every card reads the new contract (§3); a missing / null field shows "—" (never the legacy fields).
            Clicking a card opens its detail table. */}
        <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }} spacing="sm">
          {NVR_BUCKETS.map((b) => (
            <Stat
              key={b}
              label={t(`som.nvr.${b}`)}
              value={nvrValue(b)}
              onClick={() => setNvrOpen(b)}
            />
          ))}
        </SimpleGrid>
        <p className="mt-1.5 text-xs text-muted-400">{t("som.nvrHint")}</p>
        <NvrDetailModal
          bucket={nvrOpen}
          query={query}
          onClose={() => setNvrOpen(null)}
        />
      </section>

      {/* 4. Coach capacity — see docs/backend-som-dashboard.md §4 */}
      <section>
        <SectionHeading scope={monthLabel}>
          {t("som.coachCapacityTitle")}
        </SectionHeading>
        <CoachCapacitySection data={data.coachCapacity} />
      </section>

      {/* 5. Demographics */}
      <section>
        <SectionHeading scope={monthLabel}>
          {t("som.demographicsTitle")}
        </SectionHeading>
        <DemographicsSection demo={demo} />
      </section>

      {/* 6. Activity / Program */}
      <section>
        <SectionHeading scope={monthLabel}>
          {t("som.sportShareTitle")}
        </SectionHeading>
        <ActivityProgramSection data={data.activityProgram} />
      </section>
    </Stack>
  );

  // The number on each New-vs-Renewing card (also how many rows its detail table shows).
  function nvrValue(b: NvrBucket): number | string {
    const v = data!.newVsRenewing;
    const n = {
      firstTrial: v.firstTrial,
      newCourseThisMonth: v.newCourseThisMonth,
      newCoursePrevMonth: v.newCoursePrevMonth,
      renewCourse: v.renewCourse,
      trialNotConverted: v.trialNotConverted,
      notRenewed: v.notRenewed,
    }[b];
    return n ?? "—";
  }

  // Every section says which period its numbers cover: today (locked) or the page's month.
  function SectionHeading({
    children,
    scope,
  }: {
    children: ReactNode;
    scope: ReactNode;
  }) {
    return (
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-600">{children}</h2>
        <span className="inline-flex items-center gap-1 rounded-md bg-muted-50 px-2 py-0.5 text-xs text-muted-500">
          {scope}
        </span>
      </div>
    );
  }

  function TodayScope() {
    return (
      <>
        <Lock size={12} aria-hidden />
        {t("som.todayLocked", {
          date: dayjs().locale(lang).format("D MMM YYYY"),
        })}
      </>
    );
  }
}

function Stat({
  label,
  value,
  accent,
  onClick,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
  onClick?: () => void;
}) {
  const clickable = onClick
    ? {
        component: "button" as const,
        onClick,
        className: "text-left transition-colors hover:bg-muted-50",
      }
    : {};
  return (
    <Card withBorder padding="sm" {...clickable}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text
        fw={700}
        fz="xl"
        c={accent ? "blue" : undefined}
        className="tabular-nums"
      >
        {value}
      </Text>
    </Card>
  );
}
