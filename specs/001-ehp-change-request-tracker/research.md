# Research: EHP Change Request Tracker

**Feature**: `001-ehp-change-request-tracker` | **Date**: 2026-11-11 | **Plan**: [plan.md](./plan.md)

Each topic is recorded as Decision / Rationale / Alternatives considered. Topics marked **⚠ Verify in T0** must be confirmed against the real spreadsheet copy in the first setup task before any feature code is written.

---

## R1. Runtime and hosting

- **Decision**: Use a Google Apps Script Web App (`HtmlService`) on the V8 runtime, **container-bound** to the spreadsheet "สรุปขอแก้ไขโปรแกรม EHP และ แพลตฟอร์มกลาง". Deploy with "Execute as: User accessing the web app" and "Who has access: anyone in the organization" (or specific users). No domain or hosting is needed; Google provides a `script.google.com/.../exec` URL.
- **Rationale**: This is required by constitution VIII and the Additional Constraints. It costs nothing, the data never leaves Workspace, and the user's real identity reaches the audit log.
- **Alternatives considered**: A standalone script project, which was rejected because the constitution requires container-bound. An external host (Vercel or Firebase), which was rejected by VIII.

## R2. ⚠ Existing code in the bound script project (critical risk)

- **Finding**: The `_แมวส้ม_บันทึก` and `_แมวส้ม_สถานะ` sheets show that a status tracker already exists. It is probably Apps Script code in the **same** bound project. `clasp push` **replaces every file in the project**, so a careless push would delete the tracker.
- **Decision**: Task T0 must run `clasp clone` on the bound project of the **copy** and commit every existing file unchanged into `src/legacy/`. The build copies `src/legacy/` into `dist/` untouched, so a push always includes the legacy files. No feature code may share a file with legacy code, and global names must not collide (all new globals use the `App`, `Domain`, `Repo`, `Config`, and `Api_` prefixes).
- **Rationale**: This satisfies constitution II (do not touch the `_แมวส้ม_` sheets) and the deploy checklist ("the tracker still works").
- **Alternatives considered**: Keeping our code in a separate standalone project, which was rejected (see R1). Editing in the online editor only, which was rejected by XV (git is the source of truth).

## R3. ⚠ Will the `_แมวส้ม_` tracker see status changes made by the app?

- **Finding**: Simple and installable `onEdit` triggers **do not fire** for changes made by scripts. If the tracker uses `onEdit`, status changes written by the app would be missed, which would break SC-007 and the deploy checklist.
- **Decision**: T0 must read the legacy code and classify the tracker:
  1. **Snapshot or diff based** (time-driven, or compares the main sheet against `_แมวส้ม_สถานะ`): it already catches app writes, so no action is needed.
  2. **`onEdit` based**: after each successful status write, the app calls the tracker's own handler function in the same project with a synthetic event object (`{range, value, oldValue, source}`). The app does not write to the `_แมวส้ม_` sheets itself, so constitution II is kept. If the handler cannot be called safely, stop and ask the sheet-owner PM.
- **Rationale**: Calling the tracker's own code preserves its logic without the app touching its sheets.
- **Alternatives considered**: Writing to the `_แมวส้ม_` sheets directly, which was rejected by II.

## R4. Sharing domain logic between server and client (constitution XII)

- **Decision**: The single source is `src/shared/Domain.js`, written as plain ES2020 inside an IIFE that assigns `var Domain = (function(){ … return {…}; })();` and ends with `if (typeof module === 'object') module.exports = Domain;`.
  - **Apps Script**: the file is pushed as a server `.gs` file. `module` is undefined, so `Domain` becomes a global.
  - **Node (Vitest)**: `require()` returns `Domain`.
  - **Browser**: `scripts/build.mjs` wraps the same file in `<script>…</script>` as `dist/DomainClient.html`, which `Index.html` includes.
- **Rationale**: The rules exist once and are tested once. Dashboard figures computed on the client after filtering use exactly the same functions as the server.
- **Alternatives considered**: A bundler such as esbuild, which works but is heavier than needed. Duplicating the rules in the client, which is forbidden by IV and XII. Computing all metrics on the server for each filter change, which costs a round trip and breaks the 300 ms filter budget.

## R5. Reading data (constitution I, VI, XIV)

- **Decision**: Read each sheet with one `getDataRange().getDisplayValues()` call. The main sheet also needs one `getValues()` call over the same range, only to learn which date columns hold real Date cells (see R6). That makes 2 calls per load. Option sets come from `getDataValidation()` on row 2 of each dropdown column (1 call per column) and are cached with `CacheService` for 5 minutes. Row data is **not cached**: every load and every Refresh reads the sheet fresh.
- **Rationale**: About 1,000 rows by 18 columns is well under 1 s to read, which keeps the 5 s dashboard budget, and the data is always up to date. Caching only the option sets keeps freshness while saving the slower validation reads.
- **Alternatives considered**: Caching the rows for 5 minutes, which is allowed but gives stale numbers right after a direct sheet edit. That works against the Refresh expectation in Story 1, scenario 6.

## R6. Dates (constitution VI)

- **Decision**:
  - **Parse** the display string with `^\s*(\d{1,2})/(\d{1,2})/(\d{4})\s*$` as d/m/yyyy into a date-only value `{y, m, d}`, with no time and no timezone. "Today" is computed once as a date-only value in `Asia/Bangkok` and passed into the domain functions.
  - **Invalid values**: a date that does not exist (for example 31/2/2026) or text that does not match is treated as unparseable. The original text is kept and an issue is flagged (`DATE_UNPARSEABLE`).
  - **Buddhist-era years**: a year ≥ 2400 (for example 16/4/2569) is converted by subtracting 543 for calculations only, and flagged as `DATE_BUDDHIST_YEAR`. The value in the sheet is not changed.
  - **Write**: if the target cell currently holds a Date (from `getValues()`), or is empty and the majority of the column holds Dates, write a JavaScript `Date` built for midnight Asia/Bangkok. The cell keeps its existing number format. Otherwise, write the text `d/m/yyyy` exactly.
- **Rationale**: Display values avoid timezone and locale drift, which is what the constitution asks for. Writing the same type that the column already uses keeps sheet formulas and filters working.
- **⚠ Verify in T0**: check the spreadsheet locale and timezone, and whether the date columns are real dates or text, on the copy.

## R7. Safe writes (constitution V)

- **Decision**: Every write goes through `Repo.withLock(fn)`, which uses `LockService.getScriptLock()` with `tryLock(10000)`. Inside the lock:
  1. **Update**: read the target row's `ลำดับ` and the current display value of every cell to be changed. If `ลำดับ` ≠ the expected value, return `SEQ_MISMATCH`. If any cell's current value ≠ the `from` value the client saw, return `CONFLICT` with the details. Otherwise, write each changed cell with `getRange(row, col).setValue()`. Only changed cells are written.
  2. **Create**: compute `max(ลำดับ) + 1` from a fresh read, then append with `appendRow` built from the header map. Columns the user did not fill are written as `''`. Appending a full new row is allowed because it is a new row, not an overwrite.
  3. **Log**: append one `_app_log` row per changed cell. Then `SpreadsheetApp.flush()` and release the lock.
- **Rationale**: This meets V in full. The `CONFLICT` check also prevents silently overwriting a direct sheet edit made while the form was open.
- **Alternatives considered**: `getDocumentLock()`, which behaves the same for a bound script; the script lock is chosen for clarity. Writing the whole row with `setValues`, which is forbidden by V.

## R8. Identity and permissions

- **Decision**: Get the email from `Session.getActiveUser().getEmail()`. Decide `canEdit` with `SpreadsheetApp.getActive().getEditors()` (does the list contain the email?) inside try/catch. If the call fails, set `canEdit = false`. The server re-checks `canEdit` on every write call, never trusting the client. Name mapping (FR-028) is stored in the `_app_users` sheet.
- **⚠ Verify in T0**: whether `getEditors()` works for a view-only user. If it throws, the fallback (`canEdit = false`) is already correct. As a last line of defense, a write by a viewer also fails at the Sheets permission level; that error is caught and returned as `FORBIDDEN`.
- **Rationale**: Permissions follow the sheet's own permissions (Additional Constraints).

## R9. UI technology

- **Decision**: Vanilla JavaScript (ES2020) and HTML/CSS served by `HtmlService` templates, with no framework. Charts are hand-built SVG components (bar, stacked bar, donut) following constitution VIII. The font is "IBM Plex Sans Thai" from Google Fonts, falling back to the system font. Shared UI components (XI) live in `src/client/components/*.html` as small render functions: `StatCard`, `StatusBadge`, `DataTable`, `FilterBar`, `SelectField`, `DateField`, `Combobox` (for ระบบงาน), `ConfirmDialog`, `Toast`, `EmptyState`, `Tour`, and `HelpTip`.
- **Rationale**: HtmlService has no bundler or modules, and a framework adds weight and complexity for a 4-screen app. Plain render functions are easy to test with Playwright.
- **Alternatives considered**: Vue or Alpine from a CDN, which is possible but uses up the single CDN library allowance and is unnecessary. React, which is rejected (it needs a build step and the Vercel skills do not apply).
- **Skills**: `frontend-design` sets the visual direction, and `web-design-guidelines` and `writing-guidelines` are used for review.

## R10. Testing strategy (constitution X)

- **Decision**:
  - **Unit (Vitest + @vitest/coverage-v8)**: `Domain.js` with ≥ 90% coverage. It also includes a performance test that computes metrics on 1,000 synthetic rows in under 200 ms.
  - **Contract (Vitest)**: `Repo` against an in-memory `FakeSpreadsheet` that mimics the APIs we use: `getDataRange`, `getDisplayValues`, `getValues`, `getRange().setValue`, `appendRow`, `getDataValidation`, `LockService`, and `Session`. This proves "write changed cells only", "seq mismatch stops", "conflict stops", and "log rows written" without Google.
  - **Integration (in Apps Script, on the copy only)**: `tests/integration/IntegrationTests.js` is pushed **only** to the test project (the build flag `--with-integration`). It runs from the editor with `runIntegrationTests()`, creates and edits rows tagged `[TEST]` on the copy, asserts the results, logs them, and changes those rows' status to `0.ยกเลิก` afterwards (there is no row deletion).
  - **E2E (Playwright)**: `scripts/build.mjs --preview` produces `preview/index.html` with every include resolved and a `google.script.run` mock backed by fixture data. Playwright covers each user story, onboarding, mobile at 375 px, and accessibility with `@axe-core/playwright`. A manual smoke checklist runs on the test deployment before release.
- **Rationale**: This covers every layer. It runs fast and offline for TDD, and the real-sheet tests stay isolated on the copy as constitution X and the Development Workflow require.

## R11. Tooling and repository layout

- **Decision**: Node 22 with npm. Dev dependencies: `@google/clasp`, `vitest`, `@vitest/coverage-v8`, `@playwright/test`, `@axe-core/playwright`, `eslint` (flat config, with `eslint-plugin-googleappsscript` globals), `prettier`, `typescript` (for `tsc --noEmit --checkJs` only), and `@types/google-apps-script`. Run `clasp` with `rootDir: dist`. Keep two clasp targets: `.clasp.test.json` for the copy's project and `.clasp.prod.json` for the real project. `npm run push:prod` refuses to run unless the branch is `main` and the tree is clean.
- **Rationale**: This follows XV (git is the source; named, reversible deployments) and VIII (tooling is dev-only).

## R12. Week and month boundaries

- **Decision**: "This week" runs from Monday 00:00 to Sunday, and "this month" is the calendar month, both in Asia/Bangkok. The calculation is done on date-only values in `Domain`.
- **Rationale**: These are the spec assumptions.

## R13. Performance budgets (constitution XIV)

- **Decision**: The load path is `doGet` → page shell → `Api_bootstrap()`, which returns rows, options, and the user in one call. Metrics are computed on the client. Budgets: bootstrap < 3 s server time for 1,000 rows, first render < 5 s, filter/search < 300 ms (measured by a Playwright timing check on 1,000 fixture rows), and save < 3 s.
- **Rationale**: One round trip minimizes Apps Script latency (each `google.script.run` call costs about 0.5–1 s).

---

**All Technical Context unknowns are resolved.** The remaining ⚠ items (R2, R3, R6, R8) are environment facts that can only be observed on the spreadsheet copy, and they are scheduled as task T0 gates.
