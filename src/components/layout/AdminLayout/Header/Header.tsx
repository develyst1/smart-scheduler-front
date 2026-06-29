"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@mantine/core";
import { LogOut } from "lucide-react";
import { NAV_ITEMS } from "../AdminLayout.config";
import { getUser } from "@/lib/api/auth-store";
import { logout } from "@/services/auth.service";

export default function Header() {
  const pathname = usePathname();
  const current = NAV_ITEMS.find((i) => pathname?.startsWith(i.href));

  // Read user after mount to avoid SSR/client hydration mismatch.
  const [name, setName] = useState("ทีมงาน");
  useEffect(() => {
    const u = getUser();
    if (u?.username) setName(u.username);
  }, []);

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-default-200 bg-content1/80 px-6 backdrop-blur">
      <h1 className="text-lg font-semibold tracking-tight">
        {current?.label ?? "Smart Scheduler"}
      </h1>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-default-500">{name}</span>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-blue-700 text-xs font-semibold text-primary-foreground ring-2 ring-primary/20">
          TM
        </span>
        <Button
          variant="subtle"
          color="gray"
          size="xs"
          leftSection={<LogOut size={15} />}
          onClick={logout}
        >
          ออกจากระบบ
        </Button>
      </div>
    </header>
  );
}
