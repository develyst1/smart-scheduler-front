// Offline stand-in for `GET /api/sellable-packages` (TASK-078).
// ⚠️ This mirrors the server's card **because it replaces the server**, not because the FE keeps a price list:
// nothing outside this mock reads these numbers, and production code only ever reads the API response.
import type { SellablePackagesResponse } from "@/types/app/pricing";

const THB = (baht: number) => baht * 100; // satang, VAT-inclusive

const BIKE_SKATE = [{ id: "s1", name: "Bike" }, { id: "s2", name: "Skate" }];
const ONEWHEEL = [{ id: "s3", name: "Onewheel" }];
const BALANCE_PRIVATE = [{ id: "s4", name: "Balance Play (Private)" }];
const BALANCE_GROUP = [{ id: "s5", name: "Balance Play (Group)" }];

export const getSellablePackages = async (): Promise<SellablePackagesResponse> =>
  new Promise((r) =>
    setTimeout(
      () =>
        r({
          vatInclusive: true,
          packages: [
            // bike-skate — no 1 h on the card
            { priceGroup: "bike-skate", size: 4, externalRef: "course-bike-skate-4", priceMinor: THB(4790), subjects: BIKE_SKATE },
            { priceGroup: "bike-skate", size: 6, externalRef: "course-bike-skate-6", priceMinor: THB(6490), subjects: BIKE_SKATE },
            { priceGroup: "bike-skate", size: 10, externalRef: "course-bike-skate-10", priceMinor: THB(9790), subjects: BIKE_SKATE },
            // onewheel — ⚠️ no 10 h
            { priceGroup: "onewheel", size: 1, externalRef: "session-onewheel", priceMinor: THB(1690), subjects: ONEWHEEL },
            { priceGroup: "onewheel", size: 4, externalRef: "course-onewheel-4", priceMinor: THB(5790), subjects: ONEWHEEL },
            { priceGroup: "onewheel", size: 6, externalRef: "course-onewheel-6", priceMinor: THB(7990), subjects: ONEWHEEL },
            // balance-private — ⚠️ no 4 h
            { priceGroup: "balance-private", size: 1, externalRef: "session-balance-private", priceMinor: THB(1390), subjects: BALANCE_PRIVATE },
            { priceGroup: "balance-private", size: 6, externalRef: "course-balance-private-6", priceMinor: THB(7490), subjects: BALANCE_PRIVATE },
            { priceGroup: "balance-private", size: 10, externalRef: "course-balance-private-10", priceMinor: THB(11390), subjects: BALANCE_PRIVATE },
            // balance-group — ⚠️ no 4 h
            { priceGroup: "balance-group", size: 1, externalRef: "session-balance-group", priceMinor: THB(1090), subjects: BALANCE_GROUP },
            { priceGroup: "balance-group", size: 6, externalRef: "course-balance-group-6", priceMinor: THB(5290), subjects: BALANCE_GROUP },
            { priceGroup: "balance-group", size: 10, externalRef: "course-balance-group-10", priceMinor: THB(7790), subjects: BALANCE_GROUP },
          ],
          // A program with no price group — so the "nothing sellable" state is exercisable offline.
          unpricedSubjects: [{ id: "s6", name: "Surfskate" }],
          // TASK-106 — only bike-skate is voucher-bookable (matches the real card); onewheel/balance-* excluded.
          voucherAllowedGroups: ["bike-skate"],
        }),
      200,
    ),
  );
