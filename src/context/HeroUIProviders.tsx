"use client";

import { HeroUIProvider, ToastProvider } from "@heroui/react";
import { useRouter } from "next/navigation";
import { QueryProvider } from "@/context/query/QueryProvider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <HeroUIProvider navigate={router.push}>
      <ToastProvider placement="top-right" toastProps={{ timeout: 4000 }} />
      <QueryProvider>{children}</QueryProvider>
    </HeroUIProvider>
  );
}
