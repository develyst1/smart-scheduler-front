import type { CoursePatternSlot } from "@/types/api/contract";
import { TIME_SLOTS } from "@/types/app/scheduler";
import { HALF_HOUR_TIMES, dayShort } from "./work-days";

/**
 * The times a pattern row is picked from: every HALF hour over the same opening hours as the sale's single Time field (`TIME_SLOTS`, 09:00–17:00), up to 17:30 — a slot is on the hour or the half hour
 * (SPEC-109 §2), and the single field is hourly only because a one-slot course has always been.
 */
export const PATTERN_TIMES: string[] = HALF_HOUR_TIMES.filter((x) => x >= TIME_SLOTS[0] && x <= `${TIME_SLOTS[TIME_SLOTS.length - 1].slice(0, 2)}:30`);

/**
 * 🔴 **TASK-970 (REQ-5016 F1, SPEC-109 §2-§4) — the pure side of a course's WEEKLY PATTERN: the editor's rows, what they send, and how a pattern is read aloud.**
 * 🔑 The server owns the expansion into dates, the order inside a week, every clash and every number; this file only decides what the SCREEN may send and how a list of slots reads.
 */

/** SPEC-109 §2 — a pattern holds 1…21 slots. */
export const PATTERN_MAX = 21;

/** One editor row. Every field starts empty: nothing is assumed for the admin. `weekday` 0 = Sunday … 6 = Saturday. */
export interface PatternRow {
  weekday: number | null;
  startTime: string | null;
  teacherId: string | null;
}
export const emptyPatternRow = (seed: Partial<PatternRow> = {}): PatternRow => ({ weekday: null, startTime: null, teacherId: null, ...seed });

const complete = (r: PatternRow): r is { weekday: number; startTime: string; teacherId: string } => r.weekday !== null && !!r.startTime && !!r.teacherId;

/** The rows that are filled in, as the wire's slots, in the order entered. */
export const patternSlots = (rows: readonly PatternRow[]): CoursePatternSlot[] => rows.filter(complete).map((r) => ({ weekday: r.weekday, startTime: r.startTime, teacherId: r.teacherId }));

/** What is wrong with the rows, in words' keys; `null` = fine (or too few rows to be a pattern at all). Nothing is sent while one stands. */
export const patternIssue = (rows: readonly PatternRow[]): "incomplete" | "duplicate" | "tooMany" | null => {
  if (rows.length > PATTERN_MAX) return "tooMany";
  if (rows.some((r) => !complete(r))) return "incomplete";
  const seen = new Set<string>();
  for (const s of patternSlots(rows)) {
    const k = `${s.weekday}|${s.startTime}`;
    if (seen.has(k)) return "duplicate";
    seen.add(k);
  }
  return null;
};

/**
 * 🔴 **The body rule (SPEC-109 §3.1):** TWO or more slots send `pattern`; ONE row keeps today's fields (`pattern` absent), so a one-row editor is exactly the sale it always was.
 * `null` = the rows are not sendable (an issue stands, or the editor is off). The caller spreads the result into the body.
 */
export const patternPayload = (on: boolean, rows: readonly PatternRow[]): { pattern: CoursePatternSlot[] } | Record<string, never> | null => {
  if (!on) return {};
  if (patternIssue(rows) !== null) return null;
  const slots = patternSlots(rows);
  return slots.length >= 2 ? { pattern: slots } : {};
};

/**
 * 🔴 **«จ 10:00, 11:00 · พฤ 12:00» — a pattern read aloud (SPEC-109 §3.5 / AC6):** the slots in the server's order, consecutive slots of one weekday sharing the day name, days joined with « · ».
 * A one-slot course has no pattern (`null` / one slot) ⇒ the empty string, and the caller shows its usual weekly line.
 */
export const patternLabel = (slots: readonly { weekday: number; startTime: string }[] | null | undefined, lang: string): string => {
  if (!slots || slots.length < 2) return "";
  const groups: { weekday: number; times: string[] }[] = [];
  for (const s of slots) {
    const last = groups[groups.length - 1];
    if (last && last.weekday === s.weekday) last.times.push(s.startTime.slice(0, 5));
    else groups.push({ weekday: s.weekday, times: [s.startTime.slice(0, 5)] });
  }
  return groups.map((g) => `${dayShort(g.weekday, lang).replace(/\.$/, "")} ${g.times.join(", ")}`).join(" · ");
};

/** A course's slots as editor rows (to open the change-pattern dialog on what the course has now). */
export const rowsFromSlots = (slots: readonly CoursePatternSlot[] | null | undefined): PatternRow[] => (slots ?? []).map((s) => ({ weekday: s.weekday, startTime: s.startTime.slice(0, 5), teacherId: s.teacherId }));
