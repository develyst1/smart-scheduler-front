import { test, expect } from "bun:test";
import { voucherAllowsSubject } from "./sellable";
import type { SellablePackagesResponse } from "@/types/app/pricing";

// SPEC-030 / TASK-107 — a voucher may book only the allowed price groups (real card: ["bike-skate"]).
// The FE filters off the exposed set; it must NOT over-hide a subject it can't classify (server is the backstop).
const card: SellablePackagesResponse = {
  vatInclusive: true,
  packages: [
    { priceGroup: "bike-skate", size: 4, externalRef: "c-bs-4", priceMinor: 100, subjects: [{ id: "s1", name: "Bike" }] },
    { priceGroup: "onewheel", size: 4, externalRef: "c-ow-4", priceMinor: 100, subjects: [{ id: "s2", name: "Onewheel" }] },
  ],
  unpricedSubjects: [{ id: "s3", name: "Surfskate" }],
  voucherAllowedGroups: ["bike-skate"],
};

test("allows a subject in an allowed price group", () => {
  expect(voucherAllowsSubject(card, "s1")).toBe(true);
});

test("excludes a subject that maps only to an excluded price group", () => {
  expect(voucherAllowsSubject(card, "s2")).toBe(false);
});

test("does not over-hide: unclassifiable subject (no package) stays selectable — server enforces", () => {
  expect(voucherAllowsSubject(card, "s3")).toBe(true); // unpriced, no package
  expect(voucherAllowsSubject(card, "unknown")).toBe(true); // not on the card at all
  expect(voucherAllowsSubject(undefined, "s2")).toBe(true); // card not loaded yet
});
