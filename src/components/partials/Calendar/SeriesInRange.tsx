"use client";

import { useState } from "react";
import { Badge, Button, Collapse, Text } from "@mantine/core";
import { ChevronDown, ChevronRight, ListChecks, Users } from "lucide-react";
import { useT } from "@/lib/i18n";
import { formatDateDisplay, formatTimeDisplay } from "@/lib/ui/format";
import { useOtherSeriesList } from "@/hooks/scheduler/useOtherSeries";
import { kindLabelKey, type SeriesRef } from "@/lib/scheduler/other-series";
import type { OtherSeriesListItem } from "@/types/api/contract";

/**
 * REQ-101 (TASK-429 → §6, TASK-435) — "Series in range": the ECA/Free/KOL series touching the visible week
 * (`GET /other-series?from&to`, fetched only while open), one row per key (title · kind · dates · live/total); a row is a
 * BUTTON opening the Manage-plan MODAL (`onOpen(ref)`) — no navigation. Sits where the Other create lives — under the
 * calendar header. REQ-104 (TASK-442): the DUO/Group series listed too (`GET /group-series?from&to`, the same shape),
 * each with the group's kind chip; a row opens the SAME modal with its `SeriesRef`. Nothing here on CAMP.
 */
export default function SeriesInRange({ from, to, onOpen }: { from: string; to: string; onOpen: (ref: SeriesRef) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { data: others = [], isLoading: loadingOthers } = useOtherSeriesList("other", from, to, open);
  const { data: groups = [], isLoading: loadingGroups } = useOtherSeriesList("group", from, to, open);
  const isLoading = loadingOthers || loadingGroups;
  const items: { ref: SeriesRef; item: OtherSeriesListItem }[] = [
    ...others.map((item) => ({ ref: { kind: "other" as const, key: item.key }, item })),
    ...groups.map((item) => ({ ref: { kind: "group" as const, key: item.key }, item })),
  ];
  return (
    <div data-series-in-range={open ? "open" : "closed"}>
      <Button size="compact-xs" variant="subtle" color="gray" leftSection={open ? <ChevronDown size={12} /> : <ChevronRight size={12} />} onClick={() => setOpen((o) => !o)}>
        {t("otherSeries.inRange")}
      </Button>
      <Collapse expanded={open}>
        <div className="mt-1 flex flex-col gap-1 pl-2">
          {isLoading ? (
            <Text size="xs" c="dimmed">
              {t("common.loading")}
            </Text>
          ) : items.length === 0 ? (
            <Text size="xs" c="dimmed">
              {t("otherSeries.inRangeEmpty")}
            </Text>
          ) : (
            items.map(({ ref, item: s }) => {
              const kindKey = kindLabelKey(ref, s.kind);
              return (
                <button key={`${ref.kind}:${s.key}`} type="button" onClick={() => onOpen(ref)} className="flex flex-wrap items-center gap-2 text-left text-xs underline-offset-2 hover:underline" data-series-line={s.key} data-series-kind={ref.kind}>
                  {ref.kind === "group" ? <Users size={12} className="shrink-0 text-muted-500" /> : <ListChecks size={12} className="shrink-0 text-muted-500" />}
                  <span className="font-medium">{s.title}</span>
                  {kindKey && (
                    <Badge size="xs" variant="outline" color={ref.kind === "group" ? "grape" : "gray"}>
                      {t(kindKey)}
                    </Badge>
                  )}
                  <span className="text-muted-500">
                    {formatDateDisplay(s.firstDate)} → {formatDateDisplay(s.lastDate)} · {formatTimeDisplay(s.startTime)} · {s.liveCount}/{s.total}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </Collapse>
    </div>
  );
}
