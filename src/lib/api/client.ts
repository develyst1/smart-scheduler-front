import axios from "axios";
import type { ApiError } from "@/types/api/contract";
import { clearAuth, getToken } from "./auth-store";

export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

const baseURL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:3001/api";

export const useMockData = process.env.NEXT_PUBLIC_USE_MOCK === "true";

export const api = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
});

// Attach the JWT (B.7) to every request when logged in.
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Session missing/expired → drop the token and bounce to login (skip in mock).
    if (error.response?.status === 401 && typeof window !== "undefined" && !useMockData) {
      clearAuth();
      if (!window.location.pathname.startsWith("/login")) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/login?next=${next}`;
      }
    }
    const body = error.response?.data as ApiError | undefined;
    if (body?.error) {
      throw new ApiClientError(body.error.code, body.error.message, error.response.status);
    }
    throw error;
  },
);
