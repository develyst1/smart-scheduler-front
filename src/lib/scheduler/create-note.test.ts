import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { dictionaries } from "@/lib/i18n/dictionaries";

/**
 * 🔴 TASK-320 (`TASK-284` reopened) — **the creation note was sent under the wrong NAME.**
 *
 * `CreatePlanFlow` sent the admin's typed note as `note` — the STATUS-FLOW column, where machine text like
 * *"ยกเลิกโดยแอดมิน"* lands — instead of `attendeeNote`, REQ-068/TASK-178's field, which is what the plan
 * editor's `Session note` reads and the only note any LINE message renders.
 *
 * 🔑 **Every layer was individually correct**: the BE stored it, the API client already carried `attendeeNote`,
 * the schema has had the field since TASK-178. **Only the dialog never set it** — so *"one note at creation,
 * carried onto every session"* had never once been reachable from the UI.
 *
 * ⚠️ **These assertions are on the PAYLOAD, not on state.** The defect lived entirely in the gap between a
 * component's value and the request built from it, and no test on either side could see it: each asserted its
 * own half of a boundary neither crossed. So this file reads BOTH halves and checks they use the same name.
 */
const codeOf = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const FLOW = "src/components/partials/Bookings/CreatePlanFlow.tsx";
const SERVICE = "src/services/scheduler.service.ts";
const MOCK = "src/services/scheduler.mock.service.ts";
const flow = codeOf(FLOW);
const service = codeOf(SERVICE);
const { en, th } = dictionaries;

/** The object literal actually handed to the create mutation — the wire, not the form. */
const createPayload = flow.slice(flow.indexOf("create.mutateAsync({"), flow.indexOf("notify({"));
/** The request body the service POSTs to `/courses`. */
const requestBody = service.slice(service.indexOf('api.post<CreateCoursePackageResponse>("/courses"'), service.indexOf("return data;\n};\n\n/** Generate the editable"));

describe("🔴 the typed note leaves under the name the feature reads it from", () => {
  it("the create request carries it as `attendeeNote`", () => {
    expect(createPayload).toContain("attendeeNote: note.trim() || undefined,");
  });

  it("🚫 and NOT as `note` — one box must not write two columns", () => {
    // The status flows OWN `note` and overwrite it, so a second copy would diverge from this one the moment a
    // session was cancelled. Nothing goes dark: the value moves from `BookingModal`'s grey `note` line to its
    // `attendeeNote` block above, which is the prominent one.
    expect(createPayload).not.toMatch(/(^|[^e])note: note\.trim\(\)/);
  });

  it("🔑 crosses the boundary — the service forwards the SAME name onward", () => {
    // This is the assertion that did not exist. Either half alone passes while the two disagree.
    expect(requestBody).toContain("attendeeNote: input.attendeeNote");
  });
});

describe("🔑 a note typed at creation reaches EVERY session", () => {
  const mock = codeOf(MOCK);

  it("the offline path seeds it onto each generated booking", () => {
    // The mock did not accept the field at all, so it agreed with whatever the client sent — it could show
    // neither the defect nor the fix. Now the path is exercisable offline, which is what the mocks are for.
    const create = mock.slice(mock.indexOf("export const createCoursePackage"), mock.indexOf("bookings.push(...generated);"));
    expect(create).toContain("attendeeNote?: string;");
    expect(create).toContain("attendeeNote: input.attendeeNote ?? null,");
  });

  it("and the plan editor reads that same field back", () => {
    // `Session note` in the plan editor is `attendeeNote` — the field the owner found blank, and the one that
    // worked when he typed into a single session. Same field, both directions.
    expect(codeOf("src/components/partials/Bookings/PlanModal.tsx")).toContain("attendeeNote");
    expect(en.attendeeNote.label).toBe("Session note");
  });
});

describe("§4 — the two labels now name one field, and say so", () => {
  it("the create dialog no longer calls it something else", () => {
    // Before: `Note (optional)` here, `Session note` in the editor — two names for what is now one field.
    expect(en.course.noteField).toBe("Session note (optional) — added to every session");
    expect(th.course.noteField).toBe("โน้ตของคาบ (ถ้ามี) — ใส่ให้ทุกคาบ");
  });

  it("it names the one way it differs from the per-session editor", () => {
    // Seeding ALL sessions at once is the only difference; the field is otherwise identical.
    expect(en.course.noteField).toContain("every session");
    expect(th.course.noteField).toContain("ทุกคาบ");
  });
});

describe("🚫 no backend, contract or migration change came with this", () => {
  it("the contract is untouched and nothing here writes a migration", () => {
    // The fix is not retroactive: courses created before it keep their note in `note`. That is the owner's
    // call through @Porter, not something to slip into a copy fix.
    expect(codeOf("src/types/api/contract.ts")).not.toContain("attendeeNote: input");
    expect(flow).not.toContain("migrat");
  });

  it("🚫 the plan editor's own note path is untouched — it WORKS and it proved the diagnosis", () => {
    expect(codeOf("src/hooks/scheduler/useScheduler.ts")).toContain("setAttendeeNote");
  });
});
