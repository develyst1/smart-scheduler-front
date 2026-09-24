/**
 * REQ-095 Stage 2a / SPEC-081 (TASK-398) — DUO / Group sessions, the pure side.
 *
 * A GROUP row is one booking (`bookingType: "GROUP"`) carrying `group { key, kind, name, seatCap, seats[], teacherRates,
 * ratePostedAt }`; its SEATS are ordinary booking rows (`groupId` / `groupName`) that the server hides from the grid
 * and shows everywhere else. The FE renders `n/cap` from `group.seats`, never counts anything itself beyond that
 * length, and sends the confirmed bodies. 🚫 The ONE client rule: a DUO's cap is 2 (locked in the form — the server
 * refuses anything else with a `400`); everything else (`GROUP_FULL`, `SLOT_TAKEN`, `GROUP_MISMATCH`) is the server's.
 */

export const GROUP_KINDS = ["DUO", "GROUP"] as const;
export type GroupKind = (typeof GROUP_KINDS)[number];

/** DUO ⇒ exactly 2; Group ⇒ 3..12 (the server's range is 2..12; a Group of 2 is a DUO by name). */
export const DUO_CAP = 2;
export const GROUP_CAP_MIN = 3;
export const GROUP_CAP_MAX = 12;

/** The cap the form sends for a kind: DUO is locked at 2; Group keeps what was typed. Pure. */
export const seatCapFor = (kind: GroupKind, typed: number | ""): number | "" => (kind === "DUO" ? DUO_CAP : typed);

export interface GroupSeat {
  bookingId: string;
  studentId: string | null;
  studentName: string | null;
  status: string;
  courseId: string | null;
}

/** The server's facts on a GROUP row (`group`), as the FE reads them. */
export interface GroupFacts {
  key: string | null;
  kind: GroupKind | null;
  /** REQ-105 (TASK-453) — the yield / closed stamps and the SERVER's clash verdict; read, never re-derived. */
  yieldedAt?: string | null;
  closedAt?: string | null;
  clash?: boolean;
  /** The card's price group for this group, from the server — the course form inside the group picks its card by THIS name. */
  priceGroup: string | null;
  name: string | null;
  seatCap: number | null;
  seats: GroupSeat[];
  /** teacherId → SATANG. */
  teacherRates: Record<string, number>;
  ratePostedAt: string | null;
}

/**
 * `n/cap` for the cell and the roster — `n` is the seats the server listed, nothing derived.
 * REQ-105 (TASK-453/457): `seatCap: null` now means **uncapped**, and an uncapped group prints a bare `n` — no
 * denominator is invented (the old `?` claimed "unknown", which is a different thing from "no limit").
 */
export const seatsLabel = (g: Pick<GroupFacts, "seats" | "seatCap">): string =>
  typeof g.seatCap === "number" ? `${g.seats.length}/${g.seatCap}` : `${g.seats.length}`;

/** The body of `POST /bookings/group-series` — the confirmed shape; optional parts only when present. */
export interface GroupSeriesInput {
  name: string;
  groupKind: GroupKind;
  seatCap: number;
  teacherId: string;
  additionalTeacherIds?: string[];
  teacherRates?: Record<string, number>;
  startTime: string;
  dates: string[];
}
export const groupSeriesBody = (input: GroupSeriesInput) => ({
  name: input.name,
  groupKind: input.groupKind,
  seatCap: input.seatCap,
  teacherId: input.teacherId,
  ...(input.additionalTeacherIds?.length ? { additionalTeacherIds: input.additionalTeacherIds } : {}),
  ...(input.teacherRates ? { teacherRates: input.teacherRates } : {}),
  startTime: input.startTime,
  dates: [...input.dates].sort(),
});

/** The body of `PATCH /bookings/:id/group-teacher`. */
export interface GroupTeacherSwapInput {
  teacherId: string;
  fromHereOn: boolean;
}
