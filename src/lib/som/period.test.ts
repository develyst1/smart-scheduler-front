import { describe, expect, it } from "bun:test";
import { resolveSomScope, somPeriodKey, somPeriodParams } from "./period";

const month = { kind: "month", month: "2026-10" } as const;
const range = { kind: "range", from: "2026-10-01", to: "2026-10-15" } as const;
const all = { kind: "all" } as const;

describe("somPeriodParams", () => {
  it("sends nothing for all", () => {
    expect(somPeriodParams(all)).toEqual({});
  });

  it("sends a month alone or from + to alone — never both (the server answers 400)", () => {
    expect(somPeriodParams(month)).toEqual({ month: "2026-10" });
    expect(somPeriodParams(range)).toEqual({
      from: "2026-10-01",
      to: "2026-10-15",
    });
  });
});

describe("somPeriodKey", () => {
  it("gives each period its own key", () => {
    const keys = [
      all,
      month,
      range,
      { kind: "range", from: "2026-10-01", to: "2026-10-16" } as const,
    ].map(somPeriodKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("resolveSomScope", () => {
  it("prefers the month the response echoes", () => {
    expect(
      resolveSomScope(
        { month: "2026-09", from: "2026-09-01", to: "2026-09-30" },
        all,
      ),
    ).toEqual({
      kind: "month",
      month: "2026-09",
    });
  });

  it("reads the range when month is null", () => {
    expect(
      resolveSomScope(
        { month: null, from: "2026-10-01", to: "2026-10-15" },
        month,
      ),
    ).toEqual(range);
  });

  it("falls back to what was asked when the response has no period", () => {
    expect(resolveSomScope({ month: null, from: null, to: null }, all)).toEqual(
      all,
    );
    expect(resolveSomScope(undefined, month)).toEqual(month);
    expect(resolveSomScope({ from: "2026-10-01", to: null }, range)).toEqual(
      range,
    );
  });
});
