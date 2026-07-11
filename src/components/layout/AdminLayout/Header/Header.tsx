"use client";

import { usePathname } from "next/navigation";
import { ActionIcon, Button } from "@mantine/core";
import { LogOut, Menu, PanelLeft, PanelLeftClose } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useT, LanguageToggle } from "@/lib/i18n";
import { NAV_ITEMS } from "../AdminLayout.config";

interface Props {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenMobile: () => void;
}

export default function Header({ collapsed, onToggleCollapse, onOpenMobile }: Props) {
  const pathname = usePathname();
  const t = useT();
  const current = NAV_ITEMS.find((i) => pathname?.startsWith(i.href));

  const { data: session } = useSession();
  const name = session?.user?.username ?? t("header.staff");

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-default-200 bg-content1/80 px-4 backdrop-blur sm:px-6">
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
          {current ? t(current.labelKey) : "Smart Scheduler"}
        </h1>
      </div>

      <div className="flex shrink-0 items-center gap-3 text-sm">
        <LanguageToggle />
        <span className="hidden text-default-500 sm:inline">{name}</span>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-blue-700 text-xs font-semibold text-primary-foreground ring-2 ring-primary/20">
          TM
        </span>
        <Button
          variant="subtle"
          color="gray"
          size="xs"
          leftSection={<LogOut size={15} />}
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <span className="hidden sm:inline">{t("header.logout")}</span>
        </Button>
      </div>
    </header>
  );
}
