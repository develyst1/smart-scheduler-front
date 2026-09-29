/**
 * REQ-110 item 5 (TASK-562 BE → TASK-564 FE) — **this session, or the rest?**
 *
 * 🔴 Khwan's complaint was that changing a teacher *"changed the whole course"*. 🔑 **It did, and the screen never asked.**
 * The only scope control the series doors had was a date box labelled *"From date — today by default"*, so a Swap or an
 * Add on one session quietly rewrote **every remaining row from today onward**. The backend now **refuses a body that
 * names neither scope (400)** — *the default is a refusal, not a guess* — so the UI must make the choice explicit.
 *
 * 🔑 **Exactly one scope, always:**
 *  · `onDate`   = **this session only.** On a Swap that is a **COVER** (A replaces B on that row); on an Add it is A
 *    **JOINING** B for that row (co-teacher, both paid). **Different outcomes, and the pay differs.**
 *  · `fromDate` = **this session and the rest** — the old silent behaviour, now something an admin chooses.
 *
 * 🚫 **No default.** A pre-selected *"the rest"* would reproduce Khwan's complaint with one extra click, and a
 * pre-selected *"this session"* would be a different guess. **`null` until a person chooses**, and the door stays shut.
 * 🚫 And the rate never contradicts the scope: `rateMinor` belongs to a COVER (the server refuses it otherwise), so it
 * never rides on a whole-series body.
 */

/** What the admin chose. `null` = **not yet chosen**, which is not a scope and cannot be sent. */
export type SeriesScope = "this" | "rest" | null;

export const SERIES_SCOPES = Object.freeze(["this", "rest"] as const);

/** The door opens only once a scope is chosen. 🚫 There is no third answer and no default. */
export const scopeChosen = (scope: SeriesScope): scope is "this" | "rest" => scope === "this" || scope === "rest";

/**
 * The one scope field the body carries. 🔑 **Exactly one key, never both and never neither** — the shape the server now
 * enforces, mirrored here so the refusal is something we never provoke by accident.
 */
export const scopeBody = (scope: SeriesScope, date: string): { onDate: string } | { fromDate: string } | null =>
  !scopeChosen(scope) || !date ? null : scope === "this" ? { onDate: date } : { fromDate: date };

/** The copy key for the date box's label — it says a different thing in each scope, because it means a different thing. */
export const scopeDateLabelKey = (scope: SeriesScope): string =>
  scope === "this" ? "otherSeries.scopeThisDate" : "otherSeries.fromDate";

/**
 * 🔑 **What this act will be called on screen**, and the two must not read alike: *A covers for B* (a swap on one row —
 * B is not there, A is paid for it) versus *A joins B* (an add on one row — both are there and both are paid).
 * 📌 Only meaningful for `this`: over the rest of the series a swap is a replacement and an add is an extra coach, which
 * is what the existing wording already says.
 */
export const scopeOutcomeKey = (mode: "add" | "swap", scope: SeriesScope): string | null =>
  scope !== "this" ? null : mode === "swap" ? "otherSeries.coverNote" : "otherSeries.joinNote";
