"use client";

import { Badge, Button, Checkbox, Group, Loader, Stack, Text } from "@mantine/core";
import { useI18n, useT } from "@/lib/i18n";
import { HIDDEN_NAV_ITEMS, NAV_ITEMS } from "@/components/layout/AdminLayout/AdminLayout.config";
import { MENU_KEYS, type MenuKey } from "@/lib/rbac/menus";
import type { PermissionRegistry } from "@/types/api/contract";

/**
 * REQ-092 Stage 4 (TASK-388) — the TWO checklists, extracted from the Users page's dialogs so the Roles page's builder
 * renders the SAME rows (no third list of labels): the twelve menus in the nav's order, labelled by the nav's own
 * `labelKey`s; the actions FROM `GET /permissions` grouped by the registry's `area` under the menu's nav label, the
 * BE's label in `lang`.
 *
 * Two-tone (SPEC-079 Stage 4): `locked` keys are ticked and DISABLED with a hint (a user's keys from their role); the
 * editable ticks are `value` (a user's OWN rows, or a role's keys). `onChange` only ever moves `value` — a locked key
 * stays locked — so a save writes own rows only. Pure of any request: the dialogs own the save.
 */

/** The twelve grants in the nav's order, each labelled by its entry's own `labelKey` (the hidden pages last). */
export const MENU_ROWS: { key: MenuKey; labelKey: string }[] = [...NAV_ITEMS, ...HIDDEN_NAV_ITEMS]
  .filter((i): i is typeof i & { menuKey: MenuKey } => !!i.menuKey)
  .map((i) => ({ key: i.menuKey, labelKey: i.labelKey }));

/** The nav entry whose tail is this area — its label heads the group; `sales` (the discount) has no menu. */
export const NAV_BY_AREA = new Map([...NAV_ITEMS, ...HIDDEN_NAV_ITEMS].filter((i) => i.menuKey).map((i) => [i.menuKey!.slice("menu:".length), i]));

/** `value` with `list` added or removed (deduped, order kept) — the ONE mutation both checklists make. */
export const withKeys = (value: readonly string[], list: readonly string[], on: boolean): string[] =>
  on ? [...new Set([...value, ...list])] : value.filter((x) => !list.includes(x));

/** Ticked = editable OR locked; a locked key never moves. Pure, value-tested. */
export const isTicked = (value: readonly string[], locked: readonly string[], key: string) => value.includes(key) || locked.includes(key);

export interface ChecklistProps {
  value: readonly string[];
  onChange: (next: string[]) => void;
  /** Keys ticked and locked (from a role). Default none. */
  locked?: readonly string[];
  /** The hint on a locked tick, e.g. "from role Front desk". */
  lockedHint?: string;
}

export function MenusChecklist({ value, onChange, locked = [], lockedHint }: ChecklistProps) {
  const t = useT();
  const free = MENU_KEYS.filter((k) => !locked.includes(k));
  return (
    <Stack gap="xs">
      <Group gap="xs">
        <Button size="compact-xs" variant="subtle" onClick={() => onChange(withKeys(value, free, true))}>
          {t("users.menusSelectAll")}
        </Button>
        <Button size="compact-xs" variant="subtle" onClick={() => onChange([])}>
          {t("users.menusSelectNone")}
        </Button>
      </Group>
      <Stack gap={6}>
        {MENU_ROWS.map((row) => (
          <LockableCheckbox
            key={row.key}
            label={t(row.labelKey)}
            checked={isTicked(value, locked, row.key)}
            locked={locked.includes(row.key)}
            lockedHint={lockedHint}
            onChange={(on) => onChange(withKeys(value, [row.key], on))}
          />
        ))}
      </Stack>
    </Stack>
  );
}

export function ActionsChecklist({
  registry,
  value,
  onChange,
  locked = [],
  lockedHint,
  menus,
}: ChecklistProps & {
  /** `GET /permissions` — the ONLY source of action keys and labels; `undefined` while loading. */
  registry: PermissionRegistry | undefined;
  /** The effective menus, for the "menu not granted" hint on a group header; `undefined` = no hint (a role). */
  menus?: readonly string[];
}) {
  const t = useT();
  const { lang } = useI18n();
  if (!registry) return <Loader size="xs" />;
  const actions = registry.actions;
  const allKeys = actions.map((a) => a.key).filter((k) => !locked.includes(k));
  const areas = [...new Set(actions.map((a) => a.area))];
  return (
    <Stack gap="xs">
      <Group gap="xs">
        <Button size="compact-xs" variant="subtle" onClick={() => onChange(withKeys(value, allKeys, true))}>
          {t("users.menusSelectAll")}
        </Button>
        <Button size="compact-xs" variant="subtle" onClick={() => onChange([])}>
          {t("users.menusSelectNone")}
        </Button>
      </Group>
      <Stack gap="md">
        {areas.map((area) => {
          const nav = NAV_BY_AREA.get(area);
          const rows = actions.filter((a) => a.area === area);
          const rowKeys = rows.map((a) => a.key).filter((k) => !locked.includes(k));
          const allOn = rows.every((a) => isTicked(value, locked, a.key));
          // Convenience, not a rule: an act under a menu the user cannot open is allowed to be ticked — the server
          // refuses the route by menu first — but the header says so. Nothing is auto-granted.
          const menuMissing = !!menus && !!nav?.menuKey && !menus.includes(nav.menuKey);
          return (
            <div key={area}>
              <Group justify="space-between" mb={4}>
                <Group gap={6}>
                  <Text size="sm" fw={600}>
                    {nav ? t(nav.labelKey) : t("users.areaSales")}
                  </Text>
                  {menuMissing && (
                    <Badge size="xs" variant="light" color="orange">
                      {t("users.areaMenuNotGranted")}
                    </Badge>
                  )}
                </Group>
                <Button size="compact-xs" variant="subtle" onClick={() => onChange(withKeys(value, rowKeys, !allOn))}>
                  {allOn ? t("users.menusSelectNone") : t("users.menusSelectAll")}
                </Button>
              </Group>
              <Stack gap={4}>
                {rows.map((a) => (
                  <LockableCheckbox
                    key={a.key}
                    size="sm"
                    label={lang === "th" ? a.labelTh : a.labelEn}
                    checked={isTicked(value, locked, a.key)}
                    locked={locked.includes(a.key)}
                    lockedHint={lockedHint}
                    onChange={(on) => onChange(withKeys(value, [a.key], on))}
                  />
                ))}
              </Stack>
            </div>
          );
        })}
      </Stack>
    </Stack>
  );
}

function LockableCheckbox({
  label,
  checked,
  locked,
  lockedHint,
  onChange,
  size,
}: {
  label: string;
  checked: boolean;
  locked: boolean;
  lockedHint?: string;
  onChange: (on: boolean) => void;
  size?: "sm";
}) {
  return (
    <Checkbox
      size={size}
      label={
        locked && lockedHint ? (
          <span>
            {label}{" "}
            <Text span size="xs" c="dimmed">
              · {lockedHint}
            </Text>
          </span>
        ) : (
          label
        )
      }
      checked={checked}
      disabled={locked}
      onChange={(e) => onChange(e.currentTarget.checked)}
    />
  );
}
