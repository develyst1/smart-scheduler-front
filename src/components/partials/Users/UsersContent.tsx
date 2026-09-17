"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Alert, Badge, Button, Card, Checkbox, Group, Loader, Modal, PasswordInput, Stack, Table, Text, TextInput } from "@mantine/core";
import { AlertTriangle, KeyRound, LayoutList, Pencil, ShieldCheck, UserPlus, UserX, UserCheck } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { useConfirm } from "@/components/common/useConfirm";
import { formatDateDisplay } from "@/lib/ui/format";
import { useCreateUser, useResetUserPassword, useSetUserDisabled, useSetUserMenus, useUpdateUser, useUsers } from "@/hooks/scheduler/useUsers";
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
    </Stack>
  );
}

function UserRow({
  user,
  isSelf,
  onEdit,
  onReset,
  onMenus,
}: {
  user: UserDTO;
  isSelf: boolean;
  onEdit: () => void;
  onReset: () => void;
  onMenus: () => void;
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
