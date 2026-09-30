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
  // 🔴 TASK-565 (REQ-110 item 10) — every field is REQUIRED now: the ข้าม path is gone from the chat and the page.
  // Both are the SERVER's backstop: the form stops a parent earlier with a `*`, and these arrive only if it did not.
  "BIRTHDATE_REQUIRED",
  "ADDRESS_REQUIRED", // once per household, while none is on file
  /**
   * 🔴 **TASK-590 (BE) → TASK-591 — the address is THREE parts now** (the owner: province + district + sub-district).
   * 🔑 **`ADDRESS_INCOMPLETE` carries `missing`, and that is the point of it:** it names WHICH part is absent, so the page
   * asks for **that part** instead of saying the address is wrong. *"You need the sub-district" is a different sentence
   * from "that is wrong", and only one of them tells a parent what to do.*
   */
  "ADDRESS_INCOMPLETE",
  /**
   * 🔴 **TASK-590 — the phone became a family between `/link` and `/create`.** A new family's first child is now ONE call,
   * so the window exists: go back to the phone step. 🚫 Not an error to swallow — someone else registered that number.
   */
  "PHONE_NOW_REGISTERED",
] as const;
export type RegisterCode = (typeof REGISTER_CODES)[number];

export interface ChildRef {
  id: string;
  name: string;
  nickname: string | null;
}

/**
 * 🔴 **TASK-590 (BE) → TASK-591 — `/link` on a NEW phone writes NOTHING.** No parent, no binding, no roster move: it
 * answers `outcome: "new"` and the session is untouched. ⇒ 🔑 **a new family is created by `/create` WITH `phone`, in one
 * transaction with its first child** — *so there is no half-linked state to show, because there is no half-linked state.*
 * 🔻 `isNew` is gone from the answer.
 */
export type LookupResult =
  | { ok: true; outcome: "found"; phone: string; children: ChildRef[] }
  | { ok: true; outcome: "found"; phone: string; twoFactor: "required"; childCount: number }
  | { ok: true; outcome: "new"; phone: string };

/**
 * 🔑 TASK-565 — **the household's address, on status · link · create.** `addressOnFile` is true exactly when
 * `parents.province` is set, and `province` is that value (to SHOW it back). ⇒ **the form asks for an address once per
 * household and then never again — and it learns that from the answer it already has, never from a second request.**
 * ⚠️ A family that only ever typed its address in the CHAT has no province stored, so it is `false` and **is asked once
 * more, by design**: *an address we cannot show back to the parent is not one we collected.*
 */
export interface HouseholdAddress {
  addressOnFile: boolean;
  province: string | null;
}

/**
 * 🔻 **TASK-591 — `isNew` is GONE and `/link` has two arms.** An EXISTING phone links at once (`"linked"`); a NEW phone
 * 🚫 **writes nothing** and answers `"new"` — *there is nothing to report about a family that does not exist yet.*
 */
export type LinkResult =
  | ({ ok: true; outcome: "linked"; children: ChildRef[]; canAddMore: boolean } & HouseholdAddress)
  | { ok: true; outcome: "new"; phone: string };

/** 🔑 The create ANSWERS with the new state, so adding a second child needs no re-fetch to know the address is on file. */
export interface CreateResult extends HouseholdAddress {
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
  /** 🔴 TASK-591 — `ADDRESS_INCOMPLETE`: WHICH parts are absent, so the page can ask for exactly those. */
  missing?: Array<"province" | "district" | "subDistrict">;
  /**
   * 🔴 **TASK-590 — `NAME_DUPLICATE_NEEDS_DETAIL` now arrives WITH ITS WORDS, in both languages.**
   * 🔑 **The page renders what the server sends and keeps no copy of that sentence** — *one sentence, one source.*
   * 📌 Its third home in three rounds: the chat's words, then an approved reword held locally (TASK-577), now the
   * server's own body. **The local copy is DELETED, not left as a fallback** — a fallback is a second source.
   */
  message?: { TH?: string; EN?: string };
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

/**
 * TASK-355 (`§10.3`) — `/status`: *"is this LINE account already someone's?"* The phone comes MASKED from the
 * server (`08x-xxx-xxxx`); the page renders it and never holds a full number. A COUNT, never names (TASK-047).
 */
/**
 * 🔴 TASK-578 (BE) → TASK-580 — **`canAddMore` is the SERVER's answer, not a sum done here.** The cap lives in one place
 * (`MAX_STUDENTS_PER_PARENT`) and this page does not know it. 🔑 A linked family can still add a child, and a linked family
 * with **zero** children could not reach the form at all until this field existed (D11 · Tanya's F-B — *one defect, not two*).
 */
export type StatusResult =
  | { ok: true; linked: false }
  | ({ ok: true; linked: true; phone: string; childCount: number; canAddMore: boolean } & HouseholdAddress);

/** `/unlink`: the family's LINE binding cleared — EVERY account the family holds. Not linked ⇒ `unlinked: false`, idempotent. */
export interface UnlinkResult {
  ok: true;
  unlinked: boolean;
  cleared?: number;
}

/** §10.3 — writes nothing. */
export const status = (idToken: string) => post<StatusResult>("status", { idToken });

/** §10.3 — the ONE writer's new door; the same clear the admin's button runs. */
export const unlink = (idToken: string) => post<UnlinkResult>("unlink", { idToken });

export interface CreateInput {
  name: string;
  /**
   * 🔴 The customer's `DD-MM-YYYY` TEXT. **Never `""`, never ISO.**
   * 🔻 **TASK-565: it is REQUIRED** — the ข้าม path is gone. It stays OPTIONAL in this type on purpose: an absent key is
   * how the server is told nothing was given (`BIRTHDATE_REQUIRED`), and `""` would be read as INVALID instead
   * (TASK-347 §5.1) — *a parent who typed nothing must not be told their date is malformed.* **The page blocks empty
   * before the request; this shape is what keeps the server's refusal the right one if it ever gets there.**
   */
  birthDate?: string;
  /**
   * 🔴 **TASK-590 (BE) → TASK-591 — THREE PARTS, and the page no longer joins them.** The owner ruled province +
   * district + sub-district; **the server builds the stored line itself**, in the page's order and spelling.
   * 🔻 **`address` (the pre-joined line) is no longer read and is GONE from this type** — *a field the server ignores is
   * a field that will be sent wrong eventually.*
   * ⚠️ **The server checks the SHAPE only: three non-empty parts and a real province.** 🚫 **It does NOT check that the
   * district belongs to the province** — so nothing on this side may be worded as if it did.
   */
  province?: string;
  district?: string;
  subDistrict?: string;
  /**
   * 🔴 **TASK-591 — a NEW family's first child is ONE call.** When `/lookup` said `"new"`, the page carries the phone here
   * and the server creates **the family WITH this child, in one transaction** ⇒ 🚫 **nothing is half-linked, because
   * nothing is written until the child is accepted.** An already-linked account's `phone` is IGNORED by the server
   * (never re-pointed), so it is sent only on the unlinked path.
   */
  phone?: string;
  /** AC-9 — after `NAME_DUPLICATE_NEEDS_DETAIL`: the FULLER name, with this flag, never a rename. */
  detailProvided?: boolean;
}

/** §C3 — add a child to MY family. The family is the token's; no phone, no id. */
export const create = (idToken: string, input: CreateInput) => {
  const body: Body = { idToken, name: input.name };
  // 🔑 Skips are OMITTED keys, not empty strings — see `CreateInput.birthDate`.
  if (input.birthDate) body.birthDate = input.birthDate;
  if (input.province) body.province = input.province;
  if (input.district) body.district = input.district;
  if (input.subDistrict) body.subDistrict = input.subDistrict;
  if (input.phone) body.phone = input.phone;
  if (input.detailProvided) body.detailProvided = true;
  return post<CreateResult>("create", body);
};
