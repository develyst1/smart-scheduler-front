"use client";

import { Skeleton } from "@mantine/core";
import { TIME_SLOTS } from "@/types/app/scheduler";
import { SKEL, SKEL_RADIUS } from "@/components/common/skeleton";
import CalendarLegendBar from "./CalendarLegendBar";

/**
 * The calendar's loading state — the grid's own frame, empty.
 *
 * 🔴 **This is the screen the audit ranked `critical`, and the reason is how often it runs.** `useCalendar(date,
 * view)` takes a new query key on EVERY week or day the staff steps through, and this repo's calendar query
 * carries no `keepPreviousData` — so `isLoading` went true on every arrow press and the whole grid was replaced
 * by a spinner in an `h-64` box, then sprang back. Staff navigate weeks all day; the most-used screen in the
 * product flashed on every click, and lost the horizontal scroll position with it.
 *
 * ⇒ the frame stays: the same card, the same legend bar, the same `grid-template-columns`, the same row count,
 * the same `min-h-24` cells. Only the contents are bars. The arriving week lands in the frame it left.
 *
 * ⚠️ **The legend bar is REAL, not a placeholder.** It is pure `t()` plus the display toggle — it depends on no
 * request, so blanking it would be inventing a wait that is not happening, and it would take the toggle away
 * from staff mid-navigation.
 *
 * 🚫 Not shared with the list skeletons. A calendar is not a list, and the shared piece is
 * `components/common/skeleton.ts` — the bar heights and the radius — never the shape.
 */
export default function CalendarGridSkeleton({
  view,
  /** How many teacher columns/rows to draw. The teacher roster is its own query and usually already answered,
   *  so this is normally the real count and the frame is exactly the one that returns. */
  teacherCount,
}: {
  view: "day" | "week";
  teacherCount: number;
}) {
  // A floor, so a calendar loading before the roster does still draws a grid rather than a bare header.
  const n = Math.max(teacherCount, 4);
  const isWeek = view === "week";
  // Week: teacher rows × 7 days. Day: time rows × teacher columns. Same two numbers, transposed — which is
  // exactly the difference between the two real grids.
  const columns = isWeek ? 7 : n;
  const rows = isWeek ? n : TIME_SLOTS.length;

  return (
    <div className="rounded-2xl border border-muted-200 bg-content1 shadow-sm" aria-busy aria-live="polite">
      <CalendarLegendBar />
      <div className="overflow-hidden rounded-b-2xl">
        <div
          className="grid min-w-max"
          style={{
            gridTemplateColumns: isWeek
              ? "160px repeat(7, minmax(150px, 1fr))"
              : `72px repeat(${n}, minmax(160px, 1fr))`,
          }}
        >
          {/* Corner + header row — the day names in week view, the teacher names in day view. */}
          <div className="border-b border-r border-muted-200 bg-content1 p-3">
            <Skeleton height={SKEL.meta} width="60%" radius={SKEL_RADIUS} />
          </div>
          {Array.from({ length: columns }, (_, i) => (
            <div
              key={`h-${i}`}
              className="flex flex-col items-center gap-1.5 border-b border-l border-muted-100 bg-content1 p-3"
            >
              <Skeleton height={SKEL.line} width="55%" radius={SKEL_RADIUS} />
              <Skeleton height={SKEL.meta} width="40%" radius={SKEL_RADIUS} />
            </div>
          ))}

          {Array.from({ length: rows }, (_, r) => (
            <div key={`r-${r}`} className="contents">
              {/* Row header: a teacher (week) or a time (day). */}
              <div className="flex flex-col gap-1.5 border-r border-t border-muted-100 bg-content1 p-3">
                <Skeleton height={SKEL.line} width={isWeek ? "70%" : "80%"} radius={SKEL_RADIUS} />
                {isWeek && <Skeleton height={SKEL.meta} width="50%" radius={SKEL_RADIUS} />}
              </div>
              {Array.from({ length: columns }, (_, c) => (
                <div key={`c-${r}-${c}`} className="min-h-24 border-l border-t border-muted-100 p-1.5">
                  {/* 🔴 Only SOME cells carry a bar. A booking in every cell of every week would be a picture of
                      a fully-booked calendar, which is a claim about the data — the frame may be honest about
                      the shape, never about how full it is. The pattern is deterministic so it does not
                      re-shuffle on each render and read as motion. */}
                  {(r + c) % 3 === 0 && <Skeleton height={SKEL.badge} radius={SKEL_RADIUS} />}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
