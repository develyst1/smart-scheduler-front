// NextAuth (Auth.js v5) — full config. Replaces the old localStorage JWT flow (B.7).
// The backend stays the source of truth for auth: the Credentials provider wraps
// the existing `POST /auth/login`, and the backend JWT is carried inside the
// NextAuth session so axios can attach it as a Bearer header (see lib/api/client.ts).
// Base/edge-safe bits live in auth.config.ts (used by the proxy).

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import axios from "axios";
import { authConfig } from "@/auth.config";
import type { LoginResponse } from "@/types/api/contract";
import { MENU_KEYS } from "@/lib/rbac/menus";
import { ACTION_KEYS_SNAPSHOT } from "@/lib/rbac/actions";

const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

// Same base as the API (e.g. `…/api`); login lives at `…/api/auth/login`.
const apiAuthBase =
  process.env.AUTH_URL?.replace(/\/$/, "") ?? "/api";
const apiBase =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "/api";

  console.log("apiAuthBase", apiAuthBase);
  console.log("apiBase", apiBase);
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const username = String(credentials?.username ?? "").trim();
        const password = String(credentials?.password ?? "");

        if (useMock) {
          return {
            id: username || "admin",
            name: username || "admin",
            username: username || "admin",
            displayName: username || "admin",
            isSuperAdmin: true,
            role: "super_admin",
            menus: [...MENU_KEYS],
            actions: [...ACTION_KEYS_SNAPSHOT],
            backendToken: "mock-token",
          };
        }
        console.log("NextAuth config: apiBase=", apiBase, "useMock=", useMock);

        try {
          const { data } = await axios.post<LoginResponse>(`${apiBase}/auth/login`, {
            username,
            password,
          });
          // REQ-092 Stage 1 (TASK-378) — the REAL user from the table: `id` is the row's id (it used to be the
          // username), `name`/`displayName` is what the header shows, `isSuperAdmin` gates the Users page and its nav
          // entry. `role` is still read as today so nothing else moves (the discount guard reads it — Stage 3's).
          return {
            id: data.user.id,
            name: data.user.displayName,
            username: data.user.username,
            displayName: data.user.displayName,
            isSuperAdmin: data.user.isSuperAdmin === true,
            role: data.user.role,
            // REQ-092 Stage 2 (TASK-382) — the login body's menus SEED the nav; `/me` on load is the truth.
            menus: Array.isArray(data.user.menus) ? data.user.menus : [],
            actions: Array.isArray(data.user.actions) ? data.user.actions : [],
            backendToken: data.token,
          };
        } catch {
          // Returning null surfaces as a CredentialsSignin error on the client.
          return null;
        }
      },
    }),
  ],
});
