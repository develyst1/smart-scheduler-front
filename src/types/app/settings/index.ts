// Configurable business rules (SPEC-029 / REQ-031). The BE registry is the source of truth for what's configurable,
// each rule's unit, default, and bounds; the FE only lists / edits / resets. "In the DB" ≠ "easy to change" — this
// screen is what makes REQ-031 real (no SQL, no deploy).

export interface SettingRow {
  key: string;
  /** Human label from the BE registry (already localised server-side). */
  label: string;
  /** e.g. "days" | "minutes" — shown beside the value so the unit is never ambiguous. */
  unit: string;
  /** The effective value: the override if set, else the coded default. */
  value: number;
  /** The coded default — shown so staff can see what "reset" restores. */
  default: number;
  /** True when an override row exists (value came from the DB, not the code default). */
  isOverridden: boolean;
}
