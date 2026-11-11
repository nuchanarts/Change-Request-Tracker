# Quickstart & Validation Guide: EHP Change Request Tracker

This guide explains how to set up, run, test, and deploy the app, and how to prove that each user story works. For details, see the [plan](./plan.md), the [data model](./data-model.md), and the [server API contract](./contracts/server-api.md).

## Prerequisites

- Node.js 22+ and npm 10+
- A Google account in the organization with **edit** access to the real spreadsheet, so you can make a copy
- The Apps Script API turned on for your account: https://script.google.com/home/usersettings

## 1. One-time setup

```powershell
npm install
npx clasp login
```

1. **Make a test copy.** In Google Sheets, choose **File → Make a copy** of "สรุปขอแก้ไขโปรแกรม EHP และ แพลตฟอร์มกลาง" and name it `[TEST] สรุปขอแก้ไขโปรแกรม EHP`. The copy brings its bound script with it.
2. **Get the script ID.** In the copy, open **Extensions → Apps Script → Project Settings** and copy the Script ID.
3. **Create the test clasp target.** Put the ID into `.clasp.test.json` (this file is git-ignored):
   ```json
   { "scriptId": "<COPY_SCRIPT_ID>", "rootDir": "dist" }
   ```
4. **Run T0 gates.** Pull the existing code into `src/legacy/`, then record the findings for R2, R3, R6, and R8 in `research.md`:
   ```powershell
   npm run legacy:pull
   ```

> ⚠ Never put the real spreadsheet's script ID in `.clasp.test.json`. Only `npm run push:prod` uses `.clasp.prod.json`, and it refuses to run unless you are on `main` with a clean tree.

## 2. Daily development loop (TDD)

```powershell
npm run test:watch         # Vitest: unit + contract tests (red → green → refactor)
npm run lint               # ESLint + Prettier check + tsc --checkJs
npm run preview            # build preview/ with mocked google.script.run, serve on http://localhost:5173
npm run test:e2e           # Playwright against the preview (desktop + 375px mobile + axe)
npm run coverage           # Domain coverage must be ≥ 90%
```

Commit after every green cycle, using Conventional Commits (constitution XV).

## 3. Push to the test copy and run integration tests

```powershell
npm run push:test          # build dist/ (includes src/legacy + integration tests) and clasp push to the copy
```

Then, in the copy's Apps Script editor, run `runIntegrationTests`. **Expected result**: the log shows `ALL PASSED`. The test rows tagged `[TEST]` end with the status `0.ยกเลิก`.

## 4. Validation scenarios (run on the test deployment)

Deploy the copy using **Deploy → Test deployments** (or a named deployment), then open its `/exec` URL.

| # | Story | Steps | Expected |
|---|---|---|---|
| V1 | US1 Monitor | Open the app. In the sheet, filter สถานะ to exclude the 3 closed values and count the rows. Then also filter วันที่เลื่อน or วันที่ต้องได้ < today and count again. | The **งานค้าง** and **เกินกำหนด** cards equal the two manual counts exactly |
| V2 | US1 drill-down | Click the overdue number for one developer | The list length equals that number, and every row belongs to that developer |
| V3 | US1 filters | Set แพลตฟอร์ม = NHIP and ความเร่งด่วน = ด่วนที่สุด | All cards and charts change. Spot-check against a sheet filter |
| V4 | US2 create | Add an item with every required field filled | A new last row appears with `ลำดับ` = previous max + 1, and dates are in `d/m/yyyy`. `_app_log` has one row per field. The `_แมวส้ม_` tracker logs the new status |
| V5 | US2 validation | Submit with รายละเอียด empty | Nothing is written. The field shows a Thai error |
| V6 | US3 edit | Change only นักพัฒนา on an item | Only that cell changes, and `_app_log` gets one `UPDATE` row |
| V7 | US3 seq guard | Open an item's edit form, sort the sheet in another tab, then save | `SEQ_MISMATCH` message appears. Nothing is written |
| V8 | US3 conflict | Open the edit form, change สถานะ directly in the sheet, then save a status change in the app | `CONFLICT` message appears. Nothing is written |
| V9 | US3 viewer | Open the app with a view-only account | Only Monitor, Items, and Help are usable. There are no add or edit buttons |
| V10 | US4 My Work | Map yourself to a developer name | The groups are correct, and a quick status change saves and appears in Monitor after Refresh |
| V11 | US6 data quality | Put a date in แพลตฟอร์ม on a test row | The row appears under "ข้อมูลไม่ครบ/ผิดช่อง" with the column named |
| V12 | US7 guidance | Use a fresh browser profile | The tour starts, can be skipped, and can be replayed from วิธีใช้งาน |
| V13 | Perf | Use the copy with ≥ 1,000 rows (duplicate rows in the copy if needed) | Monitor is usable in < 5 s, a save takes < 3 s, and filters respond instantly |

## 5. Release (production)

1. Merge into `main` after review, with every gate in the constitution's Quality Gates passing.
2. Run `npm run push:prod`. This builds, checks that the branch is `main` and the tree is clean, then runs `clasp push` to the real bound project. The legacy files are included unchanged.
3. Run `npx clasp -P .clasp.prod.json deploy -d "vX.Y.Z – <summary>"`. Never give users `/dev`.
4. Smoke test on production with V1, V2, and V9 (read-only checks), then share the `/exec` URL.
5. **Rollback**: in **Manage deployments**, point the deployment back to the previous version.
