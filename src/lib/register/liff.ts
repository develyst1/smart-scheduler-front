/**
 * TASK-348 (`REQ-088`) — the LIFF half of `/register`: **the only genuinely new thing on this side.**
 *
 * 🔑 **The ID TOKEN is the identity, on every call.** `liff.init({ liffId })` → `liff.getIDToken()` → the token
 * goes in the request body. 🚫 **`liff.getProfile().userId` is NEVER sent** — the server verifies the TOKEN
 * against `LINE_LOGIN_CHANNEL_ID`; a `userId` from the client is a claim, not a proof (TASK-047's rule, by a
 * new door). Nothing in this module reads a profile at all, so there is nothing to leak by accident.
 *
 * ⚠️ **The LIFF ID is the CUSTOMER's value and per-environment.** It is read from `NEXT_PUBLIC_LIFF_ID` —
 * 🔻 not `LIFF_ID` as the task named it: a Next.js client bundle can only see `NEXT_PUBLIC_*` variables, so a
 * bare `LIFF_ID` is invisible to the page by construction and would ALWAYS look absent. Same shape as
 * `NEXT_PUBLIC_API_URL`, which the sibling `/checkin` page already reads. **The absent case is a MESSAGE, not a
 * blank screen** — the page renders `register.liffMissing` and stops.
 *
 * 📌 `@line/liff` is imported dynamically so the admin app's bundle never carries it: this module is only ever
 * reached from `/register`.
 */

export const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID?.trim() ?? "";

export type LiffState =
  | { kind: "missing-id" }
  | { kind: "ready"; idToken: string }
  | { kind: "not-logged-in" }
  | { kind: "error"; detail: string };

type LiffLike = {
  init: (cfg: { liffId: string }) => Promise<void>;
  isLoggedIn: () => boolean;
  login: () => void;
  getIDToken: () => string | null;
};

let cached: LiffLike | null = null;

const loadLiff = async (): Promise<LiffLike> => {
  if (cached) return cached;
  const mod = await import("@line/liff");
  cached = (mod.default ?? mod) as unknown as LiffLike;
  return cached;
};

/**
 * Initialise LIFF and return an ID token, or the reason there is none.
 *
 * `force` re-initialises even if a token was already obtained — used exactly once, on `TOKEN_EXPIRED`
 * (§C0: *"the page re-inits LIFF and retries; nothing else"*). 🚫 `TOKEN_WRONG_CHANNEL` is NOT retried: that is
 * a misconfiguration, and re-initialising the same misconfigured LIFF app cannot change it.
 */
export const obtainIdToken = async (): Promise<LiffState> => {
  if (!LIFF_ID) return { kind: "missing-id" };
  try {
    const liff = await loadLiff();
    await liff.init({ liffId: LIFF_ID });
    if (!liff.isLoggedIn()) {
      // Outside the LINE app the SDK needs an explicit login; inside it this is already true.
      liff.login();
      return { kind: "not-logged-in" };
    }
    const idToken = liff.getIDToken();
    if (!idToken) return { kind: "error", detail: "no-id-token" };
    return { kind: "ready", idToken };
  } catch (e) {
    return { kind: "error", detail: e instanceof Error ? e.message : String(e) };
  }
};
