"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Alert, Badge, Button, Card, Group, Loader, Modal, Select, Stack, Table, Tabs, Text, TextInput, Textarea } from "@mantine/core";
import { AlertTriangle, Pencil, ShieldCheck, ShieldPlus, Trash2 } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { useCreateRole, useDeleteRole, useRoles, useUpdateRole } from "@/hooks/scheduler/useRoles";
import { usePermissions } from "@/hooks/scheduler/useMe";
import { useUsers } from "@/hooks/scheduler/useUsers";
import { ActionsChecklist, MenusChecklist } from "@/components/partials/Users/GrantChecklists";
import { MENU_KEYS } from "@/lib/rbac/menus";
import StickyScrollArea from "@/components/common/StickyScrollArea";
import MatrixTable from "./MatrixTable";
import type { RoleDTO } from "@/types/api/contract";

/**
 * REQ-092 Stage 4 (TASK-388) — **the super admin's Roles page**: the builder (name · description · the SAME two
 * checklists the Users page uses, `GrantChecklists.tsx`) and the read-only matrix tab.
 *
 * 🔑 The server is the guard (`requireSuperAdmin` ⇒ `403`); the page hides itself on `session.user.isSuperAdmin` as
 * the honest UI, like Users. A role is LIVE: editing it changes every holder on their next request. Every rule is
 * the server's — `ROLE_NAME_TAKEN` (case-insensitive), the blank / > 60 name (`VALIDATION`), `ROLE_IN_USE` on delete
 * (its sentence carries the holder count, shown in the delete dialog). Two taps on delete. 🚫 No templates, no
 * default role, no client-side key rule.
 */
const errMsg = (e: unknown) => (e instanceof ApiClientError ? e.message : (e as Error).message);

export default function RolesContent() {
  const t = useT();
  const { data: session, status } = useSession();
  const isSuperAdmin = session?.user?.isSuperAdmin === true;
  const { data: roles = [], isLoading, error } = useRoles(isSuperAdmin);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RoleDTO | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RoleDTO | null>(null);

  if (status === "loading") return <Loader />;
  if (!isSuperAdmin) {
    return (
      <Alert color="orange" icon={<AlertTriangle size={16} />} variant="light">
        {t("users.noAccess")}
      </Alert>
    );
  }

  return (
    <Tabs defaultValue="roles" color="blue">
      <Tabs.List>
        <Tabs.Tab value="roles">{t("roles.tabRoles")}</Tabs.Tab>
        <Tabs.Tab value="matrix">{t("roles.tabMatrix")}</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="roles" pt="md">
        <Stack gap="md">
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              {t("roles.hint")}
            </Text>
            <Button leftSection={<ShieldPlus size={16} />} onClick={() => setCreateOpen(true)}>
              {t("roles.create")}
            </Button>
          </Group>
          {error && (
            <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
              {errMsg(error)}
            </Alert>
          )}
          <Card withBorder padding={0}>
            {isLoading ? (
              <Group p="md" gap="xs">
                <Loader size="xs" />
                <Text size="sm" c="dimmed">
                  {t("common.loading")}
                </Text>
              </Group>
            ) : roles.length === 0 ? (
              <Text p="md" size="sm" c="dimmed">
                {t("roles.empty")}
              </Text>
            ) : (
              <StickyScrollArea minWidth={720}>
              <Table verticalSpacing="sm" highlightOnHover className="whitespace-nowrap">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th data-pin="lead">{t("roles.colName")}</Table.Th>
                    <Table.Th>{t("roles.colDescription")}</Table.Th>
                    <Table.Th>{t("roles.colKeys")}</Table.Th>
                    <Table.Th>{t("roles.colUsers")}</Table.Th>
                    <Table.Th data-pin="action" />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {roles.map((r) => {
                    const menus = r.keys.filter((k) => k.startsWith("menu:")).length;
                    const actions = r.keys.filter((k) => k.startsWith("action:")).length;
                    return (
                      <Table.Tr key={r.id}>
                        <Table.Td data-pin="lead">
                          <Group gap={6} wrap="nowrap">
                            <ShieldCheck size={14} className="text-blue-600" />
                            <span className="font-medium">{r.name}</span>
                          </Group>
                        </Table.Td>
                        <Table.Td className="min-w-[220px] max-w-[360px] whitespace-normal text-sm text-muted-500">{r.description ?? ""}</Table.Td>
                        <Table.Td className="text-sm">{t("roles.keysCount", { menus: String(menus), actions: String(actions) })}</Table.Td>
                        <Table.Td>
                          <Badge size="sm" variant="light" color={r.userCount > 0 ? "blue" : "gray"}>
                            {t("roles.usersCount", { n: String(r.userCount) })}
                          </Badge>
                        </Table.Td>
                        <Table.Td data-pin="action">
                          <Group gap={4} justify="flex-end" wrap="nowrap">
                            <Button size="compact-xs" variant="subtle" leftSection={<Pencil size={13} />} onClick={() => setEditTarget(r)}>
                              {t("users.edit")}
                            </Button>
                            <Button size="compact-xs" variant="subtle" color="red" leftSection={<Trash2 size={13} />} onClick={() => setDeleteTarget(r)}>
                              {t("roles.delete")}
                            </Button>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
              </StickyScrollArea>
            )}
          </Card>
        </Stack>
        <RoleDialog opened={createOpen} role={null} onClose={() => setCreateOpen(false)} />
        <RoleDialog opened={editTarget !== null} role={editTarget} onClose={() => setEditTarget(null)} />
        <DeleteRoleDialog role={deleteTarget} onClose={() => setDeleteTarget(null)} />
      </Tabs.Panel>

      <Tabs.Panel value="matrix" pt="md">
        <MatrixTab roles={roles} />
      </Tabs.Panel>
    </Tabs>
  );
}

/** Create / Edit — one dialog: name, description, then the two shared checklists (a role has no locked rows). */
function RoleDialog({ opened, role, onClose }: { opened: boolean; role: RoleDTO | null; onClose: () => void }) {
  const t = useT();
  const create = useCreateRole();
  const update = useUpdateRole();
  const { data: registry, error: registryError } = usePermissions(opened);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [menus, setMenus] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [seededFor, setSeededFor] = useState<string | null>(null);
  // Seed from the role on open (render-time, as the Users page's dialogs do); a create seeds empty.
  const seedKey = opened ? (role?.id ?? "new") : null;
  if (seedKey && seededFor !== seedKey) {
    setSeededFor(seedKey);
    setName(role?.name ?? "");
    setDescription(role?.description ?? "");
    setMenus(role?.keys.filter((k) => k.startsWith("menu:")) ?? []);
    setActions(role?.keys.filter((k) => k.startsWith("action:")) ?? []);
    setError(null);
  }
  if (!seedKey && seededFor !== null) setSeededFor(null);

  const busy = create.isPending || update.isPending;
  const submit = async () => {
    setError(null);
    // Registry order, menus then actions — the shape the BE hands back; an unknown key is the server's 400.
    const registryActions = registry?.actions.map((a) => a.key) ?? [];
    const keys = [...MENU_KEYS.filter((k) => menus.includes(k)), ...registryActions.filter((k) => actions.includes(k))];
    try {
      if (role) {
        // Only what changed rides; `keys` REPLACE the role's set when sent.
        const sameKeys = keys.length === role.keys.length && keys.every((k, i) => k === role.keys[i]);
        await update.mutateAsync({
          id: role.id,
          input: {
            ...(name.trim() !== role.name ? { name } : {}),
            ...((description.trim() || null) !== role.description ? { description } : {}),
            ...(sameKeys ? {} : { keys }),
          },
        });
        notify({ title: t("roles.savedOk", { name: name.trim() }), color: "success" });
      } else {
        await create.mutateAsync({ name, description, keys });
        notify({ title: t("roles.createdOk", { name: name.trim() }), color: "success" });
      }
      onClose();
    } catch (e) {
      setError(errMsg(e)); // ROLE_NAME_TAKEN · VALIDATION — the server's words
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} centered size="lg" title={role ? t("roles.editTitle", { name: role.name }) : t("roles.createTitle")}>
      <Stack gap="sm">
        {(error || registryError) && (
          <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
            {error ?? errMsg(registryError)}
          </Alert>
        )}
        <TextInput label={t("roles.name")} value={name} onChange={(e) => setName(e.currentTarget.value)} required autoComplete="off" />
        <Textarea label={t("roles.description")} value={description} onChange={(e) => setDescription(e.currentTarget.value)} autosize minRows={2} />
        <Text size="sm" fw={600} mt="xs">
          {t("users.colMenus")}
        </Text>
        <MenusChecklist value={menus} onChange={setMenus} />
        <Text size="sm" fw={600} mt="xs">
          {t("users.colActions")}
        </Text>
        <ActionsChecklist registry={registry} value={actions} onChange={setActions} />
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button loading={busy} disabled={!name.trim() || !registry} onClick={submit}>
            {t("common.save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** Two taps: the row's red button opens this; its own red confirm is the second. `ROLE_IN_USE` lands here with its count. */
function DeleteRoleDialog({ role, onClose }: { role: RoleDTO | null; onClose: () => void }) {
  const t = useT();
  const del = useDeleteRole();
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setError(null);
    onClose();
  };
  const submit = async () => {
    if (!role) return;
    setError(null);
    try {
      await del.mutateAsync(role.id);
      notify({ title: t("roles.deletedOk", { name: role.name }), color: "success" });
      close();
    } catch (e) {
      setError(errMsg(e)); // ROLE_IN_USE — "มีผู้ใช้ n คนถืออยู่ — ย้ายก่อนลบ", the server's count
    }
  };
  return (
    <Modal opened={role !== null} onClose={close} centered title={t("roles.deleteTitle", { name: role?.name ?? "" })}>
      <Stack gap="sm">
        {error && (
          <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
            {error}
          </Alert>
        )}
        <Text size="sm">{t("roles.deleteBody")}</Text>
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button color="red" leftSection={<Trash2 size={15} />} loading={del.isPending} onClick={submit}>
            {t("roles.deleteConfirm")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** The matrix: users × keys from `GET /users` + the registry; filter by role. Read-only. */
function MatrixTab({ roles }: { roles: RoleDTO[] }) {
  const t = useT();
  const { data: users = [], isLoading } = useUsers();
  const { data: registry } = usePermissions();
  const [roleFilter, setRoleFilter] = useState<string>("");
  const rows = roleFilter === "" ? users : roleFilter === "none" ? users.filter((u) => !u.roleId && !u.isSuperAdmin) : users.filter((u) => u.roleId === roleFilter);
  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="wrap">
        <Text size="sm" c="dimmed">
          {t("roles.matrixHint")}
        </Text>
        <Select
          size="xs"
          w={200}
          value={roleFilter}
          onChange={(v) => setRoleFilter(v ?? "")}
          data={[{ value: "", label: t("roles.filterAll") }, { value: "none", label: t("users.roleNone") }, ...roles.map((r) => ({ value: r.id, label: r.name }))]}
          allowDeselect={false}
          aria-label={t("roles.filterLabel")}
        />
      </Group>
      {isLoading || !registry ? (
        <Loader size="xs" />
      ) : (
        // The same bordered surface as the Roles tab's table — without it the matrix sat on the page's paper tint.
        <Card withBorder padding={0}>
          <MatrixTable users={rows} registry={registry} />
        </Card>
      )}
    </Stack>
  );
}
