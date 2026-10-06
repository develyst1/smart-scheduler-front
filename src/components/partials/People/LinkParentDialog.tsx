"use client";

import { useState } from "react";
import { Alert, Button, Group, Loader, Modal, Stack, Text, TextInput, UnstyledButton } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { AlertTriangle, Search } from "lucide-react";
import { ApiClientError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { notify } from "@/lib/ui/notify";
import { formatDateDisplay } from "@/lib/ui/format";
import { useLinkParent, useLinkParentPreview, useParents } from "@/hooks/scheduler";
import type { Parent } from "@/types/app/people";

/**
 * 🔴 **TASK-669 (server: TASK-668) — link a parent to a child that has none.** Two steps in one dialog:
 *  1. **Pick the family** with the People page's OWN parent search (`GET /parents?q=`, name or phone). 🚫 No new read, and
 *     🚫 no "create a family and link in one go" this round — staff create the family on People first (Porter).
 *  2. **Confirm — the point of the task.** Before the admin presses Link the dialog shows, from the server's dry run:
 *     - **the family's existing children, BY NAME.** 🔑 This is the "two Aris" case: the admin must SEE the duplicate, not be
 *       warned by a heuristic (there is deliberately no "possible duplicate!" check anywhere);
 *     - **the child's upcoming sessions** (count + next date) — the server's own "upcoming" set, the same one the archive
 *       refusal uses, so the two cannot disagree;
 *     - **that the link can't be undone from the screen** — nothing in the product un-links, so the admin must know first.
 *
 * Every refusal is the server's sentence, shown as sent (`STUDENT_ALREADY_HAS_PARENT`, `PARENT_ARCHIVED`, the 5-per-family cap).
 * 🚫 One child, one family, one press: there is no bulk link anywhere.
 */
type Picked = Pick<Parent, "id" | "name" | "phone">;
const personName = (p: { name: string; nickname: string | null }) => (p.nickname && p.nickname !== p.name ? `${p.name} (${p.nickname})` : p.name);

export default function LinkParentDialog({ student, onClose }: { student: { id: string; name: string; nickname: string | null }; onClose: () => void }) {
  const t = useT();
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 300);
  const [parent, setParent] = useState<Picked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const families = useParents({ q: debounced.trim() || undefined, limit: 10 });
  const preview = useLinkParentPreview(student.id, parent?.id ?? null);
  const link = useLinkParent();
  const child = student.nickname || student.name;
  const familyName = (p: Picked) => p.name || p.phone;
  const errOf = (e: unknown) => (e instanceof ApiClientError ? e.message : (e as Error).message);

  const submit = async () => {
    if (!parent) return;
    setError(null);
    try {
      await link.mutateAsync({ studentId: student.id, parentId: parent.id });
      notify({ title: t("people.linkParentDone", { child, parent: familyName(parent) }), color: "success" });
      onClose();
    } catch (e) {
      setError(errOf(e));
    }
  };

  return (
    <Modal opened onClose={onClose} centered title={parent ? t("people.linkParentConfirmTitle", { child, parent: familyName(parent) }) : t("people.linkParent")} data-link-parent-dialog={parent ? "confirm" : "pick"}>
      {!parent ? (
        <Stack gap="sm">
          <TextInput placeholder={t("people.linkParentSearch")} value={search} onChange={(e) => setSearch(e.currentTarget.value)} leftSection={<Search size={16} />} data-link-search />
          {families.isLoading && !families.data ? (
            <Loader size="sm" />
          ) : families.error ? (
            <Alert color="red" icon={<AlertTriangle size={16} />} variant="light">
              {errOf(families.error)}
            </Alert>
          ) : (families.data?.parents.length ?? 0) === 0 ? (
            <Text ta="center" c="dimmed" size="sm">
              {t("people.noMatch")}
            </Text>
          ) : (
            <Stack gap={0} data-link-families={families.data!.parents.length}>
              {families.data!.parents.map((p) => (
                <UnstyledButton key={p.id} onClick={() => setParent({ id: p.id, name: p.name, phone: p.phone })} className="rounded-md px-2 py-1.5 text-left hover:bg-muted-100" data-link-family={p.id}>
                  <Text size="sm" fw={500}>
                    {familyName(p)}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {p.phone} · {p.students.length > 0 ? p.students.map((s) => s.nickname || s.name).join(", ") : t("people.noStudents")}
                  </Text>
                </UnstyledButton>
              ))}
            </Stack>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              {t("common.cancel")}
            </Button>
          </Group>
        </Stack>
      ) : (
        <Stack gap="sm">
          {(error || preview.error) && (
            <Alert color="red" icon={<AlertTriangle size={16} />} variant="light" data-link-error>
              {error ?? errOf(preview.error)}
            </Alert>
          )}
          {preview.isLoading ? (
            <Loader size="sm" />
          ) : preview.data ? (
            <Stack gap="xs">
              {/* 🔑 the family's children BY NAME — the admin sees "two Aris" for themselves; no duplicate heuristic exists. */}
              <Text size="sm" data-link-family-children={preview.data.children.length}>
                {preview.data.children.length > 0 ? t("people.linkParentFamilyHas", { names: preview.data.children.map(personName).join(", ") }) : t("people.linkParentFamilyEmpty")}
              </Text>
              <Text size="sm" data-link-upcoming={preview.data.upcoming.count}>
                {preview.data.upcoming.count > 0 ? t("people.linkParentUpcoming", { child, n: preview.data.upcoming.count, date: formatDateDisplay(preview.data.upcoming.next) }) : t("people.linkParentNoUpcoming", { child })}
              </Text>
              <Text size="sm" fw={500} data-link-irreversible>
                {t("people.linkParentIrreversible")}
              </Text>
            </Stack>
          ) : null}
          <Group justify="flex-end" gap="sm">
            <Button
              variant="default"
              onClick={() => {
                setError(null);
                setParent(null);
              }}
            >
              {t("common.cancel")}
            </Button>
            {/* The link is only offered once the dry run has answered AND nothing refused: a 409 / cap / archived-family
                sentence in the dialog means there is nothing to confirm. */}
            <Button loading={link.isPending} disabled={!preview.data} onClick={() => void submit()} data-link-confirm>
              {t("people.linkParentConfirm")}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
