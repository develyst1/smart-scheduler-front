// Edge-safe base config shared by the proxy (middleware) and the full auth setup.
// Keeps NO Node-only deps (no axios) so it can run in the edge runtime. The
// Credentials provider — which calls the backend via axios — lives in auth.ts.

import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
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
        // REQ-092 Stage 2 — the menus from the login body seed the first paint; `useMe()` refetches `/auth/me` at once.
        token.menus = user.menus;
      }
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
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
