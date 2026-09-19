// REQ-092 Stage 2 — offline `me`: the mock login is a super admin with every menu.
import { MENU_KEYS } from "@/lib/rbac/menus";
import { ACTION_KEYS_SNAPSHOT } from "@/lib/rbac/actions";
import type { MeResponse, PermissionRegistry } from "@/types/api/contract";

const delay = <T>(v: T, ms = 80) => new Promise<T>((r) => setTimeout(() => r(v), ms));

export const getMe = () =>
  delay<MeResponse["user"]>({ id: "u-admin", username: "admin", displayName: "Admin", isSuperAdmin: true, menus: [...MENU_KEYS], actions: [...ACTION_KEYS_SNAPSHOT], roleName: null, teacherId: null });

// The offline registry: the snapshot's keys with the key's tail as both labels (the real labels are the BE's).
export const getPermissions = () =>
  delay<PermissionRegistry>({
    menus: [...MENU_KEYS],
    actions: ACTION_KEYS_SNAPSHOT.map((key) => {
      const area = key.slice("action:".length, key.indexOf("."));
      const tail = key.slice(key.indexOf(".") + 1);
      return { key, area, labelTh: tail, labelEn: tail };
    }),
  });

export const changeMyPassword = (_currentPassword: string, _newPassword: string) => delay({ ok: true as const });
