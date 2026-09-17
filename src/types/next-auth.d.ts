// Module augmentation: carry the backend JWT + role/username through the
// NextAuth session and token (see src/auth.ts).
import type { Role } from "@/types/api/contract";
import type { DefaultSession } from "next-auth";
import "next-auth/jwt";

// REQ-092 Stage 1 (TASK-378) — the session carries the REAL user: `id` (the row), `displayName`, `isSuperAdmin`.
declare module "next-auth" {
  interface Session {
    backendToken?: string;
    user: {
      id: string;
      role?: Role;
      username?: string;
      displayName?: string;
      isSuperAdmin?: boolean;
      /** REQ-092 Stage 2 — the menus from the login body (a seed; `/me` is the truth). Absent on an older token. */
      menus?: string[];
      actions?: string[];
    } & DefaultSession["user"];
  }

  interface User {
    backendToken?: string;
    role?: Role;
    username?: string;
    displayName?: string;
    isSuperAdmin?: boolean;
    menus?: string[];
    actions?: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    backendToken?: string;
    role?: Role;
    username?: string;
    userId?: string;
    displayName?: string;
    isSuperAdmin?: boolean;
    menus?: string[];
    actions?: string[];
  }
}
