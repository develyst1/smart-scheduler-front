"use client";

import { useState } from "react";
import { Card, Group, SegmentedControl, Table, Text } from "@mantine/core";
import { TeacherTypeChip } from "@/components/common/BookingBadges";
import { useTeachers } from "@/hooks/scheduler";
import { useI18n } from "@/lib/i18n";
import {
  TEACHER_TYPE_LABEL,
  TEACHER_TYPE_PRIORITY,
  type TeacherType,
} from "@/types/app/scheduler";
import type { CapacityFigures, CoachCapacity } from "@/types/app/som";
import { ChartTip } from "./ChartTip";

type View = "person" | "type";

const TYPES = (Object.keys(TEACHER_TYPE_PRIORITY) as TeacherType[]).sort(
  (a, b) => TEACHER_TYPE_PRIORITY[a] - TEACHER_TYPE_PRIORITY[b],
);

/**
 * Coach capacity (client pick B2, 2026-10-17) — one table, By person / By type toggle. Hours = booked / available
 * for the month; Weekday and Weekend cells each show the % (bold), "booked / available h" under it and a thin
 * single-color bar — no intensity shading. A period with nothing available shows 0, not a special label.
 * Renders the API's figures as-is; until the API ships `coachCapacity` the coach names/types come from the
 * teacher list and every figure is "—".
 */
export function CoachCapacitySection({
  data,
}: {
  data?: CoachCapacity | null;
}) {
  const { t } = useI18n();
  const { data: teachers = [] } = useTeachers();
  const [view, setView] = useState<View>("person");

  const teacherById = new Map(teachers.map((tc) => [tc.id, tc]));

  // By person: the API's rows in its order; without them, every coach from the teacher list, FT → PT → FL.
  const personRows: {
    id: string;
    name: string;
    type: TeacherType;
    f?: CapacityFigures;
  }[] = data
    ? data.byPerson.map((p) => {
        const tc = teacherById.get(p.teacherId);
        return {
          id: p.teacherId,
          name: tc ? tc.nickname || tc.name : t("common.none"),
          type: p.teacherType,
          f: p,
        };
      })
    : [...teachers]
        .sort(
          (a, b) =>
            TEACHER_TYPE_PRIORITY[a.type] - TEACHER_TYPE_PRIORITY[b.type],
        )
        .map((tc) => ({
          id: tc.id,
          name: tc.nickname || tc.name,
          type: tc.type,
        }));

  const typeRows: {
    type: TeacherType;
    coaches?: number;
    f?: CapacityFigures;
  }[] = data
    ? data.byType.map((r) => ({
        type: r.teacherType,
        coaches: r.coaches,
        f: r,
      }))
    : TYPES.map((type) => ({ type }));

  return (
    <Card withBorder padding="md">
      <Group justify="space-between" mb="sm" gap="xs">
        <Text size="xs" c="dimmed">
          {data
            ? t("som.capacityMonth", { month: data.month })
            : t("som.capacityHint")}
        </Text>
        <SegmentedControl
          size="xs"
          value={view}
          onChange={(v) => setView(v as View)}
          data={[
            { value: "person", label: t("som.capacityByPerson") },
            { value: "type", label: t("som.capacityByType") },
          ]}
        />
      </Group>

      <Table.ScrollContainer type="native" minWidth={600}>
        <Table verticalSpacing="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              {view === "person" ? (
                <>
                  <Table.Th>{t("som.capCol.coach")}</Table.Th>
                  <Table.Th>{t("som.capCol.type")}</Table.Th>
                </>
              ) : (
                <>
                  <Table.Th>{t("som.capCol.type")}</Table.Th>
                  <Table.Th ta="right">{t("som.capCol.coaches")}</Table.Th>
                </>
              )}
              <Table.Th>{t("som.capCol.hours")}</Table.Th>
              <Table.Th miw={130}>{t("som.capCol.weekday")}</Table.Th>
              <Table.Th miw={130}>{t("som.capCol.weekend")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {view === "person" ? (
              personRows.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Text size="sm" c="dimmed" ta="center">
                      {t("som.noData")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                personRows.map((r) => (
                  <Table.Tr key={r.id}>
                    <Table.Td className="font-medium">{r.name}</Table.Td>
                    <Table.Td>
                      <TeacherTypeChip type={r.type} short />
                    </Table.Td>
                    <Figures f={r.f} who={r.name} />
                  </Table.Tr>
                ))
              )
            ) : (
              typeRows.map((r) => (
                <Table.Tr key={r.type}>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <TeacherTypeChip type={r.type} short />
                      <Text size="xs" c="dimmed">
                        {TEACHER_TYPE_LABEL[r.type]}
                      </Text>
                    </Group>
                  </Table.Td>
                  <Table.Td ta="right" className="tabular-nums">
                    {r.coaches ?? t("common.none")}
                  </Table.Td>
                  <Figures f={r.f} who={TEACHER_TYPE_LABEL[r.type]} />
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Card>
  );

  function Figures({ f, who }: { f?: CapacityFigures; who: string }) {
    if (!f) {
      return (
        <>
          <Table.Td>{t("common.none")}</Table.Td>
          <Table.Td>{t("common.none")}</Table.Td>
          <Table.Td>{t("common.none")}</Table.Td>
        </>
      );
    }
    return (
      <>
        <Table.Td className="whitespace-nowrap tabular-nums">
          <span className="font-semibold">{f.bookedHours}</span>
          <span className="text-xs text-muted-400">
            {" "}
            / {f.availableHours} {t("som.capHoursUnit")}
          </span>
        </Table.Td>
        <Period
          who={who}
          period={t("som.capCol.weekday")}
          pct={f.weekdayPct}
          booked={f.weekdayBookedHours}
          available={f.weekdayAvailableHours}
        />
        <Period
          who={who}
          period={t("som.capCol.weekend")}
          pct={f.weekendPct}
          booked={f.weekendBookedHours}
          available={f.weekendAvailableHours}
        />
      </>
    );
  }

  function Period(p: {
    who: string;
    period: string;
    pct: number;
    booked: number;
    available: number;
  }) {
    return (
      <Table.Td>
        <ChartTip
          label={t("som.capTip", {
            who: p.who,
            period: p.period,
            booked: p.booked,
            available: p.available,
            pct: p.pct,
          })}
        >
          <div className="cursor-default">
            <Text size="sm" fw={600} className="tabular-nums">
              {p.pct}%
            </Text>
            <Text
              size="xs"
              c="dimmed"
              className="whitespace-nowrap tabular-nums"
            >
              {p.booked} / {p.available} {t("som.capHoursUnit")}
            </Text>
            <div className="mt-1 h-1.5 overflow-hidden rounded bg-muted-100">
              <div
                className="h-full rounded bg-[var(--mantine-color-blue-5)]"
                style={{ width: `${Math.min(100, p.pct)}%` }}
              />
            </div>
          </div>
        </ChartTip>
      </Table.Td>
    );
  }
}
