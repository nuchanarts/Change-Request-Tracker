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

1. **Make a test copy.** In Google Sheets, choose **File → Make a copy** of "สรุปขอแก้ไขโปรแกรม EHP และ แพลตฟอร์มกลาง" and name it `[TEST] สรุปขอแก้ไขโปรแกรม EHP`. Copy the **spreadsheet ID** from its URL: the part between `/d/` and `/edit`.
2. **Create the TEST standalone project.** The script is created in your own Drive:
   ```powershell
   npm run clasp:create-test        # clasp create --type webapp --title "[TEST] EHP Tracker" --rootDir dist → .clasp.test.json
   ```
3. **Point it at the copy.** Push once, then in the TEST project open **Project Settings → Script properties** and add `SPREADSHEET_ID` = `<COPY_SPREADSHEET_ID>`.
4. **Run the T0 probes.** Run `runProbes` in the TEST project. It logs the date cell types per column, the spreadsheet locale and timezone, and the `getEditors()` behavior. Record the results in `research.md` (R6, R8).

> ⚠ **Never** use the sheet's bound script project (Extensions → Apps Script inside the sheet). It hosts the LINE bot "แมวส้ม", and `clasp push` would delete it. `scripts/check-clasp-target.mjs` blocks pushes to the IDs listed in `scripts/bound-script-ids.txt`. Only `npm run push:prod` uses `.clasp.prod.json`, and it refuses to run unless you are on `main` with a clean tree.

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
npm run push:test          # build dist/ (+ integration tests) and clasp push to the TEST standalone project
```

Then, in the copy's Apps Script editor, run `runIntegrationTests`. **Expected result**: the log shows `ALL PASSED`. The test rows tagged `[TEST]` end with the status `0.ยกเลิก`.

## 4. Validation scenarios (run on the test deployment)

Deploy the copy using **Deploy → Test deployments** (or a named deployment), then open its `/exec` URL.

| # | Story | Steps | Expected |
|---|---|---|---|
| V1 | US1 Monitor | Open the app. In the sheet, filter สถานะ to exclude the 3 closed values and count the rows. Then also filter วันที่เลื่อน or วันที่ต้องได้ < today and count again. | The **งานค้าง** and **เกินกำหนด** cards equal the two manual counts exactly |
| V2 | US1 drill-down | Click the overdue number for one developer | The list length equals that number, and every row belongs to that developer |
| V3 | US1 filters | Set แพลตฟอร์ม = NHIP and ความเร่งด่วน = ด่วนที่สุด | All cards and charts change. Spot-check against a sheet filter |
| V4 | US2 create | Add an item with every required field filled | A new last row appears with `ลำดับ` = previous max + 1, and dates are in `d/m/yyyy`. `_app_log` has one row per field. (The แมวส้ม bot reads the **real** sheet, so tracker pickup is checked on PROD only, within 15 minutes, in V14.) |
| V5 | US2 validation | Submit with รายละเอียด empty | Nothing is written. The field shows a Thai error |
| V6 | US3 edit | Change only นักพัฒนา on an item | Only that cell changes, and `_app_log` gets one `UPDATE` row |
| V7 | US3 seq guard | Open an item's edit form, sort the sheet in another tab, then save | `SEQ_MISMATCH` message appears. Nothing is written |
| V8 | US3 conflict | Open the edit form, change สถานะ directly in the sheet, then save a status change in the app | `CONFLICT` message appears. Nothing is written |
| V9 | US3 viewer | Open the app with a view-only account | Only Monitor, Items, and Help are usable. There are no add or edit buttons |
| V10 | US4 My Work | Map yourself to a developer name | The groups are correct, and a quick status change saves and appears in Monitor after Refresh |
| V11 | US6 data quality | Put a date in แพลตฟอร์ม on a test row | The row appears under "ข้อมูลไม่ครบ/ผิดช่อง" with the column named |
| V12 | US7 guidance | Use a fresh browser profile | The tour starts, can be skipped, and can be replayed from วิธีใช้งาน |
| V13 | Perf | Use the copy with ≥ 1,000 rows (duplicate rows in the copy if needed) | Monitor is usable in < 5 s, a save takes < 3 s, and filters respond instantly |
| V14 | Tracker (PROD, after release) | Change one real item's status through the app, then wait ≤ 15 minutes | `_แมวส้ม_บันทึก` records the change, and LINE "แมวส้ม ความเคลื่อนไหว" shows it |

## 5. Release (production)

1. Merge into `main` after review, with every gate in the constitution's Quality Gates passing.
2. **First release only.** Someone with **edit** rights on the real sheet runs `npm run clasp:create-prod` to create the PROD standalone project, then sets the script property `SPREADSHEET_ID` = `1voV3mHQi7bH2PbBeWaVrk0EaUs-9BnqMpKc53oI__RE`. That person can be the owner `ehpcisplatform@gmail.com` or an editor.
3. Run `npm run push:prod`. This builds, checks that the branch is `main`, the tree is clean, and the target is not a bound project, then runs `clasp push` to the PROD standalone project.
4. Run `npx clasp -P .clasp.prod.json deploy -d "vX.Y.Z – <summary>"`. Never give users `/dev`. In **Manage deployments**, confirm that the web app is set to "Execute as: User accessing" and "Who has access: Anyone with a Google account".
5. Smoke test on production with V1, V2, and V9 (read-only checks), and V14. Then share the `/exec` URL.
6. **Rollback**: in **Manage deployments**, point the deployment back to the previous version.
