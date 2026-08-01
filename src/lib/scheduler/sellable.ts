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
export const isUnpriced = (data: SellablePackagesResponse | undefined, subjectId: string): boolean =>
  !!subjectId && !!data?.unpricedSubjects.some((s) => s.id === subjectId);
