"use client";

import type { ReactElement } from "react";
import { Tooltip } from "@mantine/core";

/**
 * Hover/tap tooltip for the SOM dashboard's hand-drawn bars and columns — the same instant Mantine tooltip the
 * donut charts get, instead of the browser's slow native `title`. The child must be a DOM element (it takes a ref).
 */
export function ChartTip({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip label={label} withArrow openDelay={0} events={{ hover: true, focus: true, touch: true }}>
      {children}
    </Tooltip>
  );
}
