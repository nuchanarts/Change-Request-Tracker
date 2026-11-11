# Contract: Server API (`google.script.run`)

These are the functions the client calls through `google.script.run.withSuccessHandler(...).withFailureHandler(...).<name>(args)`. They are defined in `src/server/Code.js` as thin wrappers (XII). Each one does three things:

1. checks permission;
2. calls `Repo` and `Domain`;
3. returns a **Result** object.

A wrapper never throws to the client. The only exception is an unexpected crash, which `withFailureHandler` shows as a generic Thai error and which is logged.

## Common types

```text
Result<T> = { ok: true,  data: T }
          | { ok: false, code: ErrorCode, message: string /* Thai, user-facing */, details?: any }

ErrorCode = 'FORBIDDEN'        // the user has no edit permission
          | 'SCHEMA'           // required headers are missing; details: { missing: string[] }
          | 'VALIDATION'       // details: { fields: { [key]: messageTh } }
          | 'SEQ_MISMATCH'     // the row no longer holds the expected ลำดับ; the client must reload
          | 'CONFLICT'         // a cell changed since the client loaded it; details: { [key]: { expected, actual } }
          | 'SEQ_INVALID'      // the target row has a missing or duplicate ลำดับ; edit it in the sheet first
          | 'LOCK_TIMEOUT'     // another save is in progress; nothing was written
          | 'NOT_FOUND'        // the row number is outside the data range
```

`ChangeRequest`, `OptionSets`, and `Issue` are defined in [data-model.md](../data-model.md). Over the wire, `ChangeRequest` holds **raw display strings plus `rowNumber`**. The client calls `Domain.enrich()` to compute the derived fields, so the server and client always use the same code.

---

## `Api_bootstrap()` → `Result<Bootstrap>`

This function is called once on page load and again on every Refresh.

```text
Bootstrap = {
  loadedAt: string,                       // 'd/m/yyyy HH:mm' Asia/Bangkok
  today:    { y, m, d },                  // Asia/Bangkok, from the server clock
  user:     { email, name: string|null, canEdit: bool },
  schema:   { ok: bool, missing: string[] },
  options:  OptionSets,
  rows:     RawChangeRequest[],           // every row with a non-empty รายละเอียด, in sheet order
  legacyTrackerMode: 'snapshot'|'onEdit'|'unknown'   // set from T0 findings; shown only on the admin/help page
}
```

- If `schema.ok === false`, it still returns the rows it can read. The client disables add and edit, and shows which headers are missing.
- Reads: one `getDisplayValues` and one `getValues` call on the main sheet, one read of `รายชื่อ`, one read of `_app_users`, and the option sets (cached for 5 minutes).

## `Api_createRequest(input)` → `Result<{ rowNumber, seq }>`

```text
input = { platform, issueType, urgency, status, system, detail, pm, ticket?, dueDate: 'd/m/yyyy',
          developer?, postponedDate?, doneDate?, deployDate?, devQueue?, devHours?, devStart?, devEnd? }
```

The function:

1. returns `FORBIDDEN` if the user cannot edit;
2. runs `Domain.validateCreate`, and returns `VALIDATION` on errors;
3. inside the lock, computes `seq = max + 1` and appends the row;
4. logs every non-empty field as `CREATE`;
5. returns the new `seq`.

## `Api_updateRequest(req)` → `Result<{ rowNumber, seq, written: string[] }>`

```text
req = { rowNumber: int, seq: int, changes: { [key]: { from: string, to: string } } }
```

The function:

1. returns `FORBIDDEN` if the user cannot edit;
2. returns `VALIDATION` if `changes` is empty or contains `seq`;
3. runs `Domain.validateUpdate`;
4. inside the lock, returns `NOT_FOUND`, `SEQ_INVALID`, or `SEQ_MISMATCH` (the cell `ลำดับ` at `rowNumber` ≠ `seq`) when they apply;
5. returns `CONFLICT` if any target cell's display value ≠ `from`;
6. writes each `to` value to its cell, logs every change as `UPDATE`, and invokes the legacy tracker hook if R3 calls for it.

Cancelling an item is `changes: { status: { from, to: '0.ยกเลิก' } }`. **No delete API exists** (FR-022).

## `Api_setMyName(name)` → `Result<{ name }>`

The function:

1. returns `VALIDATION` unless `name` is in `options.person`;
2. inside the lock, upserts the `_app_users` row for the current email;
3. logs the change as `MAP_USER`.

Any signed-in user can call it. It requires write access to the spreadsheet, so a view-only user gets `FORBIDDEN`, and the client then keeps the choice in `localStorage` only.

## `doGet(e)` → `HtmlOutput`

The function returns `Index.html` evaluated as a template, with the title `ติดตามรายการขอแก้ไขโปรแกรม`, the meta viewport tag set, and `XFrameOptionsMode.DEFAULT`. It returns no data; all data comes from `Api_bootstrap`.

---

## Client-side contract (UI)

| View | Hash route | Visible to |
|---|---|---|
| Monitor (default) | `#/monitor` | everyone |
| My Work | `#/my-work` | everyone (editing requires `canEdit`) |
| All items | `#/items` | everyone |
| Item detail / edit | `#/items/:seq` | everyone (the form is read-only without `canEdit`) |
| New item | `#/new` | `canEdit` only |
| User guide | `#/help` | everyone |

- **Filters** are stored in `localStorage` under the key `ehp.filters.v1`. The "tour done" flag uses the key `ehp.tour.v1`. All storage access is wrapped in try/catch.
- **Testing hooks**: every interactive element has an accessible name. Stat cards expose `data-metric="<name>"`, which Playwright uses.
