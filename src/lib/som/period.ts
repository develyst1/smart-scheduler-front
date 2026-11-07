// SOM dashboard time period (client, 2026-11): the page opens on everything, then All · a month · a custom range.
// Pure and framework-free — what goes on the wire, and which period a section's numbers really cover.

import type { SomPeriod, SomPeriodEcho } from "@/types/app/som";

/**
 * Query params for a period. The server takes `month`, or `from` + `to` as a pair, or neither (= everything) —
 * sending a month together with a range is a 400, so a period only ever produces one of the shapes.
 */
export function somPeriodParams(p: SomPeriod): Record<string, string> {
  switch (p.kind) {
    case "all":
      return {};
    case "month":
      return { month: p.month };
    case "range":
      return { from: p.from, to: p.to };
  }
}

/** Stable cache key for a period. */
export const somPeriodKey = (p: SomPeriod): string =>
  Object.values(somPeriodParams(p)).join("_") || "all";

/**
 * The period a section's numbers cover: what the response itself says (`month`, else `from` + `to`), falling back
 * to the period that was asked for when a server doesn't echo one. Reading the response first keeps a section's
 * label true to the numbers beside it while a new filter is still loading.
 */
export function resolveSomScope(
  echo: SomPeriodEcho | null | undefined,
  asked: SomPeriod,
): SomPeriod {
  if (echo?.month) return { kind: "month", month: echo.month };
  if (echo?.from && echo?.to)
    return { kind: "range", from: echo.from, to: echo.to };
  return asked;
}
