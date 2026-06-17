"use client";

import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "../AdminLayout.config";

export default function Header() {
  const pathname = usePathname();
  const current = NAV_ITEMS.find((i) => pathname?.startsWith(i.href));

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-default-200 bg-content1 px-6">
      <h1 className="text-lg font-semibold">{current?.label ?? "Smart Scheduler"}</h1>
      <div className="flex items-center gap-3 text-sm text-default-500">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-default-200 text-xs font-medium">
          TM
        </span>
        <span>ทีมงาน</span>
      </div>
    </header>
  );
}
