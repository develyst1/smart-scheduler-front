// REQ-092 Stage 4 (TASK-387/388) — roles: a named bundle of keys, LIVE for its holders (edit it ⇒ every holder
// changes on their next request; the nav follows on the next `/me`). Super admin only, server-guarded
// (`requireSuperAdmin`). Refusals are named codes shown as the server's sentence: `ROLE_NAME_TAKEN` (names are
// case-insensitive unique) · `ROLE_IN_USE` (delete with holders — the sentence carries the count) · `VALIDATION`
// (blank name / > 60 / unknown key) · `NOT_FOUND`. 🚫 No templates, no default role, no client-side key rule.
import { api, useMockData } from "@/lib/api/client";
import type { RoleDTO } from "@/types/api/contract";
import * as mock from "./roles.mock.service";

export interface RoleInput {
  name: string;
  description?: string | null;
  keys: string[];
}

export const listRoles = async (): Promise<RoleDTO[]> => {
  if (useMockData) return mock.listRoles();
  const { data } = await api.get<{ roles: RoleDTO[] }>("/roles");
  return data.roles;
};

export const createRole = async (input: RoleInput): Promise<RoleDTO> => {
  if (useMockData) return mock.createRole(input);
  const { data } = await api.post<{ role: RoleDTO }>("/roles", {
    name: input.name.trim(),
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    keys: input.keys,
  });
  return data.role;
};

/** `keys` REPLACE the role's set; a field left out is untouched (the service spreads by presence). */
export const updateRole = async (id: string, input: Partial<RoleInput>): Promise<RoleDTO> => {
  if (useMockData) return mock.updateRole(id, input);
  const { data } = await api.patch<{ role: RoleDTO }>(`/roles/${id}`, {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
    ...(input.keys !== undefined ? { keys: input.keys } : {}),
  });
  return data.role;
};

export const deleteRole = async (id: string): Promise<{ deleted: true }> => {
  if (useMockData) return mock.deleteRole(id);
  const { data } = await api.delete<{ deleted: true }>(`/roles/${id}`);
  return data;
};
