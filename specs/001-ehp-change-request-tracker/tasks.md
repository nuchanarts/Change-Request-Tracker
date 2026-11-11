# Tasks: EHP Change Request Tracker

**Input**: [plan.md](./plan.md), [spec.md](./spec.md), [data-model.md](./data-model.md), [contracts/server-api.md](./contracts/server-api.md), [research.md](./research.md)

**Tests**: Required by constitution X. Within every phase, the test tasks come **before** the implementation tasks.

**Format**:
- `[P]` means the task can run in parallel with others (it touches a different file).
- `[USn]` is the user story the task belongs to.

**MVP**: Phases 1–5 (US1 Monitor, US2 Add, US3 Edit), with a working local preview and a deployable Apps Script build.

## Phase 1: Setup

- [ ] T001 Add npm scripts and dev tooling (vitest, coverage, eslint, prettier, typescript checkJs, gas types) in `package.json`, `eslint.config.js`, `.prettierrc.json`, `jsconfig.json`
- [ ] T002 [P] Write the Apps Script manifest `src/appsscript.json` (V8, Asia/Bangkok, webapp `USER_ACCESSING` / `ANYONE`, spreadsheets + userinfo.email scopes)
- [ ] T003 [P] Build script `scripts/build.mjs`: `src/` → `dist/` (flatten, generate `DomainClient.html`), `--preview` → `preview/index.html` with includes resolved and the mock backend
- [ ] T004 [P] Push guard `scripts/check-clasp-target.mjs` (denylist from `scripts/bound-script-ids.txt`; prod requires `main` and a clean tree)
- [ ] T005 [P] Synthetic fixtures and a 1,000-row generator in `tests/fixtures/` (no real data)

## Phase 2: Foundational (Domain + Repo), which blocks all stories

- [ ] T006 [P] Unit tests: dates (parse d/m/yyyy, invalid, Buddhist-era years, format, Thai display, day math, week/month) in `tests/unit/domain.dates.test.js`
- [ ] T007 [P] Unit tests: status semantics (exact closed set, `0.รอแจ้งทีมพัฒนา` and `0.จัดทำไฟล์แก้ไข` are open, empty = open), effective due date, overdue in `tests/unit/domain.status.test.js`
- [ ] T008 [P] Unit tests: enrich, ticket URL, issue detection (all 7 codes) in `tests/unit/domain.rows.test.js`
- [ ] T009 [P] Unit tests: validateCreate / validateUpdate / diffChanges / nextSeq in `tests/unit/domain.validate.test.js`
- [ ] T010 Implement `src/shared/Domain.js` (dates, status, enrich, issues, validation) until T006–T009 pass
- [ ] T011 [P] Contract tests for Repo with `tests/contract/FakeSpreadsheet.js`: header mapping, missing headers, read rows (skip empty detail), option sets (validation → distinct → รายชื่อ), create (`max+1`, lock, log), update (changed cells only, `SEQ_MISMATCH`, `CONFLICT`, `SEQ_INVALID`, `NOT_FOUND`), lock timeout, date write keeps the cell type, `_app_users` upsert, in `tests/contract/repo.test.js`
- [ ] T012 Implement `src/server/Config.js` and `src/server/Repo.js` until T011 passes
- [ ] T013 Implement `src/server/Auth.js` and `src/server/Code.js` (`doGet`, `include`, `Api_*` thin wrappers returning `Result`), plus `runProbes()` for T0
- [ ] T014 Client foundation: `src/client/Index.html`, `Styles.html` (design tokens), `App.html` (router, store, `api()` promise wrapper, the 4 view states)
- [ ] T015 [P] Shared components in `src/client/Components.html`: StatCard, StatusBadge, DataTable, FilterBar, SelectField, DateField, Combobox, ConfirmDialog, Toast, EmptyState, HelpTip, SVG BarChart

## Phase 3: US1 Monitor (P1) 🎯 MVP

- [ ] T016 [P] [US1] Unit tests: computeMetrics (6 questions, ids for drill-down, unassigned and no-due buckets, closed this week/month), applyFilters, performance (1,000 rows in < 200 ms) in `tests/unit/domain.metrics.test.js`
- [ ] T017 [US1] Implement computeMetrics and applyFilters in `Domain.js`
- [ ] T018 [US1] MonitorView: KPI cards, status bar chart, per-developer and per-PM tables, closed this week/month, overdue list, filters, Refresh, drill-down to Items in `src/client/Views.html`
- [ ] T019 [US1] E2E: Monitor numbers match fixture expectations; drill-down count = card count; filters recompute in `tests/e2e/monitor.spec.js`

## Phase 4: US2 Add request (P1) 🎯 MVP

- [ ] T020 [US2] ItemFormView (create mode): dropdowns from option sets, combobox for ระบบงาน with a new-value warning, defaults (status, PM = me), required-field errors, success toast with ลำดับ
- [ ] T021 [US2] E2E: create happy path, validation errors, new system warning in `tests/e2e/create.spec.js`

## Phase 5: US3 Safe edit (P2) 🎯 MVP

- [ ] T022 [US3] ItemFormView (edit mode): send only changed fields with from/to; done-date rule; cancel = `0.ยกเลิก` with confirm; read-only for viewers; handle `SEQ_MISMATCH` / `CONFLICT` / `LOCK_TIMEOUT` messages
- [ ] T023 [US3] E2E: edit one field; conflict message; viewer sees no edit controls in `tests/e2e/edit.spec.js`

## Phase 6: US4 My Work (P2)

- [ ] T024 [P] [US4] Unit tests: groupMyWork (5 groups, sort by devQueue then due) in `tests/unit/domain.mywork.test.js`
- [ ] T025 [US4] Implement groupMyWork; MyWorkView with dev/PM tabs, quick next-status buttons, and the "choose your name" dialog (`Api_setMyName`)
- [ ] T026 [US4] E2E: grouping and quick status change in `tests/e2e/mywork.spec.js`

## Phase 7: US5 Search & list (P3)

- [ ] T027 [P] [US5] Unit tests: search (detail, system, seq, ticket; ≥ 2 chars) in `tests/unit/domain.search.test.js`
- [ ] T028 [US5] Implement search; ItemsView with search, sort, paging, filters remembered in `localStorage`
- [ ] T029 [US5] E2E: search + filter + ticket link in `tests/e2e/items.spec.js`

## Phase 8: US6 Data quality (P3)

- [ ] T030 [US6] DataQualityPanel on Monitor listing issues with the column name and an edit link
- [ ] T031 [US6] E2E: fixture rows with wrong-column values appear in the panel in `tests/e2e/quality.spec.js`

## Phase 9: US7 Guidance (P4)

- [ ] T032 [US7] Tour (first run, skippable, replayable), HelpTips on KPI cards, HelpView (`#/help`) covering every journey
- [ ] T033 [US7] E2E: tour flow, mobile 375 px for all views, axe accessibility (no serious or critical issues) in `tests/e2e/a11y.spec.js`

## Phase 10: Integration & release

- [ ] T034 Integration tests in Apps Script on the copy: `tests/integration/IntegrationTests.js` (create/update/conflict/log on `[TEST]` rows)
- [ ] T035 T0 probes on the copy (R6 date cell types and locale, R8 `getEditors` for viewers), with results recorded in `research.md`
- [ ] T036 Run quickstart validation V1–V13 on the TEST deployment
- [ ] T037 Code review (`code-review` skill) and fix the findings
- [ ] T038 PROD project creation, push, named deployment, and V14 (done by a sheet editor)

## Dependencies

Setup → Foundational → US1 → US2 → US3 form the MVP. US4–US7 depend on the Foundational phase and the form (T020/T022), and can follow in priority order. Integration & release come last.
