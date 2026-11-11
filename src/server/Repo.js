// @ts-check
/**
 * Repo — the only code that reads or writes the spreadsheet (constitution I, II, V, VI).
 * Built as a factory so Node contract tests can inject a fake spreadsheet, lock and cache.
 *
 * @param {{
 *   ss: any,                        // Spreadsheet
 *   getLock: () => any,             // () => Lock with tryLock(ms)/releaseLock()
 *   cache?: any,                    // script Cache with get/put/remove (optional)
 *   userCache?: any,                // per-user Cache for the edit-permission probe (optional)
 *   effectiveEmail?: () => string,  // account the script runs as; the probe is used only if it equals the caller
 *   nowText: () => string,          // 'd/m/yyyy HH:mm:ss' in Asia/Bangkok
 *   makeDate: (y:number, m:number, d:number) => any  // midnight Asia/Bangkok
 * }} deps
 */
function makeRepo(deps) {
  'use strict';
  /* global require */
  var D = typeof Domain !== 'undefined' ? Domain : require('../shared/Domain.js');
  var C = typeof Config !== 'undefined' ? Config : require('./Config.js');
  var ss = deps.ss;

  // ------------------------------------------------------------------ helpers

  var clean = D.clean;
  var toInt = D.toInt;

  /**
   * Strings are written with a leading apostrophe so Sheets stores them as typed text and never
   * reinterprets them (leading zeros, "=" formulas, locale-parsed dates). The apostrophe is not displayed.
   * @param {any} v
   */
  function asText(v) {
    if (typeof v !== 'string' || v === '') return v;
    // Only values Sheets would reinterpret get the apostrophe: digits/dates-only text (leading zeros,
    // locale-parsed dates) and formula-like text. Normal text — especially dropdown values — stays plain,
    // otherwise the sheet's coloured dropdown chips stop matching (production 2026-11-11).
    return /^[=+\-@]/.test(v) || /^[\d\s.,/:-]+$/.test(v) ? "'" + v : v;
  }

  function mainSheet() {
    var sh = ss.getSheetByName(C.SHEETS.main);
    if (!sh) throw new Error('ไม่พบชีต "' + C.SHEETS.main + '"');
    return sh;
  }

  /** Map Domain keys to 0-based column indexes by exact header text (constitution II). @param {string[]} headerRow */
  function mapHeaders(headerRow) {
    var headers = headerRow.map(clean);
    /** @type {Object<string, number>} */
    var index = {};
    /** @type {string[]} */
    var missing = [];
    D.COLUMNS.forEach(function (/** @type {any} */ c) {
      var i = headers.indexOf(c.header);
      if (i === -1) missing.push(c.header);
      else index[c.key] = i;
    });
    return { index: index, missing: missing, width: headers.length };
  }

  /** @param {string} name @param {string[]} headers */
  function ensureSheet(name, headers) {
    var sh = ss.getSheetByName(name);
    if (sh) return sh;
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    if (sh.hideSheet) sh.hideSheet();
    return sh;
  }

  /** @param {Array<Array<any>>} entries rows matching LOG_HEADERS */
  function writeLog(entries) {
    if (!entries.length) return;
    var sh = ensureSheet(C.SHEETS.log, C.LOG_HEADERS);
    var rows = entries.map(function (e) {
      return e.map(asText);
    });
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, C.LOG_HEADERS.length).setValues(rows);
  }

  /** Run fn while holding the script lock; never writes partially on timeout. @param {() => any} fn */
  function withLock(fn) {
    var lock = deps.getLock();
    if (!lock.tryLock(C.LOCK_MS)) return C.fail('LOCK_TIMEOUT');
    try {
      return fn();
    } finally {
      lock.releaseLock();
    }
  }

  /** Which date columns mostly hold real Date cells. @param {any[][]} values @param {Object<string,number>} index */
  function detectDateColumns(values, index) {
    /** @type {Object<string, boolean>} */
    var out = {};
    D.DATE_KEYS.forEach(function (/** @type {string} */ key) {
      if (index[key] === undefined) return;
      var dates = 0;
      var texts = 0;
      for (var i = 1; i < values.length; i++) {
        var v = values[i][index[key]];
        if (v instanceof Date) dates++;
        else if (clean(v) !== '') texts++;
      }
      out[key] = dates > 0 && dates >= texts;
    });
    return out;
  }

  /**
   * Convert a validated string to the value written to a cell.
   * Dates keep the column's cell type (constitution VI); numbers are numbers.
   * @param {string} key @param {string} text @param {any} currentValue @param {boolean} columnIsDate
   */
  function toCellValue(key, text, currentValue, columnIsDate) {
    var col = D.COLUMN_BY_KEY[key];
    var v = clean(text);
    if (v === '') return '';
    if (col.type === 'date') {
      var useDate = currentValue instanceof Date || (clean(currentValue) === '' && columnIsDate);
      var p = D.parseDate(v).date;
      return useDate && p ? deps.makeDate(p.y, p.m, p.d) : asText(v);
    }
    if (col.type === 'number' || col.type === 'int') return Number(v);
    return asText(v);
  }

  /** @param {any[]} line @param {Object<string,number>} index @param {number} rowNumber */
  function rowObject(line, index, rowNumber) {
    /** @type {any} */
    var o = { rowNumber: rowNumber };
    Object.keys(index).forEach(function (key) {
      o[key] = line[index[key]] === undefined ? '' : String(line[index[key]]);
    });
    return o;
  }

  // ------------------------------------------------------------------ reads

  /** Read the whole main sheet in one call (constitution XIV). */
  function readAll() {
    var sh = mainSheet();
    var display = sh.getDataRange().getDisplayValues();
    var map = mapHeaders(display[0] || []);
    var hasDetail = map.index.detail !== undefined;
    var links = ticketLinks(sh, map.index.ticket, display.length - 1);
    var rows = [];
    for (var i = 1; i < display.length; i++) {
      var line = display[i];
      var isItem = hasDetail
        ? clean(line[map.index.detail]) !== ''
        : line.some(function (/** @type {any} */ c) {
            return clean(c) !== '';
          });
      if (!isItem) continue;
      var o = rowObject(line, map.index, i + 1);
      if (links[i - 1] && links[i - 1].length) o.ticketLinks = links[i - 1];
      rows.push(o);
    }
    return { rows: rows, missing: map.missing };
  }

  /**
   * Links hidden inside the Taiga/MANTIS cells (text with a link, or =HYPERLINK): display values only give
   * the text, e.g. "2132". One rich-text read + one formula read for that column (constitution XIV).
   * Best effort: if the API is missing or fails, the app still works with the text.
   * @param {any} sh @param {number|undefined} colIdx @param {number} count data rows
   * @returns {string[][]}
   */
  function ticketLinks(sh, colIdx, count) {
    if (colIdx === undefined || count < 1) return [];
    try {
      var range = sh.getRange(2, colIdx + 1, count, 1);
      var rich = typeof range.getRichTextValues === 'function' ? range.getRichTextValues() : [];
      var formulas = typeof range.getFormulas === 'function' ? range.getFormulas() : [];
      var out = [];
      for (var r = 0; r < count; r++) {
        var cell = rich[r] && rich[r][0];
        var urls = [];
        if (cell) {
          urls.push(cell.getLinkUrl());
          (cell.getRuns ? cell.getRuns() : []).forEach(function (/** @type {any} */ run) {
            urls.push(run.getLinkUrl());
          });
        }
        out.push(D.collectLinks(urls, (formulas[r] && formulas[r][0]) || ''));
      }
      return out;
    } catch (_e) {
      return [];
    }
  }

  /** @param {number} rowNumber */
  function readRow(rowNumber) {
    var sh = mainSheet();
    if (rowNumber < 2 || rowNumber > sh.getLastRow()) return null;
    var width = sh.getLastColumn();
    var map = mapHeaders(sh.getRange(1, 1, 1, width).getDisplayValues()[0]);
    return rowObject(sh.getRange(rowNumber, 1, 1, width).getDisplayValues()[0], map.index, rowNumber);
  }

  /** @param {any} validation */
  function validationList(validation) {
    if (!validation) return null;
    var type = String(validation.getCriteriaType());
    var vals = validation.getCriteriaValues() || [];
    if (type === 'VALUE_IN_LIST' && vals[0]) return vals[0].map(clean).filter(Boolean);
    if (type === 'VALUE_IN_RANGE' && vals[0] && vals[0].getDisplayValues) {
      return [].concat.apply([], vals[0].getDisplayValues()).map(clean).filter(Boolean);
    }
    return null;
  }

  /** @param {any[]} rows @param {string[]} keys */
  function distinct(rows, keys) {
    /** @type {Object<string, boolean>} */
    var seen = {};
    rows.forEach(function (r) {
      keys.forEach(function (k) {
        var v = clean(r[k]);
        if (v) seen[v] = true;
      });
    });
    return Object.keys(seen).sort();
  }

  function peopleFromSheet() {
    var sh = ss.getSheetByName(C.SHEETS.people);
    if (!sh) return null;
    var data = sh.getDataRange().getDisplayValues();
    if (!data.length) return null;
    var headers = data[0].map(clean);
    var col = 0;
    for (var i = 0; i < C.PEOPLE_HEADERS.length; i++) {
      var found = headers.indexOf(C.PEOPLE_HEADERS[i]);
      if (found !== -1) {
        col = found;
        break;
      }
    }
    /** @type {string[]} */
    var names = [];
    for (var r = 1; r < data.length; r++) {
      var n = clean(data[r][col]);
      if (n && names.indexOf(n) === -1) names.push(n);
    }
    return names.length ? names : null;
  }

  /**
   * Option sets (constitution III): Data Validation → documented/distinct values → รายชื่อ.
   * @param {any[]} [rows] raw rows from readAll; read only on a cache miss when omitted
   */
  function options(rows) {
    if (deps.cache) {
      var hit = deps.cache.get(C.CACHE_KEYS.options);
      if (hit) return JSON.parse(hit);
    }
    if (!rows) rows = readAll().rows;
    var sh = mainSheet();
    var width = sh.getLastColumn();
    var map = mapHeaders(sh.getRange(1, 1, 1, width).getDisplayValues()[0]);
    /** @param {string} key */
    var fromValidation = function (key) {
      return map.index[key] === undefined
        ? null
        : validationList(sh.getRange(2, map.index[key] + 1).getDataValidation());
    };
    /** @type {any} */
    var o = { status: D.WORKFLOW.slice() };
    ['platform', 'issueType', 'urgency'].forEach(function (key) {
      o[key] = fromValidation(key) || C.KNOWN_OPTIONS[key].slice();
    });
    o.system = fromValidation('system') || distinct(rows, ['system']);
    var people = peopleFromSheet();
    var fallback = distinct(rows, ['pm', 'developer']);
    o.pm = C.PM_LIST.slice(); // fixed by the PM (overrides validation / รายชื่อ)
    o.developer = D.withoutRetired(fromValidation('developer') || people || fallback, C.RETIRED);
    o.person = D.withoutRetired((people || fallback).slice(), C.RETIRED);
    o.pm.forEach(function (n) {
      if (o.person.indexOf(n) === -1) o.person.push(n); // PMs can map themselves in My Work
    });
    if (deps.cache) deps.cache.put(C.CACHE_KEYS.options, JSON.stringify(o), C.CACHE_SECONDS);
    return o;
  }

  // ------------------------------------------------------------------ writes

  /**
   * Append a new item with ลำดับ = max + 1 (input already validated by Domain.validateCreate).
   * @param {any} input @param {string} email
   */
  function create(input, email) {
    return withLock(function () {
      var sh = mainSheet();
      var range = sh.getDataRange();
      var display = range.getDisplayValues();
      var map = mapHeaders(display[0]);
      if (map.missing.length) return C.fail('SCHEMA', { missing: map.missing }, map.missing.join(', '));
      var dateColumns = detectDateColumns(range.getValues(), map.index);
      var seqs = [];
      for (var i = 1; i < display.length; i++) seqs.push({ seq: toInt(display[i][map.index.seq]) });
      var seq = D.nextSeq(seqs);
      var line = new Array(map.width).fill('');
      var rowNumber = sh.getLastRow() + 1;
      var now = deps.nowText();
      var log = [[now, email, 'CREATE', rowNumber, seq, D.COLUMN_BY_KEY.seq.header, '', String(seq)]];
      line[map.index.seq] = seq;
      D.COLUMNS.forEach(function (/** @type {any} */ c) {
        if (c.key === 'seq' || clean(input[c.key]) === '') return;
        line[map.index[c.key]] = toCellValue(c.key, input[c.key], '', !!dateColumns[c.key]);
        log.push([now, email, 'CREATE', rowNumber, seq, c.header, '', clean(input[c.key])]);
      });
      sh.appendRow(line);
      writeLog(log);
      if (deps.cache) deps.cache.remove(C.CACHE_KEYS.options);
      return C.ok({ rowNumber: rowNumber, seq: seq });
    });
  }

  /**
   * Write only the changed cells after checking ลำดับ and conflicts (constitution V).
   * @param {{rowNumber:number, seq:number, changes:Object<string,{from:string,to:string}>}} req
   * @param {string} email
   */
  function update(req, email) {
    return withLock(function () {
      var sh = mainSheet();
      var rowNumber = Number(req.rowNumber);
      if (!(rowNumber >= 2 && rowNumber <= sh.getLastRow())) return C.fail('NOT_FOUND');
      var range = sh.getDataRange();
      var display = range.getDisplayValues();
      var values = range.getValues();
      var map = mapHeaders(display[0]);
      if (map.missing.length) return C.fail('SCHEMA', { missing: map.missing }, map.missing.join(', '));
      var line = display[rowNumber - 1];
      var seq = toInt(line[map.index.seq]);
      if (seq === null) return C.fail('SEQ_INVALID');
      if (seq !== Number(req.seq)) return C.fail('SEQ_MISMATCH', { expected: req.seq, actual: seq });
      var dup = 0;
      for (var i = 1; i < display.length; i++) if (toInt(display[i][map.index.seq]) === seq) dup++;
      if (dup > 1) return C.fail('SEQ_INVALID');

      var keys = Object.keys(req.changes || {});
      var unknown = keys.filter(function (key) {
        return key === 'seq' || !D.isColumnKey(key) || map.index[key] === undefined;
      });
      if (!keys.length || unknown.length) return C.fail('VALIDATION', { fields: { _: unknown.join(', ') } });
      /** @type {Object<string, {expected:string, actual:string}>} */
      var conflicts = {};
      keys.forEach(function (key) {
        var actual = clean(line[map.index[key]]);
        if (actual !== clean(req.changes[key].from))
          conflicts[key] = { expected: clean(req.changes[key].from), actual: actual };
      });
      if (Object.keys(conflicts).length) return C.fail('CONFLICT', conflicts);

      var dateColumns = detectDateColumns(values, map.index);
      var now = deps.nowText();
      var log = [];
      try {
        keys.forEach(function (key) {
          var colIdx = map.index[key];
          var current = values[rowNumber - 1][colIdx];
          sh.getRange(rowNumber, colIdx + 1).setValue(
            toCellValue(key, req.changes[key].to, current, !!dateColumns[key]),
          );
          log.push([
            now,
            email,
            'UPDATE',
            rowNumber,
            seq,
            D.COLUMN_BY_KEY[key].header,
            clean(line[colIdx]),
            clean(req.changes[key].to),
          ]);
        });
      } finally {
        writeLog(log); // cells already written are always logged, even if a later write fails
      }
      if (deps.cache && req.changes.system) deps.cache.remove(C.CACHE_KEYS.options);
      return C.ok({ rowNumber: rowNumber, seq: seq, written: keys });
    });
  }

  /**
   * Delete one item row for real (user decision 2026-11-11, constitution v4). Same guards as update:
   * lock, ลำดับ at that row, unique ลำดับ, and every column must still match what the user saw.
   * The whole row is logged as JSON {header: value} in _app_log so it can be restored by hand.
   * @param {{rowNumber:number, seq:number, snapshot:Object<string,string>}} req @param {string} email
   */
  function remove(req, email) {
    return withLock(function () {
      var sh = mainSheet();
      var rowNumber = Number(req.rowNumber);
      if (!(rowNumber >= 2 && rowNumber <= sh.getLastRow())) return C.fail('NOT_FOUND');
      if (!req.snapshot || typeof req.snapshot !== 'object')
        return C.fail('VALIDATION', { fields: { _: 'snapshot' } });
      var display = sh.getDataRange().getDisplayValues();
      var map = mapHeaders(display[0]);
      if (map.missing.length) return C.fail('SCHEMA', { missing: map.missing }, map.missing.join(', '));
      var line = display[rowNumber - 1];
      var seq = toInt(line[map.index.seq]);
      if (seq === null) return C.fail('SEQ_INVALID');
      if (seq !== Number(req.seq)) return C.fail('SEQ_MISMATCH', { expected: req.seq, actual: seq });
      var dup = 0;
      for (var i = 1; i < display.length; i++) if (toInt(display[i][map.index.seq]) === seq) dup++;
      if (dup > 1) return C.fail('SEQ_INVALID');
      /** @type {Object<string, {expected:string, actual:string}>} */
      var conflicts = {};
      Object.keys(req.snapshot).forEach(function (key) {
        if (!D.isColumnKey(key) || map.index[key] === undefined) return;
        var actual = clean(line[map.index[key]]);
        if (actual !== clean(req.snapshot[key]))
          conflicts[key] = { expected: clean(req.snapshot[key]), actual: actual };
      });
      if (Object.keys(conflicts).length) return C.fail('CONFLICT', conflicts);

      /** @type {Object<string,string>} */
      var saved = {};
      display[0].forEach(function (/** @type {string} */ h, /** @type {number} */ c) {
        if (clean(h)) saved[clean(h)] = line[c];
      });
      sh.deleteRow(rowNumber); // throws on failure → nothing is logged as deleted
      writeLog([[deps.nowText(), email, 'DELETE', rowNumber, seq, '(ทั้งแถว)', JSON.stringify(saved), '']]);
      if (deps.cache) deps.cache.remove(C.CACHE_KEYS.options);
      return C.ok({ rowNumber: rowNumber, seq: seq });
    });
  }

  // ------------------------------------------------------------------ users & permissions

  /** @param {string} email */
  function getUserName(email) {
    var sh = ss.getSheetByName(C.SHEETS.users);
    if (!sh) return null;
    var data = sh.getDataRange().getDisplayValues();
    var e = clean(email).toLowerCase();
    for (var i = 1; i < data.length; i++)
      if (clean(data[i][0]).toLowerCase() === e) return clean(data[i][1]) || null;
    return null;
  }

  /** @param {string} email @param {string} name */
  function setUserName(email, name) {
    return withLock(function () {
      var sh = ensureSheet(C.SHEETS.users, C.USERS_HEADERS);
      var data = sh.getDataRange().getDisplayValues();
      var e = clean(email).toLowerCase();
      var now = deps.nowText();
      var old = '';
      var found = -1;
      for (var i = 1; i < data.length; i++) {
        if (clean(data[i][0]).toLowerCase() === e) {
          found = i + 1;
          old = clean(data[i][1]);
          break;
        }
      }
      if (found === -1) sh.appendRow([e, name, now].map(asText));
      else sh.getRange(found, 2, 1, 2).setValues([[asText(name), asText(now)]]);
      writeLog([[now, e, 'MAP_USER', '', '', C.USER_NAME_LABEL, old, name]]);
      return C.ok({ name: name });
    });
  }

  /** @param {() => any[]} list @param {string} e */
  function listed(list, e) {
    try {
      return list().some(function (/** @type {any} */ u) {
        return clean(u.getEmail()).toLowerCase() === e;
      });
    } catch (err) {
      console.warn('canEdit: could not read the sharing list', err);
      return false;
    }
  }

  /**
   * Edit permission follows the sheet's own permission (R8).
   * 1. Named editors (sharing list) → yes.
   * 2. Everyone else — including "anyone with the link can edit" and named viewers who also get edit
   *    through the link (Google grants the higher role) — is decided by what the sheet actually allows:
   *    Range.canEdit() when it says yes, otherwise a write probe (add + remove hidden developer metadata).
   *    Range.canEdit() alone is not enough: it returns false for link-based editors (production 2026-11-11).
   * The answer is cached per user. The probe only runs when the script runs AS the caller; otherwise fail
   * closed (security review 2026-11-11).
   * @param {string} email
   */
  function canEdit(email) {
    var e = clean(email).toLowerCase();
    if (!e) return false;
    if (
      listed(function () {
        return ss.getEditors();
      }, e)
    )
      return true;
    var runningAs = deps.effectiveEmail ? clean(deps.effectiveEmail()).toLowerCase() : '';
    if (runningAs !== e) return false;
    var key = C.EDIT_CACHE_PREFIX + e;
    var cached = deps.userCache ? deps.userCache.get(key) : null;
    if (cached !== null) return cached === '1';
    var result = rangeCanEdit() === true || metadataProbe();
    if (deps.userCache) deps.userCache.put(key, result ? '1' : '0', C.EDIT_PROBE_CACHE_SECONDS);
    return result;
  }

  // ------------------------------------------------------------------ repair dropdown chips (one-off, admin)

  /**
   * Rewrite option cells that earlier app versions wrote with a leading apostrophe, so the sheet's
   * dropdown chips show their colours again. Uses _app_log to find cells the app wrote; finds the row by
   * ลำดับ (the sheet may have been sorted) and only rewrites when the cell still shows the logged value.
   * @param {string} adminEmail @param {string} ownerEmail
   */
  function repairQuotedOptions(adminEmail, ownerEmail) {
    if (!isAdmin(adminEmail, ownerEmail)) return C.fail('NOT_ADMIN');
    return withLock(function () {
      var logSheet = ss.getSheetByName(C.SHEETS.log);
      if (!logSheet) return C.ok({ repaired: 0, skipped: 0 });
      var optionHeaders = {};
      D.COLUMNS.forEach(function (/** @type {any} */ c) {
        if (['option', 'status', 'person', 'freeOption', 'freePerson'].indexOf(c.type) !== -1)
          optionHeaders[c.header] = c.key;
      });
      var sh = mainSheet();
      var display = sh.getDataRange().getDisplayValues();
      var map = mapHeaders(display[0]);
      /** @type {Object<string, number>} */
      var rowBySeq = {};
      for (var i = 1; i < display.length; i++) {
        var sq = toInt(display[i][map.index.seq]);
        if (sq !== null) rowBySeq[sq] = rowBySeq[sq] ? -1 : i + 1; // -1 = duplicate ลำดับ, never touch
      }
      var latest = {}; // last logged value per (ลำดับ, column)
      logSheet
        .getDataRange()
        .getDisplayValues()
        .slice(1)
        .forEach(function (/** @type {any[]} */ r) {
          var action = clean(r[2]);
          var key = optionHeaders[clean(r[5])];
          var sq2 = toInt(r[4]);
          if ((action === 'UPDATE' || action === 'CREATE') && key && sq2 !== null)
            latest[sq2 + '|' + key] = clean(r[7]);
        });
      var repaired = 0;
      var skipped = 0;
      Object.keys(latest).forEach(function (k) {
        var parts = k.split('|');
        var row = rowBySeq[parts[0]];
        var colIdx = map.index[parts[1]];
        var value = latest[k];
        if (
          !row ||
          row < 0 ||
          colIdx === undefined ||
          clean(display[row - 1][colIdx]) !== value ||
          value === ''
        ) {
          skipped++;
          return;
        }
        // same guard as normal writes: plain for dropdown values, apostrophe for formula/number-like text
        sh.getRange(row, colIdx + 1).setValue(asText(value));
        repaired++;
      });
      writeLog([
        [
          deps.nowText(),
          clean(adminEmail).toLowerCase(),
          'REPAIR_CHIPS',
          '',
          '',
          '',
          '',
          'repaired ' + repaired + ', skipped ' + skipped,
        ],
      ]);
      return C.ok({ repaired: repaired, skipped: skipped });
    });
  }

  // ------------------------------------------------------------------ team list (_app_allowed)

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /**
   * The team list sheet, upgraded in place to the 5-column layout (email, ชื่อ, หมายเหตุ, บทบาท, สถานะ).
   * Rows from the old 3-column list become active admins (they were the people trusted to set it up).
   * Returns null when the sheet does not exist yet.
   */
  function allowedSheet() {
    var sh = ss.getSheetByName(C.SHEETS.allowed);
    if (!sh) return null;
    var width = C.ALLOWED_HEADERS.length;
    var header = sh.getRange(1, 1, 1, width).getDisplayValues()[0].map(clean);
    if (header[3] !== C.ALLOWED_HEADERS[3] || header[4] !== C.ALLOWED_HEADERS[4]) {
      sh.getRange(1, 4, 1, 2).setValues([[asText(C.ALLOWED_HEADERS[3]), asText(C.ALLOWED_HEADERS[4])]]);
      var last = sh.getLastRow();
      if (last >= 2) {
        var rows = sh.getRange(2, 1, last - 1, width).getDisplayValues();
        var fill = rows.map(function (r) {
          return clean(r[0])
            ? [asText(clean(r[3]) || C.ROLE.admin), asText(clean(r[4]) || C.ACCESS.allowed)]
            : [clean(r[3]), clean(r[4])];
        });
        sh.getRange(2, 4, fill.length, 2).setValues(fill);
      }
      writeLog([
        [deps.nowText(), '', 'ACCESS_MIGRATE', '', '', C.SHEETS.allowed, '', 'เพิ่มคอลัมน์ บทบาท/สถานะ'],
      ]);
    }
    return sh;
  }

  /** @returns {Array<{row:number,email:string,name:string,note:string,role:string,status:string}>|null} */
  function members() {
    var sh = allowedSheet();
    if (!sh) return null;
    var data = sh.getDataRange().getDisplayValues();
    var out = [];
    for (var i = 1; i < data.length; i++) {
      var em = clean(data[i][0]).toLowerCase();
      if (!em) continue;
      out.push({
        row: i + 1,
        email: em,
        name: clean(data[i][1]),
        note: clean(data[i][2]),
        role: clean(data[i][3]) || C.ROLE.editor,
        status: clean(data[i][4]) || C.ACCESS.allowed,
      });
    }
    return out;
  }

  /** @param {Array<any>|null} list @param {string} e */
  function findMember(list, e) {
    return (list || []).filter(function (m) {
      return m.email === e;
    })[0];
  }

  /** @param {string} email @param {string} ownerEmail */
  function isAdmin(email, ownerEmail) {
    var e = clean(email).toLowerCase();
    if (e && e === clean(ownerEmail).toLowerCase()) return true;
    var m = findMember(members(), e);
    return !!(m && m.role === C.ROLE.admin && m.status === C.ACCESS.allowed);
  }

  /** Public view of the list for the admin screen. */
  function listAccess() {
    return (members() || []).map(function (m) {
      return { email: m.email, name: m.name, note: m.note, role: m.role, status: m.status };
    });
  }

  /**
   * Who may add/edit through the app: must be able to edit the sheet AND be an allowed member of the
   * team list. If the list does not exist yet, the first sheet editor creates it with the sheet owner and
   * themselves as admins (visible sheet so the PM can manage it); this is logged.
   * @param {string} email @param {string} ownerEmail
   * @returns {{canEdit: boolean, reason: 'OK'|'SHEET_VIEW_ONLY'|'NOT_ALLOWED'|'PENDING'}}
   */
  function editAccess(email, ownerEmail) {
    var e = clean(email).toLowerCase();
    if (!canEdit(e)) return { canEdit: false, reason: 'SHEET_VIEW_ONLY' };
    var list = members();
    if (list === null) {
      var seeds = [clean(ownerEmail).toLowerCase(), e].filter(function (x, i, a) {
        return x && a.indexOf(x) === i;
      });
      var sh = ss.insertSheet(C.SHEETS.allowed);
      sh.appendRow(C.ALLOWED_HEADERS.map(asText));
      seeds.forEach(function (s) {
        sh.appendRow([s, '', 'เพิ่มอัตโนมัติตอนตั้งค่าครั้งแรก', C.ROLE.admin, C.ACCESS.allowed].map(asText));
      });
      writeLog([[deps.nowText(), e, 'ALLOW_INIT', '', '', C.SHEETS.allowed, '', seeds.join(', ')]]);
      return { canEdit: true, reason: 'OK' };
    }
    var m = findMember(list, e);
    if (m && m.status === C.ACCESS.allowed) return { canEdit: true, reason: 'OK' };
    if (m && m.status === C.ACCESS.pending) return { canEdit: false, reason: 'PENDING' };
    return { canEdit: false, reason: 'NOT_ALLOWED' };
  }

  /** A signed-in person asks to be added; stored as a pending editor. @param {string} email @param {string} name @param {string} note */
  function requestAccess(email, name, note) {
    var e = clean(email).toLowerCase();
    if (!EMAIL_RE.test(e)) return C.fail('VALIDATION', { fields: { email: 'อีเมลไม่ถูกต้อง' } });
    return withLock(function () {
      var m = findMember(members(), e);
      if (m) return C.ok({ status: m.status });
      var sh = allowedSheet() || ensureVisibleAllowedSheet();
      sh.appendRow([e, clean(name), clean(note), C.ROLE.editor, C.ACCESS.pending].map(asText));
      writeLog([[deps.nowText(), e, 'ACCESS_REQUEST', '', '', C.SHEETS.allowed, '', C.ACCESS.pending]]);
      return C.ok({ status: C.ACCESS.pending });
    });
  }

  function ensureVisibleAllowedSheet() {
    var sh = ss.insertSheet(C.SHEETS.allowed);
    sh.appendRow(C.ALLOWED_HEADERS.map(asText));
    return sh;
  }

  /**
   * Admins add people or change name/note/role/status. Rows are never deleted (suspend instead), and the
   * last active admin cannot be demoted or suspended (the sheet owner always counts as an admin).
   * @param {string} adminEmail @param {string} ownerEmail
   * @param {{email:string, name?:string, note?:string, role?:string, status?:string}} input
   */
  function saveAccess(adminEmail, ownerEmail, input) {
    var admin = clean(adminEmail).toLowerCase();
    if (!isAdmin(admin, ownerEmail)) return C.fail('NOT_ADMIN');
    var e = clean(input && input.email).toLowerCase();
    var roles = [C.ROLE.admin, C.ROLE.editor];
    var states = [C.ACCESS.allowed, C.ACCESS.pending, C.ACCESS.suspended];
    /** @type {Object<string,string>} */
    var errors = {};
    if (!EMAIL_RE.test(e)) errors.email = 'อีเมลไม่ถูกต้อง';
    if (input.role !== undefined && roles.indexOf(input.role) === -1) errors.role = 'บทบาทไม่ถูกต้อง';
    if (input.status !== undefined && states.indexOf(input.status) === -1) errors.status = 'สถานะไม่ถูกต้อง';
    if (Object.keys(errors).length) return C.fail('VALIDATION', { fields: errors });
    return withLock(function () {
      var sh = allowedSheet() || ensureVisibleAllowedSheet();
      var list = members() || [];
      var m = findMember(list, e);
      var next = {
        name: input.name !== undefined ? clean(input.name) : m ? m.name : '',
        note: input.note !== undefined ? clean(input.note) : m ? m.note : '',
        role: input.role !== undefined ? input.role : m ? m.role : C.ROLE.editor,
        status: input.status !== undefined ? input.status : m ? m.status : C.ACCESS.allowed,
      };
      var owner = clean(ownerEmail).toLowerCase();
      var stillAdmin = next.role === C.ROLE.admin && next.status === C.ACCESS.allowed;
      if (m && m.role === C.ROLE.admin && m.status === C.ACCESS.allowed && !stillAdmin) {
        var others = list.filter(function (x) {
          return x.email !== e && x.role === C.ROLE.admin && x.status === C.ACCESS.allowed;
        });
        if (!others.length && !(owner && owner !== e)) return C.fail('LAST_ADMIN');
      }
      var now = deps.nowText();
      if (m) {
        var before = [m.name, m.note, m.role, m.status].join(' | ');
        sh.getRange(m.row, 2, 1, 4).setValues([[next.name, next.note, next.role, next.status].map(asText)]);
        writeLog([
          [
            now,
            admin,
            'ACCESS_UPDATE',
            '',
            '',
            e,
            before,
            [next.name, next.note, next.role, next.status].join(' | '),
          ],
        ]);
      } else {
        sh.appendRow([e, next.name, next.note, next.role, next.status].map(asText));
        writeLog([
          [
            now,
            admin,
            'ACCESS_ADD',
            '',
            '',
            e,
            '',
            [next.name, next.note, next.role, next.status].join(' | '),
          ],
        ]);
      }
      return C.ok({ email: e, name: next.name, note: next.note, role: next.role, status: next.status });
    });
  }

  /** Ask Sheets directly whether the effective user can edit the main sheet (no write). null = unsupported. */
  function rangeCanEdit() {
    try {
      return mainSheet().getRange(1, 1).canEdit() === true;
    } catch (err) {
      console.warn('canEdit: Range.canEdit() unavailable, using metadata probe', err);
      return null;
    }
  }

  /**
   * Fallback: only editors can add developer metadata. Note addDeveloperMetadata() returns the
   * Spreadsheet, so the key is removed through a finder (this also cleans keys left by the old probe).
   */
  function metadataProbe() {
    try {
      ss.addDeveloperMetadata(C.EDIT_PROBE_KEY);
    } catch (_err) {
      return false; // refused without edit access
    }
    try {
      ss.createDeveloperMetadataFinder()
        .withKey(C.EDIT_PROBE_KEY)
        .find()
        .forEach(function (/** @type {any} */ md) {
          md.remove();
        });
    } catch (err) {
      console.warn('canEdit: could not remove probe metadata', err);
    }
    return true;
  }

  return {
    readAll: readAll,
    readRow: readRow,
    options: options,
    create: create,
    update: update,
    remove: remove,
    getUserName: getUserName,
    setUserName: setUserName,
    canEdit: canEdit,
    editAccess: editAccess,
    isAdmin: isAdmin,
    listAccess: listAccess,
    requestAccess: requestAccess,
    saveAccess: saveAccess,
    repairQuotedOptions: repairQuotedOptions,
  };
}

if (typeof module === 'object' && module.exports) module.exports = makeRepo;
