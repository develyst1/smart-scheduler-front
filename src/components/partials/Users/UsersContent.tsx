"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Alert, Badge, Button, Card, Checkbox, Group, Loader, Modal, PasswordInput, Stack, Table, Text, TextInput } from "@mantine/core";
import { AlertTriangle, KeyRound, LayoutList, ListChecks, Pencil, ShieldCheck, UserPlus, UserX, UserCheck } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import { useI18n, useT } from "@/lib/i18n";
import { useConfirm } from "@/components/common/useConfirm";
import { formatDateDisplay } from "@/lib/ui/format";
import { useCreateUser, useResetUserPassword, useSetUserActions, useSetUserDisabled, useSetUserMenus, useUpdateUser, useUsers } from "@/hooks/scheduler/useUsers";
import { usePermissions } from "@/hooks/scheduler/useMe";
import { MENU_KEYS, type MenuKey } from "@/lib/rbac/menus";
import { HIDDEN_NAV_ITEMS, NAV_ITEMS } from "@/components/layout/AdminLayout/AdminLayout.config";
import type { UserDTO } from "@/types/api/contract";

/**
 * REQ-092 Stage 1 (TASK-378) — **the super admin's Users page.** List · create · edit (display name, super-admin
 * flag) · reset password · disable / enable.
 *
 * 🔑 **The server is the guard** (`requireSuperAdmin` ⇒ `403 FORBIDDEN`); the page hides itself on
 * `session.user.isSuperAdmin` as the honest UI (the nav entry is hidden the same way, `AdminLayout.config`). The app
 * has no "forbidden" page shape of its own, so a non-super-admin who lands here by URL sees one calm sentence.
 * 🔴 Every rule is the server's: the username pattern (shown as the hint, refused as `VALIDATION`), the password
 * minimum (`PASSWORD_TOO_SHORT`, 8), uniqueness (`USERNAME_TAKEN`), the last super admin (`LAST_SUPER_ADMIN`). The
 * ONE thing this page checks itself is that the two password boxes match — a typing aid, not a rule the server has.
 * Two taps on the destructive ones: **disable** (button → confirm) and **reset password** (button → the dialog's own
 * submit). 🚫 No delete. Stage 2 (TASK-382): a **`Menus`** count per row ⇒ a checklist of the twelve `menu:*` grants
 * (labelled by the nav's own words, in the nav's order) ⇒ `PUT /users/:id/menus { keys }` — the bridge until Stage 4's
 * roles SET the same rows. A super admin's row says "all menus" and has no checklist (their menus are all of them).
 * The self-service password change lives in the header's user menu, not here.
 * Stage 3 (TASK-386): an **`Actions`** count per row ⇒ a checklist rendered FROM `GET /permissions` (the BE's keys and
 * labels — the FE keeps no list of action names), grouped by `area` under the menu's own nav label, `Select all` per
 * group and overall ⇒ `PUT /users/:id/actions { keys }`. Ticking an act whose menu is not granted is allowed (the
 * server refuses the route by menu first) — the group header says so; nothing is auto-granted.
 */
const errMsg = (e: unknown) => (e instanceof ApiClientError ? e.message : (e as Error).message);

export default function UsersContent() {
  const t = useT();
  const { data: session, status } = useSession();
  const isSuperAdmin = session?.user?.isSuperAdmin === true;
  const { data: users = [], isLoading, error } = useUsers(isSuperAdmin);

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserDTO | null>(null);
  const [resetTarget, setResetTarget] = useState<UserDTO | null>(null);
  const [menusTarget, setMenusTarget] = useState<UserDTO | null>(null);
  const [actionsTarget, setActionsTarget] = useState<UserDTO | null>(null);

  if (status === "loading") return <Loader />;
  if (!isSuperAdmin) {
    return (
      <Alert color="orange" icon={<AlertTriangle size={16} />} variant="light">
        {t("users.noAccess")}
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={600}>{t("users.title")}</Text>
        <Button leftSection={<UserPlus size={16} />} onClick={() => setCreateOpen(true)}>
          {t("users.create")}
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
        ) : (
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("users.colUsername")}</Table.Th>
                <Table.Th>{t("users.colDisplayName")}</Table.Th>
                <Table.Th>{t("users.colRole")}</Table.Th>
                <Table.Th>{t("users.colMenus")}</Table.Th>
                <Table.Th>{t("users.colActions")}</Table.Th>
                <Table.Th>{t("users.colStatus")}</Table.Th>
                <Table.Th>{t("users.colCreated")}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {users.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  isSelf={u.id === session?.user?.id}
                  onEdit={() => setEditTarget(u)}
                  onReset={() => setResetTarget(u)}
                  onMenus={() => setMenusTarget(u)}
                  onActions={() => setActionsTarget(u)}
                />
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>

      <CreateUserModal opened={createOpen} onClose={() => setCreateOpen(false)} />
      <EditUserModal user={editTarget} onClose={() => setEditTarget(null)} />
      <ResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} />
      <MenusModal user={menusTarget} onClose={() => setMenusTarget(null)} />
      <ActionsModal user={actionsTarget} onClose={() => setActionsTarget(null)} />
    </Stack>
  );
}

function UserRow({
  user,
  isSelf,
  onEdit,
  onReset,
  onMenus,
  onActions,
}: {
  user: UserDTO;
  isSelf: boolean;
  onEdit: () => void;
  onReset: () => void;
  onMenus: () => void;
  onActions: () => void;
}) {
  const t = useT();
  const setDisabled = useSetUserDisabled();
  const { confirm: askConfirm, confirmDialog } = useConfirm();
  const disabled = !!user.disabledAt;

  /** Two taps on DISABLE (it locks someone out mid-session); enable is one tap — it only gives back. */
  const toggle = async () => {
    if (!disabled) {
      const ok = await askConfirm({
        title: t("users.disableTitle", { name: user.displayName }),
        message: t("users.disableBody"),
        confirmLabel: t("users.disable"),
        color: "red",
      });
      if (!ok) return;
    }
    try {
      await setDisabled.mutateAsync({ id: user.id, disabled: !disabled });
      notify({ title: disabled ? t("users.enabledOk") : t("users.disabledOk"), color: "success" });
    } catch (e) {
      // `LAST_SUPER_ADMIN` and the rest: the server's sentence, unchanged.
      notify({ title: errMsg(e), color: "danger" });
    }
  };

  return (
    <Table.Tr className={disabled ? "opacity-60" : undefined}>
      <Table.Td className="font-mono text-sm">{user.username}</Table.Td>
      <Table.Td>
        {user.displayName}
        {isSelf && (
          <Text span size="xs" c="dimmed" ml={6}>
            {t("users.you")}
          </Text>
        )}
      </Table.Td>
      <Table.Td>
        {user.isSuperAdmin ? (
          <Badge size="sm" variant="light" color="blue" leftSection={<ShieldCheck size={12} />}>
            {t("users.superAdmin")}
          </Badge>
        ) : (
          <Text size="sm" c="dimmed">
            {t("users.admin")}
          </Text>
        )}
      </Table.Td>
      <Table.Td>
        {user.isSuperAdmin ? (
          <Text size="sm" c="dimmed">
            {t("users.menusAll")}
          </Text>
        ) : (
          <Button size="compact-xs" variant="light" leftSection={<LayoutList size={13} />} onClick={onMenus}>
            {t("users.menusCount", { n: String(user.menus?.length ?? 0) })}
          </Button>
        )}
      </Table.Td>
      <Table.Td>
        {user.isSuperAdmin ? (
          <Text size="sm" c="dimmed">
            {t("users.actionsAll")}
          </Text>
        ) : (
          <Button size="compact-xs" variant="light" leftSection={<ListChecks size={13} />} onClick={onActions}>
            {t("users.actionsCount", { n: String(user.actions?.length ?? 0) })}
          </Button>
        )}
      </Table.Td>
      <Table.Td>
        <Badge size="sm" variant="light" color={disabled ? "gray" : "green"}>
          {disabled ? t("users.statusDisabled") : t("users.statusEnabled")}
        </Badge>
      </Table.Td>
      <Table.Td className="tabular-nums text-sm">{formatDateDisplay(user.createdAt)}</Table.Td>
      <Table.Td>
        <Group gap={4} justify="flex-end" wrap="nowrap">
          <Button size="compact-xs" variant="subtle" leftSection={<Pencil size={13} />} onClick={onEdit}>
            {t("users.edit")}
          </Button>
          <Button size="compact-xs" variant="subtle" leftSection={<KeyRound size={13} />} onClick={onReset}>
            {t("users.resetPassword")}
          </Button>
          <Button
            size="compact-xs"
            variant="subtle"
            color={disabled ? "green" : "red"}
            leftSection={disabled ? <UserCheck size={13} /> : <UserX size={13} />}
            loading={setDisabled.isPending}
            onClick={toggle}
          >
            {disabled ? t("users.enable") : t("users.disable")}
          </Button>
        </Group>
      </Table.Td>
      {confirmDialog}
    </Table.Tr>
  );
}

function CreateUserModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const t = useT();
  const create = useCreateUser();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mismatch = confirm.length > 0 && confirm !== password;

  const close = () => {
    setUsername("");
    setDisplayName("");
    setPassword("");
    setConfirm("");
    setIsSuperAdmin(false);
    setError(null);
    onClose();
  };
  const submit = async () => {
    setError(null);
    try {
      await create.mutateAsync({ username, password, displayName, isSuperAdmin });
      notify({ title: t("users.createdOk", { name: displayName.trim() }), color: "success" });
      close();
    } catch (e) {
      setError(errMsg(e)); // USERNAME_TAKEN · PASSWORD_TOO_SHORT · VALIDATION — the server's words
    }
  };

  return (
    <Modal opened={opened} onClose={close} centered title={t("users.createTitle")}>
      <Stack gap="sm">
        {error && (
          <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
            {error}
          </Alert>
        )}
        <TextInput
          label={t("users.username")}
          description={t("users.usernameHint")}
          value={username}
          onChange={(e) => setUsername(e.currentTarget.value)}
          autoComplete="off"
          required
        />
        <TextInput label={t("users.displayName")} value={displayName} onChange={(e) => setDisplayName(e.currentTarget.value)} required />
        <PasswordInput
          label={t("users.password")}
          description={t("users.passwordHint")}
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          autoComplete="new-password"
          required
        />
        <PasswordInput
          label={t("users.passwordConfirm")}
          value={confirm}
          onChange={(e) => setConfirm(e.currentTarget.value)}
          error={mismatch ? t("users.passwordMismatch") : undefined}
          autoComplete="new-password"
          required
        />
        <Checkbox label={t("users.superAdminToggle")} checked={isSuperAdmin} onChange={(e) => setIsSuperAdmin(e.currentTarget.checked)} />
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button
            loading={create.isPending}
            disabled={!username.trim() || !displayName.trim() || !password || mismatch || confirm.length === 0}
            onClick={submit}
          >
            {t("users.create")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function EditUserModal({ user, onClose }: { user: UserDTO | null; onClose: () => void }) {
  const t = useT();
  const update = useUpdateUser();
  const [displayName, setDisplayName] = useState("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seededFor, setSeededFor] = useState<string | null>(null);
  // Seed the form from the row on open (render-time, not an effect: the row is a prop, the form is a copy of it).
  if (user && seededFor !== user.id) {
    setSeededFor(user.id);
    setDisplayName(user.displayName);
    setIsSuperAdmin(user.isSuperAdmin);
    setError(null);
  }
  if (!user && seededFor !== null) setSeededFor(null);

  const submit = async () => {
    if (!user) return;
    setError(null);
    try {
      // Only what changed rides; an unchanged field is absent from the PATCH body (the service spreads by presence).
      await update.mutateAsync({
        id: user.id,
        input: {
          ...(displayName.trim() !== user.displayName ? { displayName } : {}),
          ...(isSuperAdmin !== user.isSuperAdmin ? { isSuperAdmin } : {}),
        },
      });
      notify({ title: t("users.savedOk"), color: "success" });
      onClose();
    } catch (e) {
      setError(errMsg(e)); // LAST_SUPER_ADMIN lands here, in the dialog
    }
  };

  return (
    <Modal opened={user !== null} onClose={onClose} centered title={t("users.editTitle", { name: user?.username ?? "" })}>
      <Stack gap="sm">
        {error && (
          <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
            {error}
          </Alert>
        )}
        <TextInput label={t("users.displayName")} value={displayName} onChange={(e) => setDisplayName(e.currentTarget.value)} required />
        <Checkbox label={t("users.superAdminToggle")} checked={isSuperAdmin} onChange={(e) => setIsSuperAdmin(e.currentTarget.checked)} />
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button loading={update.isPending} disabled={!displayName.trim()} onClick={submit}>
            {t("common.save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** The twelve grants in the nav's order, each labelled by its entry's own `labelKey` (the hidden pages last). */
const MENU_ROWS: { key: MenuKey; labelKey: string }[] = [...NAV_ITEMS, ...HIDDEN_NAV_ITEMS]
  .filter((i): i is typeof i & { menuKey: MenuKey } => !!i.menuKey)
  .map((i) => ({ key: i.menuKey, labelKey: i.labelKey }));

function MenusModal({ user, onClose }: { user: UserDTO | null; onClose: () => void }) {
  const t = useT();
  const save = useSetUserMenus();
  const [keys, setKeys] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [seededFor, setSeededFor] = useState<string | null>(null);
  // Seed from the row on open (render-time, as EditUserModal does): the checklist is a copy of the row's menus.
  if (user && seededFor !== user.id) {
    setSeededFor(user.id);
    setKeys(user.menus ?? []);
    setError(null);
  }
  if (!user && seededFor !== null) setSeededFor(null);

  const toggle = (key: string, on: boolean) => setKeys((k) => (on ? [...new Set([...k, key])] : k.filter((x) => x !== key)));
  const submit = async () => {
    if (!user) return;
    setError(null);
    try {
      // Only the keys the registry knows, in the registry's order — the server refuses an unknown one anyway.
      await save.mutateAsync({ id: user.id, keys: MENU_KEYS.filter((k) => keys.includes(k)) });
      notify({ title: t("users.menusSavedOk", { name: user.displayName }), color: "success" });
      onClose();
    } catch (e) {
      setError(errMsg(e));
    }
  };

  return (
    <Modal opened={user !== null} onClose={onClose} centered title={t("users.menusTitle", { name: user?.displayName ?? "" })}>
      <Stack gap="sm">
        {error && (
          <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
            {error}
          </Alert>
        )}
        <Text size="sm" c="dimmed">
          {t("users.menusBody")}
        </Text>
        <Group gap="xs">
          <Button size="compact-xs" variant="subtle" onClick={() => setKeys([...MENU_KEYS])}>
            {t("users.menusSelectAll")}
          </Button>
          <Button size="compact-xs" variant="subtle" onClick={() => setKeys([])}>
            {t("users.menusSelectNone")}
          </Button>
        </Group>
        <Stack gap={6}>
          {MENU_ROWS.map((row) => (
            <Checkbox key={row.key} label={t(row.labelKey)} checked={keys.includes(row.key)} onChange={(e) => toggle(row.key, e.currentTarget.checked)} />
          ))}
        </Stack>
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button loading={save.isPending} onClick={submit}>
            {t("common.save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** The nav entry whose tail is this area — its label heads the group; `sales` (the discount) has no menu. */
const NAV_BY_AREA = new Map([...NAV_ITEMS, ...HIDDEN_NAV_ITEMS].filter((i) => i.menuKey).map((i) => [i.menuKey!.slice("menu:".length), i]));

function ActionsModal({ user, onClose }: { user: UserDTO | null; onClose: () => void }) {
  const t = useT();
  const { lang } = useI18n();
  const save = useSetUserActions();
  // 🔴 The registry is the ONLY source of action keys and labels — fetched, never listed here.
  const { data: registry, isLoading, error: registryError } = usePermissions(user !== null);
  const [keys, setKeys] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (user && seededFor !== user.id) {
    setSeededFor(user.id);
    setKeys(user.actions ?? []);
    setError(null);
  }
  if (!user && seededFor !== null) setSeededFor(null);

  const actions = registry?.actions ?? [];
  const allKeys = actions.map((a) => a.key);
  const areas = [...new Set(actions.map((a) => a.area))];
  const setMany = (list: string[], on: boolean) => setKeys((k) => (on ? [...new Set([...k, ...list])] : k.filter((x) => !list.includes(x))));
  const submit = async () => {
    if (!user) return;
    setError(null);
    try {
      // Only registry keys, in the registry's order — an unknown key is the server's 400 anyway.
      await save.mutateAsync({ id: user.id, keys: allKeys.filter((k) => keys.includes(k)) });
      notify({ title: t("users.actionsSavedOk", { name: user.displayName }), color: "success" });
      onClose();
    } catch (e) {
      setError(errMsg(e));
    }
  };

  return (
    <Modal opened={user !== null} onClose={onClose} centered size="lg" title={t("users.actionsTitle", { name: user?.displayName ?? "" })}>
      <Stack gap="sm">
        {(error || registryError) && (
          <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
            {error ?? errMsg(registryError)}
          </Alert>
        )}
        <Text size="sm" c="dimmed">
          {t("users.actionsBody")}
        </Text>
        {isLoading ? (
          <Loader size="xs" />
        ) : (
          <>
            <Group gap="xs">
              <Button size="compact-xs" variant="subtle" onClick={() => setMany(allKeys, true)}>
                {t("users.menusSelectAll")}
              </Button>
              <Button size="compact-xs" variant="subtle" onClick={() => setKeys([])}>
                {t("users.menusSelectNone")}
              </Button>
            </Group>
            <Stack gap="md">
              {areas.map((area) => {
                const nav = NAV_BY_AREA.get(area);
                const rows = actions.filter((a) => a.area === area);
                const rowKeys = rows.map((a) => a.key);
                const allOn = rowKeys.every((k) => keys.includes(k));
                // Convenience, not a rule: an act under a menu the user cannot open is allowed to be ticked — the
                // server refuses the route by menu first — but the header says so. Nothing is auto-granted.
                const menuMissing = !!nav?.menuKey && !user?.isSuperAdmin && !(user?.menus ?? []).includes(nav.menuKey);
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
                      <Button size="compact-xs" variant="subtle" onClick={() => setMany(rowKeys, !allOn)}>
                        {allOn ? t("users.menusSelectNone") : t("users.menusSelectAll")}
                      </Button>
                    </Group>
                    <Stack gap={4}>
                      {rows.map((a) => (
                        <Checkbox
                          key={a.key}
                          size="sm"
                          label={lang === "th" ? a.labelTh : a.labelEn}
                          checked={keys.includes(a.key)}
                          onChange={(e) => setMany([a.key], e.currentTarget.checked)}
                        />
                      ))}
                    </Stack>
                  </div>
                );
              })}
            </Stack>
          </>
        )}
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button loading={save.isPending} disabled={isLoading || !registry} onClick={submit}>
            {t("common.save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose }: { user: UserDTO | null; onClose: () => void }) {
  const t = useT();
  const reset = useResetUserPassword();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mismatch = confirm.length > 0 && confirm !== password;
  const close = () => {
    setPassword("");
    setConfirm("");
    setError(null);
    onClose();
  };
  /** The second tap: the dialog's own submit, after the new password has been typed twice. */
  const submit = async () => {
    if (!user) return;
    setError(null);
    try {
      await reset.mutateAsync({ id: user.id, password });
      notify({ title: t("users.resetOk", { name: user.displayName }), color: "success" });
      close();
    } catch (e) {
      setError(errMsg(e)); // PASSWORD_TOO_SHORT — the server's sentence
    }
  };

  return (
    <Modal opened={user !== null} onClose={close} centered title={t("users.resetTitle", { name: user?.displayName ?? "" })}>
      <Stack gap="sm">
        {error && (
          <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
            {error}
          </Alert>
        )}
        <Text size="sm" c="dimmed">
          {t("users.resetBody")}
        </Text>
        <PasswordInput
          label={t("users.newPassword")}
          description={t("users.passwordHint")}
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          autoComplete="new-password"
          required
        />
        <PasswordInput
          label={t("users.passwordConfirm")}
          value={confirm}
          onChange={(e) => setConfirm(e.currentTarget.value)}
          error={mismatch ? t("users.passwordMismatch") : undefined}
          autoComplete="new-password"
          required
        />
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button color="orange" loading={reset.isPending} disabled={!password || mismatch || confirm.length === 0} onClick={submit}>
            {t("users.resetConfirm")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
