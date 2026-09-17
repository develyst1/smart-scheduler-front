// REQ-092 Stage 2 — offline `me`: the mock login is a super admin with every menu.
import { MENU_KEYS } from "@/lib/rbac/menus";
import type { MeResponse } from "@/types/api/contract";

const delay = <T>(v: T, ms = 80) => new Promise<T>((r) => setTimeout(() => r(v), ms));

export const getMe = () =>
  delay<MeResponse["user"]>({ id: "u-admin", username: "admin", displayName: "Admin", isSuperAdmin: true, menus: [...MENU_KEYS] });

export const changeMyPassword = (_currentPassword: string, _newPassword: string) => delay({ ok: true as const });
