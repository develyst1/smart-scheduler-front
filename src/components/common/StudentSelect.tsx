"use client";

import { useEffect, useRef, useState } from "react";
import { Combobox, InputBase, Loader, ScrollArea, TextInput, useCombobox } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { UserPlus } from "lucide-react";
import { useStudentSearch } from "@/hooks/scheduler";
import { useT } from "@/lib/i18n";

/** What the form needs to build a StudentInput: an existing id, or a new name (+ phone). */
export interface StudentSelectValue {
  id?: string;
  name: string;
  phone?: string;
}

interface Props {
  value: StudentSelectValue | null;
  onChange: (value: StudentSelectValue | null) => void;
  label?: string;
  required?: boolean;
  /**
   * 🔴 TASK-662 — a NEW student must come with a phone-shaped parent phone (the server refuses one without, TASK-644).
   * **Default TRUE: it fails CLOSED** — a new caller is safe without anyone remembering. Only the IMPORT screen passes
   * `false` (the owner's exemption, mirrored 1:1 from the two exempt server acts). 🚫 The picker never works out which
   * screen it is on.
   */
  requireParentPhone?: boolean;
}

/**
 * 🔴 TASK-662 — "is this a parent phone": the SERVER's rule, mirrored (`smart-scheduler-back/src/lib/phone.ts` →
 * `isPhoneShaped`, floor 9). Digits and phone separators only (space · dash · dot · brackets · a leading `+`), and at
 * least nine digits. 🚫 Not "contains 9 digits": a picker looser than the server just moves the refusal to the save.
 */
export const isParentPhoneShaped = (input: string | undefined): boolean => {
  const t = (input ?? "").trim();
  if (!t || !/^\+?[\d\s().-]+$/.test(t)) return false;
  return t.replace(/\D/g, "").length >= 9;
};

const NEW = "__new__";

/** 🔴 TASK-664 — the no-parent tag's look: muted grey, small. Pinned by test, so "make it red" is a decision, not a drift. */
export const NO_PARENT_TAG_CLASS = "shrink-0 rounded bg-muted-100 px-1.5 py-px text-[10px] font-medium text-muted-600";

/**
 * Searchable student picker for the booking flow. Type to search the students table
 * (by name or parent phone); pick an existing student, or create a new one — when
 * creating, a parent-phone field appears so siblings can share a number (required unless `requireParentPhone={false}`).
 */
export default function StudentSelect({ value, onChange, label, required, requireParentPhone = true }: Props) {
  const t = useT();
  /**
   * 🔴 TASK-662 — how the submit waits on the phone WITHOUT touching a caller: on a `required` picker, a new student whose
   * phone is not yet phone-shaped is reported to the form as NO student (`null`), so each form's own existing "student
   * required" check keeps its Save shut. The picker keeps what is being typed in `draft` so the phone field stays on
   * screen. ⚠️ A picker that is NOT `required` keeps reporting what was typed (see `blocks`): there, `null` means "no
   * student", and the form would save WITHOUT the name the admin typed — a silent drop is worse than the server's refusal.
   */
  const [draft, setDraft] = useState<StudentSelectValue | null>(value);
  const reported = useRef<StudentSelectValue | null>(value);
  // A value set from OUTSIDE (a reset after save, a preset) replaces the draft; our own report echoing back does not.
  useEffect(() => {
    if (value !== reported.current) {
      reported.current = value;
      setDraft(value);
    }
  }, [value]);
  const phoneMissing = (v: StudentSelectValue | null) => requireParentPhone && !!v && !v.id && !isParentPhoneShaped(v.phone);
  const blocks = (v: StudentSelectValue | null) => !!required && phoneMissing(v);
  const report = (next: StudentSelectValue | null) => {
    setDraft(next);
    const out = blocks(next) ? null : next;
    reported.current = out;
    onChange(out);
  };
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const [search, setSearch] = useState(value?.name ?? "");
  const [debounced] = useDebouncedValue(search, 250);
  const { data: results = [], isFetching } = useStudentSearch(debounced.trim());

  const isNew = !!draft && !draft.id;
  const exactMatch = results.some(
    (r) => r.name.toLowerCase() === search.trim().toLowerCase(),
  );

  const handleType = (v: string) => {
    setSearch(v);
    combobox.openDropdown();
    combobox.updateSelectedOptionIndex();
    // Editing the text = a (potential) new student until an option is submitted.
    report(v.trim() ? { name: v.trim(), phone: draft?.id ? undefined : draft?.phone } : null);
  };

  const handleSubmit = (val: string) => {
    if (val === NEW) {
      report({ name: search.trim() });
    } else {
      const item = results.find((r) => r.id === val);
      if (item) {
        setSearch(item.name);
        report({ id: item.id, name: item.name, phone: item.phone ?? undefined });
      }
    }
    combobox.closeDropdown();
  };

  const options = results.map((r) => (
    <Combobox.Option value={r.id} key={r.id}>
      {r.parentId === null ? (
        // 🔴 TASK-664 — a child with no household, MARKED and still pickable. 🔒 OWNER'S JUDGEMENT (approved 2026-10-05,
        // do not "tidy"): the tag states a FACT — never error, invalid or broken — and the row stays PICKABLE. Muted grey,
        // no warning colour, no icon (pinned). The reason is said once, on People, never on every row.
        <span className="flex items-center justify-between gap-2">
          <span>{r.label}</span>
          <span data-no-parent-tag className={NO_PARENT_TAG_CLASS}>
            {t("student.noParentTag")}
          </span>
        </span>
      ) : (
        r.label
      )}
    </Combobox.Option>
  ));

  return (
    <div className="flex flex-col gap-2">
      <Combobox store={combobox} onOptionSubmit={handleSubmit}>
        <Combobox.Target>
          <InputBase
            label={label ?? t("student.label")}
            required={required}
            component="input"
            value={search}
            onChange={(e) => handleType(e.currentTarget.value)}
            onFocus={() => combobox.openDropdown()}
            onBlur={() => combobox.closeDropdown()}
            placeholder={t("student.searchPlaceholder")}
            rightSection={isFetching ? <Loader size={14} /> : <Combobox.Chevron />}
            rightSectionPointerEvents="none"
          />
        </Combobox.Target>

        <Combobox.Dropdown>
          {/* Combobox (low-level) doesn't scroll on its own like Select's maxDropdownHeight — a long student list
              would otherwise run off the bottom of the screen. Cap the height and let ScrollArea handle overflow-Y. */}
          <Combobox.Options>
            <ScrollArea.Autosize mah={280} type="scroll">
              {options}
              {search.trim() && !exactMatch && (
                <Combobox.Option value={NEW}>
                  <span className="flex items-center gap-1.5 text-primary-600">
                    <UserPlus size={14} /> {t("student.addNew", { name: search.trim() })}
                  </span>
                </Combobox.Option>
              )}
              {!options.length && !search.trim() && (
                <Combobox.Empty>{t("student.searchHint")}</Combobox.Empty>
              )}
            </ScrollArea.Autosize>
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>

      {isNew && (
        <TextInput
          // TASK-662 — required wording on the strict screens; the import keeps today's "(optional)" label.
          label={t(requireParentPhone ? "student.parentPhoneRequired" : "student.parentPhone")}
          required={requireParentPhone}
          description={t("student.parentPhoneHint")}
          placeholder={t("student.phoneExample")}
          value={draft?.phone ?? ""}
          onChange={(e) => report({ name: draft!.name, phone: e.currentTarget.value })}
          error={phoneMissing(draft) ? t("student.parentPhoneRequiredError") : undefined}
        />
      )}
    </div>
  );
}
