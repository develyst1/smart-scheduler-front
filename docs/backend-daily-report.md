# Daily report — สิ่งที่ backend ต้องปรับ (`GET /reports/daily`)

> สำหรับทีม **smart-scheduler-back** · ฝั่ง FE ทำเสร็จแล้ว (branch `Palm`) · อัปเดต 2026-10-17 (เพิ่ม §10 Others Program)
>
> ไฟล์อ้างอิงฝั่ง FE:
> - นิยามตัวเลขทั้งหมด (source of truth ฝั่ง FE): [`src/lib/scheduler/daily-report.ts`](../src/lib/scheduler/daily-report.ts)
> - Type ที่หน้าจอใช้: `DailyReport` ใน [`src/types/app/scheduler/index.ts`](../src/types/app/scheduler/index.ts)
> - API contract: `DailyReportResponse` ใน [`src/types/api/contract.ts`](../src/types/api/contract.ts)
> - การเรียก API + fallback: `getDailyReport` ใน [`src/services/scheduler.service.ts`](../src/services/scheduler.service.ts)
>
> ⚠️ **เอกสารนี้เขียนจากมุม FE** — ชื่อ status, รูปแบบข้อมูล และพฤติกรรมของ endpoint ที่อ้างถึง มาจากสิ่งที่ FE เห็น
> ก่อน implement ให้ **ตรวจสอบกับ backend จริงตาม §9** ถ้าไม่ตรง แจ้ง FE ก่อนแก้
>
> 🖥️ **UI ทำเสร็จแล้วและ client เลือกดีไซน์แล้ว** — response ต้องออกแบบให้ **ตรงกับ UI เดิม (§1.1)** ไม่ใช่ให้ UI ปรับตาม API
> ถ้าจำเป็นต้องเปลี่ยน shape / ชื่อ field / ความหมาย ให้คุยกับ FE ก่อน

---

## 1. สรุปสั้น

| # | เรื่อง | Backend ต้องทำ |
|---|--------|----------------|
| 1 | นิยาม stat ทั้ง 7 ตัวเปลี่ยน (ดู §2) | คำนวณใหม่ตามตาราง status → stat (จุดที่ยังไม่ชัด ดูคำถาม §7) |
| 2 | **นับเฉพาะคาบเรียน** (lesson) | ทุก stat นับแค่ `FIRST_TRIAL` / `SINGLE_SESSION` / `COURSE_PACKAGE` / `VOUCHER` — **ไม่นับ** Group (`OTHER`: ECA/Free/KOL/CAMP, `GROUP`) |
| 3 | Field ใหม่ `confirmed`, `awaiting` | เพิ่มใน response |
| 4 | "By booking type" แยกเป็น 2 แถว (ดู §3) | เพิ่ม `byBookingTypeAttended`, `byBookingTypeConfirmed` |
| 5 | Workload ต่อครู (ดู §4) | เพิ่ม `byTeacher[]` มี `count` / `attended` / `total` |
| 6 | Filter ครู | รับ query `teacherId` แล้วใช้กับ **ทุก** ตัวเลข |
| 7 | สถานะ `PENDING_RESCHEDULE` ถูกถอดแล้ว (UC-006) | ไม่ต้องส่ง `reschedulePending` อีก — แทนด้วย `awaiting` |
| 8 | **ใหม่ (2026-10-17)** Section "Others Program" (ดู §10) | เพิ่ม `kidsByProgram[]` — จำนวนเด็กของ Group / ECA / Camp / Other แยกตามชื่อ |

### 1.1 UI ที่ทำไปแล้ว — ยึดตามนี้

หน้า **Daily report** (`/scheduler/reports`, [`ReportsContent.tsx`](../src/components/partials/Reports/ReportsContent.tsx)) เรียงจากบนลงล่าง ทุก field ใน response มีที่แสดงผลแน่นอนแล้ว:

| ส่วนของหน้า | แสดงอะไร | Field ที่ใช้ |
|-------------|----------|---------------|
| Filter | วันที่ + ครู (`All teachers` หรือรายคน) | query `date`, `teacherId` |
| วงกลม % | อัตรามาเรียน + `attended/totalBooked` ใต้วง | `attendanceRate`, `attended`, `totalBooked` |
| Stat cards 7 ใบ (เรียงตามนี้) | Total booked · Attended · Confirmed · Pending · Awaiting · On leave · Cancelled | `totalBooked`, `attended`, `confirmed`, `pending`, `awaiting`, `onLeave`, `cancelled` |
| By booking type (Attended) | chip ประเภท + จำนวน 4 ช่อง เรียงตามลำดับที่ส่งมา | `byBookingTypeAttended` |
| By booking type (Confirmed) | เหมือนกัน | `byBookingTypeConfirmed` |
| Others Program | การ์ดละโปรแกรม (Group · ECA · Camp · Other) — หัวการ์ด: ชื่อโปรแกรม + ยอดเด็กรวม (ตัวเลขเปล่า ไม่มีหน่วย) · ด้านใน: `ชื่อ … จำนวนเด็ก` ทีละบรรทัด · **แสดงครบ 4 การ์ดเสมอ** — โปรแกรมที่ไม่มีงานในวันนั้นแสดง "—" | `kidsByProgram[]` (§10) |
| Sessions per teacher (workload) | tile ต่อครู: ชื่อ + ประเภทครู → ช่องซ้าย **Attended / Confirmed** (`2/6`) · ช่องขวา **Total (+Group)** (`7`) — **แสดงเฉพาะตอนเลือก All teachers** | `byTeacher[]` (`attended`, `count`, `total`) |

ข้อกำหนดจาก UI ที่ backend ต้องรักษา:
- ชื่อ field ตาม §5 ตรงตัว — FE map ตรงเข้าการ์ดโดยไม่แปลง
- ตัวเลขทุกตัวเป็น **จำนวนเต็ม** (`attendanceRate` เป็น % ปัดแล้ว 0–100)
- `byBookingType*` ส่งครบ 4 ประเภทเสมอ — UI แสดงทุกช่อง รวมช่องที่เป็น 0
- `byTeacher` ส่งแค่ `teacherId` — ชื่อและประเภทครู FE ดึงจากรายชื่อครูเอง ไม่ต้องส่งมา
- ลำดับใน `byTeacher` = ลำดับ tile บนหน้าจอ (FE ไม่เรียงใหม่)
- ไม่มีการ์ด "Awaiting parent (move)" แล้ว — ไม่ต้องส่ง `reschedulePending`
- `kidsByProgram` เรียงโปรแกรม `GROUP, ECA, CAMP, OTHER` และลำดับ `items` = ลำดับบรรทัดบนการ์ด (FE ไม่เรียงใหม่) · จำนวนเด็กที่ไม่ได้บันทึกส่ง `null` (FE แสดง "—")

---

## 2. นิยาม stat (การ์ด 7 ใบด้านบน)

ทุกตัวนับเฉพาะ **lesson rows** ของวัน `date` (และครู `teacherId` ถ้าส่งมา), ไม่นับแถว `pendingSlot`

| Stat (UI) | Field | ความหมาย (จาก client) | Status ที่นับ |
|-----------|-------|------------------------|----------------|
| Total booked | `totalBooked` | จองมาเรียนทั้งหมดกี่คน | ทุก status ยกเว้น `CANCELLED` — การนับ `PAUSED` ดู **Q5** |
| Attended | `attended` | มาเรียนจริงทั้งหมด — **ยังนับอยู่ใน Confirmed** (ไม่หักออก) · ไม่นับ Group (ECA/CAMP) | `ATTENDED` |
| Confirmed | `confirmed` **(ใหม่)** | คอนเฟิร์มมาเรียน — ถ้าแจ้งลาให้เอาออก | `CONFIRMED` + `ATTENDED` — `NO_SHOW` ดู **Q1** |
| Pending | `pending` | ยังไม่โอน / ยังไม่คอนเฟิร์ม | `PENDING` — `EXTENDED` ดู **Q2** |
| Awaiting | `awaiting` **(ใหม่)** | Pause คลาส 1st / 1HR ที่เลื่อนและรอลงตารางใหม่ | `PAUSED` และ `bookingType ∈ {FIRST_TRIAL, SINGLE_SESSION}` และ **วันที่เดิม** ของคลาส (`date`) = วันของ report — ประเภทอื่น ดู **Q4** |
| On leave | `onLeave` | ลา — และ **ไม่อยู่ใน Confirmed** | `SICK_LEAVE` |
| Cancelled | `cancelled` | คลาสที่ยกเลิก | `CANCELLED` |

ความสัมพันธ์ที่ต้องเป็นจริงเสมอ (ใช้เขียน test ได้):

```
attended ≤ confirmed            // Attended ไม่ถูกหักออกจาก Confirmed
onLeave ∉ confirmed             // ลาแล้วไม่นับเป็น Confirmed
cancelled ∉ totalBooked
```

`attendanceRate` (วงกลม %) = `round(attended / totalBooked × 100)` — client ยืนยันแล้วว่าใช้สูตรนี้

---

## 3. By booking type — แยกเป็น 2 แถว

เดิมมีแถวเดียว (`byBookingType` = ทุก booking ที่ไม่ยกเลิก) → ตอนนี้ UI แสดง 2 แถว:

| แถว (UI) | Field | นับ |
|----------|-------|-----|
| By booking type (Attended) | `byBookingTypeAttended` | `attended` แยกตามประเภท |
| By booking type (Confirmed) | `byBookingTypeConfirmed` | `confirmed` แยกตามประเภท (รวม ATTENDED, ไม่รวมลา) |

กติกา shape:
- ส่ง **ครบ 4 ประเภท** เรียง `FIRST_TRIAL, SINGLE_SESSION, COURSE_PACKAGE, VOUCHER` แม้ count = 0 (FE render ตามลำดับที่ได้)
- ผลรวมแต่ละแถวต้องเท่ากับ `attended` / `confirmed` ตามลำดับ
- `byBookingType` เดิมเลิกใช้แล้ว — จะคงไว้หรือลบก็ได้

---

## 4. Workload ต่อครู (`byTeacher`)

UI เปลี่ยนจาก progress bar เป็น tile ต่อครู แสดง `attended/count` และ "Total (+Group)"

```ts
byTeacher: Array<{
  teacherId: string;
  count: number;    // confirmed ของครูคนนี้ (นิยามเดียวกับ §2) → ตัวหารของ "Attended / Confirmed"
  attended: number; // ATTENDED ของครูคนนี้ (lesson เท่านั้น)
  total: number;    // งานทั้งหมดของครูวันนั้น: lesson + OTHER (ECA/Free/KOL/CAMP) + GROUP — ไม่นับ CANCELLED (หน่วยนับ ดู Q3, status ที่นับ ดู Q6)
}>
```

- เรียงตาม `total` มาก → น้อย (เท่ากันเรียงตาม `count`)
- ใส่ทุกครูที่มีแถวอย่างน้อย 1 แถว — ครูที่มีแต่งานกลุ่มก็ต้องมี (`count: 0, attended: 0, total: N`)
- ตัวอย่าง UI: `2/6` + `Total (+Group): 7` → attended 2, confirmed 6, รวม ECA/Camp แล้ว 7

**สองเรื่องที่ FE ทำเองไม่ได้ ต้องเป็น backend:**
1. แถว ECA / `OTHER` ที่มี **ครูหลายคน** ต้องนับให้ **ทุกครู** ที่ถูก assign — FE เห็นแค่ `teacherId` หลักของแถว
2. `GROUP` นับแถวกลุ่ม **ครั้งเดียวต่อครู** — ห้ามนับ seat booking ที่ซ่อนอยู่ใต้กลุ่ม

---

## 5. API contract ที่ต้องการ

**Request**

```
GET /api/reports/daily?date=2026-10-12
GET /api/reports/daily?date=2026-10-12&teacherId=t-arm   ← ใหม่: filter ทุก counter
```

**Response** (field ใหม่ทำเครื่องหมาย ★)

```jsonc
{
  "date": "2026-10-12",
  "totalBooked": 14,
  "attended": 5,
  "confirmed": 10,          // ★
  "pending": 3,
  "awaiting": 1,            // ★  ← FE ใช้ field นี้เป็นตัวบอกว่า backend ใช้ contract ใหม่แล้ว
  "onLeave": 1,
  "cancelled": 2,
  "attendanceRate": 36,     // optional — FE ใช้ค่านี้ถ้าส่งมา
  "byBookingType": [ ... ], // legacy, ไม่ใช้แล้ว
  "byBookingTypeAttended": [  // ★
    { "type": "FIRST_TRIAL", "count": 1 },
    { "type": "SINGLE_SESSION", "count": 0 },
    { "type": "COURSE_PACKAGE", "count": 3 },
    { "type": "VOUCHER", "count": 1 }
  ],
  "byBookingTypeConfirmed": [ // ★
    { "type": "FIRST_TRIAL", "count": 2 },
    { "type": "SINGLE_SESSION", "count": 1 },
    { "type": "COURSE_PACKAGE", "count": 5 },
    { "type": "VOUCHER", "count": 2 }
  ],
  "byTeacher": [              // ★
    { "teacherId": "t-arm", "count": 6, "attended": 2, "total": 7 },
    { "teacherId": "t-cat", "count": 3, "attended": 0, "total": 6 },
    { "teacherId": "t-bee", "count": 1, "attended": 1, "total": 1 }
  ],
  "kidsByProgram": [          // ★ (§10)
    { "program": "GROUP", "total": 3,  "items": [{ "name": "Balance Play", "kids": 3 }] },
    { "program": "ECA",   "total": 13, "items": [{ "name": "STA", "kids": 5 }, { "name": "ISB", "kids": 8 }] },
    { "program": "CAMP",  "total": 8,  "items": [{ "name": "October Camp W2", "kids": 8 }] },
    { "program": "OTHER", "total": 10, "items": [{ "name": "Birthday", "kids": 8 }, { "name": "Rent park", "kids": 2 }] }
  ]
}
```

> `attendanceRate` ส่งหรือไม่ส่งก็ได้ — ถ้าไม่ส่ง FE คำนวณ `attended / totalBooked` เอง

---

## 6. ข้อมูลที่ FE ใช้ตอนนี้ (fallback) และการสลับมาใช้ backend

**ตอนนี้** (`/reports/daily` ยังไม่มี `awaiting`) FE **ไม่ใช้ตัวเลขจาก server เลย** แล้วคำนวณเองทั้งหมดด้วย `summarizeDailyReport` จาก:

| ข้อมูล | Endpoint | ใช้ทำอะไร |
|--------|----------|-----------|
| แถวทั้งวัน (รวมที่ยกเลิก) | `GET /calendar?date=…&view=day&includeCancelled=true` | ทุก stat ยกเว้น Awaiting, By booking type, Workload |
| แถวที่ Pause | `GET /bookings?status=PAUSED&from=…&to=…&teacherId=…&limit=200` | Awaiting (เพราะ PAUSED ไม่อยู่บนปฏิทิน) |

เหตุที่ไม่ผสมตัวเลข server กับ FE: เลขเดิมของ server ใช้นิยามเก่า และ **ไม่รับ `teacherId`** — ถ้าผสม พอเลือกครู การ์ด On leave / Cancelled จะยังเป็นยอดรวมทุกครู (bug เดิม)

**การสลับ (switch-over):** ทันทีที่ response มี field `awaiting` → FE ถือว่าทั้ง payload เป็น contract ใหม่และ render ตามที่ส่งมาตรงๆ (ไม่ยิง `/calendar` และ `/bookings` แล้ว) → **ต้องส่ง field ใหม่ทั้งหมดพร้อมกันใน release เดียว**

หลัง backend ship แล้ว FE จะลบ fallback ใน `getDailyReport` ออก

---

## 7. คำถามสำหรับ backend / client

ข้อเหล่านี้ **ยังไม่ได้ตัดสิน** — ไม่ได้ใส่เป็น spec ใน §2–§4 ช่วยตอบ (หรือถาม client คุณฟีน) ก่อน implement ส่วนที่เกี่ยวข้อง
พอได้คำตอบแล้วแจ้ง FE เพื่ออัปเดต `src/lib/scheduler/daily-report.ts` ให้ตรงกัน (ตอนนี้ FE ใส่ค่าชั่วคราวไว้ในไฟล์นั้น)

### Q1 — `NO_SHOW` นับเป็น Confirmed ไหม?
ตัวเลือก: นับเป็น Confirmed / แยกเป็น stat ของตัวเอง / ไม่นับเลย

**ทำไมถาม:** ระบบมีสถานะ `NO_SHOW` = คอนเฟิร์มแล้วแต่ไม่มาเรียน และยังตัดคาบ นิยามที่ client ให้มาพูดถึงแค่ "มาเรียน" (Attended) กับ "ลา" (On leave) ซึ่ง NO_SHOW ไม่ใช่ทั้งสองอย่าง ถ้าไม่ระบุ backend กับ FE อาจนับไม่ตรงกัน และมีผลกับ:
- ตัวหาร `attended/confirmed` ใน workload ของครู — นับ NO_SHOW ด้วย ครูจะดู "มาไม่ครบ" เช่น 5/6
- ถ้าไม่นับในการ์ดไหนเลย ผลรวมการ์ดจะไม่เท่ากับ Total booked

### Q2 — `EXTENDED` นับเป็น Pending หรือ Confirmed?
**ทำไมถาม:** `EXTENDED` คือคาบชดเชยที่ระบบต่อท้ายให้อัตโนมัติหลังนักเรียนลา ในระบบตอนนี้ต้องกดคอนเฟิร์มเหมือน `PENDING` (จึงเข้ากับ "ยังไม่คอนเฟิร์ม") แต่ลูกค้า **จ่ายเงินแล้ว** เพราะมาจากแพ็กเกจเดิม (จึงไม่เข้ากับ "ยังไม่โอน") นิยาม Pending ของ client มีทั้งสองความหมาย เลยจัดให้ลงช่องไหนไม่ได้ชัด

### Q3 — หน่วยของ Workload `total`: ชั่วโมง หรือจำนวนคาบ/กิจกรรม?
ตัวเลือก: ชั่วโมง/แถว (Camp 10:00–15:00 = 5) / จำนวนคาบหรือกิจกรรม (Camp 1 วัน = 1)

**ทำไมถาม:** ข้อมูล Camp ถูกเก็บเป็น **1 แถวต่อ 1 ชั่วโมง** แต่ ECA และคาบเรียนปกติเป็น 1 แถวต่อคาบ ตัวอย่างของ client "Total (+Group): 7" ไม่ได้บอกหน่วย ถ้านับเป็นแถว ครูที่คุม Camp จะมีตัวเลขสูงกว่าครูคนอื่นมาก ซึ่งอาจถูก (ถ้าดูเป็นชั่วโมงทำงาน/จ่ายเงิน Freelance ตามชั่วโมง) หรือผิด (ถ้าดูเป็นจำนวนงาน)

### Q4 — Awaiting ควรรวมคาบ `VOUCHER` ที่ถูก Pause ด้วยไหม?
**ทำไมถาม:** client ระบุ Awaiting = "คลาส 1st / 1HR" แต่ปุ่ม Pause รายคาบในระบบ (`PAUSABLE_BOOKING_TYPES`) เปิดให้ 3 ประเภท คือ `FIRST_TRIAL`, `SINGLE_SESSION` **และ `VOUCHER`** ถ้าไม่รวม คาบ voucher ที่ถูก Pause ในวันนั้นจะ **ไม่ปรากฏในการ์ดไหนเลย** (ไม่อยู่ทั้งใน Total booked และ Awaiting) อยากยืนยันว่าตั้งใจแบบนั้น
(`COURSE_PACKAGE` ไม่เกี่ยว — คอร์สใช้การพักทั้งคอร์สซึ่งเป็นอีกกลไกหนึ่ง)

### Q5 — Total booked ควรรวมคลาสที่ Pause (Awaiting) ไหม?
**ทำไมถาม:** คลาสที่ Pause ยังเก็บวันที่เดิมไว้ ในแง่ "จองมาเรียนทั้งหมดกี่คน" ก็นับว่าเคยจองวันนั้น แต่ตอนนี้เด็กไม่ได้มาแล้ว ถ้ารวม:
- วงกลม Attendance rate (`attended / totalBooked`) จะต่ำลงจากเด็กที่ไม่ได้มาแน่นอน
- Total booked จะไม่เท่ากับคลาสที่เห็นบนปฏิทินของวันนั้น

ส่วน Cancelled ไม่ถามเพราะ client แยกเป็นการ์ดของตัวเองชัดเจนแล้ว

### Q6 — Workload `total` ควรนับแถว `PENDING` / `SICK_LEAVE` ด้วยไหม?
ตัวเลือก: นับทุกแถวที่ไม่ยกเลิก / นับเฉพาะงานที่ครูต้องสอนจริง (คอนเฟิร์มแล้ว + มาเรียนแล้ว + งานกลุ่ม)

**ทำไมถาม:** "Total (+Group)" สื่อว่าเป็นภาระงานของครู แต่ถ้านักเรียน **ลา** ครูไม่ได้สอนชั่วโมงนั้น และคาบ **PENDING** อาจไม่เกิดขึ้นจริง ถ้านับรวมจะทำให้ workload สูงเกินจริง ซึ่งสำคัญกับครู Freelance ที่จ่ายเงินตามชั่วโมงที่สอนจริง

---

## 8. Test cases แนะนำ (backend)

ข้อมูลวันเดียว ครู A, lesson rows:
`CONFIRMED×2, ATTENDED×2, PENDING×1, SICK_LEAVE×1, CANCELLED×1`
+ `PAUSED` SINGLE_SESSION ×1 (วันที่เดิม = วันนี้)
+ ECA (`OTHER`) 2 แถว, CAMP 3 แถว (ครู A)

| Field | Expected |
|-------|----------|
| attended | 2 |
| confirmed | 4 |
| pending | 1 |
| awaiting | 1 |
| onLeave | 1 |
| cancelled | 1 |
| totalBooked | ขึ้นกับคำตอบ Q5 |
| byTeacher[A] | `count: 4, attended: 2` · `total` ขึ้นกับ Q3 / Q6 |

เพิ่ม:
- `?teacherId=B` → ทุก counter เป็นของครู B เท่านั้น
- `PAUSED` SINGLE_SESSION ที่วันที่เดิมเป็น **เมื่อวาน** → ไม่นับใน `awaiting` ของวันนี้
- ECA ที่ assign ครู A + B → `total` ของทั้งสองคนเพิ่มขึ้นทั้งคู่
- GROUP 1 แถวที่มี 4 seats → นับเป็นงานกลุ่ม 1 รายการของครู (ไม่ใช่ 4 หรือ 5)
- เคส `NO_SHOW` / `EXTENDED` / Pause คาบ voucher — เพิ่มหลังได้คำตอบ Q1 / Q2 / Q4

---

## 9. สิ่งที่ backend ต้องตรวจสอบก่อนและหลัง implement

เอกสารนี้อ้างอิงจาก type และพฤติกรรมที่ FE เห็น **ยังไม่ได้ตรวจกับ code / database ฝั่ง backend** — ทีม backend ช่วยเช็คข้อด้านล่างก่อนลงมือ ข้อไหนไม่ตรงให้แจ้ง FE เพราะจะกระทบนิยามใน §2–§4 และ fallback ใน `daily-report.ts`

### 9.1 ก่อน implement — ข้อมูลและ status
- [ ] Status ที่อ้างถึงมีจริงใน enum / DB และความหมายตรงกัน: `PENDING`, `CONFIRMED`, `ATTENDED`, `NO_SHOW`, `SICK_LEAVE`, `EXTENDED`, `PAUSED`, `CANCELLED`
- [ ] `PENDING_RESCHEDULE` ถูกถอดออกจริงแล้ว (UC-006) — ไม่มีแถวค้างใน DB ที่ยังใช้สถานะนี้
- [ ] คลาสที่ `PAUSED` ยังเก็บ `date` เดิมไว้จริง (Awaiting ใช้วันที่นี้ผูกกับวันของ report)
- [ ] Booking type ของงานกลุ่ม: ECA / Free / KOL / CAMP เป็น `OTHER` (แยกด้วย `other.kind`) และ DUO/Group เป็น `GROUP` — ไม่มีประเภทอื่นที่ต้องนับเป็น "Group" เพิ่ม
- [ ] Camp เก็บ **1 แถวต่อ 1 ชั่วโมง** จริงไหม (เกี่ยวกับ Q3)
- [ ] ECA / `OTHER` ที่มีครูหลายคน เก็บครูแต่ละคนไว้ที่ไหน (ตาราง join?) — ใช้นับ `byTeacher` ให้ทุกครู
- [ ] Seat ของ `GROUP` แยกจากแถวกลุ่มยังไง — ต้องไม่ถูกนับซ้ำใน stat และ workload
- [ ] แถว `pendingSlot` คืออะไรในฝั่ง backend และควรตัดออกจากทุก counter จริงไหม
- [ ] `/reports/daily` ตอนนี้นับอะไรอยู่ (นิยามเดิม) — มีหน้าอื่นหรือ client อื่นใช้ endpoint นี้อีกไหม ถ้ามี การเปลี่ยนนิยามจะกระทบที่นั่นด้วย
- [ ] Timezone ของ `date` — ใช้วันตามเวลาไทย (Asia/Bangkok) ไม่ใช่ UTC

### 9.2 ก่อน implement — endpoint ที่ FE fallback ใช้อยู่
FE คำนวณเองจาก 2 endpoint นี้ระหว่างรอ ช่วยยืนยันว่าพฤติกรรมเป็นแบบที่ FE เข้าใจ (ถ้าไม่ ตัวเลขบนหน้าจอตอนนี้ผิด):
- [ ] `GET /calendar?view=day&includeCancelled=true` คืนแถว `CANCELLED` ของวันนั้นมาด้วย และคืนทั้งคาบเรียน + `OTHER` + `GROUP` + Camp
- [ ] `GET /calendar` **ไม่** คืนแถว `PAUSED`
- [ ] `GET /bookings?status=PAUSED&from=…&to=…` กรอง `from`/`to` ด้วยวันที่ของคาบ (`date`) ไม่ใช่วันที่สร้าง booking
- [ ] `GET /bookings` รับ `teacherId` เป็น filter

### 9.3 หลัง implement — ตรวจผลลัพธ์
- [ ] เปิดหน้า Daily report จริงแล้วทุกส่วนใน §1.1 แสดงครบ ไม่มีช่องว่าง / `undefined` / `NaN` ทั้งตอนเลือก All teachers และเลือกครูรายคน
- [ ] ผ่าน test cases ใน §8 และความสัมพันธ์ใน §2 (`attended ≤ confirmed`, ลาไม่อยู่ใน confirmed, ยกเลิกไม่อยู่ใน totalBooked)
- [ ] ผลรวม `byBookingTypeAttended` = `attended` และผลรวม `byBookingTypeConfirmed` = `confirmed`
- [ ] เลือกวันที่มีข้อมูลจริงหลายแบบ แล้ว **เทียบตัวเลขจาก backend กับ FE fallback** วันเดียวกัน — ต้องตรงกัน (ยกเว้น workload ของ ECA หลายครู ซึ่ง backend ต้องถูกกว่า) วิธีเทียบ: เปิดหน้า Daily report ก่อน deploy (ใช้ fallback) จดตัวเลข แล้วเทียบกับ response ใหม่
- [ ] `?teacherId=` กรองทุก counter รวม `onLeave` / `cancelled` / `awaiting`
- [ ] ส่ง field ใหม่ **ครบทุกตัวพร้อมกัน** — FE สลับมาใช้ตัวเลข backend ทันทีที่เห็น `awaiting` (§6) ถ้าส่งไม่ครบ หน้าจอจะพัง
- [ ] Performance: 1 request ต่อการเปลี่ยนวัน/ครู — query ไม่ควรช้ากว่า `/calendar` แบบ day
- [ ] แจ้ง FE เมื่อ deploy แล้ว เพื่อลบ fallback ใน `getDailyReport` และอัปเดต `daily-report.ts` ตามคำตอบของ §7 และ §10.4

---

## 10. Others Program — section ใหม่ (เพิ่ม 2026-10-17)

> field ใน API ยังชื่อ `kidsByProgram` (นับจำนวนเด็กตามโปรแกรม) — ชื่อ "Others Program" เป็นแค่หัวข้อบนหน้าจอ

### 10.1 ความต้องการจาก client
นับ **จำนวนเด็ก** (ไม่ใช่จำนวนคาบ) ของงานกลุ่มในวันนั้น แยก 4 โปรแกรม:

| โปรแกรม | client ต้องการ | ตัวอย่าง |
|---------|-----------------|----------|
| Group | ชื่อตาราง / จำนวนเด็ก | Balance Play = 3 kids |
| ECA | นับเป็นโรงเรียน / จำนวนเด็ก | STA = 5, ISB = 8 kids |
| Camp | จำนวนเด็กในแต่ละวัน | Camp = 8 kids |
| Other | ตารางอื่นๆ ที่ลงไว้ — ชื่อตาราง (Title) / จำนวนเด็ก | Birthday = 8 kids, Rent park = 2 kids |

UI (ทำเสร็จแล้ว, client เลือกแบบ "4 การ์ดตามโปรแกรม"): section ชื่อ **"Others Program"** · การ์ดละโปรแกรม หัวการ์ด = ชื่อโปรแกรม + ยอดเด็กรวม, ด้านใน = รายการ `ชื่อ … จำนวนเด็ก` — **ตัวเลขไม่มีหน่วย** (ไม่แสดงคำว่า kids ตาม client) — อยู่ใต้ By booking type ทั้งสองแถว เหนือ workload

> ✅ **ข้อมูลตัวอย่างถูกลบแล้ว (2026-10-21):** backend ส่ง `kidsByProgram` ตั้งแต่ 19 ต.ค. — FE เอา `SHOW_SAMPLE_WHEN_EMPTY` / `SAMPLE_PROGRAMS` ออกแล้ว วันที่ไม่มีเด็กโปรแกรม (หรือเลือกครูที่ไม่มีคลาสโปรแกรม) แสดงการ์ดครบ 4 ใบเป็น "—"

### 10.2 ข้อมูลที่ใช้ (mapping ที่ FE ใช้ — backend ช่วยยืนยันใน §9)

| โปรแกรม | แถวที่นับ | ชื่อ (`name`) | จำนวนเด็ก (`kids`) |
|---------|-----------|---------------|---------------------|
| `GROUP` | `bookingType = GROUP` | `displayName` (ชื่อกลุ่ม) | จำนวน seat ของกลุ่ม (`group.seats.length`) |
| `ECA` | `bookingType = OTHER` และ `other.kind = ECA` | `displayName` (= title ที่แอดมินพิมพ์ = ชื่อโรงเรียน) | `other.headCount` |
| `CAMP` | แถว camp (`OTHER` + `other.kind = CAMP` + `campWeekDayId`) | `displayName` | `campKidCount` ของวันนั้น |
| `OTHER` | `bookingType = OTHER` ที่ไม่ใช่ ECA / CAMP (`FREE`, `KOL`, ไม่ระบุ) | `displayName` (title) | `other.headCount` |

### 10.3 กติกาการนับ
- ไม่นับแถว `CANCELLED` และ `PAUSED`
- 1 booking นับครั้งเดียว แม้มีครูหลายคน (ECA ที่มี 2 ครู ≠ 2 เท่า)
- **Camp:** `campKidCount` ซ้ำอยู่ทุกชั่วโมงของวันเดียวกัน → นับ **ครั้งเดียวต่อ camp day** (`campWeekDayId`) ห้ามคูณจำนวนชั่วโมง
- จำนวนเด็กที่ไม่ได้บันทึก (`headCount` ว่าง / กลุ่มไม่มีข้อมูล seat) → `null` ไม่ใช่ `0` · ยอดรวม: `null + n = n`, ถ้าทุกรายการเป็น `null` ยอดรวม = `null`
- **ส่งครบ 4 โปรแกรมเสมอ** เรียง `GROUP, ECA, CAMP, OTHER` (client ต้องการเห็น 4 การ์ดตายตัว) · โปรแกรมที่ไม่มีงานในวันนั้นส่ง `{ "program": "ECA", "total": null, "items": [] }` → UI แสดง "—" (FE เติมให้ครบ 4 เองด้วยถ้าขาด แต่ขอให้ backend ส่งครบ) · ระหว่างนี้ถ้าทุกโปรแกรมว่าง FE แสดงข้อมูลตัวอย่างแทน ดู §10.1
- `?teacherId=` ใช้กรอง section นี้ด้วย (นับงานที่ครูคนนั้นอยู่ในรายชื่อครู — รวม ECA หลายครู)

### 10.4 ค่าที่ FE ใช้ไปก่อน — ยังไม่ได้ยืนยันกับ client
client ยังไม่ได้ตอบข้อเหล่านี้ FE ใช้ค่าด้านล่างไปก่อน ถ้าคำตอบต่างจากนี้ แก้ทั้ง backend และ `kidsByProgram` ใน `src/lib/scheduler/daily-report.ts`

- **K1 — ชื่อเดียวกันหลายรอบในวันเดียว** (เช่น ECA STA รอบเช้า 5 คน รอบบ่าย 6 คน) → FE **รวมเป็นรายการเดียว (11)**
  - *ทำไมถาม:* ถ้าเป็นเด็กชุดเดียวกันมาสองรอบ การรวมจะนับเด็กซ้ำ (จริงๆ 6 คน) แต่ถ้าเป็นคนละชุดการแยกแสดงจะชัดกว่า ระบบไม่มีข้อมูลรายชื่อเด็กของ ECA/Other (มีแค่ตัวเลข) จึงแยกเองไม่ได้ — Group เท่านั้นที่มีรายชื่อ seat
- **K2 — เลือกครูรายคน** → FE **กรองตามครู**
  - *ทำไมถาม:* section นี้อาจตั้งใจให้เห็นภาพรวมเด็กทั้งศูนย์ไม่ว่าเลือกครูไหน ถ้ากรอง ECA ที่มีหลายครูจะขึ้นในทุกครูที่สอน
- **K3 — ยอดรวมต่อโปรแกรม** (หัวการ์ด) → FE **แสดง** · ยอดรวมทั้งหมดทุกโปรแกรม → **ไม่แสดง**
  - *ทำไมถาม:* ตัวอย่างของ client ไม่มียอดรวม และยอดรวมข้ามโปรแกรมอาจนับเด็กคนเดียวกันซ้ำ (เด็กคนเดียวอยู่ทั้ง Group และ Camp)
- **K4 — ไม่ได้กรอกจำนวนเด็ก** → FE **แสดง "—"**
  - *ทำไมถาม:* `headCount` เป็น field ที่ไม่บังคับกรอก ถ้าแสดง 0 จะดูเหมือนไม่มีเด็กมา ซึ่งต่างจาก "ไม่ได้บันทึก"

### 10.5 Checklist backend (เพิ่มจาก §9)
- [ ] ยืนยัน mapping ใน §10.2: ชื่อโรงเรียนของ ECA อยู่ใน `title` จริง (ไม่มี field โรงเรียนแยก) · `headCount` คือจำนวนเด็ก · seat ของ GROUP ไม่รวมคนที่ยกเลิก/ลา
- [ ] `campKidCount` เป็นค่าต่อวันจริง (เหมือนกันทุกชั่วโมง) — และถ้าวันเดียวมี camp มากกว่า 1 week ให้แยกตามชื่อ
- [ ] Test: ECA STA 2 รอบ (5, 6) + ISB 8 → `ECA total 19, items [STA 11, ISB 8]` (ตาม K1 ปัจจุบัน)
- [ ] Test: Camp 5 ชั่วโมง `campKidCount = 8` → `CAMP total 8` (ไม่ใช่ 40)
- [ ] Test: ECA 1 แถวที่มี 2 ครู → นับ 1 ครั้ง · `?teacherId=` ครูคนที่ 2 ก็ต้องเห็นรายการนี้
- [ ] Test: Other ที่ `headCount` ว่าง → `kids: null`
- [ ] Test: วันที่ไม่มี Camp → ยังส่ง `{ "program": "CAMP", "total": null, "items": [] }` (ครบ 4 รายการเสมอ)
- [ ] `kidsByProgram` ส่งมาพร้อม field ใหม่อื่นๆ ใน release เดียวกัน (§6) — ถ้าไม่ส่ง section นี้จะขึ้นข้อมูลตัวอย่าง (ทุกการ์ดว่าง) ทั้งที่มีข้อมูลจริง
