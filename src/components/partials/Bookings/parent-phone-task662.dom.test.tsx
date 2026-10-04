import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * 🔴 **TASK-662 — one clicked test per KIND of caller.** No caller was changed: the picker's default does the work.
 *  · `CreateCourseModal` takes the DEFAULT (strict) — it is the screen in Khwan's screenshot;
 *  · `ImportBalanceModal` is the ONE caller that passes `requireParentPhone={false}` (the owner's exemption).
 * 🔑 Each form is filled until its Save would open for any OTHER reason, so the only thing that can hold it shut is the
 * phone — and the act is then actually pressed, and what reaches the mutation is read.
 */

const en = dictionaries.en;
/** What each act was CALLED with — read as `.args`, the value as the form passed it (TASK-567's boundary). */
const created: Array<{ args: Record<string, unknown> }> = [];
const importedVouchers: Array<{ args: Record<string, unknown> }> = [];
let allowed: (key: string) => boolean = () => true;

const TEACHER = {
  id: "t1",
  name: "ครูเอ",
  nickname: "เอ",
  type: "FULL_TIME",
  subjects: ["Skate"],
  subjectOptions: [{ id: "sub-skate", name: "Skate", kind: "PRIVATE" }],
  active: true,
  monthlyHours: 0,
  monthlyIncome: 0,
  overLimit: false,
  bookable: true,
};
const CARD = {
  vatInclusive: true,
  packages: [{ priceGroup: "SKATE", size: 6, externalRef: "x", priceMinor: 600000, subjects: [{ id: "sub-skate", name: "Skate" }] }],
  unpricedSubjects: [],
  voucherAllowedGroups: [],
  rentalItems: [],
  voucherItems: [],
};

const realHooks = await import("@/hooks/scheduler");
mock.module("@/hooks/scheduler", () => ({
  ...realHooks,
  useStudentSearch: () => ({ data: [], isFetching: false }),
  useTeachers: () => ({ data: [TEACHER] }),
  useSellablePackages: () => ({ data: CARD }),
  useCreateCoursePackage: () => ({
    isPending: false,
    mutateAsync: async (input: Record<string, unknown>) => {
      created.push({ args: input });
      return { course: { student: { name: input.studentName } }, bookings: [] };
    },
  }),
  useImportCoursePackage: () => ({ isPending: false, mutateAsync: async () => undefined }),
  useImportVoucher: () => ({
    isPending: false,
    mutateAsync: async (input: Record<string, unknown>) => {
      importedVouchers.push({ args: input });
    },
  }),
}));
const realMe = await import("@/hooks/scheduler/useMe");
mock.module("@/hooks/scheduler/useMe", () => ({ ...realMe, useCan: () => (key: string) => allowed(key) }));
const realSvc = await import("@/services/scheduler.service");
mock.module("@/services/scheduler.service", () => ({ ...realSvc, previewCourseImport: async () => ({ ok: true }) }));

const CreateCourseModal = (await import("./CreateCourseModal")).default;
const ImportBalanceModal = (await import("./ImportBalanceModal")).default;

const wrap = (el: ReturnType<typeof h>) => render(h(MantineProvider, null, h(I18nProvider, null, el)));
const nameBox = () => screen.getByPlaceholderText(en.student.searchPlaceholder);
const phoneBox = () => screen.queryByPlaceholderText(en.student.phoneExample) as HTMLInputElement | null;
const button = (label: string) => screen.getByText(label).closest("button") as HTMLButtonElement;

beforeEach(() => {
  created.length = 0;
  importedVouchers.length = 0;
  allowed = () => true;
});
afterEach(cleanup);

describe("🔴 TASK-662 — `CreateCourseModal` (the default, strict): a phoneless NEW student cannot be registered", () => {
  it("🔑 every other field ready ⇒ Save stays shut until the phone is phone-shaped; then the course carries the phone", async () => {
    const user = userEvent.setup();
    wrap(h(CreateCourseModal, { opened: true, onClose: () => {} }));

    // the teacher (its one program is then picked by the form itself; the card sells size 6 for it)
    await user.click(screen.getByPlaceholderText(en.course.pickTeacher));
    const teacherOption = await waitFor(() => {
      const o = [...document.querySelectorAll('[role="option"]')].find((x) => x.textContent?.includes(TEACHER.nickname));
      expect(o).toBeTruthy();
      return o as HTMLElement;
    }); // drawn by `TeacherOption`; every Select's options share the page, so it is found by its coach
    await user.click(teacherOption);
    await user.type(nameBox(), "น้องใหม่");
    await waitFor(() => expect(phoneBox()).toBeTruthy());

    const submit = () => button(en.course.submitBtn);
    expect(submit().disabled).toBe(true);
    expect(document.body.textContent).toContain(en.student.parentPhoneRequiredError);

    await user.type(phoneBox()!, "0812345678");
    await waitFor(() => expect(submit().disabled).toBe(false));
    await user.click(submit());

    await waitFor(() => expect(created.length).toBe(1));
    expect(created[0].args).toMatchObject({ studentName: "น้องใหม่", studentPhone: "0812345678", teacherId: "t1", subjectId: "sub-skate" });
  });
});

describe("🔴 TASK-662 — `ImportBalanceModal` (the exemption): a phoneless new student STILL saves", () => {
  it("✅ a voucher import with a new name and no phone: the optional label, Save open, and the import goes through", async () => {
    // voucher import only ⇒ the form's own kind is VOUCHER, whose only other requirements already hold by default
    allowed = (key) => key !== "action:bookings.course-import";
    const user = userEvent.setup();
    wrap(h(ImportBalanceModal, { opened: true, onClose: () => {} }));

    await user.type(nameBox(), "น้องนำเข้า");
    await waitFor(() => expect(phoneBox()).toBeTruthy());
    expect(document.body.textContent).toContain(en.student.parentPhone); // "(optional)"
    expect(document.body.textContent).not.toContain(en.student.parentPhoneRequiredError);

    const save = button(en.importBalance.saveAndNext);
    await waitFor(() => expect(save.disabled).toBe(false));
    await user.click(save);

    await waitFor(() => expect(importedVouchers.length).toBe(1));
    expect(importedVouchers[0].args).toMatchObject({ studentName: "น้องนำเข้า" });
    expect(importedVouchers[0].args.studentPhone).toBeUndefined();
  });
});
