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

const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

// Same base as the API (e.g. `…/api`); login lives at `…/api/auth/login`.
const apiBase =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:3001/api";

console.log("NextAuth config: apiBase=", apiBase, "useMock=", useMock);

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
            role: "admin",
            backendToken: "mock-token",
          };
        }
        console.log("NextAuth config: apiBase=", apiBase, "useMock=", useMock);

        try {
          const { data } = await axios.post<LoginResponse>(`${apiBase}/auth/login`, {
            username,
            password,
          });
          return {
            id: data.user.username,
            name: data.user.username,
            username: data.user.username,
            role: data.user.role,
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
