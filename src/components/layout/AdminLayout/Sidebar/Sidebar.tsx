"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { useT } from "@/lib/i18n";
import { NAV_ITEMS, APP_NAME } from "../AdminLayout.config";

interface Props {
  /** desktop: ย่อเหลือไอคอน */
  collapsed: boolean;
  /** mobile: เปิด drawer */
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

function Brand({ collapsed }: { collapsed: boolean }) {
  const t = useT();
  return (
    <div className="flex items-center gap-3 px-5 py-5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-blue-700 text-primary-foreground shadow-md shadow-primary/30">
        <CalendarRange size={20} />
      </span>
      {!collapsed && (
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight">{APP_NAME}</p>
          <p className="text-xs text-muted-400">{t("brand.tagline")}</p>
        </div>
      )}
    </div>
  );
}

function SidebarFooter() {
  const t = useT();
  return <div className="px-5 py-4 text-xs text-muted-400">{t("brand.footer")}</div>;
}

function NavList({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const t = useT();

  return (
    <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = pathname?.startsWith(item.href);
        const label = t(item.labelKey);
        return (
          <Link
            key={item.key}
            href={item.href}
            onClick={onNavigate}
            title={collapsed ? label : undefined}
            className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
              collapsed ? "justify-center" : ""
            } ${
              active
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-600 hover:bg-muted-100"
            }`}
          >
            {active && (
              <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
            )}
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                active
                  ? "bg-primary/15 text-primary"
                  : "text-muted-500 group-hover:text-muted-600"
              }`}
            >
              <Icon size={18} />
            </span>
            {!collapsed && label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function Sidebar({ collapsed, mobileOpen, onCloseMobile }: Props) {
  return (
    <>
      {/* ── Desktop: sidebar ในเลย์เอาต์ ย่อ/ขยายได้ (ซ่อนบนจอเล็ก) ── */}
      <aside
        className={`hidden h-full shrink-0 flex-col border-r border-muted-200 bg-content1 transition-[width] duration-200 lg:flex ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        <Brand collapsed={collapsed} />
        <NavList collapsed={collapsed} />
        {!collapsed && (
          <SidebarFooter />
        )}
      </aside>

      {/* ── Mobile: drawer ทับจอ + backdrop (แสดงเฉพาะจอเล็ก) ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={onCloseMobile}
            aria-hidden
          />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-muted-200 bg-content1 shadow-xl">
            <Brand collapsed={false} />
            <NavList collapsed={false} onNavigate={onCloseMobile} />
            <SidebarFooter />
          </aside>
        </div>
      )}
    </>
  );
}
