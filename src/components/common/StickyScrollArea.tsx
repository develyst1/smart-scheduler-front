"use client";

import { useCallback, useLayoutEffect, useRef, type ReactNode } from "react";
import "./StickyScrollArea.css";

/**
 * Horizontal-scroll wrapper for data tables with AntD-style pinned columns.
 *
 * Mark a header/body cell with `data-pin="lead"` (pins left) or `data-pin="action"` (pins right).
 * The pinned column's edge shadow only shows while that side has content scrolled out of view — at
 * rest it reads flat. Use this instead of Mantine's `Table.ScrollContainer` when a column must stick:
 * `position: sticky` does not stick inside ScrollArea's transformed viewport, and this owns the
 * native scroll element so the shadow can be scroll-aware.
 */
export default function StickyScrollArea({
  minWidth,
  children,
}: {
  minWidth: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // 1px slack absorbs sub-pixel rounding so the end state latches cleanly.
    el.dataset.atStart = String(el.scrollLeft <= 0);
    el.dataset.atEnd = String(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
  }, []);

  useLayoutEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(update); // content/viewport size changes flip the flags too
    ro.observe(el);
    return () => ro.disconnect();
  }, [update]);

  return (
    <div ref={ref} className="stickyScroll" onScroll={update}>
      <div style={{ minWidth }}>{children}</div>
    </div>
  );
}
