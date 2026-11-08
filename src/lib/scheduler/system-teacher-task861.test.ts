import { describe, expect, it } from "bun:test";
import { dtoToTeacher } from "@/lib/api/mappers";
import { systemTeacherLast, toTeacherView, withoutSystem } from "@/lib/scheduler/teacher";
import { teacherSelectData } from "@/components/common/TeacherOption";
import type { Teacher } from "@/types/app/scheduler";
import type { TeacherDTO } from "@/types/api/contract";

/**
 * TASK-861 (REQ-120 F5) — the system teacher ("No Teacher") is read by its FLAG, never its name, and is OUT of every lesson list.
 * These pin the pure half of that rule; the hook and the pickers that use it are pinned in `use-teachers-system-task861.dom.test.tsx`.
 */
const coach = (id: string, over: Partial<Teacher> = {}): Teacher => ({ id, name: id, nickname: id, type: "FULL_TIME", subjects: [], active: true, ...over });
const SYS = coach("sys", { nickname: "No Teacher", type: "FREELANCE", isSystem: true });

describe("withoutSystem / systemTeacherLast", () => {
  it("drops the flagged teacher and nothing else — a coach NAMED 'No Teacher' without the flag stays", () => {
    const lookalike = coach("x", { nickname: "No Teacher" });
    expect(withoutSystem([coach("a"), SYS, lookalike]).map((t) => t.id)).toEqual(["a", "x"]);
  });
  it("puts the system teacher after every real coach, whatever the input order", () => {
    expect(systemTeacherLast([SYS, coach("a"), coach("b", { type: "FREELANCE" })]).map((t) => t.id)).toEqual(["a", "b", "sys"]);
  });
  it("can leave it out (showSystem = false)", () => {
    expect(systemTeacherLast([SYS, coach("a")], false).map((t) => t.id)).toEqual(["a"]);
  });
});

describe("the DTO and the view", () => {
  const dto: TeacherDTO = { id: "sys", name: "No Teacher", nickname: "No Teacher", type: "FREELANCE", active: true, subjects: [], lineLinked: false, workDays: [] };
  it("maps isSystem, and an older payload without it reads false", () => {
    expect(dtoToTeacher({ ...dto, isSystem: true }).isSystem).toBe(true);
    expect(dtoToTeacher(dto).isSystem).toBe(false);
  });
  it("the system teacher is bookable while active, even with no budget set up (a Freelance with none is not)", () => {
    expect(toTeacherView({ ...SYS, setupIncomplete: true }, []).bookable).toBe(true);
    expect(toTeacherView({ ...SYS, setupIncomplete: true, active: false }, []).bookable).toBe(false);
    expect(toTeacherView(coach("f", { type: "FREELANCE", setupIncomplete: true }), []).bookable).toBe(false);
  });
});

describe("the picker label", () => {
  it("prints no type after 'No Teacher' (it has none); a coach keeps hers", () => {
    expect(teacherSelectData([SYS, coach("a")]).map((o) => o.label)).toEqual(["No Teacher", "a · Full-time"]);
  });
});
