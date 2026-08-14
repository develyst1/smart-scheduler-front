"use client";

import type { ReactNode } from "react";
import dayjs from "dayjs";
import "dayjs/locale/th";
import { Card, Stack, Text, Loader, Group, SimpleGrid, Progress } from "@mantine/core";
import { useSomReport } from "@/hooks/scheduler";
import { useI18n } from "@/lib/i18n";
import { SOM_UNKNOWN_KEY, type Breakdown, type BreakdownBucket } from "@/types/app/som";

export default function SomContent() {
  const { t, lang } = useI18n();
  const { data, isLoading } = useSomReport();

  const fmtDate = (iso: string) => dayjs(iso).locale(lang).format(lang === "th" ? "D MMM" : "D MMM YYYY");
  const fmtDateTime = (iso: string) =>
    dayjs(iso).locale(lang).format(lang === "th" ? "D MMM HH:mm น." : "D MMM YYYY, HH:mm");

  if (isLoading || !data) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-3 text-sm text-muted-500">
        <Loader size="md" />
        {t("common.loading")}
      </div>
    );
  }

  const { existingCustomers: ec, sportShare, newVsRenewing: nvr, demographics: demo, today } = data;

  return (
    <Stack gap="lg">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t("som.title")}</h1>
        <p className="text-sm text-muted-500">{t("som.subtitle")}</p>
        <p className="mt-0.5 text-xs text-muted-400">
          {t("som.generatedAt", { time: fmtDateTime(data.generatedAt) })}
        </p>
      </div>

      {/* 1. Existing customers */}
      <section>
        <SectionHeading>{t("som.existingTitle")}</SectionHeading>
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
          <Stat label={t("som.byCourse")} value={ec.byCourse} />
          <Stat label={t("som.byVoucher")} value={ec.byVoucher} />
          <Stat label={t("som.byRecentTrial")} value={ec.byRecentTrial} />
          <Stat label={t("som.totalCustomers")} value={ec.total} accent />
        </SimpleGrid>
        <p className="mt-1.5 text-xs text-muted-400">
          {t("som.trialWindow", { date: fmtDate(ec.recentTrialSince) })}
        </p>
      </section>

      {/* 3. New vs renewing */}
      <section>
        <SectionHeading>{t("som.newVsRenewingTitle", { month: nvr.month })}</SectionHeading>
        <SimpleGrid cols={{ base: 3 }} spacing="sm">
          <Stat label={t("som.newByFirstTrial")} value={nvr.newByFirstTrial} />
          <Stat label={t("som.newByRegistration")} value={nvr.newByRegistration} />
          <Stat label={t("som.renewing")} value={nvr.renewing} />
        </SimpleGrid>
      </section>

      {/* 5. Today */}
      <section>
        <SectionHeading>{t("som.todayTitle")}</SectionHeading>
        <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
          <Stat label={t("som.expected")} value={today.expected} />
          <Stat label={t("som.attended")} value={today.attended} accent />
          <Stat
            label={t("som.attendanceRate")}
            value={today.expected > 0 ? `${Math.round((today.attended / today.expected) * 100)}%` : "—"}
          />
        </SimpleGrid>
      </section>

      {/* 2. Sport share */}
      <section>
        <SectionHeading>{t("som.sportShareTitle")}</SectionHeading>
        <BreakdownCard data={sportShare} labelOf={(b) => bucketLabel(b, "sport")} />
      </section>

      {/* 4. Demographics */}
      <section>
        <SectionHeading>{t("som.demographicsTitle")}</SectionHeading>
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <BreakdownCard title={t("som.genderTitle")} data={demo.gender} labelOf={(b) => bucketLabel(b, "gender")} />
          <BreakdownCard title={t("som.ageBandTitle")} data={demo.ageBand} labelOf={(b) => bucketLabel(b, "age")} />
          <BreakdownCard title={t("som.provinceTitle")} data={demo.province} labelOf={(b) => bucketLabel(b, "text")} />
          <BreakdownCard title={t("som.nationalityTitle")} data={demo.nationality} labelOf={(b) => bucketLabel(b, "text")} />
        </SimpleGrid>
      </section>
    </Stack>
  );

  // Label a bucket: the FE supplies language for keys the API doesn't label (unknown, gender), the API's own
  // label wins where present (e.g. a sport name), everything else is self-labelling (province/nationality/age).
  function bucketLabel(b: BreakdownBucket, kind: "sport" | "gender" | "age" | "text") {
    if (b.key === SOM_UNKNOWN_KEY) return t("som.unknown");
    if (b.label) return b.label;
    if (kind === "gender")
      return b.key === "male"
        ? t("som.genderMale")
        : b.key === "female"
          ? t("som.genderFemale")
          : b.key === "other"
            ? t("som.genderOther")
            : b.key;
    return b.key;
  }

  function SectionHeading({ children }: { children: ReactNode }) {
    return <h2 className="mb-2 text-sm font-semibold text-muted-600">{children}</h2>;
  }

  function BreakdownCard({
    title,
    data,
    labelOf,
  }: {
    title?: string;
    data: Breakdown;
    labelOf: (b: BreakdownBucket) => string;
  }) {
    return (
      <Card withBorder padding="md">
        {title && (
          <Text fw={600} size="sm" mb={4}>
            {title}
          </Text>
        )}
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
                        {labelOf(b)}
                      </Text>
                      <Text size="xs" c="dimmed" className="shrink-0 tabular-nums">
                        {b.count} · {pct}%
                      </Text>
                    </Group>
                    <Progress value={pct} size="sm" mt={2} color={isUnknown ? "gray" : "blue"} />
                  </div>
                );
              })}
          </Stack>
        )}
      </Card>
    );
  }
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <Card withBorder padding="sm">
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={700} fz="xl" c={accent ? "blue" : undefined} className="tabular-nums">
        {value}
      </Text>
    </Card>
  );
}
