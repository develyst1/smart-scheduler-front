// REQ-092 Stage 2 (TASK-382) — the signed-in user's own two routes. `GET /auth/me` is the truth for the nav and the
// route guard (the login body's `menus` only seed the first paint: a super admin changes grants, the server refuses at
// once, the nav follows on the next `/auth/me`). `POST /auth/me/password` proves the current password — a self-service
// change, unlike the super admin's reset. Both are behind the JWT guard and NOT menu-gated: a zero-menu user must still
// learn that and change their own password. Refusals are the server's sentence (`401` wrong current password —
// NOT a sign-out, see `lib/api/client.ts` — and `400 PASSWORD_TOO_SHORT`).
import { api, useMockData } from "@/lib/api/client";
import type { MeResponse } from "@/types/api/contract";
import * as mock from "./me.mock.service";

export type Me = MeResponse["user"];

export const getMe = async (): Promise<Me> => {
  if (useMockData) return mock.getMe();
  const { data } = await api.get<MeResponse>("/auth/me");
  return data.user;
};

export const changeMyPassword = async (currentPassword: string, newPassword: string): Promise<{ ok: true }> => {
  if (useMockData) return mock.changeMyPassword(currentPassword, newPassword);
  const { data } = await api.post<{ ok: true }>("/auth/me/password", { currentPassword, newPassword });
  return data;
};
