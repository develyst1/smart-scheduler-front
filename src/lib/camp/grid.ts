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
  /** REQ-105 (TASK-454/457) — the DATE's kid count, from the server; null when the reader did not send it. */
  kidCount: number | null;
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
          kidCount: b.campKidCount ?? null,
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
  /** REQ-104 §2 item 4 (TASK-443/444) — teacherId → SATANG; `null` = masked without key 59 (no box); absent = older payload. */
  teacherRates?: Record<string, number> | null;
  /** REQ-105 (TASK-454/457) — the coaches with their RESOLVED windows (a coach on the day default reads the day's hours). */
  teachers?: CampDayTeacherView[];
}
/** A coach row as the server sends it: the window is resolved, so "his own" and "the day's" look the same here. */
export interface CampDayTeacherView {
  teacherId: string;
  startTime: string;
  endTime: string;
  rateMinor?: number | null;
}
/** REQ-105 (TASK-454/457) — a coach on a camp day: his own window (omitted ⇒ the DAY's, resolved server-side) and rate. */
export interface CampDayTeacher {
  teacherId: string;
  startTime?: string;
  endTime?: string;
  rateMinor?: number;
}
/**
 * The day PATCH. `teachers[]` is the shape from TASK-454; `teacherIds`/`teacherRates` are the retired pair (the
 * server still parses them for ONE deploy — 🚫 nothing new is built on them).
 */
export type CampDayPatch = { teacherIds?: string[]; startTime?: string; endTime?: string; teacherRates?: Record<string, number>; teachers?: CampDayTeacher[] };

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * The day's rates restricted to the coaches ON the day (the server's 400 for anyone else), a missing rate read as `0`
 * (the server's default — the box shows `0`, not blank). `null` (masked) ⇒ nothing to compare.
 */
export const dayRates = (day: Pick<CampDayFacts, "teacherIds" | "teacherRates">): Record<string, number> | null => {
  if (day.teacherRates === null || day.teacherRates === undefined) return null;
  return Object.fromEntries(day.teacherIds.map((id) => [id, day.teacherRates?.[id] ?? 0]));
};

/**
 * `PATCH /camp/weeks/:id/days/:date` — only the fields that differ from the server's day; unchanged ⇒ null (no call).
 * `teacherRates` rides only when a rate on the edited day differs (by coach, on the day's coaches) — and never when the
 * server masked them (`null`): the caller also strips it without key 59 (`withoutRates`), the server 403s regardless.
 */
const teacherViewOf = (day: Pick<CampDayFacts, "teachers">, id: string): CampDayTeacherView | undefined => (day.teachers ?? []).find((x) => x.teacherId === id);

/**
 * REQ-105 (TASK-454/457) — ONE coach's entry in the day PATCH's `teachers[]`.
 *
 * 🔴 **A window is sent only when the admin CHANGED it.** The server resolves a coach on the day default to the day's
 * hours, so "his own 10:00" and "the day's 10:00" arrive identical and the FE cannot tell them apart — sending back
 * what was read would silently freeze every coach onto today's window, and a later week-level edit would not reach
 * them. Equal to what the server sent ⇒ omitted, which is exactly what NULL means. (A half-given window is sent as
 * typed: the server's 400 says so, and inventing the other half would be a value nobody chose.)
 */
export const teacherEntry = (server: Pick<CampDayFacts, "teachers" | "teacherRates">, edited: { teacherId: string; startTime?: string; endTime?: string; rateMinor?: number | null }): CampDayTeacher => {
  const was = teacherViewOf(server, edited.teacherId);
  const start = edited.startTime?.trim() ? hhmm(edited.startTime) : "";
  const end = edited.endTime?.trim() ? hhmm(edited.endTime) : "";
  const masked = server.teacherRates === null;
  const rateWas = was?.rateMinor ?? null;
  return {
    teacherId: edited.teacherId,
    ...(start && start !== (was ? hhmm(was.startTime) : "") ? { startTime: start } : {}),
    ...(end && end !== (was ? hhmm(was.endTime) : "") ? { endTime: end } : {}),
    ...(!masked && typeof edited.rateMinor === "number" && edited.rateMinor !== (rateWas ?? 0) ? { rateMinor: edited.rateMinor } : {}),
  };
};

/**
 * `PATCH /camp/weeks/:id/days/:date` — only what differs from the server's day; unchanged ⇒ null (no call).
 * The roster now rides as `teachers: [...]` (TASK-454's shape) whenever the coach SET or any coach's window/rate
 * changed; 🚫 the retired `teacherIds`/`teacherRates` pair is never sent by this FE any more.
 */
export const dayPatch = (original: CampDayFacts, edited: CampDayFacts): CampDayPatch | null => {
  const rosterChanged = !sameSet(original.teacherIds, edited.teacherIds);
  const entries = edited.teacherIds.map((id) =>
    teacherEntry(original, { teacherId: id, startTime: teacherViewOf(edited, id)?.startTime, endTime: teacherViewOf(edited, id)?.endTime, rateMinor: edited.teacherRates?.[id] }),
  );
  // Something to say about a coach = an entry with more than his id, or the roster itself changed.
  const teachersChanged = rosterChanged || entries.some((e) => Object.keys(e).length > 1);
  const body: CampDayPatch = {
    ...(teachersChanged ? { teachers: entries } : {}),
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
