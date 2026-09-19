"use client";

import Link from "next/link";
import { Tent } from "lucide-react";
import { useT } from "@/lib/i18n";
import { bannerWeeksFor, type CampWeekLite } from "@/lib/camp/units";

/**
 * REQ-095 Stage 3a (TASK-402) — the calendar DAY BANNER: a strip above the day's hour grid, one row per OPEN camp week
 * covering the date, `name · n kids` from the payload's `campWeeks` (`dayCounts[date]`, the server's number). No cells;
 * click ⇒ the Camp menu. Nothing on a date no week covers. `bannerWeeksFor` is pure and value-tested.
 */
export default function CampDayBanner({ campWeeks, date }: { campWeeks: readonly CampWeekLite[] | undefined; date: string }) {
  const t = useT();
  const rows = bannerWeeksFor(campWeeks, date);
  if (rows.length === 0) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-2" data-camp-banner={date}>
      {rows.map(({ week, kids }) => (
        <Link
          key={week.id}
          href="/scheduler/camp"
          className="inline-flex items-center gap-2 rounded-lg border border-teal-600/40 bg-teal-50 px-3 py-1.5 text-sm text-teal-900 hover:bg-teal-100"
          data-week={week.id}
        >
          <Tent size={14} />
          <span className="font-medium">{week.name}</span>
          <span className="text-teal-700">· {t("camp.kids", { n: String(kids) })}</span>
        </Link>
      ))}
    </div>
  );
}
