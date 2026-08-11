"use client";

import { useState } from "react";
import dayjs from "dayjs";
import { Card, Loader, Group, Table } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useT } from "@/lib/i18n";
import { badgeColorVar } from "@/lib/ui/badge-colors";
import { useBadgeReport } from "@/hooks/scheduler";

export default function DashboardContent() {
  const t = useT();
  const [from, setFrom] = useState(dayjs().startOf("month").format("YYYY-MM-DD"));
  const [to, setTo] = useState(dayjs().endOf("month").format("YYYY-MM-DD"));

  const { data, isLoading } = useBadgeReport(from, to);
  const byValue = data?.byValue ?? [];
  const byTeacher = data?.byTeacher ?? [];
  const maxCount = byValue.reduce((m, v) => Math.max(m, v.count), 0) || 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("dashboard.title")}</h1>
          <p className="text-sm text-default-500">{t("dashboard.subtitle")}</p>
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

      {isLoading ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 text-sm text-default-500">
          <Loader size="md" />
          {t("common.loading")}
        </div>
      ) : byValue.length === 0 ? (
        <p className="py-10 text-center text-sm text-default-400">{t("dashboard.noData")}</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Bookings per badge value */}
          <Card withBorder radius="lg" p="md">
            <h2 className="mb-3 text-sm font-semibold text-default-600">{t("dashboard.byBadge")}</h2>
            <div className="space-y-2.5">
              {byValue.map((v) => (
                <div key={v.valueId} className="flex items-center gap-3">
                  <span
                    className="w-28 shrink-0 truncate text-xs font-semibold text-default-800"
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
            <h2 className="mb-3 text-sm font-semibold text-default-600">{t("dashboard.byTeacher")}</h2>
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
