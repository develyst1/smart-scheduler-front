import { Suspense } from "react";
import { Loader } from "@mantine/core";
import RegisterContent from "@/components/partials/Register/RegisterContent";

// TASK-348 (`REQ-088`) — public registration landing, the sibling of `/checkin`. A parent reaches it by tapping
// the LINE link; LIFF supplies the ID token, and the token is the credential. No admin auth.
export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-paper">
          <Loader />
        </div>
      }
    >
      <RegisterContent />
    </Suspense>
  );
}
