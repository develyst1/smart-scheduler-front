"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader } from "@mantine/core";
import { getToken } from "@/lib/api/auth-store";

const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

/** Client-side gate for the admin area: no token → redirect to /login. */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (useMock || getToken()) {
      setReady(true);
      return;
    }
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    router.replace(`/login?next=${next}`);
  }, [router]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader size="md" />
      </div>
    );
  }
  return <>{children}</>;
}
