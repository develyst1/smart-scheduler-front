// Auth service (B.7 FE). Login hits the PUBLIC `/api/auth/login` (registered before
// the JWT guard) via a bare axios call — not the `api` instance, so it skips the
// Bearer header and the 401-redirect interceptor.

import axios from "axios";
import { clearAuth, setToken, setUser, type AuthUser } from "@/lib/api/auth-store";
import type { LoginResponse } from "@/types/api/contract";

const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

// Same base as the API (e.g. `…/api`); login lives at `…/api/auth/login`.
const apiBase =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:3001/api";

export async function login(username: string, password: string): Promise<AuthUser> {
  if (useMock) {
    const user: AuthUser = { username: username || "admin", role: "admin" };
    setToken("mock-token");
    setUser(user);
    return user;
  }
  const { data } = await axios.post<LoginResponse>(`${apiBase}/auth/login`, {
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
