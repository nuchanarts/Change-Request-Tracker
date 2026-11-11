# Data Model: EHP Change Request Tracker

**Feature**: `001-ehp-change-request-tracker` | **Date**: 2026-11-11

All persistent data lives in the Google Sheet (constitution I). This document describes:

1. the sheets the app reads and writes;
2. the in-memory shapes that the domain layer works with;
3. validation rules and state transitions.

---

## 1. Sheets

### 1.1 `ข้อมูลขอแก้ไขโปรแกรม` (main sheet: read and write; schema frozen)

Columns are located **by header text in row 1**, never by position (II). The authoritative list is the constitution's Data Contract. The keys used in code are:

| Key (code) | Header (exact) | Type | Required on create | Notes |
|---|---|---|---|---|
| `seq` | ลำดับ | integer | auto | `max + 1`, never user-editable |
| `platform` | แพลตฟอร์ม | option | ✅ | |
| `issueType` | ประเภทปัญหา | option | ✅ | Keep `Requement` exactly as spelled |
| `urgency` | ความเร่งด่วน | option | ✅ | ด่วนที่สุด > ด่วน > ปกติ |
| `status` | สถานะ | option | ✅ (default `0.รอแจ้งทีมพัฒนา`) | See §3 |
| `system` | ระบบงาน | option + free text | ✅ | About 67 known values |
| `detail` | รายละเอียด | long text | ✅ | Rows with an empty value are **not items** |
| `pm` | PM รับผิดชอบ | person | ✅ | Default = mapped current user |
| `ticket` | ข้อมูลลิงค์ Taiga หรือ MANTIS | text | | Shown as a link when it is a URL |
| `dueDate` | วันที่ต้องได้ | date | ✅ | |
| `developer` | นักพัฒนา | person | | |
| `postponedDate` | วันที่เลื่อน | date | | Overrides `dueDate` when it parses |
| `doneDate` | วันที่เสร็จ | date | required when status = `0.แก้ไขเรียบร้อย` | Default = today |
| `deployDate` | วันที่ Deploy | date | | |
| `devQueue` | ลำดับการแก้ไข Dev | integer | | Developer's queue order |
| `devHours` | ระยะเวลาพัฒนา(ชม.) | number | | |
| `devStart` | เริ่มพัฒนา | date | | |
| `devEnd` | พัฒนาเสร็จ | date | | |

Any header that cannot be found produces a `SchemaError` that lists the missing headers. When that happens, every write is disabled (FR-002).

### 1.2 `รายชื่อ` (read only)

This sheet is the source of the person options. The person column is found by header. **⚠ T0** must confirm the exact header (for example `ชื่อ`). If the sheet has role columns, they are used to split the PM and developer lists. Otherwise both lists use all names.

### 1.3 `_app_log` (created by the app; append only)

| Column | Type | Example |
|---|---|---|
| เวลา | text `d/m/yyyy HH:mm:ss` (Asia/Bangkok) | `11/11/2026 14:03:22` |
| ผู้ใช้ | email | `dev1@hospital.go.th` |
| การกระทำ | `CREATE` \| `UPDATE` \| `MAP_USER` | `UPDATE` |
| เลขแถว | integer | `415` |
| ลำดับ | integer | `702` |
| คอลัมน์ | header text | `สถานะ` |
| ค่าเดิม | text | `กำลังพัฒนา` |
| ค่าใหม่ | text | `รอ compile` |

### 1.4 `_app_users` (created by the app)

| Column | Type | Notes |
|---|---|---|
| email | text | unique key |
| ชื่อ | text | must exist in `รายชื่อ` |
| อัปเดตเมื่อ | text datetime | |

Users may change only their own mapping. Every change also writes a `MAP_USER` row to `_app_log`.

---

## 2. In-memory shapes (domain layer)

```text
SheetDate      = { y, m, d }                        // date only, no timezone
DateCell       = { raw: string, date: SheetDate|null, issue: null|'DATE_UNPARSEABLE'|'DATE_BUDDHIST_YEAR' }

ChangeRequest  = {
  rowNumber: int,              // 1-based sheet row
  seq: int|null,
  platform, issueType, urgency, status, system, detail, pm, ticket, developer: string (trimmed raw),
  dueDate, postponedDate, doneDate, deployDate, devStart, devEnd: DateCell,
  devQueue: number|null, devHours: number|null,
  // derived (Domain.enrich)
  isOpen: bool,
  effectiveDue: SheetDate|null, // postponedDate.date ?? dueDate.date
  isOverdue: bool,
  overdueDays: int,            // 0 when not overdue
  ticketUrl: string|null,
  issues: Issue[]
}

Issue          = { code, column, message }   // codes listed in §4
OptionSets     = { platform[], issueType[], urgency[], status[] (workflow order), system[], person[] (pm[], developer[]) }
Filters        = { platform[], pm[], developer[], urgency[], dateFrom: SheetDate|null, dateTo: SheetDate|null, status[], query: string }
Metrics        = {
  openCount, overdueCount,
  byStatus:    [{ status, count, ids[] }]   // workflow order, unknown statuses last
  byDeveloper: [{ name, open, overdue, ids[], overdueIds[] }]   // 'ยังไม่มอบหมาย' bucket
  byPm:        [{ name, open, ids[] }]
  closedThisWeek: { count, ids[] }, closedThisMonth: { count, ids[] },
  overdueList: ChangeRequest[]               // sorted overdueDays desc, then seq asc
  noDueDate:   { count, ids[] }
}
MyWorkGroups   = { overdue[], today[], within7[], later[], noDue[] }  // sorted by devQueue, then effectiveDue
```

`ids` are `seq` values, or `row:<n>` when `seq` is missing. Click-through uses these ids, so a drill-down list always matches its number exactly (FR-011).

---

## 3. Status model (constitution IV)

```text
CLOSED   = { '0.แก้ไขเรียบร้อย', '0.ใช้งานได้อยู่แล้ว', '0.ยกเลิก' }        // exact set membership, never startsWith('0.')
WORKFLOW = [ '0.รอแจ้งทีมพัฒนา', 'รอทีมพัฒนา', 'กำลังพัฒนา', '0.จัดทำไฟล์แก้ไข', 'รอ compile',
             'รอ Complie ต้องแจ้งอจ.', 'กำลังทดสอบ', 'ส่งกลับนักพัฒนาแก้ไข', 'รอ PM ตรวจสอบ Taiga',
             '0.แก้ไขเรียบร้อย', '0.ใช้งานได้อยู่แล้ว', '0.ยกเลิก' ]
isOpen(status)  = !CLOSED.has(trim(status))           // '' → open
```

**Transitions.** The workflow order is used for sorting and as the "next step" suggestion in My Work. **Any** status may be set to any other status. The team moves items back and forth (for example, `ส่งกลับนักพัฒนาแก้ไข`), and the sheet does not enforce an order, so the app must not either. Rules applied on save:

- When the new status is `0.แก้ไขเรียบร้อย`, `doneDate` is required. The form pre-fills it with today.
- When the new status is `0.ยกเลิก`, the user must confirm in a dialog.
- A status that is not in `WORKFLOW` but exists in the sheet is displayed after the known statuses and gets a `STATUS_UNKNOWN` issue. It cannot be selected for new writes.

**Overdue**: `isOpen && effectiveDue != null && effectiveDue < today`. `overdueDays = daysBetween(effectiveDue, today)`.

**Closed this week / month**: `!isOpen && doneDate.date` falls within the Monday–Sunday week or the calendar month that contains today.

---

## 4. Validation and data-quality rules

**Create (FR-017)**: all required fields must be non-empty. Option fields must be in their option set, except `system`, which may be new (`SYSTEM_NEW` warning, not an error). Dates must parse. If status = `0.แก้ไขเรียบร้อย`, `doneDate` is required.

**Update (FR-019 to FR-021)**: a change list `{ key: {from, to} }`. `seq` cannot be changed. The same option and date rules as create apply to the changed keys. Required fields cannot be cleared.

**Issue codes (FR-031)** are detected by `Domain.detectIssues(row, options)`:

| Code | Condition |
|---|---|
| `OPTION_INVALID` | An option column holds a value that is not in its option set (for example a date in แพลตฟอร์ม, or a person's name in ประเภทปัญหา) |
| `DATE_UNPARSEABLE` | A non-empty date cell does not parse |
| `DATE_BUDDHIST_YEAR` | A date's year is ≥ 2400 |
| `SEQ_MISSING` / `SEQ_DUPLICATE` | `ลำดับ` is empty or not unique. Edits to the row are blocked |
| `OPEN_NO_DUE` | The item is open with no effective due date |
| `CLOSED_NO_DONE_DATE` | The item is closed as `0.แก้ไขเรียบร้อย` without `doneDate` |
| `STATUS_UNKNOWN` | The status is not in `WORKFLOW` and is not empty |

Values are trimmed for comparison only. Writes always use the exact option string (III).

### 1.5 `_app_allowed` (team list: who may add or edit; added 2026-11-11, v1.2.0)

| Column | Type | Notes |
|---|---|---|
| email | text | one Gmail/Google account per row (case-insensitive) |
| ชื่อ | text | optional |
| หมายเหตุ | text | optional |

- **Everyone** who signs in with Google can **view**. Only emails on this list **and** with edit rights on the sheet can add or edit (`Repo.editAccess`). Others see a view-only banner that tells them to ask the PM.
- The sheet is **visible** (not hidden), so the PM manages it directly in Google Sheets.
- If the sheet does not exist yet, the first sheet editor who opens the app creates it with the sheet owner and themselves, and logs `ALLOW_INIT` in `_app_log`.
- All changes through the app are logged in `_app_log` with the editor's email.
