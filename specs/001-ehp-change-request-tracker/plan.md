# Implementation Plan: EHP Change Request Tracker

**Branch**: `001-ehp-change-request-tracker` | **Date**: 2026-11-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-ehp-change-request-tracker/spec.md`

## Summary

Build a Thai-language, mobile-friendly web app that records and monitors EHP / NHIP / INV change requests. The data stays in the existing Google Sheet "สรุปขอแก้ไขโปรแกรม EHP และ แพลตฟอร์มกลาง", which is the single source of truth.

The app is a **container-bound Google Apps Script Web App**. It needs no domain and no hosting. It provides four main screens:

1. **Monitor**: answers the 6 team questions, every number is clickable, and it has filters;
2. **My Work**: each person's own items;
3. **All items**: search and filter;
4. **Add / Edit**: safe writes under a lock, with ลำดับ and conflict checks, writing only changed cells, and an `_app_log` row for each change.

It also has a data-quality panel and built-in onboarding and help.

**Technical approach.** All business rules live in one pure-JavaScript `Domain` module. The same file runs as a server `.gs` file, is wrapped for the browser, and is unit-tested in Node. Sheet input/output is isolated in `Repo`. The UI is vanilla JavaScript with shared components and SVG charts. Development is test-first with Vitest (unit and contract tests), in-Apps-Script integration tests that run only on a spreadsheet copy, and Playwright end-to-end tests against a local preview with a mocked `google.script.run`. `clasp` deploys from git, and every release is a named, reversible deployment.

## Technical Context

**Language/Version**: JavaScript ES2020 on the Google Apps Script V8 runtime (server), ES2020 in evergreen browsers (client), and Node.js 22 (dev tooling and tests only)

**Primary Dependencies**:
- **Runtime**: Apps Script built-ins only (`SpreadsheetApp`, `HtmlService`, `LockService`, `CacheService`, `Session`, `Utilities`), plus the Google Fonts "IBM Plex Sans Thai" font. There are no runtime libraries; charts are hand-built SVG.
- **Dev only**: `@google/clasp`, `vitest`, `@vitest/coverage-v8`, `@playwright/test`, `@axe-core/playwright`, `eslint`, `prettier`, `typescript` (used only for `--checkJs`), and `@types/google-apps-script`

**Storage**: The Google Sheet `ข้อมูลขอแก้ไขโปรแกรม` (read/write, schema frozen) and `รายชื่อ` (read only). The app owns two sheets: `_app_log` (append only) and `_app_users`. `CacheService` holds option sets only, for at most 5 minutes.

**Testing**:
- **Unit**: Vitest on `Domain`, with coverage ≥ 90%
- **Contract**: Vitest on `Repo` with a `FakeSpreadsheet`
- **Integration**: `runIntegrationTests()` inside Apps Script, on the copy only
- **E2E**: Playwright and axe against the preview build, at desktop width and 375 px mobile

**Target Platform**: A Google Apps Script Web App with "Execute as: user accessing" and access limited to the organization. Users open it in desktop and mobile browsers.

**Project Type**: A web application (single Apps Script project: server `.gs` files plus `HtmlService` client)

**Performance Goals**:
- The Monitor is usable in < 5 s with 1,000 rows
- A save completes in < 3 s
- Filtering and search respond in < 300 ms
- `Domain` metrics compute on 1,000 rows in < 200 ms

**Constraints**:
- No external backend, host, or data egress
- No changes to the main sheet's schema
- No contact with the `_แมวส้ม_*` sheets
- Values must match the sheet exactly
- Dates stay as `d/m/yyyy` C.E. in the sheet
- Timezone is Asia/Bangkok
- No row deletion
- Pages must be WCAG 2.1 AA and usable at 375 px

**Scale/Scope**: About 720 rows now, designed for ≥ 1,000. About 10–50 users. Six screens, 33 functional requirements.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| # | Principle | How this plan complies | Status |
|---|---|---|---|
| I | Single source of truth | Every read goes straight to the sheet, and Refresh re-reads it. Rows are never cached. Option sets are cached for at most 5 minutes (R5). | ✅ |
| II | Schema preservation | `Repo` maps columns by header text, and a missing header produces a `SchemaError` that disables writes. The app's only own sheets are `_app_log` and `_app_users`. The `_แมวส้ม_*` sheets are never opened. Legacy code is preserved (R2). | ✅ |
| III | Value fidelity | Options come from validation, then distinct values, then `รายชื่อ`. Writes use the exact option strings. Option fields are dropdowns only, and `ระบบงาน` is a combobox that warns on a new value. | ✅ |
| IV | Status semantics | `Domain.CLOSED` is an exact set. `isOpen`, `effectiveDue`, and `isOverdue` are defined once and used by every view. A unit test asserts that `0.รอแจ้งทีมพัฒนา` and `0.จัดทำไฟล์แก้ไข` are open. | ✅ |
| V | Safe writes | `Repo.withLock` wraps `tryLock`, the ลำดับ check, a cell-level conflict check, writing changed cells only, appending at `max+1`, and logging to `_app_log`. There is no delete API (R7). | ✅ |
| VI | Dates | Dates are parsed from display values as d/m/yyyy into date-only values. Unparseable values keep their original text and get a flag. Writes keep the column's existing cell type. The timezone is Asia/Bangkok (R6). | ✅ |
| VII | Actionable monitor | `Domain.computeMetrics` covers the 6 questions. Each figure carries the ids behind it for drill-down. There are 5 filters. | ✅ |
| VIII | Simplicity / Apps Script | The app is a container-bound HtmlService app split into several files, as the constitution allows. Tooling is dev only. The UI has no CDN library; charts are SVG. The UI is Thai and mobile-friendly. | ✅ |
| IX | Code quality | ESLint, Prettier, and `tsc --checkJs` run with JSDoc types. All constants live in `Config.js`. Errors are returned as `Result` codes, with no silent catches. Every change gets a code review. | ✅ |
| X | TDD | Test-first ordering is enforced in tasks.md. There are four test layers (R10). Integration tests run only on the copy. | ✅ |
| XI | Reuse first | Shared components live in `src/client/components/`, and shared server helpers live in `Repo`. | ✅ |
| XII | Centralized logic | There is one `Domain.js` shared by server, client, and Node (R4). `Code.js` is thin. | ✅ |
| XIII | UX consistency | `Styles.html` defines the design tokens. Every view has 4 states. Accessibility is tested with axe. The app has a tour, help tips, empty states, and a `#/help` guide. UI work uses `frontend-design` and `web-design-guidelines`. | ✅ |
| XIV | Performance | Each sheet is read with one call. There is one bootstrap round trip. Metrics are computed on the client. A timing test runs in Vitest and Playwright (R13). | ✅ |
| XV | Commit and release | The work is on a feature branch with Conventional Commits. `clasp` pushes from `dist/`. `push:prod` is guarded. Deployments are named. `.clasprc.json` and `.clasp.*.json` are git-ignored, and fixtures are synthetic. | ✅ |
| XVI | Skills | The skill map is applied per phase. Vercel and React skills are excluded. Apps Script APIs are checked against the docs. | ✅ |

**Result: PASS** (initial check and again after Phase 1 design). There are no unjustified violations. Four environment facts must be verified in task T0 before feature code is written: legacy code in the bound project (R2), the tracker type (R3), the date cell types and locale (R6), and `getEditors` for viewers (R8). They are gates, not violations.

## Project Structure

### Documentation (this feature)

```text
specs/001-ehp-change-request-tracker/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1–R13
├── data-model.md        # Phase 1: sheets, shapes, status model, issue codes
├── quickstart.md        # Phase 1: setup, dev loop, validation scenarios V1–V13, release
├── contracts/
│   └── server-api.md    # Phase 1: google.script.run API + routes
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks; not created here)
```

### Source Code (repository root)

```text
src/
├── shared/
│   └── Domain.js            # pure business rules (status, dates, validation, issues, metrics, my-work, search)
├── server/                  # pushed as .gs
│   ├── Config.js            # sheet names, header map, CLOSED/WORKFLOW, limits, Thai messages
│   ├── Repo.js              # header mapping, reads, options, withLock, create/update, _app_log, _app_users
│   ├── Auth.js              # current email, canEdit, name mapping
│   ├── LegacyBridge.js      # calls the _แมวส้ม_ handler only if T0 finds it is onEdit-based (R3)
│   └── Code.js              # doGet, include(), Api_* thin wrappers
├── client/
│   ├── Index.html           # shell + router outlet; includes everything below
│   ├── Styles.html          # design tokens + base styles
│   ├── App.html             # router, state store, api client (google.script.run → Promise)
│   ├── components/          # StatCard, StatusBadge, DataTable, FilterBar, SelectField, DateField,
│   │                        # Combobox, ConfirmDialog, Toast, EmptyState, Charts (SVG), Tour, HelpTip
│   └── views/               # MonitorView, MyWorkView, ItemsView, ItemFormView, HelpView, DataQualityPanel
├── legacy/                  # existing bound-project files from T0, never edited
└── appsscript.json          # V8, timeZone Asia/Bangkok, webapp: executeAs USER_ACCESSING, access DOMAIN

tests/
├── unit/                    # Domain.*.test.js
├── contract/                # Repo.*.test.js + FakeSpreadsheet.js
├── integration/             # IntegrationTests.js (pushed to the test copy only)
├── e2e/                     # *.spec.ts (Playwright) + mock-gas.js
└── fixtures/                # synthetic rows (no real data), 1,000-row generator

scripts/
└── build.mjs                # src → dist/ (flatten, wrap Domain for client, copy legacy), --preview, --with-integration

dist/                        # build output pushed by clasp (git-ignored)
preview/                     # local E2E build (git-ignored)
```

**Structure Decision**: This is one Apps Script project with clear layers: `shared/Domain`, which is pure; `server/Repo`, which does sheet input/output; `server/Code`, which is the thin API; and `client/`, which holds the components and views. A small build script without dependencies flattens `src/` into `dist/` for `clasp`, and produces a preview with a mocked backend for Playwright. Constitution VIII, as amended in v2.0.0, explicitly allows several files.

## Complexity Tracking

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| Build script (`scripts/build.mjs`) | Shares one `Domain.js` across server, client, and Node. Keeps legacy files in every push. Produces the E2E preview. | Hand-copying would duplicate the rules (violating XII) and risk deleting legacy code on push (R2). |
| Two clasp targets (test and prod) | Development must happen on the copy, and production pushes must be deliberate. | A single target makes it too easy to push to the real sheet by mistake. |
| `LegacyBridge.js` (conditional) | Only needed if the `_แมวส้ม_` tracker uses `onEdit`, which does not fire on script writes (R3). | Writing to the `_แมวส้ม_` sheets directly is forbidden by II. |
