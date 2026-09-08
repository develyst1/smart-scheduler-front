"use client";

import { useEffect, useState } from "react";

/**
 * How long a request may run before the screen admits it is waiting.
 *
 * 🔴 200ms is the standard threshold, and the reason is not taste: below ~100–200ms a person reads a change as
 * *instant*, so a loading state that appears and vanishes inside it is not information — it is a flash, and a
 * flash is more distracting than the wait it was covering. Above it, silence starts reading as a broken click.
 *
 * ⚠️ On a local API most switches answer inside this window, which means the correct behaviour for MOST
 * switches is to show nothing at all. That is the point.
 */
const DEFAULT_DELAY_MS = 200;

/**
 * What a list should be rendering right now.
 *
 * - `skeleton` — the wait has passed the threshold; show placeholders shaped like the content.
 * - `quiet` — still waiting, but under the threshold and there is nothing to keep showing. Render NOTHING:
 *   200ms of blank is invisible, where 200ms of an empty-state sentence is a lie that flashes.
 * - `content` — render what is in hand. Either the request finished, or it is under the threshold and the
 *   previous page is still on screen (`keepPreviousData`), which is exactly what should stay there.
 */
export type LoadPhase = "skeleton" | "quiet" | "content";

/**
 * One rule for "what does this list show while it waits", shared by every paged screen.
 *
 * 🔴 `hasData` is what separates `quiet` from `content`, and it is the half that is easy to get wrong: with no
 * data yet, rendering "content" under the threshold means rendering the EMPTY STATE — so a first load would
 * flash *"no courses"* before the courses arrive. Pass `data !== undefined`, not `items.length > 0`: an
 * answered request that returned zero rows genuinely is content, and must show the empty state.
 *
 * 🚫 Not a component and not a wrapper: the skeleton for each screen has to be shaped like that screen's own
 * card or row, so what is shared is this DECISION, never the markup.
 */
export function useLoadPhase(busy: boolean, hasData: boolean, delayMs = DEFAULT_DELAY_MS): LoadPhase {
  const [passed, setPassed] = useState(false);

  useEffect(() => {
    if (!busy) {
      // Reset synchronously with the data arriving — a skeleton that lingers after the answer is its own defect.
      setPassed(false);
      return;
    }
    const id = setTimeout(() => setPassed(true), delayMs);
    return () => clearTimeout(id);
  }, [busy, delayMs]);

  if (!busy) return "content";
  if (passed) return "skeleton";
  return hasData ? "content" : "quiet";
}
