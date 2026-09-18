"use client";

import { Table, Text, Tooltip } from "@mantine/core";
import { useI18n, useT } from "@/lib/i18n";
import StickyScrollArea from "@/components/common/StickyScrollArea";
import { MENU_ROWS, NAV_BY_AREA } from "@/components/partials/Users/GrantChecklists";
import { MATRIX_GLYPH, matrixCell } from "@/lib/rbac/matrix";
import type { PermissionRegistry, UserDTO } from "@/types/api/contract";

/**
 * REQ-092 Stage 4 (TASK-388 §3) — the READ-ONLY matrix: rows = users (username · role), columns = the twelve menus
 * then the actions grouped by area (the registry's order, from `GET /permissions`); a cell = ● own · ▲ from role · a
 * dimmed ● for a super admin's everything; blank otherwise. From `GET /users`' `grants` — no new route. Sticky first
 * column, horizontal scroll (the plan-table pattern). 🚫 No editing here: the dialogs are the editors.
 * Pure of any fetch: the tab hands it the rows and the registry, so it renders in a test.
 */
export default function MatrixTable({ users, registry }: { users: UserDTO[]; registry: PermissionRegistry }) {
  const t = useT();
  const { lang } = useI18n();
  const areas = [...new Set(registry.actions.map((a) => a.area))];
  const actionCols = areas.map((area) => ({
    area,
    label: NAV_BY_AREA.get(area) ? t(NAV_BY_AREA.get(area)!.labelKey) : t("users.areaSales"),
    actions: registry.actions.filter((a) => a.area === area),
  }));
  const cols = MENU_ROWS.length + registry.actions.length;

  return (
    <StickyScrollArea minWidth={Math.max(900, 200 + cols * 34)}>
      <Table verticalSpacing={4} horizontalSpacing={4} withColumnBorders className="text-center text-xs" aria-label={t("roles.matrixLabel")}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th rowSpan={2} data-pin="lead" className="text-left">
              {t("users.colUsername")}
            </Table.Th>
            <Table.Th colSpan={MENU_ROWS.length}>{t("users.colMenus")}</Table.Th>
            {actionCols.map((g) => (
              <Table.Th key={g.area} colSpan={g.actions.length}>
                {g.label}
              </Table.Th>
            ))}
          </Table.Tr>
          <Table.Tr>
            {MENU_ROWS.map((m) => (
              <Table.Th key={m.key} className="font-normal">
                <Tooltip label={t(m.labelKey)} withArrow>
                  <span className="inline-block max-w-[3.5rem] truncate align-bottom">{t(m.labelKey)}</span>
                </Tooltip>
              </Table.Th>
            ))}
            {actionCols.flatMap((g) =>
              g.actions.map((a) => (
                <Table.Th key={a.key} className="font-normal">
                  <Tooltip label={lang === "th" ? a.labelTh : a.labelEn} withArrow>
                    <span className="inline-block max-w-[3.5rem] truncate align-bottom">{lang === "th" ? a.labelTh : a.labelEn}</span>
                  </Tooltip>
                </Table.Th>
              )),
            )}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {users.map((u) => (
            <Table.Tr key={u.id} className={u.disabledAt ? "opacity-60" : undefined}>
              <Table.Td data-pin="lead" className="whitespace-nowrap text-left">
                <span className="font-mono">{u.username}</span>
                <Text span size="xs" c="dimmed" ml={6}>
                  {u.isSuperAdmin ? t("users.superAdmin") : (u.roleName ?? t("users.roleNone"))}
                </Text>
              </Table.Td>
              {[...MENU_ROWS.map((m) => m.key), ...actionCols.flatMap((g) => g.actions.map((a) => a.key))].map((key) => {
                const cell = matrixCell(u, key);
                return (
                  <Table.Td key={key} data-cell={cell ?? "none"} className={cell === "role" ? "text-blue-600" : cell === "all" ? "text-muted-400" : cell === "own" ? "text-foreground" : undefined}>
                    {cell ? MATRIX_GLYPH[cell] : ""}
                  </Table.Td>
                );
              })}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </StickyScrollArea>
  );
}
