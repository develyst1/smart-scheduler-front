#!/usr/bin/env node
/**
 * Mint a NextAuth session cookie from a backend token — SPEC-027 / TASK-090.
 *
 * WHY THIS EXISTS: QA has a composited browser but is forbidden from typing a password into a login form.
 * This converts an API session they can already obtain into a browser session, so painted screens become
 * testable. It is a **local operator tool** — nothing here ships with the app.
 *
 * WHAT IT DELIBERATELY DOES NOT DO:
 *   · It adds nothing to the deployed app — no provider, no route, no env flag, no SKIP_AUTH.
 *   · It grants nothing new — the cookie carries a backend token the holder already had.
 *   · It writes no secret to disk. Everything goes to stdout; the operator handles it.
 *   · It refuses to run against production.
 *
 * Usage:
 *   BACKEND_TOKEN=… AUTH_SECRET=… APP_URL=https://som.develyst.online node scripts/mint-session.mjs
 * Optional: USERNAME (default "qa"), ROLE (default "admin"), MAX_AGE_SECONDS (default 8h).
 */
import { encode } from "@auth/core/jwt";

/** Hosts this script must never mint a session for. */
const PRODUCTION_HOSTS = ["frontoffice.develyst.online"];

const die = (msg) => {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
};

const {
  BACKEND_TOKEN,
  AUTH_SECRET,
  APP_URL,
  USERNAME = "qa",
  ROLE = "admin",
  MAX_AGE_SECONDS = String(8 * 60 * 60),
} = process.env;

// Blank-but-present is the failure mode worth catching: it would mint a structurally valid cookie carrying
// no authority, which looks like a working session and behaves like a broken one.
if (!BACKEND_TOKEN || !BACKEND_TOKEN.trim())
  die("BACKEND_TOKEN is missing or blank. Get one from the API login you can already perform.");
if (!AUTH_SECRET || !AUTH_SECRET.trim())
  die("AUTH_SECRET is missing or blank. The operator holds this — it must match the running app's secret.");
if (!APP_URL || !APP_URL.trim()) die("APP_URL is missing. e.g. APP_URL=https://som.develyst.online");

let url;
try {
  url = new URL(APP_URL);
} catch {
  die(`APP_URL is not a valid URL: ${APP_URL}`);
}

if (PRODUCTION_HOSTS.includes(url.hostname))
  die(
    `Refusing to mint a session for PRODUCTION (${url.hostname}).\n` +
      `  This tool is for test environments only. If you genuinely need this against production,\n` +
      `  that is a decision to route up the chain — not to work around here.`,
  );

// HTTPS ⇒ Auth.js uses the __Secure- prefix. The cookie NAME is also the encoder's `salt` in Auth.js v5,
// so getting this wrong produces a cookie the app silently fails to decode.
const useSecureCookies = url.protocol === "https:";
const cookieName = `${useSecureCookies ? "__Secure-" : ""}authjs.session-token`;

// Shape must match auth.config.ts's `jwt`/`session` callbacks: they read backendToken, role, username.
// A drifted shape yields a session that looks valid and behaves oddly — worse than failing outright.
const token = {
  name: USERNAME,
  sub: USERNAME,
  username: USERNAME,
  role: ROLE,
  backendToken: BACKEND_TOKEN.trim(),
};

const maxAge = Number(MAX_AGE_SECONDS);
if (!Number.isFinite(maxAge) || maxAge <= 0) die(`MAX_AGE_SECONDS must be a positive number, got ${MAX_AGE_SECONDS}`);

const value = await encode({
  token,
  secret: AUTH_SECRET.trim(),
  salt: cookieName, // Auth.js v5: the cookie name IS the salt.
  maxAge,
});

const hours = Math.round(maxAge / 3600);
console.log(`
Cookie name : ${cookieName}
Cookie value: ${value}

Domain      : ${url.hostname}
Path        : /
Secure      : ${useSecureCookies}   HttpOnly: true   SameSite: Lax
Expires in  : ~${hours}h

→ Set that cookie on ${url.origin}, then open ${url.origin}/scheduler/calendar

  DevTools ▸ Application ▸ Cookies ▸ ${url.origin} ▸ add the name/value above.
  Nothing is written to disk. The value above is a live session — treat it like a password.
`);
