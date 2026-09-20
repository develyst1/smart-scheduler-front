/**
 * REQ-095 §11 / SPEC-085 (TASK-418/419) — camp ON the teacher grid, the pure side.
 *
 * A camp hour arrives as an ordinary booking row (`bookingType OTHER`, `other.kind CAMP`, `campWeekDayId`,
 * `campWeekId`, one hour, CONFIRMED at birth). 🔑 The DATA stays per hour; this file only folds contiguous hours of
 * one teacher-day into ONE visual block for the cell, and shapes the per-day PATCH bodies (only what changed). Every
 * rule — the slot check, the window bounds, a teacher's off day, a closed week — is the server's sentence.
 * 🚫 Nothing here writes a booking: a CAMP row is owned by its week (`409 CAMP_ROW_OWNED`); its doors are hidden.
 */
import type { Booking } from "@/types/app/scheduler";

/** The effective window when a week sets none — the server's `CAMP_WINDOW_DEFAULT`, shown as a placeholder only. */
export const CAMP_WINDOW_DEFAULT = { start: "10:00", end: "15:00" } as const;
/** The whole hours a window may use (the server's 06:00–22:00, whole hours) — the pickers' choices, the server the judge. */
export const CAMP_HOURS = Array.from({ length: 17 }, (_, i) => `${String(6 + i).padStart(2, "0")}:00`);

/** A CAMP row: the kind AND the owner id — Jason's rule for hiding the doors is `campWeekDayId` set. */
export const isCampRow = (b: Pick<Booking, "bookingType" | "other" | "campWeekDayId">): boolean =>
  b.bookingType === "OTHER" && b.other?.kind === "CAMP" && !!b.campWeekDayId;

export interface CampBlock {
  kind: "camp";
  /** The first hour's booking id — a stable key for the cell. */
  id: string;
  campWeekId: string;
  campWeekDayId: string;
  teacherId: string;
  date: string;
  /** The week's name (`otherTitle` ⇒ `displayName` on the row). */
  title: string;
  startTime: string;
  endTime: string;
  /** How many hour rows the block covers — the day grid spans that many slots. */
  hours: number;
  rows: Booking[];
}
export type CellItem = { kind: "booking"; booking: Booking } | CampBlock;

const hhmm = (s: string) => s.slice(0, 5);

/**
 * Fold a teacher-day's rows (sorted by start time) into cell items: contiguous CAMP rows of the SAME day object
 * (`campWeekDayId`) whose hours touch (`prev.endTime === next.startTime`) become ONE block; a gap or another day
 * object starts a new block; every other row stays its own item. Render-only — `rows` keeps the hours.
 */
export const mergeCampCells = (rows: readonly Booking[]): CellItem[] => {
  const out: CellItem[] = [];
  for (const b of rows) {
    const last = out[out.length - 1];
    if (isCampRow(b)) {
      if (last && last.kind === "camp" && last.campWeekDayId === b.campWeekDayId && hhmm(last.endTime) === hhmm(b.startTime)) {
        last.endTime = hhmm(b.endTime);
        last.hours += 1;
        last.rows.push(b);
      } else {
        out.push({
          kind: "camp",
          id: b.id,
          campWeekId: b.campWeekId as string,
          campWeekDayId: b.campWeekDayId as string,
          teacherId: b.teacherId,
          date: b.date,
          title: b.displayName,
          startTime: hhmm(b.startTime),
          endTime: hhmm(b.endTime),
          hours: 1,
          rows: [b],
        });
      }
    } else {
      out.push({ kind: "booking", booking: b });
    }
  }
  return out;
};

/** The day object as the roster sends it (beside the kids' entries). */
export interface CampDayFacts {
  date: string;
  campWeekDayId: string;
  teacherIds: string[];
  startTime: string;
  endTime: string;
  editedAt: string | null;
}
export type CampDayPatch = { teacherIds?: string[]; startTime?: string; endTime?: string };

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** `PATCH /camp/weeks/:id/days/:date` — only the fields that differ from the server's day; unchanged ⇒ null (no call). */
export const dayPatch = (original: Pick<CampDayFacts, "teacherIds" | "startTime" | "endTime">, edited: Pick<CampDayFacts, "teacherIds" | "startTime" | "endTime">): CampDayPatch | null => {
  const body: CampDayPatch = {
    ...(sameSet(original.teacherIds, edited.teacherIds) ? {} : { teacherIds: [...edited.teacherIds] }),
    ...(hhmm(original.startTime) === hhmm(edited.startTime) ? {} : { startTime: hhmm(edited.startTime) }),
    ...(hhmm(original.endTime) === hhmm(edited.endTime) ? {} : { endTime: hhmm(edited.endTime) }),
  };
  return Object.keys(body).length ? body : null;
};

/** The editor's save: one PATCH per CHANGED day, in date order; untouched days send nothing. */
export const changedDayPatches = (originals: readonly CampDayFacts[], edited: readonly CampDayFacts[]): Array<{ date: string; body: CampDayPatch }> =>
  originals
    .map((o) => {
      const e = edited.find((x) => x.date === o.date);
      const body = e ? dayPatch(o, e) : null;
      return body ? { date: o.date, body } : null;
    })
    .filter((x): x is { date: string; body: CampDayPatch } => x !== null);

/** The swap: the day's teacher list with `from` replaced by `to` (order kept; a `to` already present is not doubled). */
export const replaceTeacher = (teacherIds: readonly string[], from: string, to: string): string[] => {
  const out = teacherIds.map((id) => (id === from ? to : id));
  return out.filter((id, i) => out.indexOf(id) === i);
};
