"use client";

import { UserX } from "lucide-react";
import { useT } from "@/lib/i18n";
import { leaveMarkerKey, leaveMarkersFor } from "@/lib/scheduler/teacher-scope";
import type { LeaveDayRow } from "@/types/api/contract";

/**
 * 🔴 **TASK-587 (BE) → TASK-589 — a coach's blocked day, where an admin already looks.**
 *
 * **Why HERE, derived rather than copied from the camp banner:**
 *  1. 🔑 **The work is on that date, and an admin handles it in this very grid** — moving or cancelling those classes happens
 *     in the cells directly below this strip. *A marker one glance from the fix is worth more than a list somewhere else.*
 *  2. **A day-level fact already has a home and a precedent here** (`CampDayBanner`), so this needs no new furniture.
 *  3. ⚖️ **The alternative was the attention panel** — but that panel renders what `GET /attention` sends, so it would need a
 *     **new BE check** (not ours, and the owner's to ask for), **and it would take the admin away from the place where the
 *     fix happens.** *We were told to try a PLACE before asking for a notice; this is the place that costs nothing new.*
 *  4. ⚠️ **Unlike the camp banner, it is mounted in the WEEK view too** — an admin plans a week, and **a marker you can only
 *     see after navigating into the day is one you find only if you were already looking.**
 *
 * 🚫 **It is not a control.** No link, no button, nothing to press: the owner ruled the admin handles those classes by hand,
 * in the places that already do that.
 * ⚠️ **Never rendered for a teacher-scoped session** — the read is refused for them (403), so the caller does not even ask.
 */
export default function LeaveDayBanner({ rows, dates }: { rows: readonly LeaveDayRow[] | undefined; dates: readonly string[] }) {
  const t = useT();
  const markers = leaveMarkersFor(rows, dates);
  if (markers.length === 0) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-2" data-leave-banner={dates.length}>
      {markers.map((m) => (
        <span
          key={`${m.teacherId}-${m.date}`}
          className={
            m.classes > 0
              ? "inline-flex items-center gap-2 rounded-lg border border-orange-500/40 bg-orange-50 px-3 py-1.5 text-sm text-orange-900"
              : "inline-flex items-center gap-2 rounded-lg border border-muted-300 bg-muted-100 px-3 py-1.5 text-sm text-muted-600"
          }
          data-leave-marker={`${m.teacherId}|${m.date}`}
          data-leave-classes={m.classes}
        >
          <UserX size={14} />
          {/* 🔑 Whose day AND how many classes — a marker that only said "blocked" would send an admin hunting for them. */}
          <span>{t(leaveMarkerKey(m), { name: m.teacherName, n: String(m.classes), date: m.date })}</span>
        </span>
      ))}
    </div>
  );
}
