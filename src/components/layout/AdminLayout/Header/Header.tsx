"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { ActionIcon, Menu as MantineMenu, UnstyledButton } from "@mantine/core";
import { KeyRound, LogOut, Menu, PanelLeft, PanelLeftClose } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useT, LanguageToggle } from "@/lib/i18n";
import { navItemForPath } from "../AdminLayout.config";
import ChangePasswordModal from "./ChangePasswordModal";
import { useMe } from "@/hooks/scheduler/useMe";

interface Props {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenMobile: () => void;
}

export default function Header({ collapsed, onToggleCollapse, onOpenMobile }: Props) {
  const pathname = usePathname();
  const t = useT();
  // Hidden entries are searched too: a hidden page still resolves when visited directly (REQ-026 Stage 1 hides
  // the menu item, not the route), and it should keep its own title rather than fall back to the app name.
  const current = navItemForPath(pathname);

  const { data: session } = useSession();
  // REQ-092 Stage 1 — the real user's display name; the username as a fallback for a pre-Stage-1 token.
  const name = session?.user?.displayName ?? session?.user?.username ?? t("header.staff");
  // REQ-092 Stage 2 (TASK-382 §3) — the avatar is the user menu: who they are · change my password · sign out. The
  // sign-out moved in here from a bare button; nothing else about it changed.
  const [pwOpen, setPwOpen] = useState(false);
  // REQ-092 Stage 4 (TASK-388) — the role's name under the display name, from `/me` (null for none ⇒ nothing).
  const roleName = useMe().me?.roleName ?? null;

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-muted-200 bg-content1/80 px-4 backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        {/* mobile: เปิด drawer */}
        <ActionIcon
          variant="subtle"
          color="gray"
          size="lg"
          className="lg:hidden"
          onClick={onOpenMobile}
          aria-label={t("header.openMenu")}
        >
          <Menu size={20} />
        </ActionIcon>
        {/* desktop: ย่อ/ขยาย sidebar */}
        <ActionIcon
          variant="subtle"
          color="gray"
          size="lg"
          className="hidden lg:inline-flex"
          onClick={onToggleCollapse}
          aria-label={collapsed ? t("header.expandMenu") : t("header.collapseMenu")}
        >
          {collapsed ? <PanelLeft size={20} /> : <PanelLeftClose size={20} />}
        </ActionIcon>
        <h1 className="truncate text-lg font-semibold tracking-tight">
          {current ? t(current.labelKey) : "SOM SCHEDULE"}
        </h1>
      </div>

      <div className="flex shrink-0 items-center gap-3 text-sm">
        <LanguageToggle />
        <MantineMenu shadow="md" width={220} position="bottom-end">
          <MantineMenu.Target>
            <UnstyledButton className="flex items-center gap-3" aria-label={t("header.userMenu")}>
              <span className="hidden flex-col items-end leading-tight sm:flex">
                <span className="text-muted-500">{name}</span>
                {roleName && <span className="text-xs text-muted-400">{roleName}</span>}
              </span>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-blue-700 text-xs font-semibold text-primary-foreground ring-2 ring-primary/20">
                TM
              </span>
            </UnstyledButton>
          </MantineMenu.Target>
          <MantineMenu.Dropdown>
            <MantineMenu.Label>
              <span className="block truncate text-sm font-medium text-foreground">{name}</span>
              {session?.user?.username && <span className="block truncate font-mono text-xs">{session.user.username}</span>}
              {roleName && <span className="block truncate text-xs">{roleName}</span>}
            </MantineMenu.Label>
            <MantineMenu.Divider />
            <MantineMenu.Item leftSection={<KeyRound size={15} />} onClick={() => setPwOpen(true)}>
              {t("header.changePassword")}
            </MantineMenu.Item>
            <MantineMenu.Item leftSection={<LogOut size={15} />} onClick={() => signOut({ callbackUrl: "/login" })}>
              {t("header.logout")}
            </MantineMenu.Item>
          </MantineMenu.Dropdown>
        </MantineMenu>
        <ChangePasswordModal opened={pwOpen} onClose={() => setPwOpen(false)} />
      </div>
    </header>
  );
}
