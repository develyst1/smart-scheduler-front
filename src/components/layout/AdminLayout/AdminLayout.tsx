"use client";

import { useState } from "react";
import Sidebar from "./Sidebar/Sidebar";
import Header from "./Header/Header";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // desktop: ย่อ sidebar เหลือไอคอน · mobile: เปิด drawer ทับจอ
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
          onOpenMobile={() => setMobileOpen(true)}
        />
        <main className="flex-1 overflow-auto bg-paper p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
