"use client";

import { useState } from "react";
import { Alert, Button, Group, Modal, PasswordInput, Stack } from "@mantine/core";
import { AlertTriangle } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { useChangeMyPassword } from "@/hooks/scheduler/useMe";

/**
 * REQ-092 Stage 2 (TASK-382 §3) — "change my password", any user, from the header's user menu. Current + new + confirm
 * ⇒ `POST /auth/me/password { currentPassword, newPassword }`. 🔴 Every rule is the server's: a wrong current password
 * (`401`, its sentence — the api client does NOT sign out on this one route) and the minimum (`400 PASSWORD_TOO_SHORT`).
 * The ONE thing checked here is that the two new boxes match — a typing aid, the same as the Users page's dialogs.
 */
export default function ChangePasswordModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const t = useT();
  const change = useChangeMyPassword();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mismatch = confirm.length > 0 && confirm !== password;

  const close = () => {
    setCurrent("");
    setPassword("");
    setConfirm("");
    setError(null);
    onClose();
  };
  const submit = async () => {
    setError(null);
    try {
      await change.mutateAsync({ currentPassword: current, newPassword: password });
      notify({ title: t("header.passwordChangedOk"), color: "success" });
      close();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : (e as Error).message); // wrong current · PASSWORD_TOO_SHORT
    }
  };

  return (
    <Modal opened={opened} onClose={close} centered title={t("header.changePasswordTitle")}>
      <Stack gap="sm">
        {error && (
          <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
            {error}
          </Alert>
        )}
        <PasswordInput
          label={t("header.currentPassword")}
          value={current}
          onChange={(e) => setCurrent(e.currentTarget.value)}
          autoComplete="current-password"
          required
        />
        <PasswordInput
          label={t("header.newPassword")}
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
          <Button loading={change.isPending} disabled={!current || !password || mismatch || confirm.length === 0} onClick={submit}>
            {t("header.changePassword")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
