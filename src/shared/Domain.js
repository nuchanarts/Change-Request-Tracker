// @ts-check
/**
 * Domain — the single source of business rules (constitution IV, XII).
 * Pure ES2020: no SpreadsheetApp, no Session, no clock. "today" is always passed in.
 * The same file runs as an Apps Script server file, inside the browser (DomainClient.html),
 * and in Node for unit tests.
 */
var Domain = (function () {
  'use strict';

  /** @typedef {{y:number,m:number,d:number}} SheetDate */
  /** @typedef {{raw:string,date:SheetDate|null,issue:null|'DATE_UNPARSEABLE'|'DATE_BUDDHIST_YEAR'}} DateCell */

  // ---------------------------------------------------------------- data contract

  /** Columns of the main sheet, in contract order. `header` must match row 1 exactly. */
  var COLUMNS = [
    { key: 'seq', header: 'ลำดับ', type: 'int' },
    { key: 'platform', header: 'แพลตฟอร์ม', type: 'option', required: true },
    { key: 'issueType', header: 'ประเภทปัญหา', type: 'option', required: true },
    { key: 'urgency', header: 'ความเร่งด่วน', type: 'option', required: true },
    { key: 'status', header: 'สถานะ', type: 'status', required: true },
    { key: 'system', header: 'ระบบงาน', type: 'freeOption', required: true },
    { key: 'detail', header: 'รายละเอียด', type: 'text', required: true },
    { key: 'pm', header: 'PM รับผิดชอบ', type: 'person', required: true },
    { key: 'ticket', header: 'ข้อมูลลิงค์ Taiga หรือ MANTIS', type: 'text' },
    { key: 'dueDate', header: 'วันที่ต้องได้', type: 'date', required: true },
    { key: 'developer', header: 'นักพัฒนา', type: 'person' },
    { key: 'postponedDate', header: 'วันที่เลื่อน', type: 'date' },
    { key: 'doneDate', header: 'วันที่เสร็จ', type: 'date' },
    { key: 'deployDate', header: 'วันที่ Deploy', type: 'date' },
    { key: 'devQueue', header: 'ลำดับการแก้ไข Dev', type: 'number' },
    { key: 'devHours', header: 'ระยะเวลาพัฒนา(ชม.)', type: 'number' },
    { key: 'devStart', header: 'เริ่มพัฒนา', type: 'date' },
    { key: 'devEnd', header: 'พัฒนาเสร็จ', type: 'date' },
  ];
  var COLUMN_BY_KEY = {};
  COLUMNS.forEach(function (c) {
    COLUMN_BY_KEY[c.key] = c;
  });
  var DATE_KEYS = COLUMNS.filter(function (c) {
    return c.type === 'date';
  }).map(function (c) {
    return c.key;
  });
  var OPTION_KEYS = ['platform', 'issueType', 'urgency'];
  var PERSON_KEYS = ['pm', 'developer'];

  var DONE = '0.แก้ไขเรียบร้อย';
  var CANCELLED = '0.ยกเลิก';
  var CLOSED = [DONE, '0.ใช้งานได้อยู่แล้ว', CANCELLED];
  var WORKFLOW = [
    '0.รอแจ้งทีมพัฒนา',
    'รอทีมพัฒนา',
    'กำลังพัฒนา',
    '0.จัดทำไฟล์แก้ไข',
    'รอ compile',
    'รอ Complie ต้องแจ้งอจ.',
    'กำลังทดสอบ',
    'ส่งกลับนักพัฒนาแก้ไข',
    'รอ PM ตรวจสอบ Taiga',
    DONE,
    '0.ใช้งานได้อยู่แล้ว',
    CANCELLED,
  ];
  var DEFAULT_STATUS = WORKFLOW[0];
  var UNASSIGNED = 'ยังไม่มอบหมาย';
  var NO_PM = 'ไม่ระบุ PM';
  var NO_STATUS_LABEL = '(ไม่ระบุสถานะ)';
  var THAI_MONTHS = [
    'ม.ค.',
    'ก.พ.',
    'มี.ค.',
    'เม.ย.',
    'พ.ค.',
    'มิ.ย.',
    'ก.ค.',
    'ส.ค.',
    'ก.ย.',
    'ต.ค.',
    'พ.ย.',
    'ธ.ค.',
  ];
  var DAY_MS = 86400000;

  // ---------------------------------------------------------------- small helpers

  /** @param {any} v */
  function str(v) {
    return v === null || v === undefined ? '' : String(v);
  }
  /** @param {any} v */
  function clean(v) {
    return str(v).trim();
  }
  /** @param {any} v @returns {number|null} */
  function toNumber(v) {
    var s = clean(v);
    if (s === '') return null;
    var n = Number(s);
    return isFinite(n) ? n : null;
  }
  /** @param {any} v @returns {number|null} */
  function toInt(v) {
    var s = clean(v);
    return /^\d+(\.0+)?$/.test(s) ? parseInt(s, 10) : null;
  }

  // ---------------------------------------------------------------- dates (constitution VI)

  /** @param {number} y @param {number} m */
  function daysInMonth(y, m) {
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }

  /**
   * Parse a display value in d/m/yyyy (C.E.). Never throws.
   * @param {any} value
   * @returns {DateCell}
   */
  function parseDate(value) {
    var raw = str(value);
    var s = raw.trim();
    if (s === '') return { raw: raw, date: null, issue: null };
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (!m) return { raw: raw, date: null, issue: 'DATE_UNPARSEABLE' };
    var d = Number(m[1]);
    var mo = Number(m[2]);
    var y = Number(m[3]);
    /** @type {DateCell['issue']} */
    var issue = null;
    if (y >= 2400) {
      y -= 543;
      issue = 'DATE_BUDDHIST_YEAR';
    }
    if (y < 1900 || mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) {
      return { raw: raw, date: null, issue: 'DATE_UNPARSEABLE' };
    }
    return { raw: raw, date: { y: y, m: mo, d: d }, issue: issue };
  }

  /** @param {SheetDate|null} dt */
  function formatDate(dt) {
    return dt ? dt.d + '/' + dt.m + '/' + dt.y : '';
  }

  /** Thai short display, e.g. "16 เม.ย. 69" (Buddhist year). @param {SheetDate|null} dt */
  function formatThai(dt) {
    if (!dt) return '';
    return dt.d + ' ' + THAI_MONTHS[dt.m - 1] + ' ' + String(dt.y + 543).slice(-2);
  }

  /** @param {string} iso yyyy-mm-dd @returns {SheetDate|null} */
  function fromIso(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(iso));
    return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
  }
  /** @param {SheetDate|null} dt */
  function toIso(dt) {
    if (!dt) return '';
    var p = function (n) {
      return n < 10 ? '0' + n : String(n);
    };
    return dt.y + '-' + p(dt.m) + '-' + p(dt.d);
  }

  /** @param {SheetDate} dt */
  function dayNumber(dt) {
    return Date.UTC(dt.y, dt.m - 1, dt.d) / DAY_MS;
  }
  /** @param {number} n @returns {SheetDate} */
  function fromDayNumber(n) {
    var t = new Date(n * DAY_MS);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }
  /** b - a in days. @param {SheetDate} a @param {SheetDate} b */
  function daysBetween(a, b) {
    return dayNumber(b) - dayNumber(a);
  }
  /** @param {SheetDate} a @param {SheetDate} b */
  function compareDate(a, b) {
    return dayNumber(a) - dayNumber(b);
  }
  /** @param {SheetDate} dt @param {number} n */
  function addDays(dt, n) {
    return fromDayNumber(dayNumber(dt) + n);
  }
  /** Monday–Sunday week containing dt. @param {SheetDate} dt */
  function weekRange(dt) {
    var n = dayNumber(dt);
    var dow = (new Date(n * DAY_MS).getUTCDay() + 6) % 7; // Monday = 0
    return { from: fromDayNumber(n - dow), to: fromDayNumber(n - dow + 6) };
  }
  /** @param {SheetDate} dt */
  function monthRange(dt) {
    return { from: { y: dt.y, m: dt.m, d: 1 }, to: { y: dt.y, m: dt.m, d: daysInMonth(dt.y, dt.m) } };
  }
  /** @param {SheetDate|null} dt @param {{from:SheetDate|null,to:SheetDate|null}} r */
  function inRange(dt, r) {
    if (!dt) return false;
    if (r.from && compareDate(dt, r.from) < 0) return false;
    if (r.to && compareDate(dt, r.to) > 0) return false;
    return true;
  }

  // ---------------------------------------------------------------- status (constitution IV)

  /** @param {any} status */
  function isOpen(status) {
    return CLOSED.indexOf(clean(status)) === -1;
  }
  /** @param {any} status */
  function statusRank(status) {
    var s = clean(status);
    if (s === '') return WORKFLOW.length + 1;
    var i = WORKFLOW.indexOf(s);
    return i === -1 ? WORKFLOW.length : i;
  }
  /** Suggested next step for quick actions; null for closed or unknown statuses. @param {any} status */
  function nextStatus(status) {
    var s = clean(status);
    if (s === '') return WORKFLOW[0];
    if (!isOpen(s)) return null;
    var i = WORKFLOW.indexOf(s);
    return i === -1 ? null : WORKFLOW[i + 1];
  }

  // ---------------------------------------------------------------- rows

  /** @param {any} v @returns {string|null} */
  function ticketUrl(v) {
    var m = /https?:\/\/\S+/.exec(str(v));
    return m ? m[0] : null;
  }

  /**
   * Turn a raw row (display strings + rowNumber) into a ChangeRequest with derived fields.
   * @param {Object<string, any>} raw
   * @param {SheetDate} today
   */
  function enrich(raw, today) {
    /** @type {any} */
    var r = { rowNumber: Number(raw.rowNumber), raw: {} };
    COLUMNS.forEach(function (c) {
      var v = raw[c.key];
      r.raw[c.key] = str(v);
      if (c.type === 'date') r[c.key] = parseDate(v);
      else if (c.type === 'int') r[c.key] = toInt(v);
      else if (c.type === 'number') r[c.key] = toNumber(v);
      else r[c.key] = clean(v);
    });
    r.id = r.seq !== null ? String(r.seq) : 'row:' + r.rowNumber;
    r.isOpen = isOpen(r.status);
    r.effectiveDue = r.postponedDate.date || r.dueDate.date;
    r.isOverdue = !!(r.isOpen && r.effectiveDue && compareDate(r.effectiveDue, today) < 0);
    r.overdueDays = r.isOverdue ? daysBetween(r.effectiveDue, today) : 0;
    r.ticketUrl = ticketUrl(r.ticket);
    return r;
  }

  /** @param {Array<{seq:number|null}>} rows */
  function countSeq(rows) {
    /** @type {Object<string, number>} */
    var counts = {};
    rows.forEach(function (r) {
      if (r.seq !== null && r.seq !== undefined) counts[r.seq] = (counts[r.seq] || 0) + 1;
    });
    return counts;
  }

  /** @param {any} options @param {string} key @returns {string[]} */
  function optionList(options, key) {
    if (!options) return [];
    if (PERSON_KEYS.indexOf(key) !== -1) return options[key] || options.person || [];
    return options[key] || [];
  }

  /** @param {string} code @param {string} key @param {string} message */
  function issue(code, key, message) {
    return { code: code, column: key, message: message };
  }

  /**
   * Data-quality issues for one enriched row (FR-031).
   * @param {any} r enriched row
   * @param {any} options option sets
   * @param {Object<string, number>} seqCounts from countSeq
   */
  function detectIssues(r, options, seqCounts) {
    var out = [];
    OPTION_KEYS.concat(PERSON_KEYS).forEach(function (key) {
      var list = optionList(options, key);
      if (r[key] !== '' && list.length && list.indexOf(r[key]) === -1) {
        out.push(
          issue(
            'OPTION_INVALID',
            key,
            'ค่าในช่อง "' + COLUMN_BY_KEY[key].header + '" ไม่อยู่ในรายการตัวเลือก: ' + r[key],
          ),
        );
      }
    });
    if (r.status !== '' && WORKFLOW.indexOf(r.status) === -1) {
      out.push(issue('STATUS_UNKNOWN', 'status', 'สถานะ "' + r.status + '" ไม่อยู่ในลำดับขั้นตอนที่กำหนด'));
    }
    DATE_KEYS.forEach(function (key) {
      var cell = r[key];
      var label = COLUMN_BY_KEY[key].header;
      if (cell.issue === 'DATE_UNPARSEABLE') {
        out.push(issue('DATE_UNPARSEABLE', key, 'อ่านวันที่ในช่อง "' + label + '" ไม่ได้: ' + cell.raw));
      } else if (cell.issue === 'DATE_BUDDHIST_YEAR') {
        out.push(
          issue('DATE_BUDDHIST_YEAR', key, 'ช่อง "' + label + '" ใช้ปี พ.ศ. (ควรเป็น ค.ศ.): ' + cell.raw),
        );
      }
    });
    if (r.seq === null) out.push(issue('SEQ_MISSING', 'seq', 'ไม่มีเลขลำดับ'));
    else if ((seqCounts[r.seq] || 0) > 1)
      out.push(issue('SEQ_DUPLICATE', 'seq', 'เลขลำดับ ' + r.seq + ' ซ้ำกับแถวอื่น'));
    if (r.isOpen && !r.effectiveDue) out.push(issue('OPEN_NO_DUE', 'dueDate', 'งานค้างแต่ไม่มีวันกำหนด'));
    if (r.status === DONE && !r.doneDate.date) {
      out.push(issue('CLOSED_NO_DONE_DATE', 'doneDate', 'แก้ไขเรียบร้อยแล้วแต่ไม่มีวันที่เสร็จ'));
    }
    return out;
  }

  // ---------------------------------------------------------------- filters, metrics, my work, search

  /** @param {any[]} list @param {any} value */
  function inList(list, value) {
    return !list || !list.length || list.indexOf(value) !== -1;
  }

  /**
   * @param {any[]} rows enriched rows
   * @param {any} f filters: platform[], pm[], developer[], urgency[], status[], issueType[], dateFrom, dateTo, state, ids[]
   */
  function applyFilters(rows, f) {
    f = f || {};
    return rows.filter(function (r) {
      if (!inList(f.platform, r.platform)) return false;
      if (!inList(f.pm, r.pm)) return false;
      if (!inList(f.developer, r.developer === '' ? UNASSIGNED : r.developer)) return false;
      if (!inList(f.urgency, r.urgency)) return false;
      if (!inList(f.issueType, r.issueType)) return false;
      if (!inList(f.status, r.status)) return false;
      if (!inList(f.ids, r.id)) return false;
      if (f.state === 'open' && !r.isOpen) return false;
      if (f.state === 'closed' && r.isOpen) return false;
      if (f.state === 'overdue' && !r.isOverdue) return false;
      if (
        (f.dateFrom || f.dateTo) &&
        !inRange(r.effectiveDue, { from: f.dateFrom || null, to: f.dateTo || null })
      ) {
        return false;
      }
      return true;
    });
  }

  /** @param {any[]} rows */
  function ids(rows) {
    return rows.map(function (r) {
      return r.id;
    });
  }

  /** @param {any[]} rows @param {(r:any)=>string} keyFn */
  function groupBy(rows, keyFn) {
    /** @type {Object<string, any[]>} */
    var g = {};
    rows.forEach(function (r) {
      var k = keyFn(r);
      (g[k] = g[k] || []).push(r);
    });
    return g;
  }

  /**
   * The 6 monitor questions (constitution VII), each with the ids behind it.
   * @param {any[]} rows enriched (already filtered) rows
   * @param {SheetDate} today
   */
  function computeMetrics(rows, today) {
    var open = rows.filter(function (r) {
      return r.isOpen;
    });
    var overdue = open.filter(function (r) {
      return r.isOverdue;
    });

    var byStatusMap = groupBy(open, function (r) {
      return r.status;
    });
    var byStatus = Object.keys(byStatusMap)
      .sort(function (a, b) {
        return statusRank(a) - statusRank(b) || (a < b ? -1 : 1);
      })
      .map(function (s) {
        return {
          status: s === '' ? NO_STATUS_LABEL : s,
          value: s,
          count: byStatusMap[s].length,
          ids: ids(byStatusMap[s]),
        };
      });

    var byDevMap = groupBy(open, function (r) {
      return r.developer || UNASSIGNED;
    });
    var byDeveloper = Object.keys(byDevMap)
      .map(function (name) {
        var list = byDevMap[name];
        var od = list.filter(function (r) {
          return r.isOverdue;
        });
        return { name: name, open: list.length, overdue: od.length, ids: ids(list), overdueIds: ids(od) };
      })
      .sort(function (a, b) {
        return b.open - a.open || b.overdue - a.overdue || (a.name < b.name ? -1 : 1);
      });

    var byPmMap = groupBy(open, function (r) {
      return r.pm || NO_PM;
    });
    var byPm = Object.keys(byPmMap)
      .map(function (name) {
        var list = byPmMap[name];
        var od = list.filter(function (r) {
          return r.isOverdue;
        });
        return { name: name, open: list.length, overdue: od.length, ids: ids(list), overdueIds: ids(od) };
      })
      .sort(function (a, b) {
        return b.open - a.open || (a.name < b.name ? -1 : 1);
      });

    var week = weekRange(today);
    var month = monthRange(today);
    var closed = rows.filter(function (r) {
      return !r.isOpen && r.doneDate.date;
    });
    var cw = closed.filter(function (r) {
      return inRange(r.doneDate.date, week);
    });
    var cm = closed.filter(function (r) {
      return inRange(r.doneDate.date, month);
    });

    var overdueList = overdue.slice().sort(function (a, b) {
      return b.overdueDays - a.overdueDays || (a.seq || 0) - (b.seq || 0);
    });
    var noDue = open.filter(function (r) {
      return !r.effectiveDue;
    });

    return {
      total: rows.length,
      openCount: open.length,
      openIds: ids(open),
      overdueCount: overdue.length,
      overdueIds: ids(overdue),
      byStatus: byStatus,
      byDeveloper: byDeveloper,
      byPm: byPm,
      closedThisWeek: { count: cw.length, ids: ids(cw), range: week },
      closedThisMonth: { count: cm.length, ids: ids(cm), range: month },
      overdueList: overdueList,
      noDue: { count: noDue.length, ids: ids(noDue) },
    };
  }

  /**
   * @param {any[]} rows enriched rows
   * @param {string} name person name
   * @param {'developer'|'pm'} role
   * @param {SheetDate} today
   */
  function groupMyWork(rows, name, role, today) {
    var mine = rows.filter(function (r) {
      return name && r.isOpen && r[role] === name;
    });
    var sortFn = function (/** @type {any} */ a, /** @type {any} */ b) {
      var qa = a.devQueue === null ? Infinity : a.devQueue;
      var qb = b.devQueue === null ? Infinity : b.devQueue;
      if (qa !== qb) return qa < qb ? -1 : 1;
      var da = a.effectiveDue ? dayNumber(a.effectiveDue) : Infinity;
      var db = b.effectiveDue ? dayNumber(b.effectiveDue) : Infinity;
      if (da !== db) return da < db ? -1 : 1;
      return (a.seq || 0) - (b.seq || 0);
    };
    /** @type {{overdue:any[],today:any[],within7:any[],later:any[],noDue:any[],total:number}} */
    var g = { overdue: [], today: [], within7: [], later: [], noDue: [], total: mine.length };
    mine.forEach(function (r) {
      if (!r.effectiveDue) return g.noDue.push(r);
      var diff = daysBetween(today, r.effectiveDue);
      if (diff < 0) g.overdue.push(r);
      else if (diff === 0) g.today.push(r);
      else if (diff <= 7) g.within7.push(r);
      else g.later.push(r);
    });
    ['overdue', 'today', 'within7', 'later', 'noDue'].forEach(function (k) {
      /** @type {any} */ (g)[k].sort(sortFn);
    });
    return g;
  }

  /** @param {any[]} rows @param {string} query */
  function search(rows, query) {
    var q = clean(query).toLowerCase();
    if (q.length < 2) return rows;
    if (/^\d+$/.test(q)) {
      // A number means "item or ticket number": match whole numbers only, never digits inside other numbers.
      var whole = new RegExp('(^|\\D)' + q + '(\\D|$)');
      return rows.filter(function (r) {
        return (r.seq !== null && String(r.seq) === q) || whole.test(r.ticket);
      });
    }
    return rows.filter(function (r) {
      if (r.seq !== null && String(r.seq) === q) return true;
      return (r.detail + '\n' + r.system + '\n' + r.ticket).toLowerCase().indexOf(q) !== -1;
    });
  }

  // ---------------------------------------------------------------- validation (FR-015..FR-021)

  /**
   * Validate one field value. Returns an error message or null; may push a warning.
   * @param {string} key @param {string} value @param {any} options @param {Object<string,string>} warnings
   */
  function validateField(key, value, options, warnings) {
    var col = COLUMN_BY_KEY[key];
    var v = clean(value);
    if (v === '') return col.required ? 'กรุณากรอก "' + col.header + '"' : null;
    if (col.type === 'option' || col.type === 'person') {
      var list = optionList(options, key);
      if (list.indexOf(v) === -1) return 'กรุณาเลือก "' + col.header + '" จากรายการ';
    } else if (col.type === 'status') {
      if (WORKFLOW.indexOf(v) === -1) return 'กรุณาเลือกสถานะจากรายการ';
    } else if (col.type === 'freeOption') {
      if (optionList(options, key).indexOf(v) === -1) warnings[key] = 'เป็นระบบงานใหม่ที่ยังไม่มีในรายการ';
    } else if (col.type === 'date') {
      var p = parseDate(v);
      if (!p.date || p.issue)
        return 'วันที่ "' + col.header + '" ต้องเป็นรูปแบบ วัน/เดือน/ปี ค.ศ. เช่น 16/4/2026';
    } else if (col.type === 'number' || col.type === 'int') {
      if (toNumber(v) === null) return '"' + col.header + '" ต้องเป็นตัวเลข';
    }
    return null;
  }

  var DONE_DATE_MSG = 'สถานะ "แก้ไขเรียบร้อย" ต้องระบุวันที่เสร็จ';

  /** @param {any} input @param {any} options */
  function validateCreate(input, options) {
    /** @type {Object<string,string>} */ var errors = {};
    /** @type {Object<string,string>} */ var warnings = {};
    COLUMNS.forEach(function (c) {
      if (c.key === 'seq') return;
      var msg = validateField(c.key, input[c.key], options, warnings);
      if (msg) errors[c.key] = msg;
    });
    if (clean(input.status) === DONE && clean(input.doneDate) === '' && !errors.doneDate) {
      errors.doneDate = DONE_DATE_MSG;
    }
    return { ok: Object.keys(errors).length === 0, errors: errors, warnings: warnings };
  }

  /**
   * @param {Object<string,{from:string,to:string}>} changes
   * @param {any} current raw current values (strings)
   * @param {any} options
   */
  function validateUpdate(changes, current, options) {
    /** @type {Object<string,string>} */ var errors = {};
    /** @type {Object<string,string>} */ var warnings = {};
    var keys = Object.keys(changes || {});
    if (!keys.length) errors._ = 'ไม่มีข้อมูลที่เปลี่ยนแปลง';
    keys.forEach(function (key) {
      if (key === 'seq') errors.seq = 'แก้ไขเลขลำดับไม่ได้';
      else if (!COLUMN_BY_KEY[key]) errors[key] = 'ไม่รู้จักช่อง ' + key;
      else {
        var msg = validateField(key, changes[key].to, options, warnings);
        if (msg) errors[key] = msg;
      }
    });
    var status = changes.status ? changes.status.to : current.status;
    var doneDate = changes.doneDate ? changes.doneDate.to : current.doneDate;
    if (clean(status) === DONE && clean(doneDate) === '' && !errors.doneDate) errors.doneDate = DONE_DATE_MSG;
    return { ok: Object.keys(errors).length === 0, errors: errors, warnings: warnings };
  }

  /** Changed fields only, with from/to. @param {any} before @param {any} after */
  function diffChanges(before, after) {
    /** @type {Object<string,{from:string,to:string}>} */
    var out = {};
    Object.keys(after).forEach(function (key) {
      if (clean(before[key]) !== clean(after[key]))
        out[key] = { from: str(before[key]), to: clean(after[key]) };
    });
    return out;
  }

  /** @param {Array<{seq:number|null}>} rows */
  function nextSeq(rows) {
    var max = 0;
    rows.forEach(function (r) {
      if (typeof r.seq === 'number' && r.seq > max) max = r.seq;
    });
    return max + 1;
  }

  return {
    COLUMNS: COLUMNS,
    COLUMN_BY_KEY: COLUMN_BY_KEY,
    DATE_KEYS: DATE_KEYS,
    CLOSED: CLOSED,
    WORKFLOW: WORKFLOW,
    DONE: DONE,
    CANCELLED: CANCELLED,
    DEFAULT_STATUS: DEFAULT_STATUS,
    UNASSIGNED: UNASSIGNED,
    NO_PM: NO_PM,
    parseDate: parseDate,
    formatDate: formatDate,
    formatThai: formatThai,
    fromIso: fromIso,
    toIso: toIso,
    daysBetween: daysBetween,
    compareDate: compareDate,
    addDays: addDays,
    weekRange: weekRange,
    monthRange: monthRange,
    inRange: inRange,
    isOpen: isOpen,
    statusRank: statusRank,
    nextStatus: nextStatus,
    ticketUrl: ticketUrl,
    enrich: enrich,
    countSeq: countSeq,
    detectIssues: detectIssues,
    applyFilters: applyFilters,
    computeMetrics: computeMetrics,
    groupMyWork: groupMyWork,
    search: search,
    validateCreate: validateCreate,
    validateUpdate: validateUpdate,
    diffChanges: diffChanges,
    nextSeq: nextSeq,
  };
})();

if (typeof module === 'object' && module.exports) module.exports = Domain;
