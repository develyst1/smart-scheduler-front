// REQ-092 Stage 4 (TASK-388) — the matrix's ONE cell rule, pure so it is value-tested: what a user × key cell shows.
// `own` beats `role` when a key is in both (the own row is the one the super admin can un-tick); a super admin is
// effective everywhere without a row of their own. Rendering is `MatrixTable`'s; this decides.

import type { UserDTO } from "@/types/api/contract";

export type MatrixCell = "own" | "role" | "all" | null;

export const matrixCell = (user: Pick<UserDTO, "isSuperAdmin" | "grants">, key: string): MatrixCell => {
  if (user.isSuperAdmin) return "all";
  if (user.grants.own.includes(key)) return "own";
  if (user.grants.fromRole.includes(key)) return "role";
  return null;
};

/** The glyphs, one per source: ● own · ▲ from role · ● (dimmed) a super admin's everything. Blank otherwise. */
export const MATRIX_GLYPH: Record<Exclude<MatrixCell, null>, string> = { own: "●", role: "▲", all: "●" };
