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
    return typeof v === 'string' && v !== '' ? "'" + v : v;
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
    var display = mainSheet().getDataRange().getDisplayValues();
    var map = mapHeaders(display[0] || []);
    var hasDetail = map.index.detail !== undefined;
    var rows = [];
    for (var i = 1; i < display.length; i++) {
      var line = display[i];
      var isItem = hasDetail
        ? clean(line[map.index.detail]) !== ''
        : line.some(function (/** @type {any} */ c) {
            return clean(c) !== '';
          });
      if (isItem) rows.push(rowObject(line, map.index, i + 1));
    }
    return { rows: rows, missing: map.missing };
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
    o.pm = fromValidation('pm') || people || fallback;
    o.developer = fromValidation('developer') || people || fallback;
    o.person = people || fallback;
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
   * Edit permission follows the sheet's own permission (R8). Named editors/viewers are answered from
   * the sharing list. Anyone else (group or link sharing) is checked with Range.canEdit() (no write), or,
   * if that is unavailable, a developer-metadata probe; the answer is cached per user for 1 hour.
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
    if (
      listed(function () {
        return ss.getViewers();
      }, e)
    )
      return false;
    // The probe runs with the script's identity. It only proves the caller's access when the script
    // runs AS the caller (executeAs USER_ACCESSING); otherwise fail closed (security review 2026-11-11).
    var runningAs = deps.effectiveEmail ? clean(deps.effectiveEmail()).toLowerCase() : '';
    if (runningAs !== e) return false;
    var key = C.EDIT_CACHE_PREFIX + e; // v2 key: ignores answers cached by the buggy v1 probe
    var cached = deps.userCache ? deps.userCache.get(key) : null;
    if (cached !== null) return cached === '1';
    var result = rangeCanEdit();
    if (result === null) result = metadataProbe();
    if (deps.userCache) deps.userCache.put(key, result ? '1' : '0', C.EDIT_PROBE_CACHE_SECONDS);
    return result;
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
    getUserName: getUserName,
    setUserName: setUserName,
    canEdit: canEdit,
  };
}

if (typeof module === 'object' && module.exports) module.exports = makeRepo;
