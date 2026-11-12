import { Suspense } from "react";
import { CalendarContent } from "@/components/partials/Calendar";

export default async function CalendarPage() {
  // TASK-960: the content reads `?date=` (an Attention "closed day" item's link) — `useSearchParams` needs a Suspense boundary at build, as on the Bookings page.
  return (
    <Suspense fallback={null}>
      <CalendarContent />
    </Suspense>
  );
}
