import { describe, expect, it, setSystemTime, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import { authConfig } from "@/auth.config";
import { readTokenExp, SESSION_MAX_AGE_SECONDS, tokenLive } from "./token-expiry";

/**
 * 🔴 **REQ-128 L1 (TASK-836) — one 7-day login: the front session ends exactly when the API token it carries expires.**
 *
 * 🔑 By value: real JWT-shaped strings go through the real `jwt` callback, and the clock is set, so the boundary is a SECOND, not a guess.
 * The 401 sign-out in `client.ts` is deliberately unchanged (a revoked / disabled user is still thrown out at once) — pinned at the end.
 */

const NOW = 1_800_000_000; // a fixed "now" (seconds)
afterEach(() => setSystemTime());

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
/** A JWT-shaped string: header.payload.signature (the signature is junk — the front never verifies). */
const jwtWith = (payload: Record<string, unknown>) => `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.sig`;

// next-auth's own callback types want a full account/profile; the config's callback only reads `token` and `user`
const jwt = authConfig.callbacks.jwt as unknown as (a: { token: Record<string, unknown>; user?: Record<string, unknown> }) => Record<string, unknown> | null;
const signIn = (backendToken: string) => jwt({ token: {}, user: { id: "u1", backendToken, role: "admin", username: "dong", isSuperAdmin: true, menus: [], actions: [] } });

describe("the session lasts 7 days", () => {
  it("🔑 the NextAuth session maxAge is exactly 604800 s (7 × 24 h), and the constant is that number", () => {
    expect(SESSION_MAX_AGE_SECONDS).toBe(604_800);
    expect(authConfig.session.maxAge).toBe(604_800);
    expect(authConfig.session.strategy).toBe("jwt");
  });
});

describe("readTokenExp — a claim READ, never a verification", () => {
  it("reads a numeric exp from a base64url payload (incl. characters that need url-safe decoding)", () => {
    expect(readTokenExp(jwtWith({ sub: "u1", exp: NOW + 604_800 }))).toBe(NOW + 604_800);
    expect(readTokenExp(jwtWith({ name: "น้องเอ ??>>", exp: 42 }))).toBe(42); // multi-byte + `+`/`/` territory in base64
  });
  it("🔑 anything it cannot read is null (so the session fails closed): no token, no exp, a string exp, junk", () => {
    expect(readTokenExp(undefined)).toBeNull();
    expect(readTokenExp("")).toBeNull();
    expect(readTokenExp("not-a-jwt")).toBeNull();
    expect(readTokenExp("a.%%%.c")).toBeNull();
    expect(readTokenExp(jwtWith({ sub: "u1" }))).toBeNull();
    expect(readTokenExp(jwtWith({ exp: "1800000000" }))).toBeNull();
    expect(readTokenExp(jwtWith({ exp: null }))).toBeNull();
  });
});

describe("tokenLive — the boundary is the second of exp", () => {
  it("live while now < exp; ended at now == exp and after; unknown exp is not live", () => {
    expect(tokenLive(NOW + 1, NOW)).toBe(true);
    expect(tokenLive(NOW, NOW)).toBe(false); // ≥ ends it
    expect(tokenLive(NOW - 1, NOW)).toBe(false);
    expect(tokenLive(null, NOW)).toBe(false);
    expect(tokenLive(undefined, NOW)).toBe(false);
  });
});

describe("the jwt callback — the rolling session can never outlive the API token", () => {
  it("🔑 sign-in with a token that expires in the future: the session is kept and carries the exp AND everything it carried before", () => {
    setSystemTime(new Date(NOW * 1000));
    const t = signIn(jwtWith({ exp: NOW + 3600 }));
    expect(t).not.toBeNull();
    expect(t!.backendExp).toBe(NOW + 3600);
    expect(t!.backendToken).toContain(".");
    expect(t!.userId).toBe("u1");
    expect(t!.isSuperAdmin).toBe(true);
    expect(t!.role).toBe("admin");
  });

  it("a later read (no `user`) of a token whose exp is still ahead keeps the session", () => {
    setSystemTime(new Date((NOW + 100) * 1000));
    const kept = jwt({ token: { backendToken: "x", backendExp: NOW + 3600 } });
    expect(kept).not.toBeNull();
    expect(kept!.backendExp).toBe(NOW + 3600);
  });

  it("🔑 once the clock passes exp, the session ENDS (null)", () => {
    setSystemTime(new Date((NOW + 3601) * 1000));
    expect(jwt({ token: { backendToken: "x", backendExp: NOW + 3600 } })).toBeNull();
  });

  it("🔑 the boundary: one second before exp keeps it, the second of exp ends it", () => {
    setSystemTime(new Date((NOW + 3599) * 1000));
    expect(jwt({ token: { backendToken: "x", backendExp: NOW + 3600 } })).not.toBeNull();
    setSystemTime(new Date((NOW + 3600) * 1000));
    expect(jwt({ token: { backendToken: "x", backendExp: NOW + 3600 } })).toBeNull();
  });

  it("🔑 FAIL CLOSED: a token with no readable exp ends the session — at sign-in and on a later read", () => {
    setSystemTime(new Date(NOW * 1000));
    expect(signIn(jwtWith({ sub: "u1" }))).toBeNull();
    expect(signIn("opaque-token-without-claims")).toBeNull();
    expect(jwt({ token: { backendToken: "x" } })).toBeNull();
    expect(jwt({ token: { backendToken: "x", backendExp: null } })).toBeNull();
  });
});

describe("the 401 sign-out is unchanged (a revoked or disabled user is still thrown out at once)", () => {
  const client = readFileSync("src/lib/api/client.ts", "utf8");
  it("every 401 still signs out and the disabled sentence still rides along as reason=disabled", () => {
    expect(client).toContain('error.response?.status === 401 && typeof window !== "undefined" && !useMockData');
    expect(client).toContain('const reason = body?.error?.message === DISABLED_SENTENCE ? "&reason=disabled" : "";');
    expect(client).toContain("void signOut({ callbackUrl: `/login?next=${next}${reason}` });");
  });
});
