// REQ-092 Stage 4 — offline roles. In-memory rows; the same shapes as the real service.
import type { RoleDTO } from "@/types/api/contract";
import type { RoleInput } from "./roles.service";

const delay = <T>(v: T, ms = 100) => new Promise<T>((r) => setTimeout(() => r(v), ms));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const roles: RoleDTO[] = [];
let seq = 1;

export const listRoles = () => delay(clone([...roles].sort((a, b) => a.name.localeCompare(b.name))));

export const createRole = (input: RoleInput) => {
  const now = new Date().toISOString();
  const r: RoleDTO = { id: `r-${seq++}`, name: input.name.trim(), description: input.description?.trim() || null, keys: [...new Set(input.keys)], userCount: 0, createdAt: now, updatedAt: now };
  roles.push(r);
  return delay(clone(r));
};

export const updateRole = (id: string, input: Partial<RoleInput>) => {
  const r = roles.find((x) => x.id === id)!;
  if (input.name !== undefined) r.name = input.name.trim();
  if (input.description !== undefined) r.description = input.description?.trim() || null;
  if (input.keys !== undefined) r.keys = [...new Set(input.keys)];
  r.updatedAt = new Date().toISOString();
  return delay(clone(r));
};

export const deleteRole = (id: string) => {
  const i = roles.findIndex((x) => x.id === id);
  if (i >= 0) roles.splice(i, 1);
  return delay({ deleted: true as const });
};
