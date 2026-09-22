import type { ReactNode } from "react";

/**
 * One line of the course card's details box — `label · value · [action]`. The action slot takes a full-size
 * `ActionIcon` (34px), replacing the dotted links and 11px pencils the card used to carry, so every edit on the card
 * is the same shape and the same easy target. `below` holds a second line (e.g. the rental's variant + remove).
 * Wrap rows in `CourseDetails` for the border and dividers.
 */
export default function CourseDetailRow({ label, children, action, below, color, ...data }: { label: string; children: ReactNode; action?: ReactNode; below?: ReactNode; color?: string } & Record<`data-${string}`, string | number | undefined>) {
  // `color` tints the label AND the value with a Mantine colour (its theme-aware `-text` shade), e.g. the coach rate.
  const tint = color ? { color: `var(--mantine-color-${color}-text)` } : undefined;
  return (
    <div className="border-b border-muted-200 px-3 py-1.5 last:border-b-0" {...data}>
      <div className="flex min-h-[34px] items-center gap-2">
        <span className={`w-28 shrink-0 text-xs ${color ? "" : "text-muted-500"}`} style={tint}>
          {label}
        </span>
        <span className="min-w-0 flex-1 text-sm font-medium tabular-nums" style={tint}>
          {children}
        </span>
        {action}
      </div>
      {below && <div className="pb-1 pl-[7.5rem]">{below}</div>}
    </div>
  );
}

export function CourseDetails({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-muted-200">{children}</div>;
}
