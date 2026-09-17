"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { changeMyPassword, getMe, type Me } from "@/services/me.service";
import type { MenuAccess } from "@/lib/rbac/menus";

/** REQ-092 Stage 2 (TASK-382) — who the token is and the menus they may open. One key; the nav and the guard read it. */
export const ME_KEY = ["me"] as const;

/**
 * The event `lib/api/client.ts` fires on a `403 FORBIDDEN` from any call: a grant was taken away since the last
 * `/auth/me`, so the truth is re-read and the guard shows the sentence instead of a page that cannot load.
 */
export const FORBIDDEN_EVENT = "ss:forbidden";

/**
 * `/auth/me` is the truth; the session's `menus` (the login body) SEED the first paint so the nav does not flash
 * empty on a reload — `initialDataUpdatedAt: 0` marks the seed stale, so the real read fires at once. On a
 * pre-Stage-2 token (no `menus`) there is no seed and the guard waits for the read.
 */
export const useMe = () => {
  const { data: session, status } = useSession();
  const su = session?.user;
  const seed: Me | undefined =
    su && Array.isArray(su.menus)
      ? { id: su.id, username: su.username ?? "", displayName: su.displayName ?? "", isSuperAdmin: su.isSuperAdmin === true, menus: su.menus }
      : undefined;
  const q = useQuery({
    queryKey: ME_KEY,
    queryFn: getMe,
    enabled: status === "authenticated",
    initialData: seed,
    initialDataUpdatedAt: 0,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const { refetch } = q;
  useEffect(() => {
    const onForbidden = () => void refetch();
    window.addEventListener(FORBIDDEN_EVENT, onForbidden);
    return () => window.removeEventListener(FORBIDDEN_EVENT, onForbidden);
  }, [refetch]);
  const access: MenuAccess | undefined = q.data ? { isSuperAdmin: q.data.isSuperAdmin === true, menus: q.data.menus } : undefined;
  return { me: q.data, access, isLoading: status === "loading" || (status === "authenticated" && !q.data), error: q.error };
};

export const useChangeMyPassword = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      changeMyPassword(currentPassword, newPassword),
    onSuccess: () => qc.invalidateQueries({ queryKey: ME_KEY }),
  });
};
