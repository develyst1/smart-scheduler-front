import { describe, expect, it, mock, afterEach } from "bun:test";
import { createElement as h, useState } from "react";
import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * 🔴 **TASK-662 (piece A, FE) — a NEW student needs a parent phone, except on import.**
 *
 * The server refuses a phoneless new student on booking / course / voucher (TASK-644). The picker mirrors it so the admin
 * is told while typing, not refused at save. 🔑 **Clicked, not rendered:** what must be ruled out is a field that LOOKS
 * required while the form still saves — only typing and reading what the form receives can tell those apart.
 * The harness is a minimal caller: its Save is shut exactly the way every real caller's is (`!student?.name.trim()`).
 */

const realHooks = await import("@/hooks/scheduler");
mock.module("@/hooks/scheduler", () => ({
  ...realHooks,
  useStudentSearch: () => ({
    data: [{ id: "s-old", name: "น้องเก่า", label: "น้องเก่า · 0811111111", phone: null }],
    isFetching: false,
  }),
}));

const { default: StudentSelect, isParentPhoneShaped } = await import("./StudentSelect");
type Value = { id?: string; name: string; phone?: string } | null;

const en = dictionaries.en.student;
let last: Value = null;
function Harness({ required = true, requireParentPhone }: { required?: boolean; requireParentPhone?: boolean }) {
  const [v, setV] = useState<Value>(null);
  last = v;
  return h(
    "div",
    null,
    h(StudentSelect, { value: v, onChange: setV, required, requireParentPhone }),
    h("button", { type: "button", disabled: !v?.name.trim() }, "save"),
  );
}
const mount = (props: { required?: boolean; requireParentPhone?: boolean } = {}) =>
  render(h(MantineProvider, null, h(I18nProvider, null, h(Harness, props))));

const nameBox = () => screen.getByPlaceholderText(en.searchPlaceholder);
const phoneBox = () => screen.queryByPlaceholderText(en.phoneExample) as HTMLInputElement | null;
const save = () => screen.getByText("save") as HTMLButtonElement;
const errorShown = () => document.body.textContent?.includes(en.parentPhoneRequiredError) ?? false;

afterEach(() => {
  cleanup();
  last = null;
});

describe("🔴 TASK-662 — the phone rule is the SERVER's (`isPhoneShaped`, floor 9)", () => {
  it("phone-shaped: 9+ digits with separators only", () => {
    for (const ok of ["0812345678", "081-234-5678", "081 234 5678", "(081) 234.5678", "+66 81 234 5678", "081234567"])
      expect(isParentPhoneShaped(ok)).toBe(true);
  });
  it("not phone-shaped: empty, short, or anything but digits and separators", () => {
    for (const bad of [undefined, "", "   ", "1", "08123456", "0812x345678", "โทร 0812345678", "081234567#"])
      expect(isParentPhoneShaped(bad)).toBe(false);
  });
});

describe("🔴 TASK-662 — DEFAULT (required phone): a new student cannot be submitted without one", () => {
  it("🔑 a new name with NO phone: the field is REQUIRED (no “(optional)”), the error says why, and Save stays shut", async () => {
    const user = userEvent.setup();
    mount();
    await user.type(nameBox(), "น้องใหม่");

    await waitFor(() => expect(phoneBox()).toBeTruthy());
    expect(document.body.textContent).not.toContain(en.parentPhone); // "Parent phone (optional)"
    expect(document.body.textContent).toContain(en.parentPhoneRequired);
    expect(phoneBox()!.required).toBe(true);
    expect(errorShown()).toBe(true);
    expect(save().disabled).toBe(true);
    expect(last).toBeNull(); // the form receives NO student — its own "student required" check holds
  });

  it("a JUNK phone (too short, or not a phone) is still refused", async () => {
    const user = userEvent.setup();
    mount();
    await user.type(nameBox(), "น้องใหม่");
    await waitFor(() => expect(phoneBox()).toBeTruthy());

    for (const junk of ["1", "08123456", "0812x345678"]) {
      await user.clear(phoneBox()!);
      await user.type(phoneBox()!, junk);
      expect(errorShown()).toBe(true);
      expect(save().disabled).toBe(true);
    }
  });

  it("✅ a VALID phone lets it through — the form receives the name AND the phone", async () => {
    const user = userEvent.setup();
    mount();
    await user.type(nameBox(), "น้องใหม่");
    await waitFor(() => expect(phoneBox()).toBeTruthy());
    await user.type(phoneBox()!, "081-234-5678");

    await waitFor(() => expect(save().disabled).toBe(false));
    expect(errorShown()).toBe(false);
    expect(last).toEqual({ name: "น้องใหม่", phone: "081-234-5678" });
    // the field is still on screen while it is filled — keeping the draft is what keeps it there
    expect(phoneBox()!.value).toBe("081-234-5678");
  });

  it("✅ an EXISTING student needs no phone: picked from the list ⇒ no phone field, Save open", async () => {
    const user = userEvent.setup();
    mount();
    await user.type(nameBox(), "น้อง");
    await user.click(await screen.findByText("น้องเก่า · 0811111111"));

    await waitFor(() => expect(save().disabled).toBe(false));
    expect(!phoneBox()).toBe(true); // a boolean, not the node: a failure must not print the DOM (TASK-596)
    expect(errorShown()).toBe(false);
    expect(last).toEqual({ id: "s-old", name: "น้องเก่า", phone: undefined });
  });
});

describe("🔴 TASK-662 — `requireParentPhone={false}` (the IMPORT screen): today's optional field", () => {
  it("a new name with no phone: the “(optional)” label, no error, and Save OPEN", async () => {
    const user = userEvent.setup();
    mount({ requireParentPhone: false });
    await user.type(nameBox(), "น้องนำเข้า");

    await waitFor(() => expect(phoneBox()).toBeTruthy());
    expect(document.body.textContent).toContain(en.parentPhone);
    expect(phoneBox()!.required).toBe(false);
    expect(errorShown()).toBe(false);
    expect(save().disabled).toBe(false);
    expect(last).toEqual({ name: "น้องนำเข้า", phone: undefined });
  });
});

describe("⚠️ TASK-662 — a picker that is NOT `required` never drops what was typed", () => {
  /**
   * On an optional picker (Team A's อื่นๆ booking) `null` means "no student", so reporting it would let that form save
   * WITHOUT the name the admin typed. The error still shows; the server is the backstop there. Declared, not silent —
   * TASK-662 §Questions Q3.
   */
  it("a new name with no phone is still REPORTED (with the error shown), never turned into “no student”", async () => {
    const user = userEvent.setup();
    mount({ required: false });
    await user.type(nameBox(), "น้องอื่นๆ");

    await waitFor(() => expect(phoneBox()).toBeTruthy());
    expect(errorShown()).toBe(true);
    expect(last).toEqual({ name: "น้องอื่นๆ", phone: undefined });
  });
});
