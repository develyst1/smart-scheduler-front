// Reading the sellable-packages card (SPEC-024 / TASK-078). Pure, framework-free: the modal asks "what can I
// sell for this program, and what does it cost?" and never derives either answer from a local table.
import type { SellablePackage, SellablePackagesResponse } from "@/types/app/pricing";

/** Course sizes only — size 1 is a single session, a different booking type. */
export const courseSizesFor = (data: SellablePackagesResponse | undefined, subjectId: string): number[] =>
  !data || !subjectId
    ? []
    : data.packages
        .filter((p) => p.size !== 1 && p.subjects.some((s) => s.id === subjectId))
        .map((p) => p.size)
        .sort((a, b) => a - b);

export const packageFor = (
  data: SellablePackagesResponse | undefined,
  subjectId: string,
  size: number,
): SellablePackage | undefined =>
  data?.packages.find((p) => p.size === size && p.subjects.some((s) => s.id === subjectId));

/**
 * True when the program is configured but sells nothing — i.e. the API listed it under `unpricedSubjects`.
 * Distinct from "no program chosen yet", which must not show an error.
 */
/**
 * REQ-095 Stage 2b (TASK-400) — the course form INSIDE a group prices by the GROUP's card: the packages whose
 * `priceGroup` is the group's `priceGroup` (from the server — never kind → group here, never a price). DUO shows
 * 4/6/10, Group 6/10 — whatever the card lists; an unknown group ⇒ nothing, and the form says so like an unpriced subject.
 */
export const courseSizesForGroup = (data: SellablePackagesResponse | undefined, priceGroup: string | null | undefined): number[] =>
  !data || !priceGroup ? [] : data.packages.filter((p) => p.size !== 1 && p.priceGroup === priceGroup).map((p) => p.size).sort((a, b) => a - b);

export const packageForGroup = (data: SellablePackagesResponse | undefined, priceGroup: string | null | undefined, size: number) =>
  !priceGroup ? undefined : data?.packages.find((p) => p.size === size && p.priceGroup === priceGroup);

export const isUnpriced = (data: SellablePackagesResponse | undefined, subjectId: string): boolean =>
  !!subjectId && !!data?.unpricedSubjects.some((s) => s.id === subjectId);

/**
 * SPEC-030 / TASK-106 (part b, FE half) — may a voucher book this program?
 * The rule lives in the exposed `voucherAllowedGroups`, never a hardcoded list. A subject is excluded only when it
 * maps to a KNOWN excluded price group (it has packages, none in the allowed set). A subject with no package
 * (pricing unknown) is left selectable — the backend still enforces `VOUCHER_PROGRAM_EXCLUDED`, so this only avoids
 * over-hiding a program the FE can't classify.
 */
export const voucherAllowsSubject = (
  data: SellablePackagesResponse | undefined,
  subjectId: string,
): boolean => {
  if (!data) return true; // card not loaded yet — don't hide; the server is the backstop
  const pkgs = data.packages.filter((p) => p.subjects.some((s) => s.id === subjectId));
  if (pkgs.length === 0) return true; // no price group here → can't classify, leave it to the server
  return pkgs.some((p) => data.voucherAllowedGroups.includes(p.priceGroup));
};
