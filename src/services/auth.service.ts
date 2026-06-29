// Auth service (B.7 FE). Login hits the PUBLIC `/auth/login` (sibling of `/api`,
// not behind the JWT guard), so it uses a bare axios call — not the `api` instance
// (which would prefix `/api` and run the 401-redirect interceptor).

import axios from "axios";
import { clearAuth, setToken, setUser, type AuthUser } from "@/lib/api/auth-store";
import type { LoginResponse } from "@/types/api/contract";

const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

// `…/api` → `…` so we can reach `/auth/login` at the server root.
const authBase = (
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:3001/api"
).replace(/\/api$/, "");

export async function login(username: string, password: string): Promise<AuthUser> {
  if (useMock) {
    const user: AuthUser = { username: username || "admin", role: "admin" };
    setToken("mock-token");
    setUser(user);
    return user;
  }
  const { data } = await axios.post<LoginResponse>(`${authBase}/auth/login`, {
    username,
    password,
  });
  setToken(data.token);
  setUser(data.user);
  return data.user;
}

export function logout() {
  clearAuth();
  if (typeof window !== "undefined") window.location.href = "/login";
}
