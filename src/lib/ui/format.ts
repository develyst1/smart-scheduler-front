// Display-only formatters (SPEC-037 / TASK-129, item 5). The ONE place a table turns a stored date into what the
// user reads. NEVER use these for API query ranges or DateInput/startDate VALUES — those stay ISO `YYYY-MM-DD`.
import dayjs from "dayjs";

/** A stored ISO date (`YYYY-MM-DD`) → the display format `DD/MMM/YY` (e.g. `05/Aug/26`). Empty/invalid → "". */
export const formatDateDisplay = (iso: string | null | undefined): string =>
  iso ? dayjs(iso).format("DD/MMM/YY") : "";

/**
 * The same date with its WEEKDAY in front (`Mon 28/Sep/26`) — for the plan and series modals, where the rows are a
 * schedule and "which day is that?" is the question staff ask of every line. Weekday names stay English in both
 * languages: the rows are the backend's own schedule rows, not translated copy.
 * 🚫 Not a replacement for `formatDateDisplay`: a one-off date elsewhere reads fine without the weekday.
 */
export const formatDateWithDay = (iso: string | null | undefined): string =>
  iso ? dayjs(iso).format("ddd DD/MMM/YY") : "";

/**
 * 🔴 TASK-324 — **a stored time (`HH:mm:ss`) → what a human reads (`HH:mm`).** Empty/absent → `""`, the same
 * contract `formatDateDisplay` keeps.
 *
 * 🔑 **This exists because its sibling did.** Dates had a formatter from TASK-129; times never got one, so
 * **every time on screen was a local decision** — seven sites, three doing `.slice(0, 5)` inline and four doing
 * nothing at all. The owner reported the result four times in one week and each report looked like its own
 * one-line bug.
 *
 * ⚠️ **ONE time, not a range.** Three call sites render `start`–`end` with three different separators, and the
 * separator is layout: a table cell and an inline list item want different punctuation, and one site has no
 * `endTime` to pair. **A range helper would have to own the dash and take an optional second argument** — two
 * shapes in one function, formatting something that is not a time.
 *
 * 🚫 **A trim, not a parse** — deliberately `slice`, so the output is byte-identical to the three inline
 * `.slice(0, 5)` calls it replaces, including for a malformed value. A `dayjs` parse here would quietly change
 * what those three already-correct sites render.
 *
 * 🚫 **NEVER for a `Select` VALUE.** `contract.ts:155` says the API sends `HH:mm:ss` and names the FE as the
 * formatter — that contract stays — and a control's value is a KEY, not a display (TASK-295: `PlanModal`'s
 * `seed.startTime` feeds `TIME_SLOTS` through `toTimeSlot`, a different rule for a different job).
 */
export const formatTimeDisplay = (time: string | null | undefined): string => (time ? time.slice(0, 5) : "");
