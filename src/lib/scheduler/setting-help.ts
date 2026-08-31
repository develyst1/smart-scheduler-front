/**
 * SPEC-048 / TASK-147 — "does this settings row have a help line, and what does it say?"
 *
 * Lifted out of `SettingsContent` for one reason: **the safety of showing help on EVERY row rests entirely on
 * the dictionary-miss check**, so that check is a named function with its own test rather than a condition
 * buried in JSX. Before TASK-147 the screen only rendered help for `type:"enum"` rows; dropping that gate is
 * what lets the two leave-cut-off rules (`type:"number"`) show theirs, and it is also what would let a *future*
 * number rule leak `settings.help.some_key` onto the screen if the miss check were ever weakened.
 *
 * 🔴 Two rules, both load-bearing:
 * 1. **No dictionary entry ⇒ NO line.** `t()` returns the key it was given when it misses, so a row with no
 *    entry must render nothing at all — never the raw key, never an empty `<Text>` (an empty dimmed line reads
 *    as copy that failed to load).
 * 2. **`{n}` is interpolated with the row's EFFECTIVE value** (its override if set, else the coded default).
 *    Rendering the sentence without vars would print a literal `{n}` to staff — the raw-placeholder defect
 *    `lib/i18n/keys.test.ts` exists to catch — and hardcoding "3" would contradict REQ-047 AC-7, whose whole
 *    point is that the number staff configured is the number they read.
 */

/** The `t` shape this needs — narrow on purpose, so the helper stays pure and testable without React. */
type Translate = (key: string, vars?: Record<string, string | number>) => string;

/**
 * The help sentence for a settings row, or `null` when the row has none.
 *
 * @param value the row's effective value — what `{n}` becomes.
 */
export function settingHelp(t: Translate, key: string, value: number | string): string | null {
  const dictKey = `settings.help.${key}`;
  const text = t(dictKey, { n: value });
  // `t()` falls back to the key itself on a miss. That identity IS the "no help for this row" signal.
  return text === dictKey ? null : text;
}
