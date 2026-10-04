import axios from "axios";
import { getSession, signOut } from "next-auth/react";
import type { ApiError } from "@/types/api/contract";

/**
 * REQ-092 Stage 2 (TASK-382) — the guard's own sentence for a disabled account (`middleware/auth.ts`, a `401`). Only
 * a 401 carrying THIS sentence adds `reason=disabled` to the sign-out redirect; every other 401 is unchanged.
 */
export const DISABLED_SENTENCE = "บัญชีนี้ถูกปิดใช้งาน";
/** Fired on a `403 FORBIDDEN` so `useMe()` re-reads the grants (the guard then shows the sentence). */
const FORBIDDEN_EVENT = "ss:forbidden";

export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    /** The server's structured payload. Carried because some refusals are a LIST, not one sentence —
     *  e.g. `DISCOUNT_REFUSED` returns `{ problems: string[] }` and REQ-063 requires every entry to be
     *  shown, or staff fix one and resubmit straight into the next. Dropping it here made that impossible. */
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

/** The `problems` array from a refusal that has one (`DISCOUNT_REFUSED`), or `[]`. Never throws on shape. */
export const errorProblems = (e: unknown): string[] => {
  if (!(e instanceof ApiClientError)) return [];
  const problems = (e.details as { problems?: unknown } | undefined)?.problems;
  return Array.isArray(problems) ? problems.filter((p): p is string => typeof p === "string") : [];
};

/** TASK-662 — one zod issue at EXACTLY `["student","phone"]`: a new student with no phone-shaped parent phone (TASK-644). */
const isStudentPhoneIssue = (d: unknown): d is { message: string } =>
  typeof d === "object" && d !== null && "path" in d && "message" in d && Array.isArray(d.path) &&
  d.path.length === 2 && d.path[0] === "student" && d.path[1] === "phone" &&
  typeof d.message === "string";

/**
 * 🔴 TASK-662 (Porter's narrowest grant) — the server's SPECIFIC sentence for a phoneless new student. `lib/validate.ts`
 * answers every `VALIDATION` with one generic line by design (TASK-296), so the sentence that tells the admin what to do
 * rides only in `details`. Used ONLY for `VALIDATION` with that one path; every other error's message is untouched, and
 * `details` is still carried whole. 🔑 *An interceptor is judged by what it leaves alone.*
 */
const studentPhoneSentence = (e: ApiError["error"]): string | undefined =>
  e.code === "VALIDATION" && Array.isArray(e.details) ? e.details.find(isStudentPhoneIssue)?.message : undefined;

const baseURL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "/api";

const baseAuthURL =
  process.env.AUTH_URL?.replace(/\/$/, "") ?? "/api";
console.log("baseURL", baseURL);
console.log("baseAuthURL", baseAuthURL);
export const useMockData = process.env.NEXT_PUBLIC_USE_MOCK === "true";

export const api = axios.create({
  baseURL: baseURL,
  headers: { "Content-Type": "application/json" },
});

// Attach the backend JWT carried in the NextAuth session to every request.
// getSession() is async but cached client-side by next-auth.
api.interceptors.request.use(async (config) => {
  if (typeof window !== "undefined") {
    const session = await getSession();
    if (session?.backendToken) {
      config.headers.Authorization = `Bearer ${session.backendToken}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const body = error.response?.data as ApiError | undefined;
    // Session missing/expired → end the NextAuth session and bounce to login (skip in mock). A disabled account's
    // sentence rides along as `reason=disabled` so the login page can say why. EVERY 401 signs out — no path is exempt
    // (TASK-384: the self-service password's wrong-current refusal is a `400 WRONG_PASSWORD`, never a 401).
    if (error.response?.status === 401 && typeof window !== "undefined" && !useMockData) {
      if (!window.location.pathname.startsWith("/login")) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        const reason = body?.error?.message === DISABLED_SENTENCE ? "&reason=disabled" : "";
        void signOut({ callbackUrl: `/login?next=${next}${reason}` });
      }
    }
    // A menu grant taken away since the last `/me`: re-read it so the route guard shows the sentence.
    if (error.response?.status === 403 && typeof window !== "undefined") window.dispatchEvent(new Event(FORBIDDEN_EVENT));
    if (body?.error) {
      throw new ApiClientError(
        body.error.code,
        studentPhoneSentence(body.error) ?? body.error.message,
        error.response.status,
        body.error.details,
      );
    }
    throw error;
  },
);
