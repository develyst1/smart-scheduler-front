// REQ-092 Stage 2 (TASK-382, paths moved by TASK-384: NextAuth owns everything under `/api/auth` on the FE host, so the BE serves
// these at `/api/me` — TASK-383) — the signed-in user's own two routes. `GET /me` is the truth for the nav and the
// route guard (the login body's `menus` only seed the first paint: a super admin changes grants, the server refuses at
// once, the nav follows on the next `/me`). `POST /me/password` proves the current password — a self-service
// change, unlike the super admin's reset. Both are behind the JWT guard and NOT menu-gated: a zero-menu user must still
// learn that and change their own password. Refusals are the server's sentence: `400 WRONG_PASSWORD` (a wrong
// current password — a 400, so the api client's 401 sign-out never sees it) and `400 PASSWORD_TOO_SHORT`.
import { api, useMockData } from "@/lib/api/client";
import type { MeResponse, PermissionRegistry } from "@/types/api/contract";
import * as mock from "./me.mock.service";

export type Me = MeResponse["user"];

export const getMe = async (): Promise<Me> => {
  if (useMockData) return mock.getMe();
  const { data } = await api.get<MeResponse>("/me");
  return data.user;
};

/** Stage 3 (TASK-386) — the registry the Users page renders the `Actions` checklist from. Read-only, any signed-in user. */
export const getPermissions = async (): Promise<PermissionRegistry> => {
  if (useMockData) return mock.getPermissions();
  const { data } = await api.get<PermissionRegistry>("/permissions");
  return data;
};

export const changeMyPassword = async (currentPassword: string, newPassword: string): Promise<{ ok: true }> => {
  if (useMockData) return mock.changeMyPassword(currentPassword, newPassword);
  const { data } = await api.post<{ ok: true }>("/me/password", { currentPassword, newPassword });
  return data;
};
