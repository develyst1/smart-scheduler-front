// Configurable business rules (SPEC-029 / REQ-031). The BE registry is the source of truth for what's configurable,
// each rule's unit, default, and bounds; the FE only lists / edits / resets. "In the DB" ≠ "easy to change" — this
// screen is what makes REQ-031 real (no SQL, no deploy).

/** SPEC-044 (REQ-049) — a rule is a number OR a named choice. The FE picks its editor from this. */
export type SettingType = "number" | "enum";

export interface SettingRow {
  key: string;
  /** Human label from the BE registry (already localised server-side). */
  label: string;
  /** Which editor this row needs: a `NumberInput`, or a choice control driven by `options`. */
  type: SettingType;
  /** The allowed values for an `enum` row (raw keys — the FE renders them via `dictionaries.ts`); `null` otherwise. */
  options: string[] | null;
  /** e.g. "days" | "minutes" | "option" — shown beside the value so the unit is never ambiguous. */
  unit: string;
  /** The effective value: the override if set, else the coded default. Numeric rules stay numbers; enum rules are keys. */
  value: number | string;
  /** The coded default — shown so staff can see what "reset" restores. */
  default: number | string;
  /** True when an override row exists (value came from the DB, not the code default). */
  isOverridden: boolean;
}
