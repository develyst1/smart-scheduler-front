// Module augmentation: carry the backend JWT + role/username through the
// NextAuth session and token (see src/auth.ts).
import type { Role } from "@/types/api/contract";
import type { DefaultSession } from "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    backendToken?: string;
    user: {
      role?: Role;
      username?: string;
    } & DefaultSession["user"];
  }

  interface User {
    backendToken?: string;
    role?: Role;
    username?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    backendToken?: string;
    role?: Role;
    username?: string;
  }
}
