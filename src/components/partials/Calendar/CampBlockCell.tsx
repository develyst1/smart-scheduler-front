"use client";

import { Tent } from "lucide-react";
import { useT } from "@/lib/i18n";
import { formatTimeDisplay } from "@/lib/ui/format";
import type { CampBlock } from "@/lib/camp/grid";

/**
 * REQ-095 §11 (TASK-419) — the ONE visual block a teacher-day's contiguous camp hours fold into (render-only; the
 * rows stay per hour — `block.rows`). The week's name, the `CAMP` tag, the span. Clicking opens the camp PANEL,
 * never the booking modal. Shared by the day grid (spanning its hour rows) and the week grid (one item in the cell).
 */
export default function CampBlockCell({ block, onSelect, size = "md" }: { block: CampBlock; onSelect: (b: CampBlock) => void; size?: "sm" | "md" }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => onSelect(block)}
      data-camp-block={block.campWeekDayId}
      data-hours={block.hours}
      className={`relative flex h-full w-full flex-col gap-0.5 rounded-xl border border-teal-600/40 bg-teal-50 text-left transition-colors hover:bg-teal-100 ${size === "sm" ? "py-1.5 pl-3 pr-2" : "p-2 pl-3"}`}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 rounded-l-xl bg-teal-600" />
      <span className="flex min-w-0 items-center gap-1.5">
        <Tent size={size === "sm" ? 12 : 14} className="shrink-0 text-teal-700" aria-hidden />
        <span className={`min-w-0 flex-1 truncate font-semibold text-cal-ink ${size === "sm" ? "text-xs" : "text-sm"}`}>{block.title}</span>
        <span className={`inline-flex shrink-0 items-center rounded-sm border border-cal-ink/40 bg-white px-1 font-semibold uppercase leading-tight tracking-wide text-cal-ink ${size === "sm" ? "text-[9px] py-px" : "text-[10px] py-0.5"}`}>
          {t("calendar.otherKindTag_CAMP")}
        </span>
      </span>
      <span className={`tabular-nums text-cal-ink ${size === "sm" ? "text-[11px]" : "text-xs"} font-medium`}>
        {formatTimeDisplay(block.startTime)}–{formatTimeDisplay(block.endTime)} · {t("calendar.campHours", { n: block.hours })}
      </span>
    </button>
  );
}
