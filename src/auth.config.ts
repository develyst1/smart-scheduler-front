// Edge-safe base config shared by the proxy (middleware) and the full auth setup.
// Keeps NO Node-only deps (no axios) so it can run in the edge runtime. The
// Credentials provider — which calls the backend via axios — lives in auth.ts.

import type { NextAuthConfig } from "next-auth";
import { readTokenExp, SESSION_MAX_AGE_SECONDS, tokenLive } from "@/lib/auth/token-expiry";

export const authConfig = {
  trustHost: true,
  // REQ-128 L1 — one fixed 7-day login (the API token's own lifetime). The rolling session can never outlive that token: see the `jwt` callback.
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  pages: { signIn: "/login" },
  providers: [], // real providers are added in auth.ts
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.backendToken = user.backendToken;
        token.role = user.role;
        token.username = user.username;
        // REQ-092 Stage 1 — the real user's id, display name and super-admin flag ride the token to the session.
        token.userId = user.id;
        token.displayName = user.displayName;
        token.isSuperAdmin = user.isSuperAdmin === true;
        // REQ-092 Stage 2 — the menus from the login body seed the first paint; `useMe()` refetches `/me` at once.
        token.menus = user.menus;
        token.actions = user.actions;
        token.teacherId = user.teacherId ?? null;
        // REQ-128 L1 — the API token's own expiry (a claim READ, never verified here); the back end stays the authority.
        token.backendExp = readTokenExp(user.backendToken);
      }
      // Once the API token has expired — or its expiry is unknown (fail closed) — end the session: the user lands on the login page cleanly instead of meeting a 401 mid-action.
      if (!tokenLive(token.backendExp)) return null;
      return token;
    },
    session({ session, token }) {
      session.backendToken = token.backendToken;
      if (session.user) {
        session.user.role = token.role;
        session.user.username = token.username;
        session.user.id = token.userId ?? "";
        session.user.displayName = token.displayName;
        session.user.isSuperAdmin = token.isSuperAdmin === true;
        session.user.menus = token.menus;
        session.user.actions = token.actions;
        session.user.teacherId = token.teacherId ?? null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
