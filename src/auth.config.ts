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
      }
      return token;
    },
    session({ session, token }) {
      session.backendToken = token.backendToken;
      if (session.user) {
        session.user.role = token.role;
        session.user.username = token.username;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
