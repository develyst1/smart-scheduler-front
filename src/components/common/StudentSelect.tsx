"use client";

import { useState } from "react";
import { Combobox, InputBase, Loader, TextInput, useCombobox } from "@mantine/core";
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
}

const NEW = "__new__";

/**
 * Searchable student picker for the booking flow. Type to search the students table
 * (by name or parent phone); pick an existing student, or create a new one — when
 * creating, an optional parent-phone field appears so siblings can share a number.
 */
export default function StudentSelect({ value, onChange, label, required }: Props) {
  const t = useT();
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const [search, setSearch] = useState(value?.name ?? "");
  const [debounced] = useDebouncedValue(search, 250);
  const { data: results = [], isFetching } = useStudentSearch(debounced.trim());

  const isNew = !!value && !value.id;
  const exactMatch = results.some(
    (r) => r.name.toLowerCase() === search.trim().toLowerCase(),
  );

  const handleType = (v: string) => {
    setSearch(v);
    combobox.openDropdown();
    combobox.updateSelectedOptionIndex();
    // Editing the text = a (potential) new student until an option is submitted.
    onChange(v.trim() ? { name: v.trim(), phone: value?.id ? undefined : value?.phone } : null);
  };

  const handleSubmit = (val: string) => {
    if (val === NEW) {
      onChange({ name: search.trim() });
    } else {
      const item = results.find((r) => r.id === val);
      if (item) {
        setSearch(item.name);
        onChange({ id: item.id, name: item.name, phone: item.phone ?? undefined });
      }
    }
    combobox.closeDropdown();
  };

  const options = results.map((r) => (
    <Combobox.Option value={r.id} key={r.id}>
      {r.label}
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
          <Combobox.Options>
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
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>

      {isNew && (
        <TextInput
          label={t("student.parentPhone")}
          description={t("student.parentPhoneHint")}
          placeholder={t("student.phoneExample")}
          value={value?.phone ?? ""}
          onChange={(e) => onChange({ name: value!.name, phone: e.currentTarget.value })}
        />
      )}
    </div>
  );
}
