// REQ-092 Stage 1 (TASK-377/378) — the super admin's Users page: list · create · edit · reset password · disable /
// enable. 🔑 Super admin only, server-guarded (`403 FORBIDDEN` from `requireSuperAdmin`); the page hides itself on
// `session.user.isSuperAdmin` as the honest UI, never as the guard. Every refusal is a named code shown as the
// server's sentence: `VALIDATION` (username `^[a-z0-9._-]{3,40}$` after trim + lowercase) · `PASSWORD_TOO_SHORT`
// (min 8 — the only password rule) · `USERNAME_TAKEN` · `LAST_SUPER_ADMIN` · `FORBIDDEN`. 🚫 No delete (no route).
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

export const setUserDisabled = async (id: string, disabled: boolean): Promise<UserDTO> => {
  if (useMockData) return mock.setUserDisabled(id, disabled);
  const { data } = await api.post<{ user: UserDTO }>(`/users/${id}/${disabled ? "disable" : "enable"}`, {});
  return data.user;
};
