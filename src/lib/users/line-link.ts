import type { LineAdminRow } from "@/lib/scheduler/line-admins";

/**
 * TASK-726 (FE) ← TASK-725 (BE) — **a web user's own LINE link**, and the screens that show it.
 *
 * 🔑 The contract (Bob, TASK-725 §"THE CONTRACT"): `POST /me/line-link-code` ⇒ `{ code, expiresAt, expiresInSeconds }` (the code is
 * returned ONCE and can never be read back) · `GET /me` and `GET /users` carry `lineLinked: boolean` · `DELETE /users/:id/line-link` ·
 * `GET /users/line-admins` entries gain `kind: "linked" | "legacy"` and, for a linked one, the web user's `displayName` / `username`.
 *
 * 🚫 **The raw LINE id is NOT in this contract and no screen may hold it.** What a row may show of the account is the opaque `idTail`
 * the old panel already showed, never anything longer.
 */

/** `POST /me/line-link-code`. The code is shown, never logged, and lives only in the dialog's state. */
export interface LineLinkCode {
  code: string;
  expiresAt: string;
  expiresInSeconds: number;
}

/** Shown as `K7M2-QX9P` (the server's code is 8 characters; typing in chat is insensitive to the hyphen). Display only. */
export const groupCode = (code: string): string => (code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code);

/** The "expires in {minutes} minutes" number, from the server's own seconds (never a constant of ours). */
export const expiryMinutes = (seconds: number): number => Math.max(1, Math.ceil(seconds / 60));

/** A linked account is named by its WEB user; `null` ⇒ this row is a legacy one and keeps the old label. */
export const linkedName = (row: LineAdminRow): string | null =>
  row.kind === "linked" ? ((row.displayName ?? "").trim() || (row.username ?? "").trim() || null) : null;

/** A legacy row is the one linked with the shared code, before accounts were tied to web users. */
export const isLegacyEntry = (row: LineAdminRow): boolean => row.kind === "legacy";
