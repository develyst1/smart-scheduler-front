/**
 * TASK-538 (BE) → TASK-539 (FE) — **the LINE accounts linked as ADMIN, and taking that role away.**
 *
 * 🔴 Why it exists on a date: the demo phone is stuck as an admin, and **admin leave notices name other families'
 * children** — the moment pushes resume on 1 Oct it receives them. There was no way to remove the role at all.
 *
 * 🔑 **What the server will not let a screen imply.** TASK-538 answers with an opaque `ref` (a 16-hex hash — the full
 * LINE id never leaves the server), a tail to tell two rows apart, and **`alsoTeacher` / `alsoParent` that are `null`
 * when WE do not know who is behind the account** — we store bare ids with no display name. There is no `displayName`
 * and no `linkedAt` field at all, so **anything on this page that looks like a name would be invented**. Hence
 * `adminRowLabel`: a person's name when we have one, and otherwise *"unknown account"* with the id's tail — never a
 * guess, never an empty row that reads as a blank name.
 *
 * 🚫 Nothing here decides whether a removal is allowed: the routes are **super-admin only** (`requireSuperAdmin`), and
 * every refusal is the server's own sentence.
 */

export interface LineAdminRow {
  /** The opaque handle the removal takes. The LINE id itself is never sent to us. */
  ref: string;
  /** `…abcd` — enough to tell two rows apart, and all we may show of the id. */
  idTail: string;
  /** Our own record of the coach behind the account, or `null` = **we do not know**, not "nobody". */
  alsoTeacher?: string | null;
  /** Our own record of the parent (their name, else the row's phone), or `null` = we do not know. */
  alsoParent?: string | null;
  /** Where the account's LINE menu lands after the role is taken away. */
  afterRemoval?: "teacher-menu" | "parent-menu" | "visitor-menu" | null;
}
export interface LineAdminsResponse {
  admins?: LineAdminRow[] | null;
  /** The server's own three sentences about what we cannot know (display name · when · how). Rendered, never rewritten. */
  notKnown?: string[] | null;
}

/**
 * What the row is called. 🔑 A NAME only when the server gave us one; otherwise the honest *"unknown account"* copy key,
 * so no row can read as a person we cannot actually identify. The tail rides separately, next to either.
 */
export const adminRowLabel = (row: Pick<LineAdminRow, "alsoTeacher" | "alsoParent">): { name: string } | { key: "lineAdmins.unknownAccount" } => {
  const name = (row.alsoTeacher ?? "").trim() || (row.alsoParent ?? "").trim();
  return name ? { name } : { key: "lineAdmins.unknownAccount" };
};

/** Which role the account keeps afterwards — the dialog says it, so nobody reads Remove as "deleted". */
export const afterRemovalKey = (after: LineAdminRow["afterRemoval"]): string =>
  after === "teacher-menu"
    ? "lineAdmins.afterTeacher"
    : after === "parent-menu"
      ? "lineAdmins.afterParent"
      : "lineAdmins.afterVisitor";

/** The rows to show, as sent. An absent or empty list is simply no rows — nothing is invented to fill the page. */
export const adminRows = (data: LineAdminsResponse | null | undefined): LineAdminRow[] => (data?.admins ?? []).filter((r) => typeof r?.ref === "string" && r.ref.length > 0);

/** The server's "what we cannot know" sentences, as sent (never rewritten, never summarised). */
export const notKnownLines = (data: LineAdminsResponse | null | undefined): string[] => (data?.notKnown ?? []).filter((s) => typeof s === "string" && s.trim().length > 0);
