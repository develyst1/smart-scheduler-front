/**
 * REQ-110 item 1 (TASK-557) — **which rows the bulk confirm may tick.**
 *
 * 🔴 Khwan asked for make-ups to be bulk-confirmable. 🔑 **The backend already accepts them:** TASK-389 fixed
 * `preCheckBulkConfirm` to proceed for **PENDING or EXTENDED** after a bulk confirm had been silently skipping every
 * make-up (born EXTENDED, purple) — so it stayed EXTENDED and the end-of-day auto-mark, CONFIRMED-only and correctly so,
 * never attended it. 📌 **The screen never caught up with that fix**, which is why the risk in this task is in the
 * SELECTION and not in what confirm does.
 *
 * 🔑 **This list mirrors the server's own condition, and that is the whole reason it is a named constant in one file:**
 * the table had the test written inline three times (the row's tick, the select-all id list, the header's disabled
 * state), and three copies of one rule is how the screen drifted from the server in the first place.
 *
 * 🚫 It does not decide the OUTCOME. `CONFIRMED` / `ATTENDED` are an idempotent no-op on the server
 * (`already_confirmed`) and everything else is `skipped` — so nothing here needs to guess: a row that cannot be ticked
 * simply is not offered, and a row that can is answered by the server per id.
 */
import type { Booking } from "@/types/app/scheduler";
import type { BookingStatus } from "@/types/api/contract";

/** The server's `preCheckBulkConfirm` proceed set, mirrored by value. 🚫 Frozen: a fourth status is a decision. */
export const BULK_CONFIRMABLE: readonly BookingStatus[] = Object.freeze(["PENDING", "EXTENDED"]);

/** Can this row be ticked for a bulk confirm? 🔑 One predicate — the row, the select-all and the header all ask it. */
export const bulkConfirmable = (b: Pick<Booking, "status">): boolean => (BULK_CONFIRMABLE as readonly string[]).includes(b.status);

/** Every confirmable row on the page, in the order shown — what "select all" means. */
export const confirmableIds = (rows: readonly Pick<Booking, "id" | "status">[]): string[] => rows.filter(bulkConfirmable).map((b) => b.id);

/**
 * 🔑 **What the header checkbox says**, and it is worth stating because the words changed with this task:
 * *"select all"* means **every confirmable row on this page** — not every row, and not only the pending ones.
 * `all` ⇒ checked, `some` ⇒ indeterminate, none ⇒ unchecked, and with nothing confirmable the box is disabled.
 * 🚫 A row that is not confirmable can never be part of either answer: it has no tick to give.
 */
export const allConfirmableSelected = (ids: readonly string[], selected: readonly string[]): boolean =>
  ids.length > 0 && ids.every((id) => selected.includes(id));
export const someConfirmableSelected = (ids: readonly string[], selected: readonly string[]): boolean =>
  selected.length > 0 && !allConfirmableSelected(ids, selected);
