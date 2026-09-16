import type { SemanticColor } from "@/lib/ui/colors";

/**
 * How a booking STATUS is painted on the schedule — one literal, read by the day grid, the week grid and the
 * legend that explains them (2026-09-16, owner review).
 *
 * 🔴 **It lives here because there are three readers, and the legend is the reason it matters.** The first cut
 * of this change put identical maps in `CalendarGrid` and `CalendarWeekGrid` while the legend kept rendering
 * Mantine `StatusChip`s in the OLD semantic palette — so the strip that exists to say *"this colour means ลา"*
 * was showing a different colour from the cells underneath it. A legend that disagrees with its grid is worse
 * than no legend: staff trust it and misread the schedule.
 *
 * 🚫 These are the `cal-*` tokens, NOT `primary/success/warning/danger/secondary`. The semantic five are read by
 * 16 other files and by every `notify()` toast through `MANTINE_COLOR`; deepening them there would repaint the
 * product to fix one screen. See `--cal-*` in `globals.css`.
 *
 * 🚫 And NOT `StatusChip` either — that component is shared with `BookingsTable`, `PlanModal` and
 * `BookingModal`, which sit on white and read fine as they are.
 *
 * The keys are `SemanticColor` because `BOOKING_STATUS_COLOR` speaks that vocabulary; only the VALUES moved.
 */

/**
 * พื้น + ขอบ ของ chip/การ์ดตามสถานะ — **34% fill, solid border.**
 *
 * The old set was a 10% wash with a 30% border, which is how six different hues ended up within a few percent
 * of each other and drew the owner's note: *"สีไม่จำเป็นต้องเป็นพาสเทล เพราะสีแต่ละอันแอบใกล้เคียงกัน"*. At 34%
 * the hue is actually present; the solid border stops the chip bleeding into the cell it sits in.
 *
 * ⚠️ **`default` (= `SICK_LEAVE`) no longer borrows `muted-100/300`.** That was the *"ลาที่ดูยากมาก"* half of the
 * complaint: a plain grey on a white cell has no hue to deepen, so it fell further behind every time the others
 * gained any. It is still slate — the owner asked for deeper, not for a new colour — but now a real token that
 * deepens with the rest.
 */
export const CAL_SURFACE_STYLE: Record<SemanticColor, string> = {
  primary: "bg-cal-conf/[0.34] border-cal-conf",
  success: "bg-cal-att/[0.34] border-cal-att",
  warning: "bg-cal-pend/[0.34] border-cal-pend",
  secondary: "bg-cal-ext/[0.34] border-cal-ext",
  danger: "bg-cal-no/[0.34] border-cal-no",
  default: "bg-cal-leave/[0.34] border-cal-leave",
};

/**
 * The hover darkening — **a separate map, and the separation is the point.**
 *
 * 🔴 The legend renders the same surface as a SAMPLE, and a sample is not a control: it does not click, so it
 * must not light up under the cursor. Folding `hover:` into `CAL_SURFACE_STYLE` gave the legend a hover state
 * it had no business having, and the owner caught it. ⇒ only the two grids, whose cells really are buttons,
 * append this.
 */
export const CAL_SURFACE_HOVER: Record<SemanticColor, string> = {
  primary: "hover:bg-cal-conf/[0.44]",
  success: "hover:bg-cal-att/[0.44]",
  warning: "hover:bg-cal-pend/[0.44]",
  secondary: "hover:bg-cal-ext/[0.44]",
  danger: "hover:bg-cal-no/[0.44]",
  default: "hover:bg-cal-leave/[0.44]",
};

/**
 * The status dot — beside the time (week) or the name (day).
 *
 * 🔴 **Always the `-dot` token, never the fill's.** A dot in the same hue as the tint under it has nothing to
 * stand against; at a 34% fill it dissolves into the wash it exists to mark. Each `-dot` is two ramp steps
 * darker than its fill — see `--cal-*-dot` in `globals.css` for the rule and the one offset (`pend`).
 *
 * The FILLS are untouched by this: the colour staff have learned for each status is the same, only the marker
 * on top of it is stronger.
 */
export const CAL_DOT_STYLE: Record<SemanticColor, string> = {
  primary: "bg-cal-conf-dot",
  success: "bg-cal-att-dot",
  warning: "bg-cal-pend-dot",
  secondary: "bg-cal-ext-dot",
  danger: "bg-cal-no-dot",
  default: "bg-cal-leave-dot",
};
