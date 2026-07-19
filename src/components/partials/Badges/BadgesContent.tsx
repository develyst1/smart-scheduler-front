"use client";

import { useState } from "react";
import {
  Card,
  Loader,
  Button,
  Group,
  Stack,
  Text,
  TextInput,
  Switch,
  ColorSwatch,
  Badge,
  Tooltip,
  ActionIcon,
  Modal,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Plus, Power, PowerOff } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { useT } from "@/lib/i18n";
import { badgeColorVar } from "@/lib/ui/badge-colors";
import {
  useBadges,
  useCreateBadgeType,
  useCreateBadgeValue,
  useUpdateBadgeType,
  useUpdateBadgeValue,
} from "@/hooks/scheduler";
import { BADGE_COLORS, type BadgeColor, type BadgeType } from "@/types/app/scheduler";

export default function BadgesContent() {
  const t = useT();
  const { data: types = [], isLoading } = useBadges(true); // admin view: include inactive
  const createType = useCreateBadgeType();

  const [newType, setNewType] = useState("");
  const [confirmOpen, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);

  // Validate first, then ask for confirmation before creating.
  const requestAddType = () => {
    if (!newType.trim()) return;
    openConfirm();
  };

  const addType = () => {
    const name = newType.trim();
    if (!name) return;
    createType.mutate(
      { name },
      {
        onSuccess: () => {
          notify({ title: t("badges.createdType"), color: "success" });
          setNewType("");
          closeConfirm();
        },
        onError: () => {
          notify({ title: t("badges.saveError"), color: "danger" });
          closeConfirm();
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-sm text-default-500">
        <Loader size="md" />
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t("badges.title")}</h1>
        <p className="text-sm text-default-500">{t("badges.subtitle")}</p>
      </div>

      <Card withBorder radius="lg" p="md">
        <Group align="end" gap="sm">
          <TextInput
            label={t("badges.typeName")}
            placeholder={t("badges.typeNamePlaceholder")}
            value={newType}
            onChange={(e) => setNewType(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && requestAddType()}
            className="grow"
          />
          <Button leftSection={<Plus size={16} />} onClick={requestAddType}>
            {t("badges.addType")}
          </Button>
        </Group>
      </Card>

      <Modal
        opened={confirmOpen}
        onClose={closeConfirm}
        title={t("badges.confirmAddType")}
        centered
        size="sm"
      >
        <Text size="sm" c="dimmed">
          {t("badges.confirmAddTypeBody")}
        </Text>
        <Text size="sm" fw={600} mt={4}>
          {newType.trim()}
        </Text>
        <Group justify="flex-end" gap="sm" mt="lg">
          <Button variant="subtle" color="gray" onClick={closeConfirm} disabled={createType.isPending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={addType} loading={createType.isPending}>
            {t("common.confirm")}
          </Button>
        </Group>
      </Modal>

      {types.length === 0 ? (
        <p className="py-10 text-center text-sm text-default-400">{t("badges.noTypes")}</p>
      ) : (
        <Stack gap="md">
          {types.map((type) => (
            <BadgeTypeCard key={type.id} type={type} />
          ))}
        </Stack>
      )}
    </div>
  );
}

function BadgeTypeCard({ type }: { type: BadgeType }) {
  const t = useT();
  const updateType = useUpdateBadgeType();
  const createValue = useCreateBadgeValue();
  const updateValue = useUpdateBadgeValue();

  const [label, setLabel] = useState("");
  const [color, setColor] = useState<BadgeColor>(BADGE_COLORS[0]);
  const [confirmOpen, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);

  // Validate first, then ask for confirmation before creating.
  const requestAddValue = () => {
    if (!label.trim()) return;
    openConfirm();
  };

  const addValue = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    createValue.mutate(
      { badgeTypeId: type.id, label: trimmed, color },
      {
        onSuccess: () => {
          notify({ title: t("badges.createdValue"), color: "success" });
          setLabel("");
          closeConfirm();
        },
        onError: () => {
          notify({ title: t("badges.saveError"), color: "danger" });
          closeConfirm();
        },
      },
    );
  };

  return (
    <Card withBorder radius="lg" p="md" className={type.active ? undefined : "opacity-60"}>
      <Group justify="space-between" mb="sm">
        <span className="text-base font-semibold">{type.name}</span>
        <Switch
          size="sm"
          checked={type.active}
          onChange={(e) =>
            updateType.mutate({ id: type.id, patch: { active: e.currentTarget.checked } })
          }
          label={type.active ? t("badges.active") : t("badges.inactive")}
        />
      </Group>

      {type.values.length === 0 ? (
        <p className="text-sm text-default-400">{t("badges.noValues")}</p>
      ) : (
        <Group gap="xs" mb="sm">
          {type.values.map((v) => (
            <Badge
              key={v.id}
              variant="light"
              color={v.color}
              className={v.active ? undefined : "opacity-50 line-through"}
              rightSection={
                <Tooltip label={v.active ? t("badges.inactive") : t("badges.active")}>
                  <ActionIcon
                    size="xs"
                    variant="transparent"
                    color={v.color}
                    onClick={() =>
                      updateValue.mutate({ id: v.id, patch: { active: !v.active } })
                    }
                    aria-label={v.active ? t("badges.inactive") : t("badges.active")}
                  >
                    {v.active ? <PowerOff size={12} /> : <Power size={12} />}
                  </ActionIcon>
                </Tooltip>
              }
            >
              {v.label}
            </Badge>
          ))}
        </Group>
      )}

      <Group align="end" gap="sm" className="border-t border-default-100 pt-3">
        <TextInput
          label={t("badges.valueLabel")}
          placeholder={t("badges.valuePlaceholder")}
          value={label}
          onChange={(e) => setLabel(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && requestAddValue()}
          className="grow"
          size="sm"
        />
        <div>
          <p className="mb-1 text-xs font-medium text-default-500">{t("badges.color")}</p>
          <Group gap={6}>
            {BADGE_COLORS.map((c) => (
              <ColorSwatch
                key={c}
                component="button"
                type="button"
                color={badgeColorVar(c)}
                onClick={() => setColor(c)}
                size={22}
                className="cursor-pointer"
                style={{
                  outline: color === c ? "2px solid var(--mantine-color-default-color)" : "none",
                  outlineOffset: 2,
                }}
                aria-label={c}
              />
            ))}
          </Group>
        </div>
        <Button
          size="sm"
          variant="light"
          leftSection={<Plus size={15} />}
          onClick={requestAddValue}
        >
          {t("badges.addValue")}
        </Button>
      </Group>

      <Modal
        opened={confirmOpen}
        onClose={closeConfirm}
        title={t("badges.confirmAddValue")}
        centered
        size="sm"
      >
        <Text size="sm" c="dimmed">
          {t("badges.confirmAddValueBody")}
        </Text>
        <Group gap="xs" mt={8}>
          <Badge variant="light" color={color}>
            {label.trim()}
          </Badge>
          <Text size="xs" c="dimmed">
            {type.name}
          </Text>
        </Group>
        <Group justify="flex-end" gap="sm" mt="lg">
          <Button variant="subtle" color="gray" onClick={closeConfirm} disabled={createValue.isPending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={addValue} loading={createValue.isPending}>
            {t("common.confirm")}
          </Button>
        </Group>
      </Modal>
    </Card>
  );
}
