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
          variant="default"
          size="xs"
          radius="md"
          leftSection={<SlidersHorizontal size={15} />}
        >
          {t("calendar.cellDisplay")}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{t("calendar.cellDisplayHint")}</Menu.Label>
        {CELL_FIELDS.map((f) => (
          // 🔴 EXACTLY ONE handler. This row previously toggled twice for a single click — `Menu.Item`'s
          // `onClick` AND the `Checkbox`'s `onChange` both fired, netting zero — while a click on the row's
          // padding (which misses the checkbox) fired once and worked. That position-dependence is what read as
          // "sometimes it works, same button" and is why waiting/re-clicking never helped: a parity bug has
          // nothing settling in the background. The comment below was already right; the code contradicted it.
          <Menu.Item key={f} onClick={() => toggle(f)}>
            <Checkbox
              checked={display[f]}
              // The ROW is the control; the box is the affordance. `readOnly` keeps it controlled without
              // giving it a second handler (and without React's uncontrolled-input warning).
              readOnly
              label={t(`calendar.cellField.${f}`)}
              size="xs"
              styles={{ input: { cursor: "pointer" }, label: { cursor: "pointer" } }}
            />
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
