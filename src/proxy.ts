// Server-side route guard (Next.js 16 renamed `middleware` → `proxy`).
// Replaces the old client-only AuthGuard: no session on a protected route →
// redirect to /login, preserving the requested path as `next`.

import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  if (!req.auth) {
    const next = req.nextUrl.pathname + req.nextUrl.search;
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("next", next);
    return Response.redirect(url);
  }
});

export const config = {
  matcher: ["/scheduler/:path*"],
};
