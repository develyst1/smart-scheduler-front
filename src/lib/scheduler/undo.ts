/**
 * SPEC-094 / REQ-108 (TASK-492 BE → TASK-518 FE) — **the admin Undo: one control, one act, in two places.**
 *
 * The API shipped in TASK-492 and nothing could press it; this file is the rule half of the control that can.
 *
 * 🔑 **The label names what will happen to THIS row** — an attendance undone, a check-in undone, a leave undone — and
 * where nothing is undoable there is **no control at all**, not a greyed one: a disabled button invites "why?", and the
 * honest answer ("there is nothing here to undo") is better said by absence.
 * 🔴 **The verb is `ย้อน…`, never `ยกเลิก…`** (the owner, via @Porter): `ยกเลิก` belongs to `ยกเลิกการจอง` — **Cancel takes a
 * session off the schedule, Undo puts one back** — and those two must never blur on a screen.
 * 🚫 Nothing here decides whether an undo is *allowed*: every refusal is the server's, named, and shown as its own
 * sentence. This file only chooses the words and whether to offer the door.
 */
import type { Booking } from "@/types/app/scheduler";
import type { CheckinChannel } from "@/types/api/contract";

/** The 60th key (TASK-492). A user without it sees no control — never a control that fails. */
export const UNDO_KEY = "action:calendar.undo";

/**
 * Which of the server's five channels mean *"attended because someone SCANNED"* rather than *"attended because staff
 * said so"*. 📌 TASK-526: this now names a subset of a **closed set** (`CheckinChannel`, TASK-488's `checkinChannel`)
 * instead of guessing at an open-ended string — so the label is a FACT about the channel, and the type makes a typo a
 * compile error. The other two channels (`staff`, `end-of-day`) and `null` read as the general *attendance* wording.
 *
 * 🔑 The safe default SURVIVES the change, deliberately: anything unrecognised (a channel a later task invents, an older
 * payload with no channel at all) still reads as *attendance*. **Both labels lead to the same act, so the general word is
 * the right fallback** — a mislabel here is cosmetic, a missing control would not be.
 * 🚫 `checkinActor` is never read: it is a person's username, it has no business on a label, and TASK-488 exists to keep
 * the two apart.
 */
export const SCAN_CHANNELS: readonly CheckinChannel[] = ["shopfront-qr", "checkin-qr", "line"];

export type UndoKind = "attendance" | "checkin" | "leave";

/** Which undo this row is — or `null` when there is nothing to undo (⇒ no control). */
export const undoKind = (b: Pick<Booking, "status" | "checkinChannel">): UndoKind | null => {
  if (b.status === "SICK_LEAVE") return "leave";
  if (b.status !== "ATTENDED") return null;
  return b.checkinChannel != null && (SCAN_CHANNELS as readonly string[]).includes(b.checkinChannel) ? "checkin" : "attendance";
};

/** The owner-approved labels (TASK-517), one per kind. 🚫 No `ยกเลิก` anywhere in this family. */
export const UNDO_LABEL_KEYS: Readonly<Record<UndoKind, string>> = Object.freeze({
  attendance: "undo.attendanceBtn",
  checkin: "undo.checkinBtn",
  leave: "undo.leaveBtn",
});

/**
 * The dialog body, per kind. 🔴 **The leave case says the coach IS told** — TASK-508 sends him "class on again" — while
 * an attendance or check-in undo tells nobody. Shipping "nobody is told" on a leave row would be the same defect this
 * control exists to remove, so the body varies with the state exactly as the label does, from ONE table.
 */
export const UNDO_BODY_KEYS: Readonly<Record<UndoKind, string>> = Object.freeze({
  attendance: "undo.attendanceMsg",
  checkin: "undo.checkinMsg",
  leave: "undo.leaveMsg",
});

/** The door: the key AND something to undo. Hidden, never disabled. */
export const undoDoor = (granted: boolean, b: Pick<Booking, "status" | "checkinChannel">): boolean => granted && undoKind(b) !== null;

/** `POST /bookings/:id/undo` — the optional reason rides only when typed (the server allows ≤ 500 chars). */
export const undoBody = (reason: string): { reason?: string } => (reason.trim() ? { reason: reason.trim() } : {});
