// In-memory mock for the settings screen — used when NEXT_PUBLIC_USE_MOCK=true. Mirrors the BE registry (its rules,
// defaults + bounds) so list / edit-with-validation / reset are all exercisable offline. SPEC-044 added an `enum`
// rule, so the mock carries one too — otherwise the new choice editor would be unreachable without a backend.
import type { SettingRow, SettingType } from "@/types/app/settings";

interface MockSpec {
  key: string;
  label: string;
  type: SettingType;
  unit: string;
  default: number | string;
  /** number rules only */
  min?: number;
  max?: number;
  /** enum rules only */
  options?: string[];
}

const SPECS: MockSpec[] = [
  { key: "teacher_change_notice_days", label: "Teacher-change notice", type: "number", unit: "days", default: 3, min: 0, max: 30 },
  { key: "checkin_early_minutes", label: "Check-in early window", type: "number", unit: "minutes", default: 30, min: 0, max: 240 },
  // SPEC-048 / REQ-047 (TASK-146) — two number rules, one per teacher type. Labels + bounds copied from the BE
  // registry (`lib/settings.ts`), including its new `hours` unit, so these rows are exercisable offline like the rest.
  {
    key: "leave_cutoff_hours_fulltime",
    label: "แจ้งลาล่วงหน้า — ครูประจำ/พาร์ทไทม์ (ชั่วโมง)",
    type: "number",
    unit: "hours",
    default: 3,
    min: 0,
    max: 72,
  },
  {
    key: "leave_cutoff_hours_freelance",
    label: "แจ้งลาล่วงหน้า — ครูฟรีแลนซ์ (ชั่วโมง)",
    type: "number",
    unit: "hours",
    default: 3,
    min: 0,
    max: 72,
  },
  {
    key: "notify_on_leave",
    label: "แจ้งเตือนเมื่อมีการลา",
    type: "enum",
    unit: "option",
    default: "admin_only",
    options: ["admin_only", "admin_and_teacher"],
  },
];

const overrides = new Map<string, number | string>();

const delay = <T>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 150));

const rowFor = (spec: MockSpec): SettingRow => {
  const has = overrides.has(spec.key);
  return {
    key: spec.key,
    label: spec.label,
    type: spec.type,
    options: spec.options ?? null,
    unit: spec.unit,
    value: has ? (overrides.get(spec.key) as number | string) : spec.default,
    default: spec.default,
    isOverridden: has,
  };
};

export const getSettings = () => delay(SPECS.map(rowFor));

export const updateSetting = (key: string, value: number | string) => {
  const spec = SPECS.find((s) => s.key === key);
  if (!spec) return Promise.reject(new Error(`Unknown setting "${key}"`));
  if (spec.type === "enum") {
    // The BE names the allowed options in its refusal rather than saying "invalid" — mirror that.
    if (typeof value !== "string" || !spec.options?.includes(value)) {
      return Promise.reject(new Error(`Value must be one of: ${(spec.options ?? []).join(", ")}`));
    }
  } else if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < (spec.min ?? 0) ||
    value > (spec.max ?? 0)
  ) {
    return Promise.reject(
      new Error(`Value must be a whole number (${spec.unit}) between ${spec.min} and ${spec.max}`),
    );
  }
  overrides.set(key, value);
  return delay(rowFor(spec));
};

export const resetSetting = (key: string) => {
  const spec = SPECS.find((s) => s.key === key);
  if (!spec) return Promise.reject(new Error(`Unknown setting "${key}"`));
  overrides.delete(key); // idempotent — reset twice is fine
  return delay(rowFor(spec));
};
