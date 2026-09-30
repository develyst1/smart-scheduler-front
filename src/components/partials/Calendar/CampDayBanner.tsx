"use client";

import Link from "next/link";
import { Tent } from "lucide-react";
import { useT } from "@/lib/i18n";
import { bannerWeeksFor, type CampWeekLite } from "@/lib/camp/units";

/**
 * REQ-095 Stage 3a (TASK-402) — the calendar DAY BANNER: a strip above the day's hour grid, one row per camp week
 * covering the date, `name · n kids` from the payload's `campWeeks` (`dayCounts[date]`, the server's number). No cells;
 * click ⇒ the Camp menu. Nothing on a date no week covers. `bannerWeeksFor` is pure and value-tested.
 *
 * 🔻 **TASK-586 — a CLOSED week now appears too, on days that have children**, because Close stops new bookings and
 * nothing else: those children are there and those coaches are blocked. **It is MARKED closed** — 🔑 *a week that cannot
 * take a booking must not look like one that can*, and the marker is the whole reason showing it is safe.
 */
export default function CampDayBanner({ campWeeks, date }: { campWeeks: readonly CampWeekLite[] | undefined; date: string }) {
  const t = useT();
  const rows = bannerWeeksFor(campWeeks, date);
  if (rows.length === 0) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-2" data-camp-banner={date}>
      {rows.map(({ week, kids, closed }) => (
        <Link
          key={week.id}
          href="/scheduler/camp"
          className={
            closed
              ? "inline-flex items-center gap-2 rounded-lg border border-muted-300 bg-muted-100 px-3 py-1.5 text-sm text-muted-600 hover:bg-muted-200"
              : "inline-flex items-center gap-2 rounded-lg border border-teal-600/40 bg-teal-50 px-3 py-1.5 text-sm text-teal-900 hover:bg-teal-100"
          }
          data-week={week.id}
          data-week-closed={closed ? "yes" : "no"}
        >
          <Tent size={14} />
          <span className="font-medium">{week.name}</span>
          <span className={closed ? "text-muted-500" : "text-teal-700"}>· {t("camp.kids", { n: String(kids) })}</span>
          {/* 🔑 The marker that makes showing a closed week honest: it is running, and it is not taking bookings. */}
          {closed && <span className="text-xs text-muted-500">· {t("camp.weekStatus_CLOSED")}</span>}
        </Link>
      ))}
    </div>
  );
}
