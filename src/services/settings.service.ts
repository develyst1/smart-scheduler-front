// Configurable business rules — SPEC-029 / TASK-102. The BE (scheduling-back) owns validation + the registry;
// the FE lists, edits (PUT), and resets (DELETE). A rejected value bubbles as an ApiClientError with the server reason.
import { api, useMockData } from "@/lib/api/client";
import type { SettingRow } from "@/types/app/settings";
import * as mock from "./settings.mock.service";

export const getSettings = async (): Promise<SettingRow[]> => {
  if (useMockData) return mock.getSettings();
  const { data } = await api.get<SettingRow[]>("/settings");
  return data;
};

/** Set an override. The server validates via its registry `parse`; a bad value → 400 with a Thai reason. */
export const updateSetting = async (key: string, value: number): Promise<SettingRow> => {
  if (useMockData) return mock.updateSetting(key, value);
  const { data } = await api.put<SettingRow>(`/settings/${key}`, { value });
  return data;
};

/** Clear the override (TASK-122 `DELETE`). Returns the row resolved to the coded default (`isOverridden:false`). */
export const resetSetting = async (key: string): Promise<SettingRow> => {
  if (useMockData) return mock.resetSetting(key);
  const { data } = await api.delete<SettingRow>(`/settings/${key}`);
  return data;
};
