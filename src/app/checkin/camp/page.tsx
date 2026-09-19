import { Suspense } from "react";
import { Loader } from "@mantine/core";
import CheckinContent from "@/components/partials/Checkin/CheckinContent";

// TASK-404 — the camp day's public check-in landing: /checkin/camp?token=xxx (the server's `checkinUrl`). The SAME
// page as the session's, told its kind by the path — it posts to POST {API}/checkin/camp and renders the day shape.

export default function CampCheckinPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-paper">
          <Loader />
        </div>
      }
    >
      <CheckinContent kind="camp" />
    </Suspense>
  );
}
