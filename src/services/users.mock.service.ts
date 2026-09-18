// REQ-092 Stage 1 — offline Users page. In-memory rows; the same shapes as the real service.
import { MENU_KEYS } from "@/lib/rbac/menus";
import { ACTION_KEYS_SNAPSHOT } from "@/lib/rbac/actions";
import type { UserDTO } from "@/types/api/contract";
import type { CreateUserInput, UpdateUserInput } from "./users.service";

const delay = <T>(v: T, ms = 120) => new Promise<T>((r) => setTimeout(() => r(v), ms));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const users: UserDTO[] = [
  { id: "u-admin", username: "admin", displayName: "Admin", isSuperAdmin: true, disabledAt: null, createdAt: "2026-09-17T00:00:00.000Z", menus: [...MENU_KEYS], actions: [...ACTION_KEYS_SNAPSHOT], roleId: null, roleName: null, grants: { fromRole: [], own: [] } },
];
let seq = 1;

export const listUsers = () => delay(clone(users));

export const createUser = (input: CreateUserInput) => {
  const u: UserDTO = {
    id: `u-${seq++}`,
    username: input.username.trim().toLowerCase(),
    displayName: input.displayName.trim(),
    isSuperAdmin: !!input.isSuperAdmin,
    disabledAt: null,
    createdAt: new Date().toISOString(),
    menus: input.isSuperAdmin ? [...MENU_KEYS] : [],
    actions: input.isSuperAdmin ? [...ACTION_KEYS_SNAPSHOT] : [],
    roleId: null,
    roleName: null,
    grants: { fromRole: [], own: [] },
  };
  users.push(u);
  return delay(clone(u));
};

export const updateUser = (id: string, input: UpdateUserInput) => {
  const u = users.find((x) => x.id === id)!;
  if (input.displayName !== undefined) u.displayName = input.displayName.trim();
  if (input.isSuperAdmin !== undefined) u.isSuperAdmin = input.isSuperAdmin;
  return delay(clone(u));
};

// Stage 4 — the mock's effective read: own ∪ role, like the BE's UNION.
const recompute = (u: UserDTO) => {
  const eff = new Set([...u.grants.own, ...u.grants.fromRole]);
  u.menus = u.isSuperAdmin ? [...MENU_KEYS] : MENU_KEYS.filter((k) => eff.has(k));
  u.actions = u.isSuperAdmin ? [...ACTION_KEYS_SNAPSHOT] : ACTION_KEYS_SNAPSHOT.filter((k) => eff.has(k));
};

export const setUserMenus = (id: string, keys: string[]) => {
  const u = users.find((x) => x.id === id)!;
  u.grants.own = [...u.grants.own.filter((k) => !k.startsWith("menu:")), ...new Set(keys)];
  recompute(u);
  return delay(clone(u));
};

export const setUserRole = (id: string, roleId: string | null) => {
  const u = users.find((x) => x.id === id)!;
  u.roleId = roleId;
  u.roleName = roleId ? `role ${roleId}` : null;
  u.grants.fromRole = [];
  recompute(u);
  return delay(clone(u));
};

export const setUserActions = (id: string, keys: string[]) => {
  const u = users.find((x) => x.id === id)!;
  u.grants.own = [...u.grants.own.filter((k) => !k.startsWith("action:")), ...new Set(keys)];
  recompute(u);
  return delay(clone(u));
};

export const resetUserPassword = (_id: string, _password: string) => delay({ ok: true as const });

export const setUserDisabled = (id: string, disabled: boolean) => {
  const u = users.find((x) => x.id === id)!;
  u.disabledAt = disabled ? new Date().toISOString() : null;
  return delay(clone(u));
};
