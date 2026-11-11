<!--
SYNC IMPACT REPORT
==================
Version change: 3.0.0 → 4.0.0 (MAJOR: the "never delete rows" rule is redefined. By user decision on
2026-11-11, any editor may delete one item row from the app, through a guarded path only: lock, ลำดับ check,
full-row conflict check, and a full JSON snapshot of the row in _app_log for manual restore.)
Previous: 2.1.1 → 3.0.0 (MAJOR: Data Contract status workflow reordered and two statuses added,
"0.จัดทำ Taiga" and "dev ขอ Sourecode อจ."; closed statuses ordered 0.ยกเลิก / 0.ใช้งานได้อยู่แล้ว /
0.แก้ไขเรียบร้อย. Approved by the PM (sheet owner side) on 2026-11-11 as required by Governance.)
Previous: 2.1.0 → 2.1.1 (PATCH: clarify that a static GitHub Pages entry page that only links to the
Apps Script URL is allowed under Principle VIII; it holds no data or logic.)
Previous: 2.0.0 → 2.1.0
Bump rationale: MINOR. Principle VIII changed from "container-bound" to "standalone project
that opens the sheet by ID (SPREADSHEET_ID script property)". The bound project already
hosts the LINE bot "แมวส้ม" (doGet/doPost, deployed as anonymous). Sharing that project would
collide on doGet and risk exposing the app anonymously or deleting the bot on clasp push.
Access changed to "Anyone with a Google account", because the sheet owner is a personal Gmail
account and no Workspace domain exists. Nothing had been implemented against the old wording.

Previous: 1.1.0 → 2.0.0
Bump rationale: MAJOR. The project scope changed from a generic project tracker to the
EHP Change Request Tracker (Google Sheet + Google Apps Script). Principles were merged:
  - Domain principles I–VIII + Data Contract come from the "EHP Change Request Tracker
    Constitution" v1.0.0 (supplied by the user).
  - Engineering principles IX–XVI come from BGS Monitor Constitution v1.1.0, redefined to
    fit Apps Script (testing approach, performance budgets, file layout, deployments).

Modified / redefined:
  VIII. Simplicity: the file list now allows several .gs/.html files (needed for
        Principles XI–XII). Local dev-only tooling (clasp, Node test runner,
        Playwright) is allowed and is not an external backend.
  X.    TDD: the coverage target applies to the pure domain layer. Sheet I/O is
        covered by integration tests on a copy of the spreadsheet.
  XIV.  Performance: replaced generic web/API budgets with Apps Script budgets.
  XVI.  Skills: names updated to the Spec Kit 1.4 "speckit-*" form. React/Vercel skills
        are marked not applicable to this stack.

Removed: generic "Web vitals / API p95 / JS bundle" budgets (not meaningful for HtmlService).

Templates:
  ✅ .specify/templates/*.md: generic; the Constitution Check in plan.md reads this file
  ⚠ No CLAUDE.md yet. Create it during /speckit-plan.

Follow-up TODOs: none.
-->

# BGS Monitor — EHP Change Request Tracker Constitution

แอปสำหรับ **บันทึก** และ **ติดตาม (monitor)** รายการขอแก้ไขโปรแกรม EHP / NHIP / INV
โดยใช้ Google Sheet **"สรุปขอแก้ไขโปรแกรม EHP และ แพลตฟอร์มกลาง"** เป็นแหล่งข้อมูลหลัก

- Spreadsheet ID: `1voV3mHQi7bH2PbBeWaVrk0EaUs-9BnqMpKc53oI__RE`
- ชีตหลัก: `ข้อมูลขอแก้ไขโปรแกรม` (ณ วันที่ร่าง มีประมาณ 720 รายการ)

---

## Part A — หลักการด้านข้อมูลและโดเมน (Domain Principles)

### I. Google Sheet คือแหล่งข้อมูลจริงเพียงแห่งเดียว (Single Source of Truth)

- แอปอ่านและเขียนข้อมูลที่ชีต `ข้อมูลขอแก้ไขโปรแกรม` โดยตรง **ห้าม**มีฐานข้อมูลอื่นหรือสำเนาข้อมูลที่ต้องคอยซิงก์กัน
- คนที่ยังกรอกในชีตโดยตรงต้องใช้งานต่อได้ตามปกติ แอปต้องรองรับข้อมูลที่คนแก้ในชีตเองได้ (แอปไม่ใช่ผู้เขียนเพียงคนเดียว)
- หน้า Monitor ต้องแสดงข้อมูลล่าสุดจากชีตทุกครั้งที่เปิดหรือกด Refresh และห้ามแคชข้อมูลไว้นานเกิน 5 นาที

### II. ห้ามเปลี่ยนโครงสร้างชีต (Schema Preservation)

- ห้ามเพิ่ม ลบ หรือสลับคอลัมน์ และห้ามเปลี่ยนชื่อหัวคอลัมน์ในชีตหลัก
- แอปต้องหาคอลัมน์จาก**ชื่อหัวคอลัมน์** (แถวที่ 1) ห้ามผูกกับตำแหน่ง A/B/C ตายตัว
- ห้ามแตะต้องชีตอื่นในไฟล์ โดยเฉพาะ `_แมวส้ม_บันทึก` และ `_แมวส้ม_สถานะ` ซึ่งเป็นตัวติดตามการเปลี่ยนสถานะที่มีอยู่แล้ว
- ถ้าแอปต้องเก็บข้อมูลของตัวเอง (เช่น audit log) ให้สร้างชีตใหม่ที่ชื่อขึ้นต้นด้วย `_app_` เท่านั้น

### III. ค่าที่บันทึกต้องตรงกับค่าเดิมในชีตทุกตัวอักษร (Value Fidelity)

- ค่าในรายการตัวเลือกต้องเหมือนค่าที่ใช้อยู่ในชีตทุกตัวอักษร รวมถึงคำที่สะกดไว้แบบเดิม เช่น `Requement`, `รอ Complie ต้องแจ้งอจ.`, `Workbeanch` ห้ามแก้คำสะกดเหล่านี้เอง เพราะสูตร ฟิลเตอร์ และตัวติดตามเดิมอ้างอิงค่าเหล่านี้อยู่
- ลำดับในการหาค่าตัวเลือก:
  1. ใช้ Data Validation ของคอลัมน์นั้นในชีต
  2. ถ้าไม่มี ใช้ค่าที่ไม่ซ้ำกันจากข้อมูลจริง
  3. รายชื่อคนใช้จากชีต `รายชื่อ`
- ช่องที่มีตัวเลือกจำกัดต้องเป็น dropdown เท่านั้น เพื่อกันไม่ให้ค่าไปอยู่ผิดคอลัมน์ (ปัจจุบันมีวันที่ไปอยู่ในช่อง "แพลตฟอร์ม" และชื่อนักพัฒนาไปอยู่ในช่อง "ประเภทปัญหา")

### IV. ใช้นิยามสถานะชุดเดียวกันทั้งแอป (Status Semantics)

- **สถานะปิดงาน (Closed)** มีแค่ `0.แก้ไขเรียบร้อย`, `0.ยกเลิก`, `0.ใช้งานได้อยู่แล้ว`
- สถานะอื่นทั้งหมด รวมถึงค่าว่าง ถือเป็น**งานค้าง (Open)**
- ⚠️ **ห้ามใช้เงื่อนไข "ขึ้นต้นด้วย 0." เพื่อตัดสินว่าปิดงาน** เพราะ `0.รอแจ้งทีมพัฒนา` และ `0.จัดทำไฟล์แก้ไข` ยังเป็นงานค้างอยู่
- **เกินกำหนด (Overdue)** คืองานที่ยัง Open และวันกำหนดน้อยกว่าวันนี้ วันกำหนดใช้ `วันที่เลื่อน` ถ้ามีค่า ถ้าไม่มีให้ใช้ `วันที่ต้องได้`
- ทุกตัวเลข ทุกกราฟ และทุกตัวกรองในหน้า Monitor ต้องคำนวณจากนิยามชุดนี้ชุดเดียว โดยเขียนเป็นฟังก์ชันกลาง ห้ามเขียนซ้ำหลายที่ (ดู Principle XII)

### V. เขียนข้อมูลอย่างปลอดภัย (Safe Writes)

- ทุกครั้งที่เขียนต้องใช้ `LockService` กันการเขียนชนกันเมื่อหลายคนบันทึกพร้อมกัน
- ตอนแก้ไขรายการ ให้อ้างอิงทั้ง**เลขแถวและ `ลำดับ`** ก่อนเขียนต้องตรวจว่า `ลำดับ` ในแถวนั้นยังตรงอยู่ ถ้าไม่ตรง (เช่น มีคน sort ชีต) ให้หยุดและแจ้งผู้ใช้ ห้ามเขียนทับ
- แอปต้องเขียนเฉพาะช่องที่ผู้ใช้แก้จริง ห้ามเขียนทับทั้งแถว
- รายการใหม่ให้ต่อท้ายชีต โดยใช้ `ลำดับ` = ค่าสูงสุดเดิม + 1
- **ลบแถวได้ผ่านช่องทางเดียวเท่านั้น** คือปุ่ม "ลบรายการนี้" สำหรับผู้มีสิทธิ์แก้ไข (ตัดสินใจโดยผู้ใช้ 2026-11-11)
  ต้องทำภายใต้ lock, ตรวจ `ลำดับ` ที่แถวนั้น, ตรวจทุกคอลัมน์ว่ายังตรงกับที่ผู้ใช้เห็น และบันทึกสำเนาทั้งแถว
  (JSON หัวคอลัมน์ → ค่า) ลง `_app_log` ก่อนรายงานสำเร็จ งานที่ยกเลิกยังให้เปลี่ยนสถานะเป็น `0.ยกเลิก` ได้ตามเดิม
  การลบเกิน 1 แถวต่อครั้ง หรือลบโดยไม่มีสำเนาใน log ยังห้ามเหมือนเดิม
- ทุกการเขียนต้องบันทึกลง `_app_log` ด้วยข้อมูลต่อไปนี้: เวลา, ผู้ใช้ (email), เลขแถว, ลำดับ, คอลัมน์, ค่าเดิม, ค่าใหม่

### VI. รูปแบบวันที่ (Date Handling)

- วันที่ในชีตหลักเป็น**ปี ค.ศ.** รูปแบบ `d/m/yyyy` (เช่น `16/4/2026`) ตอนเขียนต้องเก็บรูปแบบนี้ไว้
- ตอนอ่านให้ใช้ `getDisplayValues()` แล้ว parse เอง เพื่อไม่ให้ timezone หรือ locale ทำให้วันที่เพี้ยน
- ค่าวันที่ที่ parse ไม่ได้ให้แสดงตามข้อความเดิมพร้อมป้ายเตือน ห้ามปล่อยให้แอปล่ม และห้ามแก้ค่าเอง
- Timezone ของแอป: `Asia/Bangkok`

### VII. Monitor ต้องตอบคำถามจริงของทีม (Monitoring Must Be Actionable)

หน้า Dashboard ต้องตอบคำถามเหล่านี้ได้ในหน้าจอเดียว:

1. ตอนนี้มีงานค้างกี่งาน และเกินกำหนดกี่งาน
2. งานค้างกระจายอยู่ที่สถานะไหนบ้าง และสถานะไหนเป็นคอขวด (เช่น `รอ compile`, `กำลังทดสอบ`)
3. นักพัฒนาแต่ละคนมีงานค้างกี่งาน และในนั้นเกินกำหนดกี่งาน
4. PM แต่ละคนดูแลงานค้างกี่งาน
5. ปิดงานไปได้กี่งานในสัปดาห์นี้และเดือนนี้ (นับจาก `วันที่เสร็จ`)
6. รายการงานเกินกำหนด เรียงจากงานที่เกินนานที่สุดก่อน

ทุกตัวเลขต้องคลิกเพื่อดูรายการที่อยู่เบื้องหลังได้ ตัวกรองหลักที่ต้องมี: แพลตฟอร์ม, PM, นักพัฒนา, ความเร่งด่วน, ช่วงวันที่

### VIII. เรียบง่ายและไม่พึ่งของภายนอก (Simplicity)

- Stack: **Google Apps Script Web App** (`HtmlService`) เป็น **project แบบ standalone แยกจาก project ที่ผูกกับชีต** และเปิดชีตด้วย `SpreadsheetApp.openById()` โดยอ่าน Spreadsheet ID จาก Script Properties (`SPREADSHEET_ID`) เพื่อให้ project ทดสอบชี้ไปที่สำเนา และ project จริงชี้ไปที่ชีตจริง โดยใช้โค้ดชุดเดียวกัน
- **ห้ามแตะต้อง project ที่ผูกกับชีต** (ซึ่งมีบอท LINE "แมวส้ม" อยู่) ห้าม push, pull เพื่อแก้ไข หรือ deploy ทับ project นั้น
- ไฟล์โค้ดใน Apps Script แยกตามหน้าที่ได้หลายไฟล์ เพื่อให้เป็นไปตาม Principle XI–XII โดยมีโครงหลักดังนี้:
  - `.gs` ฝั่ง server: `Code.gs` (entry point: `doGet` และฟังก์ชันที่ UI เรียก), ไฟล์ domain (กฎธุรกิจที่ไม่มี I/O), และไฟล์ data-access (อ่านและเขียนชีต)
  - `.html` ฝั่ง UI: `Index.html` และไฟล์ partial ที่ include เข้ามา เช่น `Styles.html`, `Scripts.html`, และ component ที่ใช้ซ้ำ
- ห้ามใช้ backend หรือ hosting ภายนอก และห้ามเก็บข้อมูลไว้นอก Google Workspace
  - ข้อยกเว้นเดียว: **หน้าทางเข้า (entry page) แบบ static บน GitHub Pages** (`docs/index.html`) ที่มีแค่ลิงก์หรือพาไปยัง URL ของ Apps Script web app ได้ โดยต้องไม่มีข้อมูล ไม่มี Spreadsheet ID ไม่เรียก API และไม่ฝังแอปไว้ใน iframe
- เครื่องมือสำหรับพัฒนาบนเครื่อง (`clasp`, ตัวรันเทสต์บน Node, Playwright) ใช้ได้ เพราะไม่ใช่ส่วนหนึ่งของแอปที่ deploy และไม่ได้รับข้อมูลจริง
- กราฟเขียนด้วย SVG/CSS ล้วน หรือใช้ library เดียวผ่าน CDN ที่ล็อกเวอร์ชันไว้
- UI เป็นภาษาไทย และต้องใช้งานบนมือถือได้

---

## Part B — หลักการด้านวิศวกรรม (Engineering Principles)

### IX. คุณภาพโค้ด (Code Quality, NON-NEGOTIABLE)

- โค้ดต้องอ่านง่ายก่อนเสมอ ใช้ชื่อที่สื่อความหมาย ฟังก์ชันเล็กและทำหน้าที่เดียว ไม่มีโค้ดที่ไม่ใช้แล้ว และไม่มีโค้ดที่ comment ทิ้งไว้
- ESLint และ Prettier ต้องผ่านโดยไม่มี error ก่อน commit ทุกครั้ง ใช้ JSDoc ระบุชนิดข้อมูลกับฟังก์ชันสาธารณะทุกตัว และตรวจด้วย `// @ts-check`
- จัดการ error อย่างชัดเจน ห้ามมี `catch` ที่กลืน error เงียบๆ ข้อผิดพลาดต้องแสดงให้ผู้ใช้เห็นเป็นข้อความภาษาไทยที่เข้าใจได้ หรือบันทึกพร้อมบริบท
- ห้ามใช้ตัวเลขหรือข้อความลอยๆ (magic values) ชื่อคอลัมน์ ชื่อชีต รายการสถานะ และค่าคงที่อื่นๆ ต้องอยู่ในไฟล์ค่าคงที่ที่เดียว
- ทุกการเปลี่ยนแปลงต้องผ่าน code review ด้วย skill `code-review` หรือให้คนรีวิว ก่อนจะถือว่าเสร็จ

### X. Test-Driven Development (NON-NEGOTIABLE)

- ต้องทำตามลำดับ Red → Green → Refactor เขียนเทสต์และเห็นเทสต์ fail **ก่อน**เขียนโค้ดจริง
- ระดับการทดสอบ:
  - **Unit test**: กฎธุรกิจทุกข้อใน domain layer รันบน Node ได้โดยไม่ต้องใช้ Google เช่น นิยาม Open/Closed/Overdue, การ parse และจัดรูปแบบวันที่, การ validate ฟอร์ม, การคำนวณตัวเลข Dashboard, การตรวจข้อมูลไม่ครบหรือผิดช่อง, และการหาคอลัมน์จากหัวคอลัมน์ ต้องมี coverage อย่างน้อย **90%**
  - **Integration test**: การอ่านและเขียนชีตจริง, `LockService`, การตรวจ `ลำดับ`, และ `_app_log` ต้องรันกับ**สำเนาของ Spreadsheet** เท่านั้น
  - **E2E test** ด้วย Playwright ครอบคลุมทุก user journey หลักใน spec รันกับ UI ที่จำลอง `google.script.run` ด้วยข้อมูลตัวอย่าง และต้องมี smoke checklist บน deployment ทดสอบก่อนปล่อยจริง
- แก้บั๊กทุกครั้งต้องเริ่มจากเขียนเทสต์ที่ทำให้บั๊กนั้นเกิดซ้ำได้ก่อน
- เทสต์ต้องให้ผลเหมือนเดิมทุกครั้งที่รัน และไม่ขึ้นต่อกัน เทสต์ที่ผ่านบ้างไม่ผ่านบ้างถือเป็นบั๊ก ห้าม skip
- ห้ามบอกว่างานเสร็จจนกว่าจะรันเทสต์ทั้งหมดแล้วเห็นผลว่าผ่านจริง

### XI. ใช้ซ้ำก่อนสร้างใหม่ (Reuse First)

- ก่อนเขียนโค้ดใหม่ ต้องหาฟังก์ชันหรือ component ที่มีอยู่แล้วมาใช้หรือขยายก่อน
- UI ที่ใช้ตั้งแต่ **2 ที่ขึ้นไป** ต้องแยกเป็น component กลาง (HTML partial + JS) เช่น dropdown ตามค่าในชีต, ช่องวันที่, ป้ายสถานะ, การ์ดตัวเลข, ตาราง, ตัวกรอง, และหน้าต่างยืนยัน ส่วน logic ที่ซ้ำกัน 2 ที่ต้องแยกเป็นฟังก์ชันกลาง
- component กลางต้องตั้งค่าผ่าน parameter ได้ และไม่ผูกกับข้อมูลของหน้าใดหน้าหนึ่ง
- ทุกชิ้นที่ใช้ร่วมกันต้องมีเทสต์ของตัวเอง และมี JSDoc อธิบายวิธีใช้

### XII. รวมกฎธุรกิจไว้ที่เดียว (Centralized Business Logic)

- กฎธุรกิจทั้งหมดต้องอยู่ใน domain layer ไฟล์เดียวหรือกลุ่มเดียว ได้แก่ นิยามสถานะ (IV), วันกำหนดและ Overdue, การ validate ช่องบังคับ, ลำดับขั้นตอนสถานะ, และการคำนวณตัวเลข Dashboard
- domain layer ต้องเป็น pure JavaScript ห้ามเรียก `SpreadsheetApp`, `Session`, หรือวันที่ปัจจุบันตรงๆ ให้รับ "วันนี้" และข้อมูลเข้ามาเป็น parameter แทน เพื่อให้ทดสอบบน Node ได้
- ฝั่ง UI ใช้กฎชุดเดียวกัน โดยให้ server ส่งผลที่คำนวณแล้ว หรือ include ไฟล์ domain เดียวกันเข้าไป ห้ามเขียนกฎซ้ำใน UI
- ชั้น data-access ทำหน้าที่อ่านและเขียนชีตเท่านั้น (I, II, V, VI) ส่วน `Code.gs` เป็นตัวเชื่อมบางๆ ระหว่าง UI, domain และ data-access

### XIII. ประสบการณ์ผู้ใช้สม่ำเสมอ ใช้ง่าย และสวยงาม (UX Consistency)

- ใช้ design token ชุดเดียว (สี, ระยะห่าง, ตัวอักษร, มุมโค้ง, เงา) และ component กลางจาก XI ห้ามใส่สีหรือ style เฉพาะจุด
- การกระทำเดียวกันต้องหน้าตาและพฤติกรรมเหมือนกันทุกหน้า
- ทุกหน้าที่แสดงข้อมูลต้องมีสถานะ **กำลังโหลด, ไม่มีข้อมูล, เกิดข้อผิดพลาด, และสำเร็จ** ครบ
- ต้องผ่าน **WCAG 2.1 AA**: ใช้คีย์บอร์ดได้, เห็น focus ชัด, สีตัดกันพอ, ทุกช่องมี label, และไม่สื่อความหมายด้วยสีอย่างเดียว (ป้ายสถานะต้องมีข้อความด้วย)
- รองรับมือถือ (VIII) โดยตารางยาวต้องอ่านได้บนจอเล็ก
- หน้าจอต้องสะอาด ไม่รก เห็นข้อมูลสำคัญและปุ่มหลักทันที ความเรียบร้อยของหน้าตาเป็นส่วนหนึ่งของคำว่า "เสร็จ"
- **มีวิธีใช้ในตัวแอป** ได้แก่
  - tour แนะนำการใช้งานครั้งแรก
  - tooltip และคำแนะนำในช่องที่ไม่ชัดเจน
  - หน้าว่างที่บอกว่าต้องทำอะไรต่อ
  - หน้า "วิธีใช้งาน" ที่อธิบายทุก journey หลักทีละขั้น
- งาน UI ใหม่ต้องใช้ skill `frontend-design` และตรวจด้วย `web-design-guidelines`
- ข้อความถึงผู้ใช้ต้องเป็นภาษาไทยที่ชัดเจน บอกว่าต้องทำอะไรต่อ และห้ามแสดง error ทางเทคนิคตรงๆ

### XIV. ประสิทธิภาพ (Performance Requirements)

- อ่านข้อมูลทั้งชีตด้วยการเรียกครั้งเดียว (`getDataRange().getDisplayValues()`) ห้ามอ่านทีละเซลล์ และห้ามเรียก API ของชีตใน loop
- เมื่อมีข้อมูล 1,000 แถว หน้า Dashboard ต้องโหลดเสร็จภายใน **5 วินาที** และการบันทึกหนึ่งรายการต้องเสร็จภายใน **3 วินาที** (รวมเวลารอ lock และเขียน log)
- การกรองและค้นหาบนหน้าจอทำฝั่ง client กับข้อมูลที่โหลดมาแล้ว และต้องตอบสนองภายใน **300 ms**
- ตารางที่ยาวต้องแบ่งหน้าหรือแสดงทีละส่วน
- ใช้ `CacheService` ได้ไม่เกิน 5 นาที (I) และต้องล้าง cache ทันทีเมื่อแอปเขียนข้อมูล
- ต้องมีเทสต์วัดเวลาการคำนวณของ domain layer กับข้อมูลจำลอง 1,000 แถว

### XV. Commit และ Deploy อย่างมีวินัย (Commit & Release Discipline)

- **Commit บ่อยๆ**: ทุกครั้งที่เทสต์ผ่าน (green) และทุกครั้งที่จบ task ต้อง commit ทันที ห้ามปล่อยงานค้างไว้โดยไม่ commit
- แต่ละ commit ต้องเป็นการเปลี่ยนแปลงเรื่องเดียว และ lint กับเทสต์ต้องผ่าน
- ข้อความ commit ใช้รูปแบบ **Conventional Commits** (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `chore:`) และอธิบายว่า*ทำไม*
- ใช้ `clasp` ซิงก์โค้ดระหว่าง git กับ Apps Script โดยให้ git เป็นต้นฉบับ ห้ามแก้โค้ดใน editor ของ Apps Script โดยตรง
- ใช้ Deployment ที่ตั้งชื่อเวอร์ชันไว้ ห้ามให้ผู้ใช้จริงใช้ `/dev` และต้องย้อนกลับเวอร์ชันได้
- ห้าม commit secrets, token, ไฟล์ `.clasprc.json`, หรือข้อมูลจริงจากชีต ข้อมูลตัวอย่างสำหรับเทสต์ต้องเป็นข้อมูลปลอม และห้ามใช้ `--no-verify`

### XVI. ใช้ Skill ที่มีให้เต็มที่ (Skill-Assisted Development)

| ขั้นตอน | Skill หรือเครื่องมือที่ต้องใช้ |
|---|---|
| คิดฟีเจอร์ใหม่ | `superpowers:brainstorming` → `/speckit-specify` → `/speckit-clarify` |
| วางแผน | `/speckit-plan`, `/speckit-checklist` |
| แตกงาน | `/speckit-tasks`, `/speckit-analyze` |
| ลงมือทำ | `/speckit-implement`, `superpowers:test-driven-development` |
| งาน UI | `frontend-design`, `web-design-guidelines`, `writing-guidelines` (ข้อความในหน้าจอและคู่มือ) |
| บั๊กหรือเทสต์ fail | `superpowers:systematic-debugging` (หาสาเหตุจริงก่อนแก้) |
| E2E และตรวจผ่านเบราว์เซอร์ | Playwright MCP |
| รีวิวก่อนรวมงาน | `code-review`, `superpowers:requesting-code-review` |
| ก่อนบอกว่า "เสร็จ" | `superpowers:verification-before-completion` |
| ตรวจงานที่ยังขาด | `/speckit-converge` |
| ทำงานยาวอัตโนมัติ | Ralph Loop โดยต้องมีเงื่อนไขจบชัดเจน และเทสต์ต้องผ่าน |

- ถ้ามี skill สำหรับงานนั้นอยู่แล้ว ต้องใช้ skill นั้น ห้ามทำเอาเอง
- ต้องตรวจ API ของ Apps Script และ library กับเอกสารล่าสุด (เช่นผ่าน Context7) ห้ามเขียนจากความจำ
- skill สาย React, Next.js และ Vercel (`vercel-*`, `deploy-to-vercel`) **ไม่ใช้กับโปรเจกต์นี้** เพราะขัดกับ Principle VIII

---

## Data Contract — ชีต `ข้อมูลขอแก้ไขโปรแกรม`

| คอลัมน์ | ชนิด | ช่องบังคับ (ตอนสร้างใหม่) | ค่าที่ใช้อยู่ / หมายเหตุ |
|---|---|---|---|
| ลำดับ | ตัวเลข | auto | ค่าสูงสุดเดิม + 1 ห้ามให้ผู้ใช้แก้ |
| แพลตฟอร์ม | dropdown | ✅ | `EHP`, `NHIP`, `INV`, `EHP Pharmacy` |
| ประเภทปัญหา | dropdown | ✅ | `Requement`, `defect`, `ลด error`, `การใช้งาน`, `ข้อมูลพื้นฐาน`, `รายงาน`, `แบบฟอร์ม`, `ไม่ระบุ` |
| ความเร่งด่วน | dropdown | ✅ | `ด่วนที่สุด`, `ด่วน`, `ปกติ` |
| สถานะ | dropdown | ✅ (ค่าเริ่มต้น `0.รอแจ้งทีมพัฒนา`) | ดูลำดับขั้นตอนด้านล่าง |
| ระบบงาน | dropdown + พิมพ์ค่าใหม่ได้ | ✅ | มีค่าที่ใช้อยู่ประมาณ 67 ค่า |
| รายละเอียด | ข้อความยาว | ✅ | |
| PM รับผิดชอบ | dropdown | ✅ (ค่าเริ่มต้นคือผู้ใช้ที่ล็อกอิน ถ้า map ได้) | จากชีต `รายชื่อ` |
| ข้อมูลลิงค์ Taiga หรือ MANTIS | ข้อความ | | อาจเป็นเลข ticket หรือ URL ถ้าเป็น URL ให้แสดงเป็นลิงก์ |
| วันที่ต้องได้ | วันที่ | ✅ | |
| นักพัฒนา | dropdown | | จากชีต `รายชื่อ` |
| วันที่เลื่อน | วันที่ | | ถ้ามีค่า ให้ใช้แทนวันที่ต้องได้ |
| วันที่เสร็จ | วันที่ | บังคับเมื่อเปลี่ยนเป็น `0.แก้ไขเรียบร้อย` | ค่าเริ่มต้น = วันนี้ |
| วันที่ Deploy | วันที่ | | |
| ลำดับการแก้ไข Dev | ตัวเลข | | ลำดับคิวของนักพัฒนา |
| ระยะเวลาพัฒนา(ชม.) | ตัวเลข | | |
| เริ่มพัฒนา | วันที่ | | |
| พัฒนาเสร็จ | วันที่ | | |

**ลำดับขั้นตอนของสถานะ** (ใช้เรียงในกราฟและ dropdown):
`0.จัดทำไฟล์แก้ไข` → `0.จัดทำ Taiga` → `รอ PM ตรวจสอบ Taiga` → `0.รอแจ้งทีมพัฒนา` → `dev ขอ Sourecode อจ.` → `รอทีมพัฒนา` → `กำลังพัฒนา` → `ส่งกลับนักพัฒนาแก้ไข` → `กำลังทดสอบ` → `รอ compile` → `รอ Complie ต้องแจ้งอจ.` → **ปิดงาน:** `0.ยกเลิก` / `0.ใช้งานได้อยู่แล้ว` / `0.แก้ไขเรียบร้อย`

(ลำดับนี้ PM อนุมัติเมื่อ 2026-11-11 และเพิ่มสถานะใหม่ 2 ค่า: `0.จัดทำ Taiga`, `dev ขอ Sourecode อจ.` ตามตัวสะกดในชีต รายการใหม่ยังเริ่มที่ `0.รอแจ้งทีมพัฒนา`)

---

## Additional Constraints

- **สิทธิ์การใช้งาน**: Deploy แบบ "Execute as: User accessing the web app" เพื่อให้ log บันทึกตัวตนจริงของคนแก้ และให้สิทธิ์แก้ไขในแอปเป็นไปตามสิทธิ์ของชีต ผู้ที่มีแค่สิทธิ์ดูจะเปิดได้เฉพาะหน้า Monitor
- **ใครเข้าถึงได้**: ชีตเป็นของบัญชี Gmail ส่วนตัว ไม่ใช่ Workspace domain จึงใช้ "Anyone with a Google account" ซึ่งต้องล็อกอินก่อน คนที่ไม่มีสิทธิ์ในชีตจะอ่านข้อมูลไม่ได้ เพราะแอปรันด้วยสิทธิ์ของผู้ใช้เอง
- **ข้อมูลภายใน**: ห้ามส่งข้อมูลออกไปยังบริการภายนอก และห้ามเปิดเว็บแอปให้ "Anyone (anonymous)" เข้าถึง
- **ข้อมูลไม่ครบ**: แถวที่ไม่มี `รายละเอียด` ไม่นับเป็นรายการ ส่วนแถวที่มีค่าผิดประเภทให้แสดงป้าย "ข้อมูลไม่ครบ/ผิดช่อง" ในหน้า Monitor เพื่อให้ PM ตามแก้

## Quality Gates

งานจะถือว่า **เสร็จ** เมื่อผ่านครบทุกข้อ:

1. มี spec และ plan ผ่าน Constitution Check ครบทุกข้อ I–XVI
2. เขียนเทสต์ก่อน และตอนนี้เทสต์ผ่านทั้งหมด domain layer มี coverage ≥ 90%
3. lint, format และ `@ts-check` ผ่าน โดยไม่มี error
4. ไม่มี logic ซ้ำ ใช้ component และฟังก์ชันกลาง และกฎธุรกิจอยู่ใน domain layer เท่านั้น
5. UI ใช้ design token มีสถานะครบ 4 แบบ ผ่าน WCAG 2.1 AA ใช้บนมือถือได้ และมีวิธีใช้ในตัวแอป
6. ผ่านเกณฑ์ประสิทธิภาพใน XIV
7. ผ่าน checklist ก่อน deploy:
   - คนที่ยังกรอกในชีตโดยตรงใช้งานได้ตามปกติ
   - ตัวติดตาม `_แมวส้ม_` ยังทำงาน และจับการเปลี่ยนสถานะที่มาจากแอปได้
   - ตัวเลขงานค้างและงานเกินกำหนดตรงกับการนับด้วยมือโดยใช้ฟิลเตอร์ในชีต
   - โครงสร้างชีตหลักไม่เปลี่ยน (คอลัมน์และหัวคอลัมน์เหมือนเดิม)
8. code review เสร็จ และแก้ทุกข้อที่พบแล้ว
9. commit ด้วย Conventional Commit แล้ว

## Development Workflow

1. **Specify**: ใช้ `/speckit-specify` กำหนดว่าจะทำ*อะไร*และ*ทำไม* แล้วใช้ `/speckit-clarify` เคลียร์จุดที่ยังไม่ชัด
2. **Plan**: ใช้ `/speckit-plan` ออกแบบภายใต้ข้อจำกัดของ Principle VIII และตรวจ Constitution Check
3. **Tasks**: ใช้ `/speckit-tasks` แตกงานโดยให้ task เขียนเทสต์มาก่อน task เขียนโค้ด แล้วตรวจความสอดคล้องด้วย `/speckit-analyze`
4. **Implement**: ทำแต่ละ task ตามรอบ red → green → refactor → commit โดยทดสอบกับ**สำเนาของ Spreadsheet** เสมอ ห้ามพัฒนาบนชีตจริง
5. **Verify & Release**: รันเทสต์ทั้งหมดและ E2E, ทำ code review, ผ่าน checklist ก่อน deploy, แล้วสร้าง Deployment ที่ตั้งชื่อเวอร์ชันไว้

## Governance

- Constitution นี้มีลำดับความสำคัญสูงกว่า spec, plan และ task ทั้งหมด ถ้าขัดกันให้ยึดตามเอกสารนี้
- การแก้หลักการข้อ I–V และ Data Contract ต้องให้ PM เจ้าของชีตอนุมัติ และต้องเพิ่มเลขเวอร์ชันหลัก (MAJOR)
- การเปลี่ยนแปลงทุกครั้งต้องเพิ่มเลขเวอร์ชันแบบ Semantic Versioning และแก้วันที่ Last Amended
  - **MAJOR**: ลบหลักการ หรือนิยามหลักการใหม่จนเข้ากันไม่ได้กับของเดิม
  - **MINOR**: เพิ่มหลักการหรือหัวข้อ หรือขยายเนื้อหาอย่างมีนัยสำคัญ
  - **PATCH**: แก้ถ้อยคำให้ชัดขึ้น โดยความหมายไม่เปลี่ยน
- ทุก plan และทุก review ต้องตรวจว่าเป็นไปตาม constitution นี้ ความซับซ้อนที่ไม่มีเหตุผลรองรับจะทำให้รวมงานไม่ได้
- คำแนะนำสำหรับ agent อยู่ใน `CLAUDE.md` และต้องสอดคล้องกับเอกสารนี้เสมอ

**Version**: 4.0.0 | **Ratified**: 2026-11-11 | **Last Amended**: 2026-11-11
