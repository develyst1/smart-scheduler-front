/**
 * REQ-110 item 7 (TASK-559) — **how wide the camp week dialog has to be.**
 *
 * 🔴 Khwan's report: the per-coach **rate box is cut off** on uat, desktop. Nothing is logically broken —
 * `OpenWeekDialog` puts a **six-column table** inside a `size="lg"` modal (620px), and **the rate is the LAST column**,
 * so what falls off the right edge is exactly the thing she needed. 🔑 The fix is the container, not the table.
 *
 * 🔑 **Why a `min()` and not a bigger fixed size:** *a fix tuned to one screen moves the problem to another one.*
 * `min(92rem, 94vw)` is **1472px on Khwan's 1920 desktop** and **94% of the viewport on anything narrower**, so the
 * dialog never becomes wider than the screen it is on — the page can never gain a horizontal scrollbar because of it.
 * 🚫 **Only when the rate column is actually there.** `showRates` is conditional (the key plus a day that carries rates),
 * and the five-column layout fitted `lg` fine: **widening it unconditionally would change a dialog that was not broken.**
 */

/** What the dialog is showing. `isEdit` = an existing week (the per-day table); otherwise it is the small open-week form. */
export interface CampDialogShape {
  isEdit: boolean;
  showRates: boolean;
}

/** Mantine's own size for the two narrow cases; a CSS width for the wide one. */
export const CAMP_DIALOG_CREATE = "md";
export const CAMP_DIALOG_EDIT = "lg";
/** 🔑 Viewport-capped on purpose — see the file header. 1472px at 1920, 94vw below that. */
export const CAMP_DIALOG_EDIT_RATES = "min(92rem, 94vw)";

export const campDialogWidth = ({ isEdit, showRates }: CampDialogShape): string =>
  !isEdit ? CAMP_DIALOG_CREATE : showRates ? CAMP_DIALOG_EDIT_RATES : CAMP_DIALOG_EDIT;
