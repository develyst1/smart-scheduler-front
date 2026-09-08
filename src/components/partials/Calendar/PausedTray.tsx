"use client";

import { Badge, Button, Card, Group, Loader, Stack, Text } from "@mantine/core";
import { ChevronDown, PauseCircle } from "lucide-react";
import { BookingTypeChip } from "@/components/common/BookingBadges";
import { formatDateDisplay } from "@/lib/ui/format";
import { useT } from "@/lib/i18n";
import { usePausedTrayCollapsed } from "@/lib/scheduler/paused-tray";
import type { Booking } from "@/types/app/scheduler";

/**
 * SPEC-075 / REQ-076 / TASK-261 — **รายการที่พักไว้**, the tray a paused booking lives in.
 *
 * 🔴 **AC-10 — this is NOT a calendar cell and it never renders inside the grid.** A paused booking has no
 * scheduled slot, and anything dateless dropped into a dated grid is invisible or wrong. That is not a
 * hypothetical: it is REQ-078's DEF-4, where an item the calendar could not render became a double-booking
 * nobody could see. **`CalendarContent` renders this BESIDE `CalendarGrid`/`CalendarWeekGrid`, never within
 * one** — and neither grid takes a `PAUSED` booking, because both filter their own lists by status.
 *
 * 🔴 **AC-9 — it is on the calendar page, visible without navigating away and without opening anything.** The
 * owner's test is that an admin doing ordinary booking work *notices* it, so it is a bordered card with a count
 * badge, not a link or a menu item.
 *
 * 🔴 **AC-11 — an empty tray renders `ไม่มีรายการที่พักไว้`, and is PRESENT when empty.** It must never
 * disappear at zero: a control that vanishes when it is empty teaches staff it is not there, and then they stop
 * looking for it — and a paused booking is off the calendar by design, so the tray is the only place it exists.
 *
 * 🔴 **AC-12 — each row names student · type · the ORIGINAL date and time**, so two paused bookings can be told
 * apart without opening either. The date/time is the slot it came from (the booking keeps them while paused);
 * `pausedOriginalSlot` labels it `เดิม:` so it never reads as a *new* scheduled time.
 *
 * 🔴 **Collapsing hides the LIST — never the tray.** The card, its title and its count stay on screen in both
 * states, because those are what AC-9 (noticed without opening anything) and AC-11 (present when empty) are
 * actually about. A collapse that removed the card would let a paused booking end up nowhere at all: it is off
 * the calendar by design, so this is the only place it exists.
 *
 * The collapsed flag lives in `lib/scheduler/paused-tray.ts` rather than in this component, because
 * `CalendarContent` mounts this **twice** — `rail` and `strip`, switched by CSS — and per-instance state would
 * let the two disagree across a resize. Same reason, same shape as the cell-display toggle.
 */
export default function PausedTray({
  bookings,
  loading,
  onSelect,
  /** `rail` = the ≥xl column beside the grid · `strip` = the narrower-screen band above it. See Q2 in TASK-261. */
  layout,
}: {
  bookings: Booking[];
  loading: boolean;
  onSelect: (b: Booking) => void;
  layout: "rail" | "strip";
}) {
  const t = useT();
  const isStrip = layout === "strip";
  const { collapsed, toggle } = usePausedTrayCollapsed();

  return (
    <Card padding="md" withBorder className={isStrip ? undefined : "sticky top-4"}>
      {/* The WHOLE header is the control, not a small chevron beside it: the target is the row staff already
          look at, and there is nothing else in the header to click by mistake. `mb` collapses with the body so
          a closed tray is a header, not a header with a gap under it.
          ⚠️ The label is two literal `t("…")` calls rather than one `t(cond ? a : b)`: `keys.test.ts` scans for
          the literal form, so writing it this way is what puts both keys under the missing-key guard. */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-label={collapsed ? t("calendar.pausedTrayExpand") : t("calendar.pausedTrayCollapse")}
        className={`-m-1 flex w-full items-center justify-between gap-2 rounded-md p-1 text-left transition-colors hover:bg-muted-50 ${
          collapsed ? "" : "mb-2"
        }`}
      >
        <Group gap={6} wrap="nowrap">
          <PauseCircle size={16} className="shrink-0 text-muted-500" />
          <Text fw={600} size="sm">
            {t("calendar.pausedTray")}
          </Text>
        </Group>
        <Group gap={6} wrap="nowrap">
          {/* The count is what makes it noticeable from across the page (AC-9) — and it is `light gray` at zero
              so an empty tray reads as calm rather than as an alert about nothing. 🔴 It stays visible while
              collapsed: that is what keeps a closed tray honest about holding three bookings. */}
          <Badge size="sm" variant="light" color={bookings.length ? "grape" : "gray"}>
            {bookings.length}
          </Badge>
          <ChevronDown
            size={16}
            aria-hidden
            className={`shrink-0 text-muted-500 transition-transform ${collapsed ? "-rotate-90" : ""}`}
          />
        </Group>
      </button>

      {!collapsed &&
        (loading ? (
        <Group gap="xs">
          <Loader size="xs" />
          <Text size="xs" c="dimmed">
            {t("common.loading")}
          </Text>
        </Group>
      ) : bookings.length === 0 ? (
        /* AC-11 — a sentence, not an absence. */
        <Text size="xs" c="dimmed">
          {t("calendar.pausedTrayEmpty")}
        </Text>
      ) : (
        <div className={isStrip ? "flex gap-2 overflow-x-auto pb-1" : "max-h-[28rem] overflow-y-auto"}>
          <Stack gap="xs" className={isStrip ? "flex-row" : undefined}>
            {bookings.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => onSelect(b)}
                className={`rounded-lg border border-muted-200 bg-muted-50 p-2 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 ${
                  isStrip ? "w-56 shrink-0" : "w-full"
                }`}
              >
                {/* AC-12, all three, in the order staff read them. */}
                <Text size="sm" fw={500} truncate>
                  {b.displayName}
                </Text>
                <Group gap={6} mt={4} wrap="nowrap">
                  <BookingTypeChip type={b.bookingType} />
                </Group>
                <Text size="xs" c="dimmed" mt={4}>
                  {t("calendar.pausedOriginalSlot", {
                    date: formatDateDisplay(b.date),
                    time: b.startTime,
                  })}
                </Text>
              </button>
            ))}
          </Stack>
        </div>
        ))}
    </Card>
  );
}
