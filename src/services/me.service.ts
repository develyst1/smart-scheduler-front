// REQ-092 Stage 2 (TASK-382, paths moved by TASK-384: NextAuth owns everything under `/api/auth` on the FE host, so the BE serves
// these at `/api/me` — TASK-383) — the signed-in user's own two routes. `GET /me` is the truth for the nav and the
// route guard (the login body's `menus` only seed the first paint: a super admin changes grants, the server refuses at
// once, the nav follows on the next `/me`). `POST /me/password` proves the current password — a self-service
// change, unlike the super admin's reset. Both are behind the JWT guard and NOT menu-gated: a zero-menu user must still
// learn that and change their own password. Refusals are the server's sentence: `400 WRONG_PASSWORD` (a wrong
// current password — a 400, so the api client's 401 sign-out never sees it) and `400 PASSWORD_TOO_SHORT`.
import { api, useMockData } from "@/lib/api/client";
import type { MeResponse, PermissionRegistry } from "@/types/api/contract";
import type { LineLinkCode } from "@/lib/users/line-link";
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

/**
 * TASK-726 🔻 (TASK-725 contract change #1) — is MY account linked to a LINE account? `GET /me/line-link` ⇒ `{ lineLinked }`. It is its own route so the
 * shell's every-page `GET /me` stays untouched; only the link dialog asks. A yes/no: the LINE id never reaches the front.
 */
export const getMyLineLink = async (): Promise<{ lineLinked: boolean }> => {
  if (useMockData) return mock.getMyLineLink();
  const { data } = await api.get<{ lineLinked: boolean }>("/me/line-link");
  return data;
};

/**
 * TASK-726 (FE) ← TASK-725 (BE) — "link LINE" from the web: the signed-in user asks the server for a ONE-TIME code to type in the
 * shop's LINE chat. 🔴 The code is returned ONLY here (stored hashed, never readable again), so the caller keeps it in its own
 * state and nowhere else: no cache, no log, no storage. `403 LINE_LINK_NOT_FOR_COACH` is refused by the server, and no screen reaches
 * it — the header does not offer the item to a coach account.
 */
export const requestLineLinkCode = async (): Promise<LineLinkCode> => {
  if (useMockData) return mock.requestLineLinkCode();
  const { data } = await api.post<LineLinkCode>("/me/line-link-code");
  return data;
};
