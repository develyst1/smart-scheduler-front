import { Suspense } from "react";
import { BookingsContent } from "@/components/partials/Bookings";

export default async function BookingsPage() {
  // REQ-132 (TASK-841): the content reads `?course=` / `?voucher=` (an Attention item's link) — `useSearchParams` needs a Suspense boundary at build.
  return (
    <Suspense fallback={null}>
      <BookingsContent />
    </Suspense>
  );
}
