// REQ-128 L1 (TASK-836) — the front session ends exactly when the API token it carries expires, never later.
// Edge-safe (the proxy runs this): no Node deps, no secret. We READ the token's `exp` claim; we never verify it — the back end is the authority.

/** One fixed 7-day login: the same length as the back end's default API-token lifetime (`JWT_TTL_SECONDS`, 604800 s). */
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 3600;

/** The `exp` claim (seconds since the epoch) of a JWT's payload, or `null` when it cannot be read (not a JWT, bad base64/JSON, no numeric `exp`). */
export const readTokenExp = (jwt: string | undefined): number | null => {
  const part = jwt?.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const exp = (JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="))) as { exp?: unknown }).exp;
    return typeof exp === "number" && Number.isFinite(exp) ? exp : null;
  } catch {
    return null;
  }
};

/** Still inside the token's life? Fails CLOSED: no `exp` ⇒ not live; at the very second of `exp` ⇒ not live (`now >= exp` ends it). */
export const tokenLive = (exp: number | null | undefined, nowSeconds = Math.floor(Date.now() / 1000)): boolean =>
  typeof exp === "number" && nowSeconds < exp;
