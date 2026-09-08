/**
 * The shared measurements every skeleton in the app is drawn from.
 *
 * 🔴 **The SHAPES are never shared; these NUMBERS always are.** A course card, a family card, a table row and a
 * calendar cell look nothing alike, so a component stretched over all four fits none of them — that stays
 * per-screen. But if each screen also picks its own bar heights and radii, the app ships a dozen pieces of
 * handwork that happen to mean the same thing, which is the drift `hallmark audit` flagged across the four
 * loading languages already in here.
 *
 * ⇒ every `Skeleton` in the app takes its `height` and `radius` from this file. A new skeleton adds a NAMED
 * role here rather than a number at the call site.
 */
export const SKEL = {
  /** A card's or row's primary line — a name, a title. */
  title: 16,
  /** An ordinary line of body text, and the default for a table cell. */
  line: 12,
  /** A secondary line: dates, counts, the meta row under a name. */
  meta: 10,
  /** A pill-shaped element — status badge, type chip. */
  badge: 20,
  /** A button. Matches the `size="xs"` / `compact-sm` buttons these cards actually carry. */
  button: 30,
} as const;

/** `radius` for every bar. Pill-shaped bars (a progress track) pass `"xl"` explicitly instead. */
export const SKEL_RADIUS = "sm" as const;
