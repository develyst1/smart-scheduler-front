import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "bun:test";
import { dictionaries } from "./dictionaries";

/**
 * 🔴 The guard for a defect class that has now shipped twice: a `t("…")` key that resolves to **nothing**, so the
 * screen renders the raw key (`endCourse.drop`) to staff. Both times the code compiled, the build passed, and the
 * dictionaries were valid TypeScript — the key simply lived under the wrong parent block. Nothing existing could
 * catch it, because `t()` takes a string and returns the key when it misses.
 *
 * This walks every literal `t("…")` in the source and resolves it the way `t()` does, in **both** languages: a
 * key present in English but missing in Thai is the same bug for a Thai-speaking user.
 *
 * Only literal keys are checkable; templated ones (`t(\`course.status.${s}\`)`) are listed as a known gap rather
 * than silently passed over — see the task notes.
 */
const resolve = (d: unknown, key: string): unknown =>
  key.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[part];
    return undefined;
  }, d);

const sourceFiles = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.tsx?$/.test(p) && !p.endsWith(".test.ts") && !p.endsWith(".test.tsx")) out.push(p);
  }
  return out;
};

describe("every literal t() key resolves — in BOTH languages", () => {
  it("has no unresolved keys", () => {
    const unresolved: string[] = [];
    for (const file of sourceFiles("src")) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/\bt\(\s*"([a-zA-Z0-9_.]+)"/g)) {
        const key = m[1];
        if (typeof resolve(dictionaries.en, key) !== "string") unresolved.push(`${file} → ${key} (en)`);
        else if (typeof resolve(dictionaries.th, key) !== "string") unresolved.push(`${file} → ${key} (th)`);
      }
    }
    expect(unresolved).toEqual([]);
  });
});
