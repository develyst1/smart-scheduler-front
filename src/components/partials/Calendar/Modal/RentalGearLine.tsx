"use client";

import { Text } from "@mantine/core";
import { PackageOpen } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { Booking } from "@/types/app/scheduler";

/**
 * REQ-106 §1 (TASK-464) — what a COACH sees of a session's rental: **the gear, and nothing else.**
 *
 * The customer's report was *"โน๊ต rental ไม่ขึ้นเวลาสร้างตารางให้ครู"* — a coach could not see what to prepare. The cause
 * was not a missing permission: `BookingModal` hides the whole `RentalSection` for a linked teacher account (REQ-097's
 * teacher view), so no grant could ever reveal it. The owner's ruling (ก) is **gear only** — the item and its remark,
 * read-only. **No price, no paid/unpaid state, no buttons:** what the family paid is the shop's business, and a coach
 * has nothing to press here.
 *
 * 🔴 **`paid` IS in the object this component is handed** — the REQ-097 scope decides which BOOKINGS a coach sees, not
 * which fields — so the whole job is to not render it. That absence is pinned by value, not left to review.
 *
 * A separate component rather than a flag inside `RentalSection`, deliberately: that section is three doors, a money
 * post and six server codes: a `readOnly` branch through it would put "the coach must never see money" one boolean
 * away from every one of them. Here there is no money to leak — this file imports no price source and holds no door.
 *
 * A session with no rental renders nothing at all: no empty box, no `—`.
 */
export default function RentalGearLine({ booking }: { booking: Booking }) {
  const t = useT();
  const rental = booking.rental ?? null;
  if (!rental) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-muted-200 bg-muted-50 p-2.5" data-rental-gear={rental.code}>
      <PackageOpen size={15} className="mt-0.5 shrink-0 text-muted-500" aria-hidden />
      <div className="min-w-0">
        <Text size="sm" fw={500}>
          {t("rental.gearForCoach")}: {t(`rental.tier.${rental.code}`)}
        </Text>
        {rental.remark && (
          <Text size="xs" c="dimmed" className="whitespace-pre-wrap">
            {rental.remark}
          </Text>
        )}
      </div>
    </div>
  );
}
