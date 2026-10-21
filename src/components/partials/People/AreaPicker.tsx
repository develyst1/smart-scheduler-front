"use client";

import { useEffect, useState } from "react";
import { Select, Stack } from "@mantine/core";
import { useI18n } from "@/lib/i18n";
import { areaLabel, loadAddressBook, tierWordsFor, type AddressBook, type AreaPick } from "@/lib/register/entry";

/** The three levels as the DOPA CODES — the only thing the form holds, sends and prefills from. */
export interface AreaCodes {
  province: string | null;
  district: string | null;
  subdistrict: string | null;
}
export const NO_AREA: AreaCodes = { province: null, district: null, subdistrict: null };

/** `none` = nothing picked · `full` = all three · `half` = one or two (cannot be saved: the server refuses a half triple). */
export const areaState = (a: AreaCodes): "none" | "full" | "half" => {
  const n = [a.province, a.district, a.subdistrict].filter(Boolean).length;
  return n === 0 ? "none" : n === 3 ? "full" : "half";
};

/**
 * 🔴 **TASK-801 (REQ-118) — the admin parent form's address: the SAME 3-level picker the register page uses** (province → district →
 * sub-district, the register page's address book, option labels follow the language (TASK-830; Thai on the TH page), values are the geocodes).
 *
 * 🔑 Held as CODES end to end: a form that holds names cannot tell two same-named districts apart (the page's own rule — lookups are by
 * geocode). The dataset is loaded here by `loadAddressBook()`, a dynamic `import()`, so it never enters the main bundle.
 * 🚫 **No new words:** the labels are `people.province`, `register.addrDistrict` / `addrSubDistrict` (English) and `tierWordsFor` (Thai — the
 * same Bangkok เขต/แขวง flip the page uses), the placeholder is `register.addrPickPlaceholder`.
 * 🔑 A parent whose province is only the old TEXT (no codes yet — the backfill leaves some on purpose, and three uat rows hold non-province
 * text) shows that text IN the province box as a disabled, selected option — the owner's TASK-353 rule, kept: *the visible value is the
 * warning*, not a blank box with a placeholder. It can be replaced by a real pick but never re-picked, and it is not a pick: saving without
 * touching the picker sends no address at all.
 */
export default function AreaPicker({
  value,
  onChange,
  legacyProvince,
  half,
}: {
  value: AreaCodes;
  onChange: (next: AreaCodes) => void;
  /** The parent's old `province` text when it has no codes. */
  legacyProvince?: string | null;
  /** A half triple: the unfilled levels get the red border (no words — the Save button is shut). */
  half?: boolean;
}) {
  const { t, lang } = useI18n();
  const [book, setBook] = useState<AddressBook | null>(null);
  const [districts, setDistricts] = useState<AreaPick[]>([]);
  const [subDistricts, setSubDistricts] = useState<AreaPick[]>([]);

  useEffect(() => {
    let live = true;
    // a list that will not load leaves the pickers disabled — an address we cannot list is one we cannot collect (no half-built address)
    void loadAddressBook().then(
      (b) => live && setBook(b),
      () => live && setBook(null),
    );
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    let live = true;
    if (!book || !value.province) setDistricts([]);
    else void book.districtsOf(value.province).then((r) => live && setDistricts(r), () => live && setDistricts([]));
    return () => {
      live = false;
    };
  }, [book, value.province]);
  useEffect(() => {
    let live = true;
    if (!book || !value.district) setSubDistricts([]);
    else void book.subDistrictsOf(value.district).then((r) => live && setSubDistricts(r), () => live && setSubDistricts([]));
    return () => {
      live = false;
    };
  }, [book, value.district]);

  const tier = lang === "th" ? tierWordsFor(value.province) : { district: t("register.addrDistrict"), subDistrict: t("register.addrSubDistrict") };
  const options = (rows: AreaPick[]) => rows.map((r) => ({ value: r.code, label: areaLabel(r, lang) }));
  const placeholder = t("register.addrPickPlaceholder");
  const legacyValue = legacyProvince && !value.province ? `legacy:${legacyProvince}` : null;
  const provinceData = legacyValue ? [{ value: legacyValue, label: legacyProvince as string, disabled: true }, ...options(book?.provinces ?? [])] : options(book?.provinces ?? []);

  return (
    <Stack gap="xs" data-area-picker>
      <Select
        label={t("people.province")}
        placeholder={book ? placeholder : t("register.addrLoading")}
        data={provinceData}
        value={value.province ?? legacyValue}
        onChange={(code) => onChange({ province: code, district: null, subdistrict: null })}
        disabled={!book}
        error={half && !value.province}
        searchable
        clearable
        comboboxProps={{ withinPortal: true }}
      />
      <Select
        label={tier.district}
        placeholder={placeholder}
        data={options(districts)}
        value={value.district}
        onChange={(code) => onChange({ ...value, district: code, subdistrict: null })}
        disabled={!value.province}
        error={half && !value.district}
        searchable
        clearable
        comboboxProps={{ withinPortal: true }}
      />
      <Select
        label={tier.subDistrict}
        placeholder={placeholder}
        data={options(subDistricts)}
        value={value.subdistrict}
        onChange={(code) => onChange({ ...value, subdistrict: code })}
        disabled={!value.district}
        error={half && !value.subdistrict}
        searchable
        clearable
        comboboxProps={{ withinPortal: true }}
      />
    </Stack>
  );
}
