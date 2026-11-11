# Research: EHP Change Request Tracker

**Feature**: `001-ehp-change-request-tracker` | **Date**: 2026-11-11 | **Plan**: [plan.md](./plan.md)

Each topic is recorded as Decision / Rationale / Alternatives considered. Topics marked **⚠ Verify in T0** must be confirmed against the real spreadsheet copy in the first setup task before any feature code is written.

---

## R1. Runtime and hosting

- **Decision** (revised 2026-11-11 after inspecting the bound project, constitution v2.1.0): Use a **standalone** Google Apps Script Web App (`HtmlService`, V8) that opens the sheet with `SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID'))`. There are two standalone projects running the same code:
  - **TEST**: `SPREADSHEET_ID` = the `[TEST]` copy;
  - **PROD**: `SPREADSHEET_ID` = `1voV3mHQi7bH2PbBeWaVrk0EaUs-9BnqMpKc53oI__RE`.

  Deploy with "Execute as: User accessing the web app" and "Who has access: **Anyone with a Google account**". The sheet owner `ehpcisplatform@gmail.com` is a personal Gmail account with no Workspace domain, so "domain only" is impossible. This setting is still **not** anonymous, because users must sign in, and data access follows each user's own sheet permission. No domain or hosting is needed; Google provides a `script.google.com/.../exec` URL.
- **Rationale**: The bound project already hosts the LINE bot (see R2), so sharing it is unsafe. A standalone project keeps the bot untouched and gives our app its own deployment settings. It costs nothing, the data stays in Google, and the user's real identity reaches the audit log.
- **Alternatives considered**: Putting the app in the same bound project, which was rejected (R2). An external host (Vercel or Firebase), which is rejected by VIII.

## R2. ✅ Resolved: the bound project contains the LINE bot "แมวส้ม"

- **Finding** (cloned the bound project of the copy, script `1LK5KdJE…Fjn`, into the scratchpad only; not committed):
  - The project has 2 files: `appsscript.json` (V8, Asia/Bangkok) and `Checklist_Monitor_dev.js`, about 1,000 lines. The second file is the LINE bot "แมวส้ม" (`CODE_VERSION 'แมวส้ม-แก้ไขโปรแกรม v2026-11-10b'`).
  - The bot defines **`doPost`**, which is the LINE webhook and must be deployed as anonymous, and **`doGet`**, a health text.
  - It hard-codes `SHEET_ID` to the **real** sheet and opens it with `openById`, even when it runs from a copy.
  - It contains a **hard-coded LINE channel token** as the fallback when the script property `LINE_TOKEN` is missing.
- **Decision**:
  - Our app lives in a **separate standalone project** (R1). We never push, deploy, or edit the bound project. `.clasp.*.json` must never contain the bound script ID.
  - The bot's code is **not** copied into this repository, because it contains a secret (XV).
  - Recommend to the sheet owner (outside this feature's scope): rotate the LINE token, store it only in Script Properties, and remove the hard-coded fallback.
- **Rationale**: This avoids `doGet` collisions, anonymous exposure of our UI, and accidental deletion of the bot by `clasp push`.

## R3. ✅ Resolved: the `_แมวส้ม_` tracker sees status changes made by the app

- **Finding**: `setupAll()` installs a **time-driven** trigger, `watchChanges`, every 15 minutes (`WATCH_MINUTES`). It diffs the main sheet against the snapshot sheet `_แมวส้ม_สถานะ` and appends to `_แมวส้ม_บันทึก`. It does **not** use `onEdit`. Our app's writes are therefore detected at the next run, within 15 minutes, exactly like manual edits.
- **Decision**: No bridge code is needed. `LegacyBridge.js` is removed from the plan.
- **Note**: The bot reads columns by header regex and treats closed as `stripNo_(status)` ∈ {แก้ไขเรียบร้อย, ยกเลิก, ใช้งานได้อยู่แล้ว}. That matches our exact-set rule for every real value, so the bot's counts and the app's counts agree.

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
- **Partly verified**: the real sheet's 18 headers match the Data Contract exactly, and dates display as `16/4/2026`. The bot's parser accepts both Date cells and text, which suggests the sheet holds a mix.
- **⚠ Verify in T0**: check the cell type per date column and the spreadsheet locale on the copy, using an integration probe.

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

- **Decision**: Node 22 with npm. Dev dependencies: `@google/clasp` (3.x), `vitest`, `@vitest/coverage-v8`, `@playwright/test`, `@axe-core/playwright`, `eslint` (flat config, with `globals` for Apps Script declared from `@types/google-apps-script`), `prettier`, `typescript` (for `tsc --noEmit --checkJs` only), and `@types/google-apps-script`. Run `clasp` with `rootDir: dist`.
  - **Two standalone clasp targets** (both git-ignored): `.clasp.test.json`, created with `clasp create --type webapp`, whose `SPREADSHEET_ID` property points at the copy; and `.clasp.prod.json`, a separate project whose property points at the real sheet.
  - `npm run push:prod` refuses to run unless the branch is `main` and the tree is clean.
  - `scripts/check-clasp-target.mjs` refuses any push whose scriptId equals a known bound-project ID, which is a denylist kept in `scripts/bound-script-ids.txt`.
- **Rationale**: This follows XV (git is the source; named, reversible deployments) and VIII (tooling is dev-only).

## R12. Week and month boundaries

- **Decision**: "This week" runs from Monday 00:00 to Sunday, and "this month" is the calendar month, both in Asia/Bangkok. The calculation is done on date-only values in `Domain`.
- **Rationale**: These are the spec assumptions.

## R13. Performance budgets (constitution XIV)

- **Decision**: The load path is `doGet` → page shell → `Api_bootstrap()`, which returns rows, options, and the user in one call. Metrics are computed on the client. Budgets: bootstrap < 3 s server time for 1,000 rows, first render < 5 s, filter/search < 300 ms (measured by a Playwright timing check on 1,000 fixture rows), and save < 3 s.
- **Rationale**: One round trip minimizes Apps Script latency (each `google.script.run` call costs about 0.5–1 s).

---

**All Technical Context unknowns are resolved.** R2 and R3 were resolved by inspecting the bound project. The remaining ⚠ items (R6 date cell types and locale, R8 `getEditors` for viewers) can only be observed on the copy. They are scheduled as T0 integration probes.
