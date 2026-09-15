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

// TASK-355 §10.1 put `SOM SCHEDULE` here as a page-level title; TASK-357 (REQ-089 item 0) made it the app's name in
// the root layout, so this page carries none of its own — the LIFF header still reads it, from the root.

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
