/**
 * TASK-348 (`REQ-088`) — the three `/register` calls, as `/checkin` does it: **public, no admin auth, direct
 * `fetch`, local types.** The axios client is bypassed on purpose — it attaches a staff JWT and bounces to
 * `/login` on 401, and a parent has neither.
 *
 * ⚠️ **Every type below is this repo's CLAIM about the wire** (`contract.ts`'s rule). It was written against
 * the LIVE route (`smart-scheduler-back/src/routes/register.ts`, TASK-347), not the contract prose — where the
 * two differ, the route is the source. It matched.
 *
 * 🔴 **RULE 1 — the page holds NO rules.** Nothing in this module or its caller decides anything: no phone
 * normalising, no reserved words, no duplicate check, no cap, no date parsing. **Every refusal arrives as a
 * NAMED CODE and the page renders words for it.** *The page owns WORDS. The server owns DECISIONS.*
 *
 * 🚫 No `GET`. 🚫 No `lineUserId`, `parentId` or `familyId` in any body — the `idToken` IS the identity.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:3001/api";

/** Every named code the three routes can return (§C0–§C3), so a rendering can be asserted for each. */
export const REGISTER_CODES = [
  // §C0 — auth, before anything else
  "TOKEN_MISSING",
  "TOKEN_WRONG_CHANNEL",
  "TOKEN_INVALID",
  "TOKEN_EXPIRED",
  // §C1 / §C2 — the phone
  "PHONE_INVALID",
  "PHONE_BOUND_TO_OTHER_LINE",
  "LINE_BOUND_TO_OTHER_FAMILY",
  "TWOFA_NOT_CONFIGURED",
  "TWOFA_CODE_REQUIRED",
  "TWOFA_CODE_BAD",
  // §C3 — the child
  "NOT_LINKED",
  "NAME_REQUIRED",
  "NAME_RESERVED",
  "FAMILY_FULL",
  "NAME_DUPLICATE_NEEDS_DETAIL",
  "BIRTHDATE_INVALID",
  "PROVINCE_UNKNOWN", // TASK-352/353 (§9) — `province` was not one of the server's 77 full names
] as const;
export type RegisterCode = (typeof REGISTER_CODES)[number];

export interface ChildRef {
  id: string;
  name: string;
  nickname: string | null;
}

export type LookupResult =
  | { ok: true; outcome: "found"; phone: string; children: ChildRef[] }
  | { ok: true; outcome: "found"; phone: string; twoFactor: "required"; childCount: number }
  | { ok: true; outcome: "new"; phone: string };

export interface LinkResult {
  ok: true;
  outcome: "linked";
  isNew: boolean;
  children: ChildRef[];
  canAddMore: boolean;
}

export interface CreateResult {
  ok: true;
  outcome: "created";
  student: { id: string; name: string };
  /** The customer's `DD-MM-YYYY`, back from the server's ONE formatter — or `null` when skipped. */
  birthDate: string | null;
  count: number;
  atMax: boolean;
  canAddMore: boolean;
}

/** A refusal: a NAMED code and, for three of them, one detail the words need. 🚫 No `message` — ever. */
export interface Refusal {
  ok: false;
  code: RegisterCode;
  word?: string; // NAME_RESERVED
  max?: number; // FAMILY_FULL
  name?: string; // NAME_DUPLICATE_NEEDS_DETAIL
  province?: string; // PROVINCE_UNKNOWN
}

/** The one thing the page cannot get a code for: the network itself. Rendered as `register.connectFail`. */
export type Unreachable = { ok: false; code: "UNREACHABLE" };

type Body = Record<string, unknown>;

const post = async <T>(path: string, body: Body): Promise<T | Refusal | Unreachable> => {
  try {
    const res = await fetch(`${API_BASE}/register/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as T | Refusal | null;
    if (!data) return { ok: false, code: "UNREACHABLE" };
    return data;
  } catch {
    return { ok: false, code: "UNREACHABLE" };
  }
};

/** §C1 — *"is this phone a family we know?"* Writes nothing (the 2FA send when ON is the chat's behaviour). */
export const lookup = (idToken: string, phone: string) => post<LookupResult>("lookup", { idToken, phone });

/** §C2 — bind this LINE account to that family. `phone` again, never an id; `code` only when 2FA is on. */
export const link = (idToken: string, phone: string, code?: string) =>
  post<LinkResult>("link", code ? { idToken, phone, code } : { idToken, phone });

export interface CreateInput {
  name: string;
  /**
   * 🔴 The customer's `DD-MM-YYYY` TEXT, or ABSENT. **Never `""`, never ISO.** A blank is the skip (`ข้าม`)
   * and must not reach the parser — the server's parser refuses `""` as INVALID (TASK-347 §5.1), so the page
   * omits the key rather than re-creating that trap from its side.
   */
  birthDate?: string;
  /**
   * TASK-353 (`REQ-088 §9`) — two fields, two homes. `province` is the PICKED province's FULL name (`กรุงเทพมหานคร`,
   * never `กทม`) → `parents.province`, the column the report groups on; `address` is the joined LINE in the
   * customer's format (`พระโขนงเหนือ วัฒนา กทม`) → APPENDED to `parents.note`. PICKED ⇒ both · TYPED ⇒ `address`
   * only (the server will not guess a province) · blank ⇒ neither. Both are forwarded as-is; nothing here decides.
   */
  province?: string;
  address?: string;
  /** AC-9 — after `NAME_DUPLICATE_NEEDS_DETAIL`: the FULLER name, with this flag, never a rename. */
  detailProvided?: boolean;
}

/** §C3 — add a child to MY family. The family is the token's; no phone, no id. */
export const create = (idToken: string, input: CreateInput) => {
  const body: Body = { idToken, name: input.name };
  // 🔑 Skips are OMITTED keys, not empty strings — see `CreateInput.birthDate`.
  if (input.birthDate) body.birthDate = input.birthDate;
  if (input.province) body.province = input.province;
  if (input.address) body.address = input.address;
  if (input.detailProvided) body.detailProvided = true;
  return post<CreateResult>("create", body);
};
