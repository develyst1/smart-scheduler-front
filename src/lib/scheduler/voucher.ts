/**
 * REQ-103 / SPEC-089 B (TASK-440) — the voucher card's doors and chip, as pure rules.
 *
 * 🚫 **No client status derivation.** `status` is the server's ONE derivation (`lib/voucher.ts` `voucherStatus`:
 * ENDED > EXPIRED > EXHAUSTED > ACTIVE) — the FE never computes ENDED from `endedAt`, and never re-reads
 * "usable" from the hours or the date when a `status` is present. An older payload without `status` keeps the
 * pre-REQ-103 chip rule (`remaining === 0` ⇒ used-up) and can never read ENDED.
 */
import type { VoucherStatus } from "@/types/api/contract";

export interface VoucherGrants {
  /** `can("action:bookings.course-cancel")` — the course's key, reused (owner ruling B1: no 60th key). */
  cancel: boolean;
}

export interface VoucherLike {
  status?: VoucherStatus | null;
  remaining: number;
}

/**
 * Which doors the voucher card offers.
 * - `cancel`: the key AND not ENDED (hidden, never disabled — REQ-092 Stage 3's rule).
 * - `book`: the server's usable rule mirrored (`voucherUsable` — the BE `lib/voucher.ts`: not ENDED, hours left,
 *   not expired) ⇒ exactly `ACTIVE`. An older payload without `status` reads as bookable — the server decides.
 */
export const voucherDoors = (grants: VoucherGrants, v: VoucherLike) => ({
  cancel: grants.cancel && v.status !== "ENDED",
  book: v.status == null || v.status === "ACTIVE",
});

/** `ENDED · Nh left` — the frozen balance stays readable (owner ruling 4). The `n` is the server's `remaining`. */
export const endedLabel = (v: VoucherLike) => ({ key: "voucher.endedChip", args: { n: v.remaining } });

/** The status chip: one row ⇒ one `{ key, args?, tone }`. The ENDED chip is red like the course's CANCELLED. */
export const voucherChip = (v: VoucherLike): { key: string; args?: Record<string, number>; tone: "success" | "danger" | "muted" } => {
  switch (v.status) {
    case "ENDED":
      return { ...endedLabel(v), tone: "danger" };
    case "EXPIRED":
      return { key: "course.status.EXPIRED", tone: "muted" };
    case "EXHAUSTED":
      return { key: "voucher.used", tone: "danger" };
    case "ACTIVE":
      return { key: "voucher.usable", tone: "success" };
    default:
      // No `status` (an older payload): the pre-REQ-103 rule, unchanged — never ENDED.
      return v.remaining === 0 ? { key: "voucher.used", tone: "danger" } : { key: "voucher.usable", tone: "success" };
  }
};
