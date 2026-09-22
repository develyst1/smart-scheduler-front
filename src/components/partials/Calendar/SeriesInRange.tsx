"use client";

import { useState } from "react";
import { Badge, Button, Collapse, Text } from "@mantine/core";
import { ChevronDown, ChevronRight, ListChecks } from "lucide-react";
import { useT } from "@/lib/i18n";
import { formatDateDisplay, formatTimeDisplay } from "@/lib/ui/format";
import { useOtherSeriesList } from "@/hooks/scheduler/useOtherSeries";

/**
 * REQ-101 (TASK-429 → §6, TASK-435) — "Series in range": the ECA/Free/KOL series touching the visible week
 * (`GET /other-series?from&to`, fetched only while open), one row per key (title · kind · dates · live/total); a row is a
 * BUTTON opening the Manage-plan MODAL (`onOpen(key)`) — no navigation. Sits where the Other create lives — under the
 * calendar header. Nothing here on GROUP/CAMP.
 */
export default function SeriesInRange({ from, to, onOpen }: { from: string; to: string; onOpen: (key: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { data: items = [], isLoading } = useOtherSeriesList(from, to, open);
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
            items.map((s) => (
              <button key={s.key} type="button" onClick={() => onOpen(s.key)} className="flex flex-wrap items-center gap-2 text-left text-xs underline-offset-2 hover:underline" data-series-line={s.key}>
                <ListChecks size={12} className="shrink-0 text-muted-500" />
                <span className="font-medium">{s.title}</span>
                {s.kind && (
                  <Badge size="xs" variant="outline" color="gray">
                    {t(`booking.otherKind_${s.kind}`)}
                  </Badge>
                )}
                <span className="text-muted-500">
                  {formatDateDisplay(s.firstDate)} → {formatDateDisplay(s.lastDate)} · {formatTimeDisplay(s.startTime)} · {s.liveCount}/{s.total}
                </span>
              </button>
            ))
          )}
        </div>
      </Collapse>
    </div>
  );
}
