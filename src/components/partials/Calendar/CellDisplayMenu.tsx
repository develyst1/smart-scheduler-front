"use client";

import { Checkbox, Menu, Button } from "@mantine/core";
import { SlidersHorizontal } from "lucide-react";
import { useT } from "@/lib/i18n";
import { CELL_FIELDS, useCellDisplay } from "@/lib/scheduler/cell-display";

/**
 * SPEC-046 re-cut — the calendar cell's display toggle.
 *
 * 🔴 **Display-only.** Every item here hides or shows a line; **none of them filters bookings.** That distinction
 * matters more than it looks: a "filter" that quietly removes sessions from a calendar would make the screen lie
 * about what is booked, which is the opposite of what this cell is for.
 *
 * The set is fixed at five (type · program · badge · note · rental) — the re-cut says adding a sixth is a new
 * decision, not an assumption.
 */
export default function CellDisplayMenu() {
  const t = useT();
  const { display, toggle } = useCellDisplay();

  return (
    <Menu shadow="md" width={200} closeOnItemClick={false} position="bottom-end" withArrow>
      <Menu.Target>
        <Button
          variant="subtle"
          size="compact-xs"
          color="gray"
          leftSection={<SlidersHorizontal size={13} />}
        >
          {t("calendar.cellDisplay")}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{t("calendar.cellDisplayHint")}</Menu.Label>
        {CELL_FIELDS.map((f) => (
          <Menu.Item key={f} onClick={() => toggle(f)}>
            <Checkbox
              checked={display[f]}
              onChange={() => toggle(f)}
              label={t(`calendar.cellField.${f}`)}
              size="xs"
              // The row itself toggles; the box is the affordance, not a second control to hit exactly.
              styles={{ input: { cursor: "pointer" }, label: { cursor: "pointer" } }}
            />
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
