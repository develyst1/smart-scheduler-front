"use client";

import { CalendarX2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { formatDateWithDay } from "@/lib/ui/format";
import type { ClosedDayRow } from "@/types/api/contract";
import ClosedDayChip from "./ClosedDayChip";
import { closedReasonText } from "./ClosedDayPanel";

/**
 * 🔴 **TASK-960 (SPEC-105 §5, REQ-5013 option B) — a whole-school closed day, where an admin already looks: a strip «วันปิดทำการ · <reason or note>» on each closed date,** on the
 * `LeaveDayBanner` pattern and mounted in the day AND the week view (an admin plans a week; a marker you can only see after navigating into the day is one you find only if you
 * were already looking). Its chip opens the closed-day panel.
 * ⚠️ In the WEEK view each strip also carries its date (several days can be closed and the strip sits above all seven columns); in the day view the date is the page's own.
 * 🚫 Never rendered for a teacher-scoped session — the read is refused for them (403), so the caller does not even ask.
 */
export default function ClosedDayBanner({ rows, dates }: { rows: readonly ClosedDayRow[] | undefined; dates: readonly string[] }) {
  const t = useT();
  const shown = (rows ?? []).filter((r) => dates.includes(r.date)).sort((a, b) => a.date.localeCompare(b.date));
  if (shown.length === 0) return null;
  const withDate = dates.length > 1;
  return (
    <div className="mb-2 flex flex-wrap gap-2" data-closed-banner={dates.length}>
      {shown.map((r) => (
        <span
          key={r.date}
          className="inline-flex items-center gap-2 rounded-lg border border-red-500/40 bg-amber-50 px-3 py-1.5 text-sm text-red-900"
          data-closed-marker={r.date}
          data-closed-classes={r.bookings.length}
        >
          <CalendarX2 size={14} />
          <ClosedDayChip row={r} text={`${withDate ? `${formatDateWithDay(r.date)} · ` : ""}${t("closedDay.marker", { reason: closedReasonText(t, r) })}`} />
        </span>
      ))}
    </div>
  );
}
