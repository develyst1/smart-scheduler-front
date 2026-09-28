// REQ-092 Stage 1 — offline Users page. In-memory rows; the same shapes as the real service.
import { MENU_KEYS } from "@/lib/rbac/menus";
import { ACTION_KEYS_SNAPSHOT } from "@/lib/rbac/actions";
import type { UserDTO } from "@/types/api/contract";
import type { CreateUserInput, UpdateUserInput } from "./users.service";

const delay = <T>(v: T, ms = 120) => new Promise<T>((r) => setTimeout(() => r(v), ms));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const users: UserDTO[] = [
  { id: "u-admin", username: "admin", displayName: "Admin", isSuperAdmin: true, disabledAt: null, createdAt: "2026-09-17T00:00:00.000Z", menus: [...MENU_KEYS], actions: [...ACTION_KEYS_SNAPSHOT], roleId: null, roleName: null, grants: { fromRole: [], own: [] }, teacherId: null, teacherName: null },
];
let seq = 1;

/**
 * TASK-539 — offline stand-ins for the LINE-admin list. Deliberately TWO shapes: one row we can name (a coach) and one
 * we cannot name at all — the honest case the page has to handle, so it is the default thing a dev sees, not an edge.
 */
const lineAdmins = [
  { ref: "a1b2c3d4e5f60718", idTail: "…8f21", alsoTeacher: "บีม", alsoParent: null, afterRemoval: "teacher-menu" as const },
  { ref: "0f1e2d3c4b5a6978", idTail: "…4c7d", alsoTeacher: null, alsoParent: null, afterRemoval: "visitor-menu" as const },
];
const notKnown = [
  "ชื่อที่แสดงใน LINE — ระบบไม่เคยเก็บไว้",
  "วันที่เชื่อมบัญชี — ไม่มีการบันทึกต่อการเชื่อม",
  "วิธีที่ถูกเชื่อม — แอดมินที่ถูกต้องกับคนที่ใช้รหัสเดิมดูเหมือนกันหมด",
];
export const listLineAdmins = () => delay(clone({ admins: lineAdmins, notKnown }));
export const removeLineAdmin = (ref: string) => {
  const i = lineAdmins.findIndex((r) => r.ref === ref);
  if (i < 0) return delay(Promise.reject(new Error("NOT_FOUND")) as never);
  const [row] = lineAdmins.splice(i, 1);
  return delay({ removed: { ref: row.ref, idTail: row.idTail }, afterRemoval: row.afterRemoval, menuSettled: true });
};

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
    teacherId: input.teacherId ?? null,
    teacherName: input.teacherId ? `teacher ${input.teacherId}` : null,
  };
  users.push(u);
  return delay(clone(u));
};

export const updateUser = (id: string, input: UpdateUserInput) => {
  const u = users.find((x) => x.id === id)!;
  if (input.displayName !== undefined) u.displayName = input.displayName.trim();
  if (input.isSuperAdmin !== undefined) u.isSuperAdmin = input.isSuperAdmin;
  if (input.teacherId !== undefined) {
    u.teacherId = input.teacherId;
    u.teacherName = input.teacherId ? `teacher ${input.teacherId}` : null;
  }
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
