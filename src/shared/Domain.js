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
    { key: 'developer', header: 'นักพัฒนา', type: 'freePerson' }, // pick or type a new name (2026-11-11)
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
  // Order approved by the PM on 2026-11-11 (constitution v3.0.0 Data Contract). Spellings are kept exactly
  // as used in the sheet, including "Sourecode" and "Complie" (constitution III).
  var WORKFLOW = [
    '0.จัดทำไฟล์แก้ไข',
    '0.จัดทำ Taiga',
    'รอ PM ตรวจสอบ Taiga',
    '0.รอแจ้งทีมพัฒนา',
    'dev ขอ Sourecode อจ.',
    'รอทีมพัฒนา',
    'กำลังพัฒนา',
    'ส่งกลับนักพัฒนาแก้ไข',
    'กำลังทดสอบ',
    'รอ compile',
    'รอ Complie ต้องแจ้งอจ.',
    CANCELLED,
    '0.ใช้งานได้อยู่แล้ว',
    DONE,
  ];
  // New requests still start here (Data Contract default), even though it is not the first step.
  var DEFAULT_STATUS = '0.รอแจ้งทีมพัฒนา';
  var URGENCY = ['ด่วนที่สุด', 'ด่วน', 'ปกติ'];
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

  var THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  var THAI_MONTHS_LONG = [
    'มกราคม',
    'กุมภาพันธ์',
    'มีนาคม',
    'เมษายน',
    'พฤษภาคม',
    'มิถุนายน',
    'กรกฎาคม',
    'สิงหาคม',
    'กันยายน',
    'ตุลาคม',
    'พฤศจิกายน',
    'ธันวาคม',
  ];

  /** Full Thai date, e.g. "วันพุธที่ 11 พฤศจิกายน 2569". @param {SheetDate|null} dt */
  function formatThaiLong(dt) {
    if (!dt) return '';
    var dow = new Date(Date.UTC(dt.y, dt.m - 1, dt.d)).getUTCDay();
    return 'วัน' + THAI_DAYS[dow] + 'ที่ ' + dt.d + ' ' + THAI_MONTHS_LONG[dt.m - 1] + ' ' + (dt.y + 543);
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
  /**
   * Screen label for a status: drops the leading "0." the sheet uses for sorting (user request
   * 2026-11-11). Display only; the value written to the sheet stays exactly as spelled.
   * @param {string} status
   */
  function statusLabel(status) {
    return String(status || '')
      .trim()
      .replace(/^0\.\s*/, '');
  }

  function statusRank(status) {
    var s = clean(status);
    if (s === '') return WORKFLOW.length + 1;
    var i = WORKFLOW.indexOf(s);
    return i === -1 ? WORKFLOW.length : i;
  }
  /** Suggested next step for quick actions; null for closed or unknown statuses. @param {any} status */
  function nextStatus(status) {
    var s = clean(status);
    if (s === '') return DEFAULT_STATUS;
    if (!isOpen(s)) return null;
    var i = WORKFLOW.indexOf(s);
    if (i === -1) return null;
    var next = WORKFLOW[i + 1];
    // after the last working step the item is finished (never "next" into 0.ยกเลิก)
    return isOpen(next) ? next : DONE;
  }

  // ---------------------------------------------------------------- rows

  /** @param {any} v @returns {string|null} */
  /**
   * Links found in one cell: rich-text link URLs plus the URL of a =HYPERLINK(...) formula.
   * Only http(s) is kept (no javascript:, mailto:, in-sheet anchors); order kept, duplicates dropped.
   * @param {Array<string|null|undefined>} urls @param {string} formula
   */
  function collectLinks(urls, formula) {
    var all = (urls || []).slice();
    var f = /^\s*=\s*HYPERLINK\(\s*"([^"]+)"/i.exec(str(formula));
    if (f) all.push(f[1]);
    var out = [];
    all.forEach(function (u) {
      var v = str(u).trim();
      if (/^https?:\/\/\S+$/i.test(v) && out.indexOf(v) === -1) out.push(v);
    });
    return out;
  }

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
    // links embedded in the cell (rich text / =HYPERLINK) win over a URL typed as text (2026-11-11)
    r.ticketLinks = collectLinks(raw.ticketLinks || [], '');
    r.ticketUrl = r.ticketLinks[0] || ticketUrl(r.ticket);
    r.pms = splitPm(r.pm);
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

  var PM_SEP = ', ';

  /** Several PMs live in one cell joined with ", " (Google Sheets multi-select chip format). @param {string} v */
  function splitPm(v) {
    return String(v || '')
      .split(',')
      .map(clean)
      .filter(Boolean);
  }

  /** @param {string[]} names @param {string[]} [order] PM list order */
  function joinPm(names, order) {
    var list = names.map(clean).filter(function (n, i, a) {
      return n && a.indexOf(n) === i;
    });
    if (order) {
      list.sort(function (a, b) {
        var ia = order.indexOf(a);
        var ib = order.indexOf(b);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      });
    }
    return list.join(PM_SEP);
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
    OPTION_KEYS.concat(['pm']).forEach(function (key) {
      var list = optionList(options, key);
      var bad =
        key === 'pm'
          ? splitPm(r.pm)
              .filter(function (p) {
                return list.indexOf(p) === -1;
              })
              .join(PM_SEP)
          : list.indexOf(r[key]) === -1
            ? r[key]
            : '';
      if (r[key] !== '' && list.length && bad) {
        out.push(
          issue(
            'OPTION_INVALID',
            key,
            'ค่าในช่อง "' + COLUMN_BY_KEY[key].header + '" ไม่อยู่ในรายการตัวเลือก: ' + bad,
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
      if (
        f.pm &&
        f.pm.length &&
        !splitPm(r.pm).some(function (p) {
          return f.pm.indexOf(p) !== -1;
        }) &&
        f.pm.indexOf(r.pm) === -1
      )
        return false;
      if (!inList(f.developer, r.developer === '' ? UNASSIGNED : r.developer)) return false;
      if (!inList(f.urgency, r.urgency)) return false;
      if (!inList(f.issueType, r.issueType)) return false;
      if (!inList(f.status, r.status)) return false;
      // ids is a drill-down: an empty list means "nothing", never "no filter"
      if (f.ids && f.ids.indexOf(r.id) === -1) return false;
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

  /** Stage groups used by the board colours and the My Work filter. */
  var STAGE_LABELS = {
    prep: 'เตรียมงาน',
    dev: 'กำลังพัฒนา',
    back: 'ส่งกลับแก้',
    test: 'ทดสอบ / compile',
    done: 'ปิดแล้ว',
    other: 'อื่นๆ',
  };
  var STAGE_OF = {
    'dev ขอ Sourecode อจ.': 'dev',
    รอทีมพัฒนา: 'dev',
    กำลังพัฒนา: 'dev',
    ส่งกลับนักพัฒนาแก้ไข: 'back',
    กำลังทดสอบ: 'test',
    'รอ compile': 'test',
    'รอ Complie ต้องแจ้งอจ.': 'test',
  };

  /** @param {string} status */
  function stageOf(status) {
    var s = clean(status);
    if (WORKFLOW.indexOf(s) === -1) return 'other';
    if (!isOpen(s)) return 'done';
    return STAGE_OF[s] || 'prep';
  }

  /**
   * My Work quick filters. Closed items are kept (they feed "ปิดได้สัปดาห์นี้") unless platform/text exclude them.
   * @param {any[]} rows enriched rows @param {{platform?:string, stage?:string, q?:string}} f
   */
  function filterMyWork(rows, f) {
    f = f || {};
    var out = rows.filter(function (r) {
      if (f.platform && r.platform !== f.platform) return false;
      if (f.stage && r.isOpen && stageOf(r.status) !== f.stage) return false;
      return true;
    });
    return f.q && clean(f.q) ? search(out, f.q) : out;
  }

  /**
   * Open items with no developer, in the order a dev lead should assign them: overdue (most days late)
   * first, then urgency, then nearest due date; items without a due date last.
   * @param {any[]} rows enriched rows @param {SheetDate} today
   */
  function unassignedQueue(rows, today) {
    void today; // enriched rows already carry isOverdue / overdueDays for "today"
    return rows
      .filter(function (r) {
        return r.isOpen && !r.developer;
      })
      .sort(function (a, b) {
        if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
        if (a.isOverdue && a.overdueDays !== b.overdueDays) return b.overdueDays - a.overdueDays;
        var u = urgencyRank(a.urgency) - urgencyRank(b.urgency);
        if (u) return u;
        if (!a.effectiveDue !== !b.effectiveDue) return a.effectiveDue ? -1 : 1;
        if (a.effectiveDue && b.effectiveDue) {
          var c = compareDate(a.effectiveDue, b.effectiveDue);
          if (c) return c;
        }
        return (a.seq || 0) - (b.seq || 0);
      });
  }

  var OTHER_PM = 'อื่นๆ (ไม่อยู่ในรายชื่อ PM)';

  /**
   * PM table rows: always the fixed PMs in order (even with no open work), then one "อื่นๆ" row for
   * any other or empty PM value so the totals still match the open count.
   * @param {Array<{name:string, open:number, overdue:number, ids:string[], overdueIds:string[]}>} byPm
   * @param {string[]} pmList
   */
  function pmBreakdown(byPm, pmList) {
    var out = pmList.map(function (name) {
      var hit = byPm.filter(function (p) {
        return p.name === name;
      })[0];
      return hit || { name: name, open: 0, overdue: 0, ids: [], overdueIds: [] };
    });
    var rest = byPm.filter(function (p) {
      return pmList.indexOf(p.name) === -1;
    });
    if (rest.length) {
      out.push({
        name: OTHER_PM,
        other: true,
        open: rest.reduce(function (n, p) {
          return n + p.open;
        }, 0),
        overdue: rest.reduce(function (n, p) {
          return n + p.overdue;
        }, 0),
        ids: [].concat.apply(
          [],
          rest.map(function (p) {
            return p.ids;
          }),
        ),
        overdueIds: [].concat.apply(
          [],
          rest.map(function (p) {
            return p.overdueIds;
          }),
        ),
      });
    }
    return out;
  }

  /**
   * Remove people who left the team from option lists (the sheet keeps their history).
   * @param {string[]} names @param {string[]} retired names or nicknames, matched as a whole word/nickname
   */
  function withoutRetired(names, retired) {
    return names.filter(function (n) {
      return !retired.some(function (x) {
        return n === x || n.indexOf('(' + x + ')') !== -1 || n.split(/\s+/).indexOf(x) !== -1;
      });
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
      // a key function may return several keys (a row shared by several PMs counts for each)
      [].concat(keyFn(r)).forEach(function (k) {
        (g[k] = g[k] || []).push(r);
      });
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
      var list = splitPm(r.pm);
      return list.length ? list : [NO_PM];
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
      return name && r.isOpen && (role === 'pm' ? r.pms.indexOf(name) !== -1 : r[role] === name);
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

  /** Most pressing first: longest overdue, then earliest due, then top urgency, then ลำดับ. */
  function pressing(/** @type {any} */ a, /** @type {any} */ b) {
    if (b.overdueDays !== a.overdueDays) return b.overdueDays - a.overdueDays;
    var da = a.effectiveDue ? dayNumber(a.effectiveDue) : Infinity;
    var db = b.effectiveDue ? dayNumber(b.effectiveDue) : Infinity;
    if (da !== db) return da < db ? -1 : 1;
    if (urgencyRank(a.urgency) !== urgencyRank(b.urgency))
      return urgencyRank(a.urgency) - urgencyRank(b.urgency);
    return (a.seq || 0) - (b.seq || 0);
  }

  /**
   * My Work by calendar week (user request 2026-11-11): overdue, this week (Mon–Sun containing today),
   * next week, later, no due date; plus "urgent" (overdue or ด่วนที่สุด) and what I closed this week.
   * @param {any[]} rows @param {string} name @param {'developer'|'pm'} role @param {SheetDate} today
   */
  function groupMyWeek(rows, name, role, today) {
    var mine = rows.filter(function (r) {
      return name && (role === 'pm' ? r.pms.indexOf(name) !== -1 : r[role] === name);
    });
    var open = mine.filter(function (r) {
      return r.isOpen;
    });
    var week = weekRange(today);
    var next = { from: addDays(week.from, 7), to: addDays(week.to, 7) };
    var g = {
      overdue: [],
      thisWeek: [],
      nextWeek: [],
      later: [],
      noDue: [],
      urgent: [],
      doneThisWeek: [],
      openTotal: open.length,
    };
    open.forEach(function (r) {
      if (!r.effectiveDue) g.noDue.push(r);
      else if (r.isOverdue) g.overdue.push(r);
      else if (inRange(r.effectiveDue, week)) g.thisWeek.push(r);
      else if (inRange(r.effectiveDue, next)) g.nextWeek.push(r);
      else g.later.push(r);
      if (r.isOverdue || r.urgency === URGENCY[0]) g.urgent.push(r);
    });
    g.doneThisWeek = mine.filter(function (r) {
      return !r.isOpen && r.doneDate.date && inRange(r.doneDate.date, week);
    });
    ['overdue', 'thisWeek', 'nextWeek', 'later', 'noDue', 'urgent'].forEach(function (k) {
      /** @type {any} */ (g)[k].sort(pressing);
    });
    return g;
  }

  /**
   * One week (Mon–Sun) of a developer's open work, by due day (วันที่เลื่อน wins over วันที่ต้องได้).
   * @param {any[]} rows enriched rows @param {string} name developer @param {SheetDate} today
   * @param {number} offset weeks from this week (0 = this week, 1 = next, -1 = last)
   */
  function weekPlan(rows, name, today, offset) {
    var base = weekRange(today);
    var range = { from: addDays(base.from, 7 * (offset || 0)), to: addDays(base.to, 7 * (offset || 0)) };
    var todayN = dayNumber(today);
    var days = [0, 1, 2, 3, 4, 5, 6].map(function (i) {
      var date = addDays(range.from, i);
      var n = dayNumber(date);
      return { date: date, isToday: n === todayN, isPast: n < todayN, items: /** @type {any[]} */ ([]) };
    });
    var total = 0;
    rows.forEach(function (r) {
      if (!name || !r.isOpen || r.developer !== name || !r.effectiveDue || !inRange(r.effectiveDue, range))
        return;
      days[dayNumber(r.effectiveDue) - dayNumber(range.from)].items.push(r);
      total++;
    });
    days.forEach(function (x) {
      x.items.sort(pressing);
    });
    return { range: range, days: days, total: total, isThisWeek: !offset };
  }

  var OVERDUE_BUCKETS = [
    { label: '1–7 วัน', max: 7 },
    { label: '8–14 วัน', max: 14 },
    { label: '15–30 วัน', max: 30 },
    { label: 'เกิน 30 วัน', max: Infinity },
  ];

  /** Overdue items grouped by days late (for the overdue chart). @param {any[]} rows */
  function overdueBuckets(rows) {
    var out = OVERDUE_BUCKETS.map(function (b) {
      return { label: b.label, max: b.max, ids: /** @type {string[]} */ ([]) };
    });
    rows.forEach(function (r) {
      if (!r.isOverdue) return;
      for (var i = 0; i < out.length; i++) {
        if (r.overdueDays <= out[i].max) {
          out[i].ids.push(r.id);
          break;
        }
      }
    });
    return out;
  }

  // ---------------------------------------------------------------- text report export (2026-11-11)

  /** Short reference used in reports: the ticket number when there is one, otherwise ลำดับ. @param {any} r */
  function itemRef(r) {
    var t = clean(r.ticket);
    var us = /\/us\/(\d+)/.exec(t);
    if (us) return us[1];
    var num = /^#?(\d+)$/.exec(t);
    if (num) return num[1];
    return 'ลำดับ ' + (r.seq === null ? '-' : r.seq);
  }

  var DIGEST_MAX_CHARS = 4500; // LINE text message limit is 5,000 characters
  var DIGEST_PER_LIST = 5;

  /**
   * Monday digest text for LINE (แมวส้ม sends it; user request 2026-11-11). Team totals, then each developer
   * with open work: overdue (days late) and due this week, capped per list. Split into messages of at most
   * DIGEST_MAX_CHARS, only between developers.
   * @param {any[]} rows enriched rows @param {SheetDate} today @param {{appUrl?: string}} opts
   * @returns {string[]}
   */
  function buildDigest(rows, today, opts) {
    opts = opts || {};
    var week = weekRange(today);
    var short = function (/** @type {any} */ dt) {
      return THAI_MONTHS[dt.m - 1] + ' ' + String(dt.y + 543).slice(-2);
    };
    var label =
      week.from.m === week.to.m
        ? week.from.d + '–' + week.to.d + ' ' + short(week.to)
        : formatThai(week.from) + ' – ' + formatThai(week.to);
    var open = rows.filter(function (r) {
      return r.isOpen;
    });
    var head = ['📋 สรุปงานประจำสัปดาห์ ' + label];
    if (!open.length) {
      head.push('ไม่มีงานค้าง เยี่ยมมาก 🎉');
      return [head.join('\n')];
    }
    var overdueAll = open.filter(function (r) {
      return r.isOverdue;
    }).length;
    var unassigned = open.filter(function (r) {
      return !r.developer;
    }).length;
    head.push(
      'งานค้าง ' +
        open.length +
        ' งาน · เกินกำหนด ' +
        overdueAll +
        ' งาน' +
        (unassigned ? ' · ยังไม่มอบหมาย ' + unassigned + ' งาน' : ''),
    );

    var item = function (/** @type {any} */ r, /** @type {string} */ tail) {
      var text = clean(r.detail);
      if (text.length > 40) text = text.slice(0, 39) + '…';
      return ' • #' + r.seq + ' ' + text + ' (' + tail + ')';
    };
    var list = function (
      /** @type {string} */ title,
      /** @type {any[]} */ items,
      /** @type {(r:any)=>string} */ tail,
    ) {
      if (!items.length) return [];
      var lines = [title].concat(
        items.slice(0, DIGEST_PER_LIST).map(function (r) {
          return item(r, tail(r));
        }),
      );
      if (items.length > DIGEST_PER_LIST)
        lines.push(' … และอีก ' + (items.length - DIGEST_PER_LIST) + ' งาน');
      return lines;
    };
    var byDev = groupBy(
      open.filter(function (r) {
        return r.developer;
      }),
      function (r) {
        return r.developer;
      },
    );
    var blocks = Object.keys(byDev)
      .map(function (name) {
        var mine = byDev[name];
        var over = mine
          .filter(function (r) {
            return r.isOverdue;
          })
          .sort(pressing);
        var thisWeek = mine
          .filter(function (r) {
            return !r.isOverdue && r.effectiveDue && inRange(r.effectiveDue, week);
          })
          .sort(pressing);
        return { name: name, open: mine.length, over: over, thisWeek: thisWeek };
      })
      .filter(function (b) {
        return b.over.length || b.thisWeek.length;
      })
      .sort(function (a, b) {
        return (
          b.over.length - a.over.length || b.thisWeek.length - a.thisWeek.length || (a.name < b.name ? -1 : 1)
        );
      })
      .map(function (b) {
        return [
          '',
          '👩‍💻 ' +
            b.name +
            ' — ค้าง ' +
            b.open +
            ' งาน' +
            (b.over.length ? ' (เกิน ' + b.over.length + ')' : ''),
        ]
          .concat(
            list('🔥 เกินกำหนด', b.over, function (r) {
              return 'เกิน ' + r.overdueDays + ' วัน';
            }),
          )
          .concat(
            list('📅 สัปดาห์นี้', b.thisWeek, function (r) {
              return formatThai(r.effectiveDue);
            }),
          )
          .join('\n');
      });
    var foot = opts.appUrl ? '\nดูรายละเอียด: ' + opts.appUrl : '';

    var msgs = [];
    var cur = head.join('\n');
    blocks.forEach(function (b) {
      if ((cur + '\n' + b).length > DIGEST_MAX_CHARS) {
        msgs.push(cur);
        cur = b.replace(/^\n/, '');
      } else cur += '\n' + b;
    });
    if ((cur + '\n' + foot).length > DIGEST_MAX_CHARS) {
      msgs.push(cur);
      cur = foot.trim();
    } else cur += foot ? '\n' + foot : '';
    if (cur) msgs.push(cur);
    return msgs;
  }

  /** "9–15 พ.ย. 2569" for a range inside one month, else two Thai dates. */
  function thaiRange(/** @type {{from:SheetDate,to:SheetDate}} */ rg) {
    if (rg.from.m === rg.to.m && rg.from.y === rg.to.y) {
      return rg.from.d + '–' + rg.to.d + ' ' + THAI_MONTHS[rg.to.m - 1] + ' ' + (rg.to.y + 543);
    }
    return formatThai(rg.from) + ' – ' + formatThai(rg.to);
  }

  /**
   * Plain-text monthly summary in the team's report format (sections 1–6).
   * @param {any[]} rows enriched rows (already filtered by the caller, e.g. by PM)
   * @param {SheetDate} today
   * @param {{sinceSeq?: number|null, pm?: string}} opts sinceSeq = last ลำดับ in the previous report
   */
  function buildReport(rows, today, opts) {
    opts = opts || {};
    var m = computeMetrics(rows, today);
    var lines = [];
    var month = THAI_MONTHS_LONG[today.m - 1] + ' ' + (today.y + 543);
    lines.push('สรุปรายการขอแก้ไขโปรแกรม ประจำเดือน' + month);
    if (opts.pm) lines.push('PM ผู้รับผิดชอบ: ' + opts.pm);
    lines.push('ข้อมูล ณ วันที่ ' + today.d + ' ' + THAI_MONTHS[today.m - 1] + ' ' + (today.y + 543));
    lines.push('');

    var since = typeof opts.sinceSeq === 'number' && isFinite(opts.sinceSeq) ? opts.sinceSeq : null;
    var fresh =
      since === null
        ? []
        : rows
            .filter(function (r) {
              return r.seq !== null && r.seq > since;
            })
            .sort(function (a, b) {
              return a.seq - b.seq;
            });
    var closed = rows.filter(function (r) {
      return !r.isOpen;
    });
    var byKind = function (s) {
      return closed.filter(function (r) {
        return r.status === s;
      }).length;
    };
    lines.push('1. ภาพรวมการดำเนินงาน');
    lines.push(
      '- รายการขอแก้ไขทั้งหมด ' +
        rows.length +
        ' ข้อ' +
        (since === null ? '' : ' (เพิ่มมาใหม่ ' + fresh.length + ' ข้อ)'),
    );
    lines.push(
      '- ดำเนินการแล้ว (ปิดงาน) ' +
        closed.length +
        ' ข้อ: แก้ไขเรียบร้อย ' +
        byKind(DONE) +
        ', ใช้งานได้อยู่แล้ว ' +
        byKind('0.ใช้งานได้อยู่แล้ว') +
        ', ยกเลิก ' +
        byKind(CANCELLED),
    );
    lines.push('- คงเหลือรอแก้ไข ' + m.openCount + ' ข้อ (เกินกำหนด ' + m.overdueCount + ' ข้อ)');
    lines.push('- ปิดงานในเดือนนี้ ' + m.closedThisMonth.count + ' ข้อ');
    lines.push('');

    var week = weekRange(today);
    var queue = rows
      .filter(function (r) {
        return r.isOpen && !r.isOverdue && inRange(r.effectiveDue, week);
      })
      .sort(pressing);
    lines.push('2. รายการในคิวแก้ไขสัปดาห์นี้ (' + thaiRange(week) + ')');
    lines.push(
      'จำนวน ' + queue.length + ' ข้อ' + (queue.length ? ' ได้แก่ ' + queue.map(itemRef).join(', ') : ''),
    );
    lines.push('');

    lines.push('3. รายการเกินกำหนดระยะเวลา');
    lines.push(
      'จำนวน ' +
        m.overdueList.length +
        ' ข้อ' +
        (m.overdueList.length ? ' ได้แก่ ' + m.overdueList.map(itemRef).join(', ') : ''),
    );
    m.overdueList.forEach(function (r) {
      lines.push(
        '- ' +
          itemRef(r) +
          ' เกิน ' +
          r.overdueDays +
          ' วัน: ' +
          r.detail +
          ' (' +
          (r.developer || UNASSIGNED) +
          ')',
      );
    });
    lines.push('');

    if (since === null) {
      lines.push('4. รายการขอแก้ไขใหม่');
      lines.push('(ระบุลำดับสุดท้ายของรายงานครั้งก่อน เพื่อแสดงรายการใหม่)');
    } else {
      lines.push('4. รายการขอแก้ไขใหม่ จำนวน ' + fresh.length + ' ข้อ (ตั้งแต่ลำดับ ' + (since + 1) + ')');
      fresh.forEach(function (r) {
        lines.push(r.platform + ' - ' + r.detail);
      });
    }
    lines.push('');

    lines.push('5. งานค้างแยกตามสถานะ');
    m.byStatus.forEach(function (s) {
      lines.push('- ' + s.status + ': ' + s.count);
    });
    lines.push('');
    lines.push('6. งานค้างแยกตามนักพัฒนา');
    m.byDeveloper.forEach(function (p) {
      lines.push('- ' + p.name + ': ' + p.open + (p.overdue ? ' (เกินกำหนด ' + p.overdue + ')' : ''));
    });
    return lines.join('\n');
  }

  /** @param {any[]} rows @param {string} query */
  function search(rows, query) {
    var q = clean(query).toLowerCase();
    if (/^\d+$/.test(q)) {
      // A number means "item or ticket number": match whole numbers only, never digits inside other numbers.
      var whole = new RegExp('(^|\\D)' + q + '(\\D|$)');
      return rows.filter(function (r) {
        return (r.seq !== null && String(r.seq) === q) || whole.test(r.ticket);
      });
    }
    if (q.length < 2) return rows;
    return rows.filter(function (r) {
      return (r.detail + '\n' + r.system + '\n' + r.ticket).toLowerCase().indexOf(q) !== -1;
    });
  }

  /** Own data-contract key only (rejects inherited names like "constructor"). @param {string} key */
  function isColumnKey(key) {
    return Object.prototype.hasOwnProperty.call(COLUMN_BY_KEY, key);
  }

  /** 0 = ด่วนที่สุด … URGENCY.length = empty/unknown. @param {any} u */
  function urgencyRank(u) {
    var i = URGENCY.indexOf(clean(u));
    return i === -1 ? URGENCY.length : i;
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
    if (key === 'pm') {
      var pmList = optionList(options, key);
      var unknown = splitPm(v).filter(function (p) {
        return pmList.indexOf(p) === -1;
      });
      if (unknown.length || !splitPm(v).length) return 'กรุณาเลือก "' + col.header + '" จากรายการ';
    } else if (col.type === 'option' || col.type === 'person') {
      var list = optionList(options, key);
      if (list.indexOf(v) === -1) return 'กรุณาเลือก "' + col.header + '" จากรายการ';
    } else if (col.type === 'status') {
      if (WORKFLOW.indexOf(v) === -1) return 'กรุณาเลือกสถานะจากรายการ';
    } else if (col.type === 'freeOption' || col.type === 'freePerson') {
      if (optionList(options, key).indexOf(v) === -1) {
        warnings[key] =
          col.type === 'freePerson'
            ? 'เป็นชื่อนักพัฒนาใหม่ที่ยังไม่มีในรายการ'
            : 'เป็นระบบงานใหม่ที่ยังไม่มีในรายการ';
      }
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
      else if (!isColumnKey(key)) errors[key] = 'ไม่รู้จักช่อง ' + key;
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
    formatThaiLong: formatThaiLong,
    THAI_MONTHS_LONG: THAI_MONTHS_LONG,
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
    pmBreakdown: pmBreakdown,
    unassignedQueue: unassignedQueue,
    buildDigest: buildDigest,
    DIGEST_MAX_CHARS: DIGEST_MAX_CHARS,
    collectLinks: collectLinks,
    weekPlan: weekPlan,
    stageOf: stageOf,
    STAGE_LABELS: STAGE_LABELS,
    filterMyWork: filterMyWork,
    splitPm: splitPm,
    joinPm: joinPm,
    PM_SEP: PM_SEP,
    statusLabel: statusLabel,
    withoutRetired: withoutRetired,
    OTHER_PM: OTHER_PM,
    groupMyWork: groupMyWork,
    groupMyWeek: groupMyWeek,
    overdueBuckets: overdueBuckets,
    itemRef: itemRef,
    buildReport: buildReport,
    search: search,
    validateCreate: validateCreate,
    validateUpdate: validateUpdate,
    diffChanges: diffChanges,
    nextSeq: nextSeq,
    URGENCY: URGENCY,
    urgencyRank: urgencyRank,
    isColumnKey: isColumnKey,
    clean: clean,
    toInt: toInt,
  };
})();

if (typeof module === 'object' && module.exports) module.exports = Domain;
