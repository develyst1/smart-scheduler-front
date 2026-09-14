import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader } from "@mantine/core";
import { I18nProvider } from "@/lib/i18n";
import RegisterContent from "@/components/partials/Register/RegisterContent";

// TASK-348 (`REQ-088`) — public registration landing, the sibling of `/checkin`. A parent reaches it by tapping
// the LINE link; LIFF supplies the ID token, and the token is the credential. No admin auth.
//
// TASK-350 — the page has ITS OWN language scope (`ss.lang.register`): `localStorage` is per origin, so a parent's
// TH/EN toggle here must not be the admin's `ss.lang` on the same browser, and vice versa. Nested provider, own key.
export const REGISTER_LANG_KEY = "ss.lang.register";

// TASK-355 §10.1 — the LIFF header shows the document title; the owner's spelling, upper case. Page-level only:
// the app is still "Smart Scheduler" everywhere else (root layout), and `/checkin` is deliberately not changed here.
export const metadata: Metadata = { title: "SOM SCHEDULE" };

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-paper">
          <Loader />
        </div>
      }
    >
      <I18nProvider storageKey={REGISTER_LANG_KEY}>
        <RegisterContent />
      </I18nProvider>
    </Suspense>
  );
}
