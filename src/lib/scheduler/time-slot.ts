import { TIME_SLOTS, type TimeSlot } from "@/types/app/scheduler";

/**
 * 🔴 TASK-295 / DEF-5 — **a server time, made showable by a `Select` over `TIME_SLOTS`.**
 *
 * The column is `time("start_time")`, so the DTO ships **`"17:00:00"`** — and `contract.ts:155` says so on
 * purpose: *"As stored (`HH:mm:ss`) — the FE formats."* ⇒ **the server is right and the promise is the FE's.**
 * The front end already keeps it at every DISPLAY site (`.slice(0, 5)`, three of them) and skipped it at the one
 * place a CONTROL has to MATCH the value. 🔑 **A Mantine `Select` given a value that is not one of its options
 * renders EMPTY** — so the field was not missing a default, **it had one and could not show it.**
 *
 * ⚠️ **Slicing alone would not have fixed it.** `"17:30:00"` slices to `"17:30"`, **which is also not a slot**,
 * and the field is empty again. ⇒ **the guard is MEMBERSHIP, and a non-member falls back to a visible time.**
 * 📌 *A wrong-but-visible default is a form the admin can correct; an empty one told them nothing was needed —
 * and then let them submit it.*
 *
 * 🔑 **It lives here, not in `resume-defaults.ts`, because it is not about resuming.** The same expression feeds
 * the everyday MOVE dialog (`PlanModal.tsx:828` → the same `Select`), so this is one rule with two callers —
 * and a shared rule filed under one caller's name is how the next stale comment gets written.
 */

/** The creation form's time, kept as the fallback for a value we cannot land on a slot. */
export const FALLBACK_TIME: TimeSlot = "10:00";

const isSlot = (v: string): v is TimeSlot => (TIME_SLOTS as readonly string[]).includes(v);

/**
 * A `TIME_SLOTS` member, always — **the return type says so, so no caller can hand a `Select` a value it cannot
 * render.** 🚫 It never invents a time: anything it cannot land on a slot becomes `fallback`, visibly.
 */
export const toTimeSlot = (value: string | null | undefined, fallback: TimeSlot = FALLBACK_TIME): TimeSlot => {
  if (value) {
    // One path covers both shapes: `"17:00"` slices to itself, `"17:00:00"` to `"17:00"`.
    const hhmm = value.slice(0, 5);
    if (isSlot(hhmm)) return hhmm;
  }
  return fallback;
};
