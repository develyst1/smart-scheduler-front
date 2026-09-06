"use client";

import { Badge, Button, Card, Group, Loader, Stack, Text } from "@mantine/core";
import { PauseCircle } from "lucide-react";
import { BookingTypeChip } from "@/components/common/BookingBadges";
import { formatDateDisplay } from "@/lib/ui/format";
import { useT } from "@/lib/i18n";
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

  return (
    <Card padding="md" withBorder className={isStrip ? undefined : "sticky top-4"}>
      <Group gap="xs" justify="space-between" wrap="nowrap" mb="sm">
        <Group gap={6} wrap="nowrap">
          <PauseCircle size={16} className="shrink-0 text-muted-500" />
          <Text fw={600} size="sm">
            {t("calendar.pausedTray")}
          </Text>
        </Group>
        {/* The count is what makes it noticeable from across the page (AC-9) — and it is `light gray` at zero
            so an empty tray reads as calm rather than as an alert about nothing. */}
        <Badge size="sm" variant="light" color={bookings.length ? "grape" : "gray"}>
          {bookings.length}
        </Badge>
      </Group>

      {loading ? (
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
      )}
    </Card>
  );
}
