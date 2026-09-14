import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader } from "@mantine/core";
import CheckinContent from "@/components/partials/Checkin/CheckinContent";

// Public check-in landing (C.1). Parents/students reach it by scanning the QR /
// tapping the LINE link: /checkin?token=xxx. No auth — the token is the credential.
//
// TASK-356 — the document title is the school's, as on /register (TASK-355 §10.1): the tab/LIFF header a parent
// sees reads SOM SCHEDULE. Page-level only; the root layout's "Smart Scheduler" stays for every other route.
export const metadata: Metadata = { title: "SOM SCHEDULE" };

export default function CheckinPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-paper">
          <Loader />
        </div>
      }
    >
      <CheckinContent />
    </Suspense>
  );
}
