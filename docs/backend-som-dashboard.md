# SOM dashboard — สิ่งที่ backend ต้องปรับ (`GET /reports/som`)

> สำหรับทีม **smart-scheduler-back** · ฝั่ง FE กำลังทำ (branch `Palm`) · อัปเดต 2026-10-15 · 🚧 **DRAFT — ยังเพิ่ม section อยู่**
>
> ไฟล์อ้างอิงฝั่ง FE:
> - หน้าจอ: [`src/components/partials/Som/SomContent.tsx`](../src/components/partials/Som/SomContent.tsx) (`/scheduler/som`)
> - Type ปัจจุบัน: `SomReport` ใน [`src/types/app/som/index.ts`](../src/types/app/som/index.ts)
> - การเรียก API: `getSomReport` ใน [`src/services/som-report.service.ts`](../src/services/som-report.service.ts)
>
> 🔌 **หน้านี้ต่อ API จริงแล้ว** — ระหว่างรอ backend, FE ยังอ่าน field เดิมอยู่ (คอลัมน์ "Field ปัจจุบัน")
> พอ backend ส่ง field ใหม่มา FE จะสลับไปอ่าน field ใหม่ (คอลัมน์ "Field ใหม่")
>
> ✅ **ลบตัวเลขตัวอย่างแล้ว (2026-10-21)** — backend ส่งครบทุก field แล้ว FE ลบ `src/lib/som/preview.ts` ออก
> และเลิก fallback ไป field เก่าด้วย: field ใหม่ที่ไม่มี / เป็น `null` → แสดง **"—"** (ไม่เติมตัวเลขสมมติ และไม่ใช้ค่า field เก่าที่มีบั๊กแทน)
> modal New vs Renewing ถ้า request error → แสดงข้อความ "โหลดรายชื่อไม่สำเร็จ" + ปุ่มลองอีกครั้ง (ไม่แสดงรายชื่อแต่งขึ้น)

---

## 0. ลำดับ section บนหน้า (บน → ล่าง)

| # | Section | สถานะ |
|---|---------|-------|
| 1 | Today | ✅ spec แล้ว (§1) |
| 2 | Existing Customers | ✅ spec แล้ว (§2) |
| 3 | New vs Renewing | ✅ spec แล้ว (§3) — มี **endpoint ใหม่** สำหรับ modal รายชื่อ |
| 4 | Coach Capacity | ✅ UI เลือกแล้ว · รอ client ยืนยันนิยาม (§4) — **section ใหม่**, API ยังไม่มีข้อมูล |
| 5 | Demographic | ✅ spec แล้ว (§5) |
| 6 | Activity / Program | ✅ UI เลือกแล้ว (§6) — แทน `sportShare` เดิม |

---

## 0.1 Filter ทั้งหน้า (client ตกลง 2026-10-17)

หัวหน้ามี filter 2 ตัว ใช้กับ **ทุก section ยกเว้น Today** — FE ส่งเป็น query บน **ทุก** request ของหน้านี้:

```
GET /reports/som?month=2026-10&badgeValueIds=bv1,bv2
GET /reports/som/new-vs-renewing/:bucket?month=2026-10&badgeValueIds=bv1,bv2
```

| Query | รูปแบบ | ค่าเริ่มต้น | ความหมาย |
|-------|--------|-------------|----------|
| `month` | `YYYY-MM` | เดือนปัจจุบัน | เดือนที่ดู — FE ไม่ให้เลือกเดือนในอนาคต |
| `badgeValueIds` | id ของ badge value คั่นด้วย `,` | ไม่ส่ง = **ทุกสาขา** | กรองตาม badge (สาขา) — ตัวเลือกเดียวกับ filter badge ในหน้า Calendar (`GET /badges`, เลือกได้หลายค่า) |

ผลต่อแต่ละ section:

| Section | `month` | `badgeValueIds` |
|---------|---------|-----------------|
| Today | ❌ **ล็อกวันนี้เสมอ** (ไม่สน `month`) | ✅ |
| Existing Customers | ✅ Active Course / Voucher / Total = ณ สิ้นเดือน (เดือนปัจจุบัน = ณ วันนี้) · 1st Trial / 1 HR = เดือนนั้น + ย้อน 2 เดือน (§2) | ✅ |
| New vs Renewing | ✅ (§3) | ✅ รวม modal |
| Coach Capacity | ✅ (§4) | ✅ |
| Demographic | ✅ นับเฉพาะนักเรียนที่มาเรียนในเดือนนั้น (Q5.2) | ✅ |
| Activity / Program | ✅ นับเฉพาะที่มาเรียนในเดือนนั้น (Q6.1) | ✅ |

- เลือกหลาย badge = **OR** (อยู่ badge ใด badge หนึ่งก็นับ) — ตรงกับพฤติกรรม filter ใน Calendar
- นักเรียน 1 คนอยู่หลายสาขา → นับในทุกสาขาที่เลือก แต่ใน response เดียวกันนับคนนั้น **ครั้งเดียว** (เช่น Total Customers, Demographic)
- แต่ละ section ใน response ควร echo `month` ที่ใช้คำนวณกลับมา (เช่น `newVsRenewing.month`, `coachCapacity.month`, `existingCustomers.month`)
- server ที่ยังไม่รองรับ query จะ ignore ไปเอง — FE ส่งไปแล้วตั้งแต่ตอนนี้

❓ คำถามเปิด:
- ~~Q0.1~~ ✅ Badge ติดกับ **การจอง** — section ที่นับเป็นคนกรองจาก badge ของการจองของคนนั้น (backend 2026-10-19, §0.2)
- **Q0.2** Coach Capacity + badge: `bookedHours` นับเฉพาะคาบที่มี badge นั้นได้ แต่ `availableHours` (ชั่วโมงที่สอนได้) จะแบ่งตามสาขาอย่างไร? หรือไม่กรอง available?

---

## 0.2 คำตอบจาก backend (2026-10-19 — back ขึ้น UAT แล้ว)

**FE เปลี่ยนแล้ว:** การ์ดที่เคยอ่าน field เก่า ตอนนี้อ่าน field ใหม่ **อย่างเดียว** (ตั้งแต่ 2026-10-21 เลิก fallback ไป field เก่าแล้ว — field ใหม่ว่าง = "—")

| การ์ด | อ่าน (ใหม่) | field เก่าที่เลิกอ่าน (server คงค่าเดิมที่มีบั๊กไว้) |
|-------|-------------|-------------------------------------------|
| Today · Confirmed | `today.confirmed` | `today.expected` |
| Today · Attendance | `today.attendanceRate` (= attended ÷ confirmed) | FE คำนวณจาก confirmed |
| Active Course | `existingCustomers.activeCourse` | `byCourse` (เคยนับคอร์สที่จบ / พักแล้ว) |
| Active Voucher | `existingCustomers.activeVoucher` | `byVoucher` |
| 1st Trial (Existing) | `existingCustomers.recentFirstTrial` | `byRecentTrial` (เคยนับรวมที่ยกเลิก) |
| Total Customers | `existingCustomers.totalCustomers` | `total` |
| บรรทัดใต้การ์ด Existing | `recentFrom` – `recentTo` | `recentTrialSince` |
| New vs Renewing · 1st Trial | `newVsRenewing.firstTrial` | `newByFirstTrial` |
| New vs Renewing · Renew Course | `newVsRenewing.renewCourse` | `renewing` (เคยเป็น 0 เสมอ) |

**ข้อมูลจริงที่ต่างจากที่ FE เขียนไว้ (backend ทำตามนี้):**
- **Badge ติดกับการจองแต่ละครั้ง** ไม่ได้ติดกับนักเรียน → section ที่นับเป็นคน กรองจาก badge ของการจองของคนนั้น (ปิด **Q0.1**)
- **District** มาจากที่อยู่ของผู้ปกครอง เก็บเป็นรหัสตั้งแต่ 12 ต.ค. — ตอนนี้รู้เขต 121 จาก 312 คน ที่เหลือเป็น "ไม่ระบุ" จนกว่าแอดมินจะเติม (ตอบ **Q5.3**)
- **Voucher ไม่มีวิชาผูกอยู่** → หมวดใน Activity / Program ดูจากวิชาของคาบที่เรียนจริงแต่ละคาบ (ตอบบางส่วนของ **Q6.4**)
- **Remark** (เหตุผลที่ไม่ต่อคอร์ส) ยังไม่มีที่เก็บ → ส่ง `null` ไปก่อน FE แสดง `—` (Q3.9 ค้าง — โด่งจะคุยต่อ)
- **Renew:** คอร์สที่ "พัก" ไม่นับว่าจบ (พักแล้วกลับมาเรียนต่อได้) จึงยังไม่นับเป็นเคสต่อคอร์ส (ตอบบางส่วนของ **Q3.7**)
- **First Trial:** เด็กที่มีคอร์สอยู่แล้ว (ซื้อก่อนสิ้นเดือนนั้น) ถือเป็นลูกค้าคอร์ส ไม่นับใน First Trial — ใช้กฎเดียวกันกับการ์ด "1st Trial, no course"
- **Today:** attendanceRate = attended ÷ confirmed ตามสูตรใน §1
- `?month` และ `?badgeValueIds` — backend ใช้แล้วใน field ใหม่

**ข้อจำกัด:** ระบบไม่ได้เก็บประวัติการพักของคอร์ส → ตัวเลขย้อนหลังเดือนก่อน ๆ ไม่รู้ว่าคอร์สไหนเคยพัก

**รอ client ยืนยัน:** ช่วงอายุ §5.1 — สรุปประชุมเขียน "1, 2, 3, 4, 5, 7, 8, 10, 20+, 40+, 55+" ส่วนในชีทลูกค้าช่องระหว่าง 11–13 กับ 55+ ว่างอยู่ — FE ใช้ 14-19 / 20-39 / 40-54 / 55+ (Q5.1) backend ใช้ตามนี้ไปก่อน แก้ทีหลังได้

---

## 1. Today

Stat card 3 ใบ ของวันนี้ (`today.date`)

| Card (UI) | ความหมาย (จาก client) | Field ปัจจุบัน | Field ใหม่ | Type |
|-----------|------------------------|-----------------|------------|------|
| **Confirmed** | จำนวนคนที่คอนเฟิร์มแล้ว | `today.expected` | `today.confirmed` | int |
| **Attended** | จำนวนคนที่มาเรียนแล้ว (เช็คอินแล้ว) | `today.attended` | `today.attended` (ชื่อเดิม เปลี่ยนนิยาม) | int |
| **Attendance** | % การเข้าเรียน = `attended ÷ confirmed × 100` | FE คำนวณเอง | `today.attendanceRate` | int 0–100 (ปัดแล้ว) |

Response ใหม่:

```jsonc
"today": {
  "date": "2026-10-15",      // YYYY-MM-DD (เขตเวลา Asia/Bangkok)
  "confirmed": 18,
  "attended": 11,
  "attendanceRate": 61       // round(attended / confirmed * 100); confirmed = 0 → 0
}
```

ข้อกำหนด:
- **Attended ⊂ Confirmed** — คนที่เช็คอินแล้วยังนับอยู่ใน Confirmed ด้วย (ไม่หักออก) เพื่อให้ % ไม่เกิน 100
- ใช้นิยามเดียวกับ Daily report (`docs/backend-daily-report.md` §2): Confirmed = `CONFIRMED` + `ATTENDED`, ไม่นับ `SICK_LEAVE` / `CANCELLED` / `PENDING`
- Attended = `ATTENDED` (เช็คอินแล้ว)
- ลบ `today.expected` ได้หลัง FE สลับไปอ่าน `confirmed` แล้ว

❓ คำถามเปิด:
- **Q1.1** นับเฉพาะคาบเรียน (lesson) เหมือน Daily report ไหม หรือรวม Group (`OTHER` / `GROUP`) ด้วย?
- **Q1.2** `NO_SHOW` นับเป็น Confirmed ไหม? (Daily report ตอนนี้นับไว้ชั่วคราว)
- **Q1.3** นับเป็น "คน" (นักเรียนไม่ซ้ำ) หรือ "คาบ" (นักเรียน 1 คนมี 2 คาบวันเดียวกัน = 2)?

---

## 2. Existing Customers

มี **ตัวเลือกเดือน** ที่หัว section (ค่าเริ่มต้น = เดือนปัจจุบัน) → ส่งเป็น query `month=YYYY-MM`
Stat card 5 ใบ เรียงตามนี้ ใต้การ์ดมีบรรทัดเล็ก "1st Trial / 1 HR: ส.ค. – ต.ค. 2026" อ่านจาก `recentFrom` / `recentTo`

**ช่วง "3 เดือน" (ใช้เฉพาะ 1st Trial และ 1 HR)** = เดือนที่เลือก + ย้อนหลังอีก 2 เดือน **นับเต็มเดือน ไม่สนวันที่**
- เลือก ต.ค. 2026 → 1 ส.ค. – 31 ต.ค. 2026 (`recentFrom: "2026-08"`, `recentTo: "2026-10"`)
- เลือก ม.ค. 2027 → 1 พ.ย. 2026 – 31 ม.ค. 2027
- Active Course / Active Voucher / Total Customers **ไม่ใช้ช่วง 3 เดือน** — นับเฉพาะ **เดือนที่เลือก**: active **ณ วันสิ้นเดือน** (เดือนปัจจุบัน = ณ วันนี้) — Q2.6 ✅

| Card (UI) | ความหมาย (จาก client) | Field ปัจจุบัน | Field ใหม่ | Type |
|-----------|------------------------|-----------------|------------|------|
| **Active Course** | ลูกค้าที่มีคอร์ส active **ณ วันสิ้นเดือนที่เลือก** — นับ **Course (`COURSE_PACKAGE`) เท่านั้น** | `existingCustomers.byCourse` | `existingCustomers.activeCourse` | int |
| **Active Voucher** | ลูกค้าที่มี Voucher ที่ **ยัง active เท่านั้น** ณ วันสิ้นเดือนที่เลือก (ไม่หมดอายุ / ชั่วโมงยังเหลือ) | `existingCustomers.byVoucher` | `existingCustomers.activeVoucher` | int |
| **1st Trial (Last 3 Months)** | ลูกค้าที่มาทดลองเรียน (`FIRST_TRIAL`) ในช่วง 3 เดือน — **ถ้าต่อคอร์สแล้ว ย้ายออกจากกลุ่มนี้** (ไปนับใน Active Course แทน) | `existingCustomers.byRecentTrial` | `existingCustomers.recentFirstTrial` | int |
| **1 HR (Last 3 Months)** | ลูกค้าที่จอง 1 ชม. (`SINGLE_SESSION`) ในช่วง 3 เดือน | — (**ยังไม่มี**, FE แสดง `—`) | `existingCustomers.recentSingleSession` | int |
| **Total Customers** | จำนวนลูกค้าทั้งหมด **นับเป็นรายชื่อ** (คนเดียวนับ 1 แม้อยู่หลายกลุ่ม) — **เดือนที่เลือกเท่านั้น** ไม่ย้อน 3 เดือน (ดู Q2.7) | `existingCustomers.total` | `existingCustomers.totalCustomers` | int |
| (บรรทัดใต้การ์ด) | เดือนแรก–เดือนสุดท้ายของช่วง 3 เดือน | `existingCustomers.recentTrialSince` (`YYYY-MM-DD`) | `existingCustomers.recentFrom` + `recentTo` | `YYYY-MM` |

Response ใหม่:

```jsonc
"existingCustomers": {
  "month": "2026-10",          // เดือนที่เลือก (echo กลับ)
  "activeCourse": 42,
  "activeVoucher": 17,
  "recentFirstTrial": 9,      // FIRST_TRIAL ใน ส.ค.–ต.ค. ที่ยังไม่ต่อคอร์ส
  "recentSingleSession": 6,   // SINGLE_SESSION ใน ส.ค.–ต.ค.
  "totalCustomers": 68,       // นักเรียนไม่ซ้ำ — เดือนที่เลือกเท่านั้น (ดู Q2.7)
  "recentFrom": "2026-08",    // เดือนแรกของช่วง 3 เดือน (เต็มเดือน)
  "recentTo": "2026-10"       // = month
}
```

ข้อกำหนด:
- นับเป็น **คน (นักเรียนไม่ซ้ำ)** ทุกการ์ด — นักเรียน 1 คนมี 2 คอร์ส active = Active Course +1
- `totalCustomers` นับเฉพาะเดือนที่เลือก (ไม่ใช้ช่วง 3 เดือน) — คนเดียวอยู่หลายกลุ่มนับครั้งเดียว
- ช่วง 3 เดือนใช้ `recentFrom`–`recentTo` ชุดเดียวกันทั้ง 1st Trial และ 1 HR
- ลบ `byCourse` / `byVoucher` / `byRecentTrial` / `total` / `recentTrialSince` ได้หลัง FE สลับไปอ่าน field ใหม่

❓ คำถามเปิด:
- **Q2.1** "Course active" นิยามอย่างไร — ยังมีคาบเหลือ + ยังไม่หมดอายุ? คอร์สที่ `PAUSED` / ล็อกลา นับไหม?
- **Q2.2** 1st Trial "ต่อคอร์สแล้วย้ายออก" — ซื้อ **Voucher** หลัง trial ย้ายออกด้วยไหม? หรือเฉพาะ Course?
- **Q2.3** 1 HR ใช้กฎย้ายออกเหมือน 1st Trial ไหม (ต่อคอร์ส/วอยเชอร์แล้วไม่นับใน 1 HR)?
- **Q2.4** นับ trial / 1 HR จาก "วันที่เรียน" หรือ "วันที่จอง"? นับเฉพาะที่มาเรียนจริง (`ATTENDED`) หรือรวมที่จองไว้?
- **Q2.5** `totalCustomers` = เฉพาะคนใน 4 กลุ่มนี้ หรือนักเรียนทั้งหมดในระบบ (รวมคนที่ไม่ active แล้ว)?
- ~~Q2.6~~ ✅ Active Course / Voucher = active **ณ วันสิ้นเดือน** ที่เลือก (เดือนปัจจุบัน = ณ วันนี้) — client 2026-10-17
- **Q2.7** Total Customers นับเดือนที่เลือกเท่านั้น — FE ตีความ = นักเรียนไม่ซ้ำของ (Active Course + Active Voucher ณ สิ้นเดือน) + (1st Trial + 1 HR **เฉพาะในเดือนที่เลือก**) ถูกไหม? (ถ้าใช่ Total อาจน้อยกว่าผลรวมการ์ด 1st Trial / 1 HR ที่นับ 3 เดือน)

---

## 3. New vs Renewing

ทั้ง section คิดตาม **เดือน `newVsRenewing.month`** (`YYYY-MM`) — ตัวอย่างด้านล่างสมมติ `month = 2026-10`

### 3.1 การ์ด 6 ใบ (เรียงตามนี้) — กดได้ทุกใบ เปิด modal ตารางรายชื่อ (§3.2)

| Card (UI) | ความหมาย (จาก client) | หน่วยนับ | Field ปัจจุบัน | Field ใหม่ |
|-----------|------------------------|----------|-----------------|------------|
| **1st Trial** | นักเรียนใหม่ที่ **จอง** 1st Trial ในเดือนนี้ — **ถึงไปเปิดคอร์สแล้วก็ยังนับอยู่** (ไม่ย้ายออก ต่างจาก §2) | คน | `newVsRenewing.newByFirstTrial` | `newVsRenewing.firstTrial` |
| **New Course this month** | จำนวน **คอร์ส** ที่นักเรียนใหม่เปิด โดยนับเข้า **เดือนของ 1st Trial** (ดูกฎด้านล่าง) | คอร์ส | — (FE แสดง `—`) | `newVsRenewing.newCourseThisMonth` |
| **New Course previous month** | เหมือนข้างบน แต่ 1st Trial อยู่ใน **เดือนที่แล้วเท่านั้น** (`month − 1`) | คอร์ส | — (FE แสดง `—`) | `newVsRenewing.newCoursePrevMonth` |
| **Renew Course** | ลูกค้าเก่า (เคยเปิดคอร์สและจบไปแล้ว) ซื้อ **Course + Voucher** ใหม่ในเดือนนี้ (ตามวันที่ซื้อ) | แพ็ก | `newVsRenewing.renewing` | `newVsRenewing.renewCourse` |
| **1st Trial, no course** | คนที่มา 1st Trial ในเดือนนี้ แต่ยังไม่เปิดคอร์ส | คน | — (FE แสดง `—`) | `newVsRenewing.trialNotConverted` |
| **Course / Voucher not renewed** | Course / Voucher ที่จบในเดือนนี้ และยังไม่ต่อ — นับทันทีตั้งแต่วันถัดจากวันจบ | แพ็ก | — (FE แสดง `—`) | `newVsRenewing.notRenewed` |

> `newVsRenewing.newByRegistration` (เดิม) — **ไม่ใช้แล้ว** ลบได้

**กฎ New Course (ยืนยันกับ client แล้ว):**
- นับ **จำนวนคอร์ส** ที่เปิด ไม่ใช่จำนวนคน (คนเดียวเปิด 2 คอร์ส = 2)
- นับเฉพาะ **Course (`COURSE_PACKAGE`)** — Voucher ไม่นับ
- คอร์สที่เปิดโดยคนที่มาจาก 1st Trial → นับเข้า **เดือนที่ทำ 1st Trial** ไม่ใช่เดือนที่เปิดคอร์ส
  - ตัวอย่าง: Trial 21 ก.ย. → เปิดคอร์ส 3 ต.ค. ⇒ นับใน **New Course previous month** ของหน้า ต.ค. (และใน this month ของหน้า ก.ย.)
  - ตัวอย่าง: Trial 4 ต.ค. → เปิดคอร์ส 12 ต.ค. ⇒ นับใน **New Course this month** ของหน้า ต.ค.
- คนที่ **ไม่มี 1st Trial** (ลงทะเบียนแล้วซื้อคอร์สเลย) → นับใน **this month** ตามเดือนที่เปิดคอร์ส
- previous month = เดือนที่แล้วเดือนเดียว ไม่ย้อนไปไกลกว่านั้น
- "เปิดคอร์ส" = **วันที่ซื้อ** แพ็ก (ไม่ใช่วันเรียนคาบแรก)
- 1st Trial นับคนที่ **จอง** trial (ไม่ต้องมาเรียนจริง) — การใส่เดือน ดู Q3.8

Response ใหม่ (ใน `GET /reports/som`):

```jsonc
"newVsRenewing": {
  "month": "2026-10",
  "firstTrial": 14,
  "newCourseThisMonth": 6,
  "newCoursePrevMonth": 3,
  "renewCourse": 9,
  "trialNotConverted": 8,
  "notRenewed": 4
}
```

### 3.2 Modal รายชื่อ — endpoint ใหม่

```
GET /reports/som/new-vs-renewing/:bucket?month=YYYY-MM&badgeValueIds=...   (filter ทั้งหน้า §0.1)
→ { "rows": NvrDetailRow[] }
```

`:bucket` = ชื่อ field ของการ์ด: `firstTrial` · `newCourseThisMonth` · `newCoursePrevMonth` · `renewCourse` · `trialNotConverted` · `notRenewed`

- **จำนวน `rows` ต้องเท่ากับตัวเลขบนการ์ด** (การ์ดนับคอร์ส → 1 row ต่อ 1 คอร์ส; การ์ดนับคน → 1 row ต่อ 1 คน)
- ส่งทั้งหมด ไม่ต้อง paginate — FE filter ครูเอง (ไม่ต้องรับ `teacherId`)
- ส่งแค่ `teacherId` — ชื่อครู FE ดึงจากรายชื่อครูเอง

```ts
interface NvrDetailRow {
  studentId: string;
  studentName: string;
  packageLabel?: string | null;    // ชื่อแพ็ก เช่น "Course 10 · Bike", "Voucher 10 hrs" — ไม่มีสำหรับ row ที่เป็น trial
  courseTeacherId?: string | null; // ครูประจำคอร์ส / วอยเชอร์
  trialTeacherId?: string | null;  // ครูที่สอน 1st Trial ของนักเรียนคนนี้
  trialDate?: string | null;       // YYYY-MM-DD วันที่ 1st Trial
  date?: string | null;            // YYYY-MM-DD วันของเหตุการณ์ของการ์ดนั้น (ดูตาราง)
  remark?: string | null;          // หมายเหตุ (ข้อความอิสระ) — แสดงเป็นคอลัมน์สุดท้ายของ **ทุก** modal
}
```

- `remark`: ทุก modal มีคอลัมน์ **Remark** เป็นคอลัมน์สุดท้าย — ไม่มี = `null` (FE แสดง `—`), ขึ้นบรรทัดใหม่ได้ (FE แสดงตาม `\n`)
- ❓ **Q3.9** remark ดึงมาจากไหน — หมายเหตุของ **นักเรียน**, ของ **booking / แพ็กนั้น**, หรือช่องใหม่สำหรับหน้านี้โดยเฉพาะ (ต้องมีที่ให้แอดมินกรอก)?

คอลัมน์ที่แต่ละ modal แสดง (field ที่ต้องมีค่า):

| Bucket | คอลัมน์ในตาราง | `date` หมายถึง | Filter |
|--------|----------------|----------------|--------|
| `firstTrial` | นักเรียน · วันที่ Trial · ครู Trial · Remark | — | — |
| `newCourseThisMonth` | นักเรียน · แพ็ก · ครูประจำคอร์ส · ครู Trial · วันที่ Trial · วันที่เปิดคอร์ส · Remark | วันที่เปิดคอร์ส | ครู (ตรงกับครูคอร์ส **หรือ** ครู Trial) |
| `newCoursePrevMonth` | เหมือน `newCourseThisMonth` | วันที่เปิดคอร์ส | เหมือนกัน |
| `renewCourse` | นักเรียน · แพ็ก · ครู · วันที่ต่อ · Remark | วันที่ต่อ | — |
| `trialNotConverted` | นักเรียน · วันที่ Trial · ครู Trial · Remark | — | — |
| `notRenewed` | นักเรียน · แพ็ก · ครู · วันที่สิ้นสุด · Remark | วันที่แพ็กจบ | — |

- `newCourse*` ที่ไม่มี Trial → `trialTeacherId` / `trialDate` = `null` (FE แสดง `—`)

### 3.3 คำตอบจาก client (2026-10-15)

| # | คำถาม | คำตอบ |
|---|-------|-------|
| Q3.1 | "1st Trial" นับคนที่จอง หรือเฉพาะที่มาเรียนจริง? | ✅ นับคนที่ **จอง** 1st Trial (ไม่ต้องรอ `ATTENDED`) — ใช้กับ `trialNotConverted` ด้วย |
| Q3.2 | "ลูกค้าเก่า" ของ Renew Course คือใคร? | ✅ ลูกค้าที่ **เคยเปิดคอร์สและคอร์สนั้นจบไปแล้ว** แล้วมาเปิดคอร์สใหม่ — คอร์สแรกของนักเรียน (หลัง trial หรือซื้อตรง) **ไม่ใช่** Renew, ไปนับใน New Course |
| Q3.3 | Not renewed นับเมื่อไหร่? | ✅ นับ **ทันที** — คอร์สจบวันนี้ พรุ่งนี้ยังไม่ต่อ = นับเป็น not renewed เลย |
| Q3.5 | "เปิดคอร์ส" ใช้วันไหน? | ✅ **วันที่ซื้อ** (สร้างแพ็ก) — ใช้กับ New Course, Renew Course และ `date` ใน modal |

❓ คำถามที่ยังเปิด:
- **Q3.4** "1st Trial, no course" — ถ้าซื้อ **Voucher** แทนคอร์ส ยังนับอยู่ในกลุ่มนี้ไหม?
- **Q3.6** (ต่อจาก Q3.3) ถ้านับเป็น not renewed ไปแล้ว แล้ว **มาต่อทีหลัง** (เช่น อีก 1 สัปดาห์) — ต้องย้ายออกจาก not renewed ไหม?
- **Q3.7** (ต่อจาก Q3.2) "คอร์สจบ" = ใช้ครบทุกคาบ, หมดอายุ, หรืออย่างใดอย่างหนึ่ง? ต่อคอร์สใหม่ **ก่อน** คอร์สเดิมจบ นับเป็น Renew ไหม?
- **Q3.8** (ต่อจาก Q3.1) 1st Trial ใส่เข้าเดือนไหน — เดือนที่ **กดจอง** หรือเดือนของ **วันนัด trial**? (เช่น จอง 28 ก.ย. นัดเรียน 2 ต.ค.)

---

## 4. Coach Capacity

> 🎨 Client ให้แค่หัวข้อ (Coach name · Coach type (FT/PT/FL) · Hour · Period (Weekday % / Weekend %) · มีทั้ง By person & By type)
> — **UI client เลือกแล้ว (B2)** · นิยามตัวเลขด้านล่าง FE เสนอเอง รอ client ยืนยัน (ดู Q4.x)

UI (client เลือกดีไซน์ B2 แล้ว 2026-10-17): การ์ดเดียว ตารางเดียว มีปุ่มสลับ **By person / By type** ด้านบนขวา
ระหว่างที่ API ยังไม่ส่ง `coachCapacity` FE แสดงตาราง (ชื่อ/ประเภทโค้ชดึงจากรายชื่อครู) และ `—` ทุกตัวเลข

| ตาราง | คอลัมน์ |
|-------|---------|
| **By person** | Coach name · Coach type (chip `FT`/`PT`/`FL`) · Hours · Weekday · Weekend |
| **By type** | Coach type · Coaches (จำนวนโค้ช) · Hours · Weekday · Weekend — 3 แถว FT → PT → FL |

- **Hours** = `bookedHours / availableHours ชม.` (รวมทั้งเดือน)
- **Weekday / Weekend** แต่ละช่องแสดง 3 อย่าง: `weekdayPct`% ตัวหนา · `weekdayBookedHours / weekdayAvailableHours ชม.` · แถบบางสีเดียว (ไม่ไล่ความเข้มตามความเต็ม)
  - hover: "แอน · Weekday: สอน 92 จาก 158 ชม. (58%)"
- ช่วงที่ไม่มีชั่วโมงให้สอน (เช่น PT ที่ไม่ทำงานวันธรรมดา) → **ส่ง 0 ทั้งหมด** (`0 / 0`, `0%`) FE แสดง 0 ตามปกติ ไม่มีป้ายพิเศษ

นิยามที่ FE เสนอ (ช่วงเวลา = ทั้งเดือน `coachCapacity.month`):

| Field | ความหมาย | Type |
|-------|----------|------|
| `weekdayBookedHours` | ชั่วโมงที่มีคาบสอนจริง จ.–ศ. (นับคาบ lesson + group ที่ครูคนนั้นสอน, ไม่นับ `CANCELLED`) | int |
| `weekdayAvailableHours` | ชั่วโมงที่สอนได้ จ.–ศ. = วันทำงาน (`workDays`) ที่ตรง จ.–ศ. ในเดือน × 9 ชม. (09:00–18:00) หักวันลาครู | int |
| `weekdayPct` | `round(weekdayBookedHours ÷ weekdayAvailableHours × 100)` — available = 0 → `0` | int 0–100 |
| `weekendBookedHours` / `weekendAvailableHours` / `weekendPct` | เหมือนกัน คิดเฉพาะ ส.–อา. | int |
| `bookedHours` | `weekdayBookedHours + weekendBookedHours` | int |
| `availableHours` | `weekdayAvailableHours + weekendAvailableHours` | int |
| `coaches` (By type) | จำนวนโค้ชของประเภทนั้นที่นับใน `byPerson` | int |

Response ใหม่ (ใน `GET /reports/som`):

```jsonc
"coachCapacity": {
  "month": "2026-10",
  "byPerson": [            // เรียง FT → PT → FL — FE แสดงตามลำดับที่ส่งมา
    {
      "teacherId": "t1", "teacherType": "FULL_TIME",
      "bookedHours": 132, "availableHours": 202,
      "weekdayBookedHours": 92, "weekdayAvailableHours": 158, "weekdayPct": 58,
      "weekendBookedHours": 40, "weekendAvailableHours": 44, "weekendPct": 91
    }
  ],
  "byType": [              // ส่งครบ 3 ประเภทเสมอ แม้ไม่มีโค้ช (ค่า 0)
    {
      "teacherType": "FULL_TIME", "coaches": 2,
      "bookedHours": 233, "availableHours": 409,
      "weekdayBookedHours": 155, "weekdayAvailableHours": 316, "weekdayPct": 49,
      "weekendBookedHours": 78, "weekendAvailableHours": 93, "weekendPct": 84
    }
  ]
}
```

ข้อกำหนด:
- `byPerson` ส่งแค่ `teacherId` + `teacherType` — ชื่อ FE ดึงจากรายชื่อครูเอง
- ตัวเลข `byType` = รวมชั่วโมงจาก `byPerson` ของประเภทนั้น แล้วคิด % ใหม่จากผลรวมชั่วโมง (ไม่ใช่เฉลี่ย %)
- ส่ง % มาเลย — FE ไม่คำนวณเอง

❓ คำถามเปิด (ถาม client):
- ~~Q4.1~~ ✅ Hour = สอนจริง / สอนได้ (client เลือก B2, 2026-10-17)
- ~~Q4.2~~ ✅ Weekday / Weekend % = ความเต็ม (สอนจริง ÷ สอนได้ ของช่วงนั้น) + แสดงชั่วโมงคู่กัน (client เลือก B2, 2026-10-17)
- **Q4.3** ช่วงเวลา = เดือนปฏิทินปัจจุบัน หรือช่วงอื่น (สัปดาห์นี้ / 4 สัปดาห์ล่าสุด)?
- **Q4.4** Freelance ไม่มีวันทำงานตายตัว — `availableHours` ของ FL คิดอย่างไร? หรือแสดงแค่ชั่วโมงสอนจริง ไม่มี %?
- **Q4.5** นับคาบ Group (`OTHER` / `GROUP`) และคาบที่ `PENDING` (ยังไม่คอนเฟิร์ม) เป็นชั่วโมงสอนไหม?
- **Q4.6** ครูที่ปิด active (ไม่รับจองเดือนนั้น) ต้องแสดงในตารางไหม?

---

## 5. Demographic

UI (client เลือกดีไซน์แล้ว 2026-10-17) — กราฟตามชนิดข้อมูล:

| การ์ด | รูปแบบ | ตำแหน่ง |
|-------|--------|---------|
| **Gender** | แถบเดียว 100% แบ่งสีตามเพศ + legend (จำนวน · %) | ครึ่งซ้าย |
| **Nationality** | ranked bars เรียงมาก → น้อย, Top 5 + "แสดงทั้งหมด" | ครึ่งขวา |
| **Age** | กราฟแท่งแนวตั้ง 9 ช่วง เรียงตามอายุ (แสดงทุกช่วงแม้ 0) | เต็มแถว |
| **Address** | ranked bars + ปุ่มสลับ **Province / District**, Top 5 + "แสดงทั้งหมด" | เต็มแถว |

ทุกใบใช้รูปแบบ `Breakdown` เดิม (`buckets[]` + `known` / `unknown` / `total`):
- หัวการ์ดแสดง "จากข้อมูล `known` จาก `total` คน · ไม่ระบุ `unknown`"
- bucket `unknown` **ไม่ถูกวาดเป็นแท่ง** — % ทุกตัวคิดจาก `known` (คนที่มีข้อมูล)
- ลำดับ bucket = ลำดับที่ส่งมา (FE ไม่เรียงใหม่) → Nationality / Address ต้องเรียงมาก → น้อย, Age ต้องเรียงตามช่วงอายุ

| Card (UI) | แสดง | Field ปัจจุบัน | Field ใหม่ | เปลี่ยนอะไร |
|-----------|------|-----------------|------------|-------------|
| **Gender** | ชาย / หญิง / อื่น ๆ / ไม่ระบุ | `demographics.gender` | (เดิม) | ไม่เปลี่ยน — key `male` / `female` / `other` / `unknown` (FE แปลชื่อเอง) |
| **Age** | 9 ช่วงอายุ + ไม่ระบุ | `demographics.ageBand` | (เดิม) | ⚠️ **เปลี่ยนช่วงอายุเป็นชุดใหม่** (§5.1) — ตอนนี้ยังส่งชุดเดิม |
| **Nationality** | สัญชาติ | `demographics.nationality` | (เดิม) | ไม่เปลี่ยน |
| **Address** | ปุ่มสลับ **Province / District** | `demographics.province` | `demographics.province` + **`demographics.district`** (ใหม่) | เพิ่ม district — ตอนนี้ FE แสดง "ยังไม่มีข้อมูล" ในแท็บ District |

### 5.1 Age — ช่วงอายุใหม่

> ⚠️ **Backend ต้องเปลี่ยนช่วงอายุ — FE ไม่แปลงให้**
> `demographics.ageBand` ตอนนี้ยังส่ง **ช่วงอายุชุดเดิม** (ชุดก่อน spec นี้ — mock ฝั่ง FE เคยใช้ `6-9`, `10-12`) และ FE แสดง bucket ตามที่ส่งมาตรง ๆ
> (ไม่ re-bucket ฝั่ง FE เพราะต้องใช้วันเกิดรายคน — คำนวณที่ server ที่เดียวให้ทุกหน้าตรงกัน)
> → กราฟ Age บนหน้าจอจะเป็น 9 ช่วงใหม่ **ก็ต่อเมื่อ backend เปลี่ยนชุด key ตามตารางล่าง**
> → ช่วงนี้ FE **ไม่เติมตัวเลขตัวอย่าง** ให้ Age (ต่างจาก field ใหม่อื่น) เพราะ API มีข้อมูลอายุจริงอยู่แล้ว
> ไม่ต้องเพิ่ม field ใหม่ — ใช้ `demographics.ageBand` ตัวเดิม เปลี่ยนแค่ `buckets[].key` / `label` / ลำดับ

ส่ง **ครบ 9 ช่วงเสมอ เรียงตามนี้** (ช่วงที่เป็น 0 ก็ส่ง — FE แสดงทุกช่วง) + `unknown` ท้ายสุด

| ลำดับ | `key` | `label` (แสดงบนจอ) | อายุ (ปีเต็ม) |
|------|-------|---------------------|----------------|
| 1 | `1-2` | — (ใช้ key) | 1–2 |
| 2 | `3-4` | — | 3–4 |
| 3 | `5-7` | — | 5–7 |
| 4 | `8-10` | — | 8–10 |
| 5 | `11-13` | — | 11–13 |
| 6 | `14-19` | `14+` | 14–19 |
| 7 | `20-39` | `20+` | 20–39 |
| 8 | `40-54` | `40+` | 40–54 |
| 9 | `55+` | — | 55 ขึ้นไป |
| — | `unknown` | (FE แปลเอง) | ไม่มีวันเกิด |

- อายุคิด **ณ วันที่สร้าง snapshot** จากวันเกิดนักเรียน (server-side)
- ช่วง `14+` / `20+` / `40+` ไม่ทับกัน — แต่ละช่วงจบก่อนช่วงถัดไปเริ่ม (ดู Q5.1)

### 5.2 Address — District (ใหม่)

```jsonc
"demographics": {
  "province": { /* เดิม */ },
  "district": {
    "buckets": [
      { "key": "10-bangrak", "label": "บางรัก, กรุงเทพมหานคร", "count": 3 },  // key ต้องไม่ซ้ำข้ามจังหวัด
      { "key": "unknown", "count": 15 }
    ],
    "known": 5, "unknown": 15, "total": 20
  }
}
```

- `label` = `"เขต/อำเภอ, จังหวัด"` — ชื่ออำเภอซ้ำกันข้ามจังหวัดได้ จึงต้องมีจังหวัดต่อท้าย
- `key` ไม่ซ้ำ (แนะนำ `รหัสจังหวัด-รหัสอำเภอ` หรือ id จากตาราง area ที่ FE ใช้ใน `AreaPicker`)
- เรียงจากมาก → น้อย, `unknown` ท้ายสุด

### 5.3 Address — แขวง/ตำบล ต่อเขต (backend เพิ่มแล้ว 2026-10-20, ขึ้น UAT)

แท็บ **District**: กดแถวเขต → กางแขวง/ตำบลของเขตนั้นใต้แถว (กดซ้ำพับ, เปิดได้หลายเขตพร้อมกัน)

```jsonc
"demographics": {
  "district": { /* เหมือนเดิม */ },
  "subdistrictByDistrict": {
    "1004": {                       // key = key ของแถวเขตใน district
      "buckets": [
        { "key": "100401", "label": "สีลม", "count": 2 },
        { "key": "unknown", "count": 0 }
      ],
      "known": 2, "unknown": 0, "total": 2
    }
  }
}
```

- รูปแบบ `Breakdown` เดียวกับการ์ดอื่น — คนชุดเดียวกันและ filter เดียวกับ District (`month`, `badgeValueIds`)
- เขตที่ **ไม่มีใน object** = ไม่มีข้อมูล → FE ไม่แสดงลูกศร กางไม่ได้
- `label` = ชื่อแขวง/ตำบลภาษาไทยอย่างเดียว · เรียงมาก → น้อย · `unknown` ท้ายสุด · ส่งครบทุกแขวง (ไม่ตัด Top N)
- `total` ของแต่ละเขต = `count` ของเขตนั้นในการ์ด District
- FE แสดง: แถบย่อยต่อแขวง (จำนวน · % ของเขตนั้น), "ไม่ระบุ" แสดงจาง ๆ เมื่อมีคน, hover = tooltip

❓ คำถามเปิด:
- **Q5.1** ช่วงอายุ `14+` `20+` `40+` `55+` ที่ client ให้มาทับกัน — FE ตีความเป็น **14–19 / 20–39 / 40–54 / 55+** ถูกไหม?
- ~~Q5.2~~ ✅ นับเฉพาะนักเรียนที่ **มาเรียนในเดือนที่เลือก** (client 2026-10-17) — Demographic เป็น section รายเดือน
- **Q5.3** ที่อยู่ใช้ของ **นักเรียน** หรือของ **ผู้ปกครอง** (ระบบเก็บที่อยู่ไว้ที่ไหน)?
- ~~Q5.4~~ ✅ FE แสดง Top 5 + ปุ่ม "แสดงทั้งหมด" — backend **ส่งทุก bucket** ไม่ต้องตัด Top N เอง

---

## 6. Activity / Program

> 🎨 Client ให้หัวข้อ: **Type · 1st Trial · Total** — ทุกอัน **by Category** (Surfskate, Inline skate, Bike, Balance Play, Other …)
> **นับเฉพาะคลาสที่ active** · อาจใช้ pie chart — FE ออกแบบไปก่อน client จะสั่งปรับอีกที

UI: การ์ดเดียว (client เลือกดีไซน์แล้ว 2026-10-17)
- บน: **Donut 3 วงเรียงกัน** (จอเล็กเรียงลง) — แต่ละวงแยกตาม category, ตัวเลขกลางวง = ผลรวม slice, hover = ชื่อหมวด · จำนวน · %
  - **Type** — "Course + Voucher + 1 HR" → ใช้ `typeTotal`
  - **1st Trial** — "การจอง 1st Trial" → ใช้ `firstTrial`
  - **Total** — "Type + 1st Trial" → ใช้ `total`
  - category เดียวกันใช้สีเดียวกันทั้ง 3 วง และในตาราง (ตารางเป็น legend ในตัว)
- ล่าง: **ตาราง 4 คอลัมน์** แถวละ 1 category

| หมวด (จุดสี) | Type — ตัวเลข `typeTotal` + บรรทัดเล็ก "Course `course` · Voucher `voucher` · 1 HR `singleSession`" | 1st Trial | Total |
|--------------|------|-----------|-------|

ระหว่างที่ API ยังไม่ส่ง `activityProgram`: FE ใช้ `sportShare` เดิมเป็น donut + คอลัมน์ **Total**, คอลัมน์อื่นแสดง `—`, donut Type / 1st Trial แสดง "ยังไม่มีข้อมูล"

| Field ปัจจุบัน | Field ใหม่ |
|-----------------|------------|
| `sportShare` (Breakdown, `count` ต่อกีฬา) | `activityProgram.categories[]` — ลบ `sportShare` ได้หลัง FE สลับแล้ว |

Response ใหม่ (ใน `GET /reports/som`):

```jsonc
"activityProgram": {
  "categories": [                 // FE แสดงตามลำดับที่ส่งมา — แนะนำเรียง total มาก → น้อย, Other / unknown ท้ายสุด
    {
      "key": "bike",              // ไม่ซ้ำ; "unknown" = ไม่ระบุหมวด (FE แปลชื่อเอง)
      "label": "Bike",            // ชื่อหมวดที่แสดง
      "course": 9,                // Type = COURSE_PACKAGE
      "voucher": 4,               // Type = VOUCHER
      "singleSession": 2,         // Type = SINGLE_SESSION (1 HR)
      "typeTotal": 15,            // = course + voucher + singleSession → donut "Type"
      "firstTrial": 3,            // FIRST_TRIAL → donut "1st Trial"
      "total": 18                 // = typeTotal + firstTrial
    }
  ]
}
```

ข้อกำหนด (FE เสนอ):
- นับเฉพาะคลาสที่ **มาเรียนในเดือนที่เลือก** (Q6.1 ✅)
- `typeTotal` และ `total` ส่งมาเลย — FE ไม่บวกเอง
- ส่งทุก category ที่มีในระบบ แม้เป็น 0 (FE ซ่อน slice ที่เป็น 0 ใน donut แต่ยังแสดงแถวในตาราง)

❓ คำถามเปิด (ถาม client):
- ~~Q6.1~~ ✅ "คลาสที่ active" = นับเฉพาะที่ **มาเรียนในเดือนที่เลือก** (client 2026-10-17) — Activity / Program เป็น section รายเดือน
- **Q6.8** (ต่อจาก Q6.1) นับเป็น **คน** (นักเรียนไม่ซ้ำต่อหมวด) หรือ **คาบ** (มา 4 ครั้ง = 4)?
- **Q6.2** "Type" = Course / Voucher / 1 HR (ที่ FE ทำ) ถูกไหม? หรือหมายถึงอย่างอื่น (เช่น Private / Group)?
- **Q6.3** `total` รวม 1st Trial ด้วยไหม?
- **Q6.4** Category มาจากไหน — วิชา (`subject`) ของคลาส? รายการหมวดตายตัว หรือ admin เพิ่มได้? อะไรตกไป "Other"?
- **Q6.5** คลาส Group (ECA / Camp / Balance Play Group) นับไหม?
- ~~Q6.6~~ ✅ client เลือก donut 3 วง: Type · 1st Trial · Total (2026-10-17)
- **Q6.7** Donut "Type" ต้องการแยกตาม **category** (ที่ทำอยู่) หรือแยกตาม **Course / Voucher / 1 HR**?
