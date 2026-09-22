"use client";

import { Badge, Table, Text } from "@mantine/core";
import { useI18n, useT } from "@/lib/i18n";
import StickyScrollArea from "@/components/common/StickyScrollArea";
import { MENU_ROWS, NAV_BY_AREA } from "@/components/partials/Users/GrantChecklists";
import { MATRIX_GLYPH, matrixCell } from "@/lib/rbac/matrix";
import type { PermissionRegistry, UserDTO } from "@/types/api/contract";

const LEAD_W = 240;
const USER_W = 120;
/** The group heading rows' tint — Mantine's theme-aware subtle surface (light gray-0 / dark-5). */
const GROUP_BG = "var(--mantine-color-default-hover)";
/** A quiet column's faint grey wash — translucent (Mantine gray-6 at 12%), so it reads in both themes and the row hover still shows through. */
const DIM_BG = "rgba(134, 142, 150, 0.12)";

/**
 * REQ-092 Stage 4 (TASK-388 §3) — the READ-ONLY matrix, **transposed**: rows = the permissions (the twelve menus, then
 * the actions grouped by area — the registry's order, from `GET /permissions`) under a heading row per group; columns
 * = users (username · role). A cell = ● own · ▲ from role · a dimmed ● for a super admin's everything; blank otherwise.
 * From `GET /users`' `grants` — no new route. Staff are far fewer than permissions, so the labels read in full down
 * the pinned lead column and the table rarely needs a horizontal scroll; column borders keep each user's column
 * traceable. 🚫 No editing here: the dialogs are the editors.
 * Pure of any fetch: the tab hands it the rows and the registry, so it renders in a test.
 */
export default function MatrixTable({ users, registry }: { users: UserDTO[]; registry: PermissionRegistry }) {
  const t = useT();
  const { lang } = useI18n();
  const areas = [...new Set(registry.actions.map((a) => a.area))];
  const groups = [
    { id: "menus", label: t("users.colMenus"), rows: MENU_ROWS.map((m) => ({ key: m.key, label: t(m.labelKey) })) },
    ...areas.map((area) => ({
      id: area,
      label: NAV_BY_AREA.get(area) ? t(NAV_BY_AREA.get(area)!.labelKey) : t("users.areaSales"),
      rows: registry.actions.filter((a) => a.area === area).map((a) => ({ key: a.key, label: lang === "th" ? a.labelTh : a.labelEn })),
    })),
  ];
  // A disabled user's column: the cells fade a little under a faint grey wash; the header stays crisp and says "Disabled".
  const dim = (u: UserDTO) => (u.disabledAt ? "opacity-80" : undefined);
  const dimBg = (u: UserDTO) => (u.disabledAt ? { background: DIM_BG } : undefined);

  return (
    <StickyScrollArea minWidth={LEAD_W + users.length * USER_W}>
      <Table withColumnBorders highlightOnHover verticalSpacing={6} className="text-sm" aria-label={t("roles.matrixLabel")}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th data-pin="lead" className="align-bottom" style={{ minWidth: LEAD_W }}>
              {t("roles.colPermission")}
            </Table.Th>
            {users.map((u) => (
              <Table.Th key={u.id} data-user={u.id} className="whitespace-nowrap text-center align-bottom" style={{ minWidth: USER_W, ...dimBg(u) }}>
                <div className="font-mono font-medium">{u.username}</div>
                <Text size="xs" c="dimmed" fw={400}>
                  {u.isSuperAdmin ? t("users.superAdmin") : (u.roleName ?? t("users.roleNone"))}
                </Text>
                {u.disabledAt && (
                  <Badge size="xs" variant="light" color="gray" mt={4}>
                    {t("users.statusDisabled")}
                  </Badge>
                )}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {groups.map((g) => [
            <Table.Tr key={`g:${g.id}`} data-group={g.id}>
              <Table.Td data-pin="lead" className="text-xs font-semibold uppercase tracking-wide text-muted-500" style={{ background: GROUP_BG }}>
                {g.label}
              </Table.Td>
              <Table.Td colSpan={Math.max(1, users.length)} style={{ background: GROUP_BG }} />
            </Table.Tr>,
            ...g.rows.map((row) => (
              <Table.Tr key={row.key}>
                <Table.Td data-pin="lead" className="pl-6">
                  {row.label}
                </Table.Td>
                {users.map((u) => {
                  const cell = matrixCell(u, row.key);
                  return (
                    <Table.Td
                      key={u.id}
                      data-user={u.id}
                      data-cell={cell ?? "none"}
                      className={`text-center ${cell === "role" ? "text-blue-600" : cell === "all" ? "text-muted-400" : cell === "own" ? "text-foreground" : ""} ${dim(u) ?? ""}`}
                      style={dimBg(u)}
                    >
                      {cell ? MATRIX_GLYPH[cell] : ""}
                    </Table.Td>
                  );
                })}
              </Table.Tr>
            )),
          ])}
        </Table.Tbody>
      </Table>
    </StickyScrollArea>
  );
}
