/**
 * TASK-193 — what build and which environment is this screen?
 *
 * 🔴 **Why this exists:** three QA rounds in 24h were lost to nobody being able to tell a fresh build from a stale
 * one — at one point a stale FE was signed off as fresh. A stamp that can only be read from the screen is the
 * cheapest thing that makes that mistake impossible to repeat.
 *
 * Both values are **build-time** `NEXT_PUBLIC_*`, so they describe the bundle you are actually looking at. That is
 * the point: a value fetched at runtime would tell you about the server, not about the JavaScript in the browser —
 * and a stale cached bundle is exactly the case this has to catch.
 *
 * ⚠️ The flip side, stated so nobody is surprised: because they are inlined at build time, **changing them on the
 * server without rebuilding does nothing** (the `nextjs-runtime-public-env` case). For a build-once-deploy-many
 * setup the ENVIRONMENT half would have to be published at container start instead — see the task's Q1.
 */
const raw = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

/** Short commit SHA, build timestamp, or whatever the build injected — `null` when nothing was provided. */
export const BUILD_ID =
  raw(process.env.NEXT_PUBLIC_BUILD_ID) ?? raw(process.env.NEXT_PUBLIC_BUILD_TIME) ?? null;

/** `sid` / `uat` / `prod` — the deployment this bundle was built for. */
export const BUILD_ENV = raw(process.env.NEXT_PUBLIC_ENV) ?? null;

/**
 * One line for the shell footer. Returns `null` when the build injected nothing, so a local `bun run dev` doesn't
 * grow a meaningless "unknown · unknown" — an empty stamp would be a claim of its own.
 */
export const buildStamp = (): string | null => {
  const parts = [BUILD_ENV, BUILD_ID].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
};
