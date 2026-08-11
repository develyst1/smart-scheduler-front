// In-memory mock for the settings screen — used when NEXT_PUBLIC_USE_MOCK=true. Mirrors the BE registry (the two
// go-live rules, their defaults + bounds) so list / edit-with-validation / reset are all exercisable offline.
import type { SettingRow } from "@/types/app/settings";

interface MockSpec {
  key: string;
  label: string;
  unit: string;
  default: number;
  min: number;
  max: number;
}

const SPECS: MockSpec[] = [
  { key: "teacher_change_notice_days", label: "Teacher-change notice", unit: "days", default: 3, min: 0, max: 30 },
  { key: "checkin_early_minutes", label: "Check-in early window", unit: "minutes", default: 30, min: 0, max: 240 },
];

const overrides = new Map<string, number>();

const delay = <T>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 150));

const rowFor = (spec: MockSpec): SettingRow => {
  const has = overrides.has(spec.key);
  return {
    key: spec.key,
    label: spec.label,
    unit: spec.unit,
    value: has ? (overrides.get(spec.key) as number) : spec.default,
    default: spec.default,
    isOverridden: has,
  };
};

export const getSettings = () => delay(SPECS.map(rowFor));

export const updateSetting = (key: string, value: number) => {
  const spec = SPECS.find((s) => s.key === key);
  if (!spec) return Promise.reject(new Error(`Unknown setting "${key}"`));
  if (!Number.isInteger(value) || value < spec.min || value > spec.max) {
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
