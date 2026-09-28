/**
 * TASK-546 (BE) → TASK-547 (FE) — **what the Undo dialog may say BEFORE the click.**
 *
 * 🔴 Why: today's body promises, for every leave, that *"the leave is returned to the family's quota and its make-up is
 * cancelled"* — **false for a creation-declared leave, an over-quota leave, a 1-hour leave and a voucher leave.** This is
 * the fourth dialog wrong because a screen could not see a server fact. Now it can: `GET /bookings/:id/undo-preview` runs
 * the act's own `planUndo` and writes nothing.
 *
 * 🔑 **A preview is a FORECAST, not a guarantee.** `UNDO_PLAN_WOULD_CHANGE` is decided *after* the act's writes
 * (TASK-546 §4), so **the act can still refuse a preview that said ok.** Every sentence here is therefore worded as
 * *"would"*, and 🚫 **nothing here lets a screen skip the act's failure path**: the act is authoritative, the dialog is a
 * forecast. A refusal arriving after a clean preview is **not a contradiction** — it is the act knowing more.
 *
 * 🚫 **A refusal is the server's own sentence, never ours.** *A refusal we paraphrase is a refusal we can get wrong.*
 * 🚫 **And silence is not an answer:** a preview in flight and a preview that FAILED each have their own words, because
 * *silence read as "nothing will happen" is this defect again.*
 */
import type { UndoPreview } from "@/types/api/contract";

/** Where the dialog is with its forecast. `refused` is the only state that blocks the act. */
export type PreviewState = "loading" | "failed" | "refused" | "ready";

export const previewState = (p: UndoPreview | undefined, isLoading: boolean, isError: boolean): PreviewState => {
  if (isLoading) return "loading";
  // 🔑 A failed request outranks a stale body: having asked and not been answered is its own state, and the words for it
  // say we could not check — never the body we happened to have.
  if (isError || !p) return "failed";
  return p.ok ? "ready" : "refused";
};

/**
 * 🔑 **The only state that stops the act is a refusal the act itself produced** (`ok: false` is `planUndo`'s own throw,
 * word for word). `loading` waits — the forecast is 200 ms away and a click that races it would be answered by the act
 * anyway. `failed` **does NOT block**: a preview outage must not stop a legitimate undo, and the act decides.
 */
export const canConfirm = (state: PreviewState): boolean => state === "ready" || state === "failed";

/** The refusal to show, as sent. `null` unless the server actually refused. */
export const refusalOf = (p: UndoPreview | undefined): string | null => (p && !p.ok ? p.message : null);

/** One line of the forecast: a copy key plus the values that line needs. */
export interface PreviewLine {
  key: string;
  vars?: Record<string, string>;
}

/**
 * What the act WOULD do, from the preview and nothing else. 🚫 No line is emitted for a fact the preview did not state:
 * **an absent make-up is not "no make-up", it is nothing to say** — and a dialog that lists only what it knows cannot
 * promise a quota it never saw. The order is fixed (quota · make-up · expiry) so the sentence reads the same every time.
 */
export const previewLines = (p: UndoPreview | undefined): PreviewLine[] => {
  if (!p || !p.ok) return [];
  const out: PreviewLine[] = [];
  if (p.leaveRefunded) out.push({ key: "undo.previewLeaveBack" });
  if (p.makeupCancelled) out.push({ key: "undo.previewMakeupOff", vars: { date: p.makeupCancelled.date } });
  if (p.expiry) out.push({ key: "undo.previewExpiry", vars: { from: p.expiry.from, to: p.expiry.to } });
  return out;
};

/**
 * 🔑 A ready preview with NOTHING to list is a real and common case (an attendance undo, a 1-hour leave): it must say so
 * in words, because **an empty list is exactly the silence an admin reads as "everything you feared".** The kind's own
 * body still states what the act is and who is told; this line states that nothing else follows.
 */
export const previewNothingElse = (p: UndoPreview | undefined): boolean => Boolean(p?.ok) && previewLines(p).length === 0;
