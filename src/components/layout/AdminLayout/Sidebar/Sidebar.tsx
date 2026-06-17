"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { NAV_ITEMS, APP_NAME } from "../AdminLayout.config";

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-default-200 bg-content1">
      <div className="flex items-center gap-2 px-5 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <CalendarRange size={20} />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold">{APP_NAME}</p>
          <p className="text-xs text-default-400">จัดตารางเรียน</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                active
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-default-600 hover:bg-default-100"
              }`}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 text-xs text-default-400">v0.1 · ทีมงานหลังบ้าน</div>
    </aside>
  );
}
