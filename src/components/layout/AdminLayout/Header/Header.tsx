"use client";

import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "../AdminLayout.config";

export default function Header() {
  const pathname = usePathname();
  const current = NAV_ITEMS.find((i) => pathname?.startsWith(i.href));

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-default-200 bg-content1/80 px-6 backdrop-blur">
      <h1 className="text-lg font-semibold tracking-tight">
        {current?.label ?? "Smart Scheduler"}
      </h1>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-default-500">ทีมงาน</span>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-blue-700 text-xs font-semibold text-primary-foreground ring-2 ring-primary/20">
          TM
        </span>
      </div>
    </header>
  );
}
