"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Alert, Button, Loader, Stack, Text } from "@mantine/core";
import { AlertTriangle, DoorClosed } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useMe } from "@/hooks/scheduler/useMe";
import { LANDING_HREF, mayOpen, navItemForPath, navItemsFor } from "./AdminLayout.config";

/**
 * REQ-092 Stage 2 (TASK-382, SPEC-079 §2–§3.3) — the route guard, in ONE place on the admin layout. The page's nav
 * entry (visible or hidden) names the `menu:*` grant it needs; `mayOpen` is the same rule the sidebar uses.
 * - granted (or a super admin, or a route outside the nav) ⇒ the page;
 * - not granted ⇒ ONE calm sentence and a door to the first menu they DO have — never a blank, never the page's
 *   own fetches (which would only 403);
 * - the landing page (`/scheduler/calendar`, where `/` and the login send everyone) ⇒ straight to their first menu;
 * - zero menus (and not a super admin) ⇒ the empty shell: "no menus yet — ask your admin". The header above still
 *   shows who they are and offers "change my password".
 * 🔑 The server is the guard (`403 FORBIDDEN` without the grant); this is the honest UI. A grant taken away mid-session
 * reaches here on the next `/auth/me` (focus, 30 s, or the first 403).
 */
export default function MenuGuard({ children }: { children: React.ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const { access, isLoading } = useMe();

  const item = navItemForPath(pathname);
  const granted = !item || mayOpen(access, item);
  const mine = navItemsFor(access);
  const first = mine[0];
  const shell = !!access && !access.isSuperAdmin && access.menus.length === 0;
  const redirectTo = !isLoading && !granted && !shell && pathname === LANDING_HREF && first ? first.href : null;

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  if (isLoading || redirectTo) {
    return (
      <div className="flex justify-center p-8">
        <Loader size="sm" />
      </div>
    );
  }
  if (shell) {
    return (
      <Stack align="center" gap="xs" py="xl" className="text-center">
        <DoorClosed size={28} className="text-muted-400" />
        <Text fw={600}>{t("rbac.shellTitle")}</Text>
        <Text size="sm" c="dimmed">
          {t("rbac.shellBody")}
        </Text>
      </Stack>
    );
  }
  if (!granted) {
    return (
      <Alert color="orange" icon={<AlertTriangle size={16} />} variant="light">
        <Stack gap="xs" align="flex-start">
          <span>{t("rbac.noMenu")}</span>
          {first && (
            <Button component={Link} href={first.href} size="xs" variant="light" color="orange">
              {t("rbac.goTo", { menu: t(first.labelKey) })}
            </Button>
          )}
        </Stack>
      </Alert>
    );
  }
  return <>{children}</>;
}
