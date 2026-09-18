// REQ-092 Stage 1 (TASK-377/378) — the super admin's Users page: list · create · edit · reset password · disable /
// enable. 🔑 Super admin only, server-guarded (`403 FORBIDDEN` from `requireSuperAdmin`); the page hides itself on
// `session.user.isSuperAdmin` as the honest UI, never as the guard. Every refusal is a named code shown as the
// server's sentence: `VALIDATION` (username `^[a-z0-9._-]{3,40}$` after trim + lowercase) · `PASSWORD_TOO_SHORT`
// (min 8 — the only password rule) · `USERNAME_TAKEN` · `LAST_SUPER_ADMIN` · `FORBIDDEN`. 🚫 No delete (no route).
// Stage 2 (TASK-382): `PUT /users/:id/menus { keys }` — the per-user menu grants, the bridge until Stage 4's roles SET
// the same rows. An unknown key is `400`; a super-admin target is accepted (their menus are all of them regardless).
import { api, useMockData } from "@/lib/api/client";
import type { UserDTO } from "@/types/api/contract";
import * as mock from "./users.mock.service";

export interface CreateUserInput {
  username: string;
  password: string;
  displayName: string;
  isSuperAdmin?: boolean;
}
export interface UpdateUserInput {
  displayName?: string;
  isSuperAdmin?: boolean;
}

export const listUsers = async (): Promise<UserDTO[]> => {
  if (useMockData) return mock.listUsers();
  const { data } = await api.get<{ users: UserDTO[] }>("/users");
  return data.users;
};

export const createUser = async (input: CreateUserInput): Promise<UserDTO> => {
  if (useMockData) return mock.createUser(input);
  // The username travels as typed (trimmed, lowercased — the server's own normalisation, done here so the admin
  // sees what will be stored); the pattern is the server's rule, refused as VALIDATION with the hint on the form.
  const { data } = await api.post<{ user: UserDTO }>("/users", {
    username: input.username.trim().toLowerCase(),
    password: input.password,
    displayName: input.displayName.trim(),
    ...(input.isSuperAdmin ? { isSuperAdmin: true } : {}),
  });
  return data.user;
};

export const updateUser = async (id: string, input: UpdateUserInput): Promise<UserDTO> => {
  if (useMockData) return mock.updateUser(id, input);
  const { data } = await api.patch<{ user: UserDTO }>(`/users/${id}`, {
    ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
    ...(input.isSuperAdmin !== undefined ? { isSuperAdmin: input.isSuperAdmin } : {}),
  });
  return data.user;
};

export const resetUserPassword = async (id: string, password: string): Promise<{ ok: true }> => {
  if (useMockData) return mock.resetUserPassword(id, password);
  const { data } = await api.post<{ ok: true }>(`/users/${id}/password`, { password });
  return data;
};

export const setUserMenus = async (id: string, keys: string[]): Promise<UserDTO> => {
  if (useMockData) return mock.setUserMenus(id, keys);
  const { data } = await api.put<{ user: UserDTO }>(`/users/${id}/menus`, { keys });
  return data.user;
};

/** Stage 3 (TASK-386) — the per-user action grants; the same shape as the menus. */
export const setUserActions = async (id: string, keys: string[]): Promise<UserDTO> => {
  if (useMockData) return mock.setUserActions(id, keys);
  const { data } = await api.put<{ user: UserDTO }>(`/users/${id}/actions`, { keys });
  return data.user;
};

/** Stage 4 (TASK-388) — assign / clear the LIVE role; `null` clears. The user's own rows are untouched. */
export const setUserRole = async (id: string, roleId: string | null): Promise<UserDTO> => {
  if (useMockData) return mock.setUserRole(id, roleId);
  const { data } = await api.put<{ user: UserDTO }>(`/users/${id}/role`, { roleId });
  return data.user;
};

export const setUserDisabled = async (id: string, disabled: boolean): Promise<UserDTO> => {
  if (useMockData) return mock.setUserDisabled(id, disabled);
  const { data } = await api.post<{ user: UserDTO }>(`/users/${id}/${disabled ? "disable" : "enable"}`, {});
  return data.user;
};
