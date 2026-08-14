import { Suspense } from "react";
import { Loader } from "@mantine/core";
import CheckinContent from "@/components/partials/Checkin/CheckinContent";

// Public check-in landing (C.1). Parents/students reach it by scanning the QR /
// tapping the LINE link: /checkin?token=xxx. No auth — the token is the credential.
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
