import ShopfrontCheckinContent from "@/components/partials/Checkin/ShopfrontCheckinContent";

/**
 * REQ-108 (TASK-478) — the SHOP-FRONT check-in page.
 *
 * 🔴 **This path is PRINTED ON A POSTER** (`https://frontoffice.develyst.online/checkin/shop`). A paper QR cannot be
 * rotated, re-issued or redirected: every visitor who scans that poster for the next year arrives here. **Do not
 * rename, nest, redirect or "tidy" this route** — `lib/checkin/shopfront.ts` holds the same warning beside the one
 * literal, and a test fails if this page stops existing.
 *
 * No `?token=` — the phone typed on the page is the credential (the owner's ruling, REQ-108 §5); a token would expire
 * and a printed poster cannot be re-printed. No `Suspense` wrapper is needed: unlike `/checkin`, this page reads no
 * search params at all.
 */
export default function ShopfrontCheckinPage() {
  return <ShopfrontCheckinContent />;
}
