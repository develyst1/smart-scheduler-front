"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { changeMyPassword, getMe, getPermissions, type Me } from "@/services/me.service";
import type { MenuAccess } from "@/lib/rbac/menus";
import { can, type ActionKey } from "@/lib/rbac/actions";

/** REQ-092 Stage 2 (TASK-382) — who the token is and the menus they may open. One key; the nav and the guard read it. */
export const ME_KEY = ["me"] as const;

/**
 * The event `lib/api/client.ts` fires on a `403 FORBIDDEN` from any call: a grant was taken away since the last
 * `/me`, so the truth is re-read and the guard shows the sentence instead of a page that cannot load.
 */
export const FORBIDDEN_EVENT = "ss:forbidden";

/**
 * `/me` is the truth; the session's `menus` (the login body) SEED the first paint so the nav does not flash
 * empty on a reload — `initialDataUpdatedAt: 0` marks the seed stale, so the real read fires at once. On a
 * pre-Stage-2 token (no `menus`) there is no seed and the guard waits for the read.
 */
export const useMe = () => {
  const { data: session, status } = useSession();
  const su = session?.user;
  const seed: Me | undefined =
    su && Array.isArray(su.menus)
      ? {
          id: su.id,
          username: su.username ?? "",
          displayName: su.displayName ?? "",
          isSuperAdmin: su.isSuperAdmin === true,
          menus: su.menus,
          actions: Array.isArray(su.actions) ? su.actions : [],
        }
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
  const access: MenuAccess | undefined = q.data
    ? { isSuperAdmin: q.data.isSuperAdmin === true, menus: q.data.menus, actions: Array.isArray(q.data.actions) ? q.data.actions : [] }
    : undefined;
  return { me: q.data, access, isLoading: status === "loading" || (status === "authenticated" && !q.data), error: q.error };
};

/**
 * REQ-092 Stage 3 (TASK-386) — ONE gate for every mutate control: `const can = useCan(); … {can("action:x.y") && <Button/>}`.
 * Reads the same `/me` the nav and the route guard read (a super admin ⇒ every act; grants not known yet ⇒ nothing).
 * Not granted ⇒ the control is HIDDEN, never disabled. The server refuses regardless (`403`, its own sentence).
 */
export const useCan = (): ((action: ActionKey) => boolean) => {
  const { access } = useMe();
  return (action) => can(access, action);
};

/** Stage 3 — the registry (`GET /permissions`): action keys with the BE's own labels, for the checklist. */
export const PERMISSIONS_KEY = ["permissions"] as const;
export const usePermissions = (enabled = true) => useQuery({ queryKey: PERMISSIONS_KEY, queryFn: getPermissions, enabled, staleTime: 5 * 60_000 });

export const useChangeMyPassword = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      changeMyPassword(currentPassword, newPassword),
    onSuccess: () => qc.invalidateQueries({ queryKey: ME_KEY }),
  });
};
