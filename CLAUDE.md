# BGS Monitor — EHP Change Request Tracker

This is a Google Apps Script Web App for recording and monitoring EHP / NHIP / INV change requests. The Google Sheet is the single source of truth.

- **Constitution (highest authority)**: `.specify/memory/constitution.md` (v4.0.0)
- **Active feature**: `specs/001-ehp-change-request-tracker/` (spec, plan, research, data-model, contracts, quickstart)

## Communication

- Reply to the user in **Thai**. Code, identifiers, and commit messages are in English.

## Stack

- Apps Script V8, **standalone** project, which opens the sheet with `openById(ScriptProperties.SPREADSHEET_ID)`. It has two projects: TEST (points at the `[TEST]` copy) and PROD. The UI is `HtmlService` with vanilla JS and SVG charts. Node 22 is used for tooling only.
- ⚠ **Never push to, deploy, or edit the sheet's bound script project.** It hosts the LINE bot "แมวส้ม" (doGet/doPost, anonymous). Its IDs are listed in `scripts/bound-script-ids.txt`. Never commit the bot's code, because it contains a LINE token.
- Layers: `src/shared/Domain.js` (pure rules, shared by server, client, and tests) → `src/server/Repo.js` (sheet I/O) → `src/server/Code.js` (thin `Api_*`) → `src/client/` (components and views).
- `scripts/build.mjs` builds `src/` into `dist/` (pushed with clasp) and `preview/` (local E2E with a mocked `google.script.run`).

## Commands

```powershell
npm run test:watch   # unit + contract (Vitest)
npm run coverage     # Domain ≥ 90%
npm run lint         # eslint + prettier + tsc --checkJs
npm run preview      # local preview with mock backend
npm run test:e2e     # Playwright (desktop + 375px + axe)
npm run push:test    # push to the TEST COPY only
```

## Non-negotiables (see the constitution)

- Never change the main sheet's columns or headers. Never touch the `_แมวส้ม_*` sheets. The app's own sheets must be named `_app_*`.
- Closed = exactly `0.แก้ไขเรียบร้อย`, `0.ใช้งานได้อยู่แล้ว`, `0.ยกเลิก`. **Never use `startsWith('0.')`.**
- Due date = `วันที่เลื่อน` if it parses, otherwise `วันที่ต้องได้`. Dates are `d/m/yyyy` C.E., and the timezone is Asia/Bangkok.
- Writes must:
  - run inside a lock;
  - check `ลำดับ` and conflicts first;
  - write changed cells only;
  - append new rows with `max+1`;
  - log every change to `_app_log`.
- Delete rows only through `Repo.remove` / `Api_deleteRequest` (one row, lock, ลำดับ + full-row check, JSON snapshot in `_app_log`). Never delete rows any other way.
- Keep option values exactly as spelled (`Requement`, `รอ Complie ต้องแจ้งอจ.`).
- Develop and test only against the spreadsheet **copy**, through the TEST project.
- Work test-first. Commit after every green cycle using Conventional Commits.
- Do not use the React, Next.js, or Vercel skills on this project.
