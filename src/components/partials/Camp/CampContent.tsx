"use client";

import { useState } from "react";
import dayjs from "dayjs";
import { ActionIcon, Badge, Button, Card, Group, Loader, Stack, Text, UnstyledButton } from "@mantine/core";
import { ChevronLeft, ChevronRight, Tent, TentTree } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useCan } from "@/hooks/scheduler/useMe";
import { useCampWeeks, useUpdateCampWeek } from "@/hooks/scheduler/useCamp";
import { formatDateDisplay } from "@/lib/ui/format";
import { weeksByMonth } from "@/lib/camp/units";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import OpenWeekDialog from "./OpenWeekDialog";
import WeekRoster from "./WeekRoster";

/**
 * REQ-095 Stage 3a / SPEC-082 (TASK-402) — the **Camp** menu (behind `menu:camp` — the nav and the route guard hide
 * it; the server refuses the routes). Weeks by month (a month at a time, ± a week so a week straddling the edge shows)
 * → a week's roster. `Open a week` behind `camp.week-open`; closing a week is the same key (`status: CLOSED`, one tap
 * — it only stops new redeems; nothing is deleted). 🚫 No expiry anywhere — there is none.
 */
export default function CampContent() {
  const t = useT();
  const can = useCan();
  const [month, setMonth] = useState(dayjs().format("YYYY-MM"));
  const from = dayjs(`${month}-01`).subtract(7, "day").format("YYYY-MM-DD");
  const to = dayjs(`${month}-01`).endOf("month").add(7, "day").format("YYYY-MM-DD");
  const { data: weeks = [], isLoading } = useCampWeeks(from, to);
  const update = useUpdateCampWeek();
  const [selected, setSelected] = useState<string | null>(null);
  const [openOpen, setOpenOpen] = useState(false);
  const groups = weeksByMonth(weeks.filter((w) => w.startDate.slice(0, 7) === month || w.endDate.slice(0, 7) === month));

  const close = async (id: string, name: string) => {
    try {
      await update.mutateAsync({ id, input: { status: "CLOSED" } });
      notify({ title: t("camp.weekClosedOk", { name }), color: "default" });
    } catch (e) {
      notify({ title: e instanceof ApiClientError ? e.message : (e as Error).message, color: "danger" });
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap">
        <Group gap="xs">
          <ActionIcon variant="subtle" color="gray" aria-label={t("camp.prevMonth")} onClick={() => setMonth(dayjs(`${month}-01`).subtract(1, "month").format("YYYY-MM"))}>
            <ChevronLeft size={18} />
          </ActionIcon>
          <Text fw={600} className="tabular-nums">
            {dayjs(`${month}-01`).format("MMMM YYYY")}
          </Text>
          <ActionIcon variant="subtle" color="gray" aria-label={t("camp.nextMonth")} onClick={() => setMonth(dayjs(`${month}-01`).add(1, "month").format("YYYY-MM"))}>
            <ChevronRight size={18} />
          </ActionIcon>
        </Group>
        {can("action:camp.week-open") && (
          <Button leftSection={<TentTree size={16} />} onClick={() => setOpenOpen(true)}>
            {t("camp.openWeek")}
          </Button>
        )}
      </Group>

      {isLoading ? (
        <Loader size="sm" />
      ) : groups.length === 0 ? (
        <Card withBorder padding="lg">
          <Group justify="center" c="dimmed" gap="xs">
            <Tent size={18} />
            <Text size="sm">{t("camp.noWeeks")}</Text>
          </Group>
        </Card>
      ) : (
        <Stack gap="xs">
          {groups.flatMap((g) => g.weeks).map((w) => {
            const kids = Object.values(w.dayCounts).reduce((s, n) => s + n, 0);
            return (
              <Card key={w.id} withBorder padding="sm" className={selected === w.id ? "border-primary" : undefined} data-week={w.id}>
                <Group justify="space-between" wrap="wrap">
                  <UnstyledButton onClick={() => setSelected(selected === w.id ? null : w.id)} className="min-w-0 flex-1">
                    <Text fw={600}>{w.name}</Text>
                    <Text size="xs" c="dimmed">
                      {formatDateDisplay(w.startDate)} → {formatDateDisplay(w.endDate)} · {t("camp.kidDays", { n: String(kids) })}
                      {w.capacity !== null ? ` · ${t("camp.capacityLine", { n: String(w.capacity) })}` : ""}
                    </Text>
                  </UnstyledButton>
                  <Group gap="xs">
                    <Badge size="sm" variant="light" color={w.status === "OPEN" ? "green" : "gray"}>
                      {t(`camp.weekStatus_${w.status}`)}
                    </Badge>
                    {can("action:camp.week-open") && w.status === "OPEN" && (
                      <Button size="compact-xs" variant="subtle" color="gray" loading={update.isPending && update.variables?.id === w.id} onClick={() => void close(w.id, w.name)}>
                        {t("camp.closeWeek")}
                      </Button>
                    )}
                    <Button size="compact-xs" variant="light" onClick={() => setSelected(selected === w.id ? null : w.id)}>
                      {selected === w.id ? t("camp.hideRoster") : t("camp.roster")}
                    </Button>
                  </Group>
                </Group>
                {selected === w.id && (
                  <div className="mt-3 border-t border-muted-200 pt-3">
                    <WeekRoster weekId={w.id} weeks={weeks} />
                  </div>
                )}
              </Card>
            );
          })}
        </Stack>
      )}

      {openOpen && <OpenWeekDialog opened={openOpen} week={null} onClose={() => setOpenOpen(false)} />}
    </Stack>
  );
}
