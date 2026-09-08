"use client";

import { useState } from "react";
import dayjs from "dayjs";
import { Card, Skeleton, Group, Table } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useT } from "@/lib/i18n";
import { useLoadPhase } from "@/lib/ui/load-phase";
import { SKEL, SKEL_RADIUS } from "@/components/common/skeleton";
import { badgeColorVar } from "@/lib/ui/badge-colors";
import { useBadgeReport } from "@/hooks/scheduler";

export default function DashboardContent() {
  const t = useT();
  const [from, setFrom] = useState(dayjs().startOf("month").format("YYYY-MM-DD"));
  const [to, setTo] = useState(dayjs().endOf("month").format("YYYY-MM-DD"));

  const { data, isLoading } = useBadgeReport(from, to);
  const phase = useLoadPhase(isLoading, data !== undefined);
  const byValue = data?.byValue ?? [];
  const byTeacher = data?.byTeacher ?? [];
  const maxCount = byValue.reduce((m, v) => Math.max(m, v.count), 0) || 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("dashboard.title")}</h1>
          <p className="text-sm text-muted-500">{t("dashboard.subtitle")}</p>
        </div>
        <Group gap="sm">
          <DatePickerInput
            label={t("dashboard.from")}
            value={from}
            onChange={(v) => v && setFrom(v)}
            valueFormat="D MMM YYYY"
            size="sm"
            popoverProps={{ withinPortal: true }}
          />
          <DatePickerInput
            label={t("dashboard.to")}
            value={to}
            onChange={(v) => v && setTo(v)}
            valueFormat="D MMM YYYY"
            size="sm"
            popoverProps={{ withinPortal: true }}
          />
        </Group>
      </div>

      {/* `useBadgeReport(from, to)` re-keys on every date-range change, so this branch ran on every filter
          press. The report is two bordered panels of labelled bars — a known shape, so it keeps its frame
          instead of collapsing to an `h-64` spinner box. */}
      {phase === "skeleton" ? (
        <div className="grid gap-5 lg:grid-cols-2" aria-busy aria-live="polite">
          {[0, 1].map((panel) => (
            <Card key={panel} withBorder radius="lg" p="md">
              <Skeleton height={SKEL.line} width="35%" radius={SKEL_RADIUS} mb={16} />
              <div className="space-y-2.5">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton height={SKEL.meta} width={112} radius={SKEL_RADIUS} />
                    <Skeleton height={SKEL.badge} className="grow" radius={SKEL_RADIUS} />
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      ) : phase === "quiet" ? null : byValue.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-400">{t("dashboard.noData")}</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Bookings per badge value */}
          <Card withBorder radius="lg" p="md">
            <h2 className="mb-3 text-sm font-semibold text-muted-600">{t("dashboard.byBadge")}</h2>
            <div className="space-y-2.5">
              {byValue.map((v) => (
                <div key={v.valueId} className="flex items-center gap-3">
                  <span
                    className="w-28 shrink-0 truncate text-xs font-semibold text-muted-800"
                    title={v.label}
                  >
                    {v.label}
                  </span>
                  <div className="flex grow items-center gap-2">
                    <div className="min-w-0 grow">
                      <div
                        className="h-5 rounded"
                        style={{
                          width: `${Math.max(6, (v.count / maxCount) * 100)}%`,
                          backgroundColor: badgeColorVar(v.color),
                        }}
                      />
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{v.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Teacher × badge */}
          <Card withBorder radius="lg" p="md">
            <h2 className="mb-3 text-sm font-semibold text-muted-600">{t("dashboard.byTeacher")}</h2>
            <Table.ScrollContainer type="native" minWidth={360}>
            <Table verticalSpacing="xs" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("dashboard.teacher")}</Table.Th>
                  <Table.Th>{t("calendar.badge")}</Table.Th>
                  <Table.Th ta="right">{t("dashboard.count")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {byTeacher.map((r) => (
                  <Table.Tr key={`${r.teacherId}-${r.valueId}`}>
                    <Table.Td>{r.teacherNickname}</Table.Td>
                    <Table.Td>
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: badgeColorVar(r.color) }}
                        />
                        {r.label}
                      </span>
                    </Table.Td>
                    <Table.Td ta="right" className="font-semibold tabular-nums">
                      {r.count}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            </Table.ScrollContainer>
          </Card>
        </div>
      )}
    </div>
  );
}
