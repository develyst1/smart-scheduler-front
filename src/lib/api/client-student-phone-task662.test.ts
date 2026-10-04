import { describe, expect, it } from "bun:test";
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from "axios";
import type { ApiClientError } from "./client";

/**
 * 🔴 **TASK-662 — the interceptor's ONE new branch, and everything it must leave alone.**
 *
 * The interceptor runs on every request the front end makes, so Porter's condition is the proof: **a non-matching error
 * renders EXACTLY as it does today** — the server's own `message`, byte for byte, with `code`, `status` and `details`
 * carried whole. 🔑 Run through the REAL `api` instance (a stand-in adapter answers in place of the network), never a
 * copy of the logic: a test of a copy proves the copy.
 */

/**
 * 📌 The REAL module, by a specifier of its own: 18 dom tests `mock.module("@/lib/api/client")` and Bun keeps a module mock
 * for the rest of the run, so a plain import here would test whichever stand-in loaded last (seen: 10/10 alone, 0/10 in
 * the full suite). A query-suffixed specifier is a separate module instance of the same source — the interceptor as shipped.
 */
const REAL = "./client.ts?task662-real";
const { api, ApiClientError: RealApiClientError }: typeof import("./client") = await import(REAL);

const GENERIC = "ข้อมูลที่กรอกไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่อีกครั้ง";
const PHONE_SENTENCE = "นักเรียนใหม่ต้องมีเบอร์โทรผู้ปกครอง (อย่างน้อย 9 หลัก) — ถ้าเป็นนักเรียนที่มีอยู่แล้ว ให้เลือกจากรายชื่อแทน";

/** What the server answers, through the interceptor: the thrown error, exactly as every screen receives it. */
const refusal = async (status: number, error: { code: string; message: string; details?: unknown }): Promise<ApiClientError> => {
  const adapter = async (config: InternalAxiosRequestConfig) => {
    throw new AxiosError("refused", "ERR_BAD_REQUEST", config, null, {
      status,
      statusText: "",
      data: { error },
      headers: {},
      config: { ...config, headers: new AxiosHeaders() },
    });
  };
  try {
    await api.post("/x", {}, { adapter });
  } catch (e) {
    if (e instanceof RealApiClientError) return e;
    throw e;
  }
  throw new Error("the request did not refuse");
};

/** Exactly today's shape: the server's message, its code, the status and the details, untouched. */
const expectUntouched = (e: ApiClientError, status: number, error: { code: string; message: string; details?: unknown }) => {
  expect(e.message).toBe(error.message);
  expect(e.code).toBe(error.code);
  expect(e.status).toBe(status);
  expect(e.details).toEqual(error.details);
};

describe("🔴 TASK-662 — `VALIDATION` at exactly student.phone ⇒ the server's specific sentence", () => {
  it("🔑 Bob's captured shape (TASK-644): the admin reads the sentence, not the generic line — and `details` is still whole", async () => {
    const details = [{ code: "custom", path: ["student", "phone"], message: PHONE_SENTENCE }];
    const e = await refusal(400, { code: "VALIDATION", message: GENERIC, details });
    expect(e.message).toBe(PHONE_SENTENCE);
    expect(e.code).toBe("VALIDATION");
    expect(e.status).toBe(400);
    expect(e.details).toEqual(details);
  });

  it("the phone issue is found among others (zod sends every issue)", async () => {
    const details = [
      { code: "too_small", path: ["teacherId"], message: "x" },
      { code: "custom", path: ["student", "phone"], message: PHONE_SENTENCE },
    ];
    expect((await refusal(400, { code: "VALIDATION", message: GENERIC, details })).message).toBe(PHONE_SENTENCE);
  });
});

describe("🔴 TASK-662 — everything else renders EXACTLY as today (Porter's condition)", () => {
  const cases: Array<[string, number, { code: string; message: string; details?: unknown }]> = [
    ["a different code", 409, { code: "SLOT_TAKEN", message: "ช่วงเวลานี้ถูกจองแล้ว" }],
    ["a different code that also carries details", 422, { code: "DISCOUNT_REFUSED", message: "ส่วนลดไม่ถูกต้อง", details: { problems: ["a", "b"] } }],
    ["VALIDATION at a different path", 400, { code: "VALIDATION", message: GENERIC, details: [{ code: "too_small", path: ["student", "name"], message: "ชื่อสั้นไป" }] }],
    ["VALIDATION at another `phone` (not the student's)", 400, { code: "VALIDATION", message: GENERIC, details: [{ code: "custom", path: ["teacher", "phone"], message: "ไม่ใช่" }] }],
    ["VALIDATION one level deeper than student.phone", 400, { code: "VALIDATION", message: GENERIC, details: [{ code: "custom", path: ["student", "phone", "x"], message: "ไม่ใช่" }] }],
    ["VALIDATION with NO details", 400, { code: "VALIDATION", message: GENERIC }],
    ["VALIDATION with details that are not a list", 400, { code: "VALIDATION", message: GENERIC, details: { path: ["student", "phone"], message: "ไม่ใช่" } }],
    ["a student.phone issue under a code other than VALIDATION", 409, { code: "CONFLICT", message: "ขัดแย้ง", details: [{ code: "custom", path: ["student", "phone"], message: PHONE_SENTENCE }] }],
  ];
  for (const [name, status, error] of cases) {
    it(`${name} ⇒ the server's own message, byte for byte`, async () => {
      expectUntouched(await refusal(status, error), status, error);
    });
  }
});
