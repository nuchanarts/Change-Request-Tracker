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
    // Not required: the PM fills it in later, so the form gives it its own frame colour (user request 2026-11-24).
    { key: 'dueDate', header: 'วันที่ต้องได้', type: 'date', pmFills: true },
    { key: 'developer', header: 'นักพัฒนา', type: 'freePerson' }, // pick or type a new name (2026-11-11)
    { key: 'postponedDate', header: 'วันที่เลื่อน', type: 'date' },
    { key: 'doneDate', header: 'วันที่เสร็จ', type: 'date' },
    { key: 'deployDate', header: 'วันที่ Deploy', type: 'date' },
    { key: 'devQueue', header: 'ลำดับการแก้ไข Dev', type: 'number' },
    { key: 'devHours', header: 'ระยะเวลาพัฒนา(ชม.)', type: 'number' },
    { key: 'devStart', header: 'เริ่มพัฒนา', type: 'date' },
    { key: 'devEnd', header: 'พัฒนาเสร็จ', type: 'date' },
    // Optional (user request 2026-11-18): a sheet without this column still works; the field is hidden.
    { key: 'tester', header: 'ผู้ทดสอบ', type: 'freePerson', optional: true },
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
  var PERSON_KEYS = ['pm', 'developer', 'tester'];

  var DONE = '0.แก้ไขเรียบร้อย';
  var PM_RETURN = '0.PM ส่งกลับแก้ไข Taiga';
  var PM_REVIEW = 'รอ PM ตรวจสอบ Taiga';
  var CANCELLED = '0.ยกเลิก';
  var CLOSED = [DONE, '0.ใช้งานได้อยู่แล้ว', CANCELLED];
  // Order approved by the PM on 2026-11-11 (constitution v3.0.0 Data Contract). Spellings are kept exactly
  // as used in the sheet, including "Sourecode" and "Complie" (constitution III).
  var WORKFLOW = [
    '0.จัดทำไฟล์แก้ไข',
    '0.จัดทำ Taiga',
    'รอ PM ตรวจสอบ Taiga',
    PM_RETURN, // added to the sheet 2026-11-20
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
  var DEFAULT_URGENCY = 'ปกติ';
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
    // PM sent the Taiga file back: once fixed it goes to PM review again; passing review skips the return step
    if (s === PM_RETURN) return PM_REVIEW;
    var i = WORKFLOW.indexOf(s);
    if (i === -1) return null;
    var next = WORKFLOW[i + 1];
    if (next === PM_RETURN) next = WORKFLOW[i + 2];
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

  // PM teams for the shared PM filter (user request 2026-11-16), by nickname so the full names stay in
  // Config.PM_LIST only.
  var PM_TEAMS = [
    { name: 'EHP/NHIP', nicks: ['แก๊ส', 'ป้อง'] },
    { name: 'EHP INET', nicks: ['แพท', 'ส้ม'] },
  ];

  /** "นุชนารถ (แก๊ส)" → "แก๊ส", "ทิพวรรณ (พี่ส้ม)" → "ส้ม". @param {string} pm */
  function pmNick(pm) {
    var m = /\(([^)]+)\)/.exec(str(pm));
    return (m ? m[1] : str(pm)).trim().replace(/^พี่\s*/, '');
  }

  /**
   * PM filter choices for the teams ("ทีม EHP/NHIP"), PMs in nickname order; teams with no PM in the list are left out.
   * @param {string[]} pmList @returns {Array<{label:string, pms:string[]}>}
   */
  function pmTeams(pmList) {
    var out = [];
    PM_TEAMS.forEach(function (t) {
      var pms = [];
      t.nicks.forEach(function (nick) {
        (pmList || []).forEach(function (pm) {
          if (pmNick(pm) === nick && pms.indexOf(pm) === -1) pms.push(pm);
        });
      });
      // team name only, no PM names in the label (user request 2026-11-16)
      if (pms.length) out.push({ label: 'ทีม ' + t.name, pms: pms });
    });
    return out;
  }

  /**
   * The PM filter value as the list applyFilters takes: a team label → its PMs, a PM → itself, '' → none.
   * @param {string} value @param {string[]} pmList
   */
  function pmFilter(value, pmList) {
    var v = clean(value);
    if (!v) return [];
    var team = pmTeams(pmList).filter(function (t) {
      return t.label === v;
    })[0];
    return team ? team.pms.slice() : [v];
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
      if (!inList(f.urgency, urgencyOf(r.urgency))) return false;
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

  /** My Work "ทุกคน": every developer's work at once (user request 2026-11-18). Unassigned items are left out. */
  var ALL_DEVELOPERS = 'ทุกคน';

  /**
   * Is this row the person's work? For PMs, `name` may also be a list of PMs (a PM team, user request
   * 2026-11-16): the row counts when any of them is a PM on it.
   * @param {any} r @param {string|string[]} name @param {'developer'|'pm'} role
   */
  function isMine(r, name, role) {
    if (!name || (Array.isArray(name) && !name.length)) return false;
    if (role === 'developer' && name === ALL_DEVELOPERS) return r.developer !== '';
    if (role !== 'pm') return r[role] === name;
    var names = Array.isArray(name) ? name : [name];
    return r.pms.some(function (/** @type {string} */ p) {
      return names.indexOf(p) !== -1;
    });
  }

  /**
   * @param {any[]} rows enriched rows
   * @param {string|string[]} name person name (PMs: or a PM team's names)
   * @param {'developer'|'pm'} role
   * @param {SheetDate} today
   */
  function groupMyWork(rows, name, role, today) {
    var mine = rows.filter(function (r) {
      return r.isOpen && isMine(r, name, role);
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
   * @param {any[]} rows @param {string|string[]} name (PMs: or a PM team's names) @param {'developer'|'pm'} role
   * @param {SheetDate} today
   */
  function groupMyWeek(rows, name, role, today) {
    var mine = rows.filter(function (r) {
      return isMine(r, name, role);
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
      if (!r.isOpen || !isMine(r, name, 'developer') || !r.effectiveDue || !inRange(r.effectiveDue, range))
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

  // ---------------------------------------------------------------- monitor charts (2026-11-20)

  var NO_PLATFORM = 'ไม่ระบุแพลตฟอร์ม';

  /**
   * Finished work per month for the last `n` months (this month last). Cancelled items are not finished
   * work, so only 0.แก้ไขเรียบร้อย and 0.ใช้งานได้อยู่แล้ว with a readable วันที่เสร็จ count.
   * @param {any[]} rows enriched rows @param {SheetDate} today @param {number} n
   */
  function closedByMonth(rows, today, n) {
    var out = [];
    for (var k = n - 1; k >= 0; k--) {
      var idx = today.y * 12 + (today.m - 1) - k;
      out.push({
        y: Math.floor(idx / 12),
        m: (idx % 12) + 1,
        label: THAI_MONTHS[idx % 12],
        count: 0,
        ids: [],
      });
    }
    rows.forEach(function (r) {
      if (r.isOpen || r.status === CANCELLED || !r.doneDate.date) return;
      var dt = r.doneDate.date;
      var hit = out.filter(function (b) {
        return b.y === dt.y && b.m === dt.m;
      })[0];
      if (hit) {
        hit.count++;
        hit.ids.push(r.id);
      }
    });
    return out;
  }

  /** Open and overdue items per platform, biggest first; items without a platform last. @param {any[]} rows */
  function openByPlatform(rows) {
    var g = groupBy(
      rows.filter(function (r) {
        return r.isOpen;
      }),
      function (r) {
        return r.platform || NO_PLATFORM;
      },
    );
    return Object.keys(g)
      .map(function (p) {
        var od = g[p].filter(function (r) {
          return r.isOverdue;
        });
        return { platform: p, open: g[p].length, overdue: od.length, ids: ids(g[p]), overdueIds: ids(od) };
      })
      .sort(function (a, b) {
        if ((a.platform === NO_PLATFORM) !== (b.platform === NO_PLATFORM))
          return a.platform === NO_PLATFORM ? 1 : -1;
        return b.open - a.open || b.overdue - a.overdue || (a.platform < b.platform ? -1 : 1);
      });
  }

  // ---------------------------------------------------------------- closed-work report (2026-11-20)

  /**
   * วันที่เสร็จ range for the report. null = no date filter.
   * @param {any} p {mode:'month',y,m} | {mode:'year',y} | {mode:'range',from,to} | {mode:'all'}
   * @returns {{from:SheetDate|null,to:SheetDate|null}|null}
   */
  function doneRange(p) {
    if (!p) return null;
    if (p.mode === 'month') return monthRange({ y: p.y, m: p.m, d: 1 });
    if (p.mode === 'year') return { from: { y: p.y, m: 1, d: 1 }, to: { y: p.y, m: 12, d: 31 } };
    if (p.mode === 'range' && (p.from || p.to)) return { from: p.from || null, to: p.to || null };
    return null;
  }

  /**
   * Items of the chosen statuses whose วันที่เสร็จ falls in the period, oldest first.
   * @param {any[]} rows enriched rows
   * @param {{statuses?: string[], period?: any}} opts statuses: exact values, empty = every status
   */
  function doneReport(rows, opts) {
    opts = opts || {};
    var statuses = opts.statuses || [];
    var range = doneRange(opts.period);
    var ofStatus = rows.filter(function (r) {
      return !statuses.length || statuses.indexOf(r.status) !== -1;
    });
    var list = ofStatus
      .filter(function (r) {
        return !range || inRange(r.doneDate.date, range);
      })
      .sort(function (a, b) {
        var x = a.doneDate.date;
        var y = b.doneDate.date;
        if (x && y && compareDate(x, y) !== 0) return compareDate(x, y);
        if (!x !== !y) return x ? -1 : 1;
        return (a.seq === null ? Infinity : a.seq) - (b.seq === null ? Infinity : b.seq);
      });
    var counts = groupBy(list, function (r) {
      return r.status;
    });
    var order = Object.keys(counts).sort(function (a, b) {
      var ia = statuses.indexOf(a);
      var ib = statuses.indexOf(b);
      if (ia !== ib) return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
      return statusRank(a) - statusRank(b) || (a < b ? -1 : 1);
    });
    return {
      rows: list,
      total: list.length,
      range: range,
      byStatus: order.map(function (s) {
        return { status: s, count: counts[s].length };
      }),
      // matching status but no readable วันที่เสร็จ: left out by a date filter, the PM should fill it in
      noDoneDate: range
        ? ofStatus.filter(function (r) {
            return !r.doneDate.date;
          }).length
        : 0,
    };
  }

  /** Years found in วันที่เสร็จ plus this year, newest first. @param {any[]} rows @param {SheetDate} today */
  function doneYears(rows, today) {
    /** @type {Object<string, boolean>} */
    var seen = {};
    seen[today.y] = true;
    rows.forEach(function (r) {
      if (r.doneDate && r.doneDate.date) seen[r.doneDate.date.y] = true;
    });
    return Object.keys(seen)
      .map(Number)
      .sort(function (a, b) {
        return b - a;
      });
  }

  var CSV_KEYS = [
    'seq',
    'platform',
    'issueType',
    'urgency',
    'status',
    'system',
    'detail',
    'pm',
    'ticket',
    'developer',
    'tester',
    'dueDate',
    'postponedDate',
    'doneDate',
    'deployDate',
    'devHours',
  ];

  /** @param {any} v */
  function csvCell(v) {
    var s = str(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // never let Excel/Sheets run cell text as a formula
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /** CSV (CRLF lines, sheet headers) of report rows; the caller adds the UTF-8 BOM for Excel. @param {any[]} rows */
  function doneReportCsv(rows) {
    var lines = [
      CSV_KEYS.map(function (k) {
        return csvCell(COLUMN_BY_KEY[k].header);
      }).join(','),
    ];
    rows.forEach(function (r) {
      lines.push(
        CSV_KEYS.map(function (k) {
          if (k === 'ticket') return csvCell(r.ticketUrl || r.raw.ticket);
          return csvCell(r.raw[k]);
        }).join(','),
      );
    });
    return lines.join('\r\n');
  }

  // ---------------------------------------------------------------- Taiga register (user request 2026-11-20)

  var TAIGA_STEPS = ['0.จัดทำ Taiga', PM_REVIEW, PM_RETURN];
  var OPEN_STEPS = WORKFLOW.filter(function (s) {
    return CLOSED.indexOf(s) === -1;
  });

  /** The item's Taiga link (cell links first, then a URL typed in the cell); MANTIS links do not count. @param {any} r */
  function taigaLink(r) {
    var all = (r.ticketLinks || []).concat(r.ticketUrl ? [r.ticketUrl] : []);
    for (var i = 0; i < all.length; i++) if (/taiga/i.test(all[i])) return all[i];
    return null;
  }

  /**
   * How far along the workflow a status is: open steps count 1..n (never 100%), the two "done" closings are
   * 100%, cancelled has no bar, and an empty/unknown status is flagged.
   * @param {any} status
   */
  function progressOf(status) {
    var s = clean(status);
    var n = OPEN_STEPS.length;
    if (s === CANCELLED) return { step: null, total: n, pct: null, state: 'cancelled', label: 'ยกเลิก' };
    if (CLOSED.indexOf(s) !== -1) return { step: n, total: n, pct: 100, state: 'done', label: 'ปิดแล้ว' };
    var i = OPEN_STEPS.indexOf(s);
    if (i === -1) return { step: null, total: n, pct: 0, state: 'unknown', label: 'ไม่อยู่ในขั้นตอน' };
    return {
      step: i + 1,
      total: n,
      pct: Math.round(((i + 1) / (n + 1)) * 100),
      state: 'open',
      label: 'ขั้น ' + (i + 1) + '/' + n,
    };
  }

  /**
   * Items with a Taiga link or in a Taiga step, newest first; kind 'all' = every item (the register replaced
   * "รายการทั้งหมด", user 2026-11-25). scope: 'open' (default) | 'overdue' | 'closed' | 'all'.
   * @param {any[]} rows @param {{scope?: string, kind?: string}} q
   */
  function taigaRegister(rows, q) {
    var scope = (q && q.scope) || 'open';
    var every = !!q && q.kind === 'all';
    var out = rows.filter(function (r) {
      if (scope === 'open' && !r.isOpen) return false;
      if (scope === 'closed' && r.isOpen) return false;
      if (scope === 'overdue' && !r.isOverdue) return false;
      return every || !!taigaLink(r) || TAIGA_STEPS.indexOf(r.status) !== -1;
    });
    out.sort(function (a, b) {
      return (b.seq === null ? -1 : b.seq) - (a.seq === null ? -1 : a.seq);
    });
    /** @type {Object<string, number>} */
    var counts = {};
    out.forEach(function (r) {
      counts[r.status] = (counts[r.status] || 0) + 1;
    });
    var byStatus = Object.keys(counts)
      .sort(function (a, b) {
        return statusRank(a) - statusRank(b);
      })
      .map(function (s) {
        return { status: s, count: counts[s] };
      });
    return {
      rows: out,
      total: out.length,
      noLink: out.filter(function (r) {
        return TAIGA_STEPS.indexOf(r.status) !== -1 && !taigaLink(r);
      }).length,
      byStatus: byStatus,
    };
  }

  // ---------------------------------------------------------------- Taiga status vs sheet status (2026-11-24)

  /** Team table: Taiga board column → sheet status (user, 2026-11-24). An admin may override it in _app_taiga_map. */
  var TAIGA_DEFAULT_MAP = {
    New: '0.จัดทำ Taiga',
    'PM Reviewing': PM_REVIEW,
    'Ready for DEV': 'รอทีมพัฒนา',
    'In progress': 'กำลังพัฒนา',
    'Ready for test': 'กำลังทดสอบ',
    Rework: 'ส่งกลับนักพัฒนาแก้ไข',
    'Waiting Compile': 'รอ compile',
    'compile from dev': 'รอ compile',
    Done: DONE,
    Archived: CANCELLED,
  };

  /** Same Taiga status name, ignoring only letter case and extra spaces. @param {any} s */
  function taigaName(s) {
    return clean(s).toLowerCase().replace(/\s+/g, ' ');
  }

  /**
   * Taiga status → app status, keyed by the names Taiga really uses. A saved pair wins over the team table;
   * a saved pair that is empty or not a workflow status means "not paired".
   * @param {string[]} statuses names seen in Taiga @param {Array<{taiga:string, app:string}>} pairs saved by an admin
   */
  function taigaEffectiveMap(statuses, pairs) {
    /** @type {Object<string,string>} */
    var byName = Object.create(null);
    Object.keys(TAIGA_DEFAULT_MAP).forEach(function (k) {
      byName[taigaName(k)] = /** @type {any} */ (TAIGA_DEFAULT_MAP)[k];
    });
    pairs.forEach(function (p) {
      if (taigaName(p.taiga)) byName[taigaName(p.taiga)] = p.app;
    });
    var names = statuses.slice();
    /** @type {Object<string,boolean>} */
    var seen = Object.create(null);
    names.forEach(function (n) {
      seen[taigaName(n)] = true;
    });
    pairs
      .map(function (p) {
        return p.taiga;
      })
      .concat(Object.keys(TAIGA_DEFAULT_MAP))
      .forEach(function (n) {
        if (!taigaName(n) || seen[taigaName(n)]) return;
        seen[taigaName(n)] = true;
        names.push(n);
      });
    /** @type {Object<string,string>} */
    var out = {};
    names.forEach(function (n) {
      var app = byName[taigaName(n)];
      if (WORKFLOW.indexOf(app) !== -1) out[n] = app;
    });
    return out;
  }

  /**
   * Sheet status → Taiga status, for sheet statuses without exactly one Taiga status (user, 2026-11-25).
   * @param {Array<{app:string, taiga:string}>} pairs saved by an admin
   */
  function statusTaigaMap(pairs) {
    /** @type {Object<string,string>} */
    var out = {};
    pairs.forEach(function (p) {
      if (WORKFLOW.indexOf(p.app) !== -1 && clean(p.taiga)) out[p.app] = clean(p.taiga);
    });
    return out;
  }

  /**
   * Every known Taiga status name, once each: seen in Taiga first, then paired names, then the team table.
   * @param {string[]} statuses @param {Object<string,string>} map taigaEffectiveMap() @param {Object<string,string>} appMap
   */
  function taigaNames(statuses, map, appMap) {
    /** @type {Object<string,boolean>} */
    var seen = Object.create(null);
    var paired = Object.keys(appMap).map(function (app) {
      return appMap[app];
    });
    return statuses.concat(Object.keys(map), paired, Object.keys(TAIGA_DEFAULT_MAP)).filter(function (n) {
      var name = taigaName(n);
      if (!name || seen[name]) return false;
      seen[name] = true;
      return true;
    });
  }

  /**
   * Sheet statuses to pair by hand: no Taiga status, or several, or already paired by hand. Workflow order.
   * @param {Object<string,string>} map taigaEffectiveMap() @param {Object<string,string>} appMap statusTaigaMap()
   */
  function statusTaigaGaps(map, appMap) {
    /** @type {Array<{app:string, several:string[]}>} */
    var out = [];
    WORKFLOW.forEach(function (app) {
      var names = Object.keys(map).filter(function (n) {
        return map[n] === app;
      });
      if (names.length !== 1 || appMap[app]) out.push({ app: app, several: names.length > 1 ? names : [] });
    });
    return out;
  }

  /**
   * The Taiga status to send for a sheet status: the pair made by hand, else its only Taiga status, else ''.
   * @param {any} status @param {Object<string,string>} map taigaEffectiveMap() @param {Object<string,string>} appMap
   */
  function statusTaigaTarget(status, map, appMap) {
    if (WORKFLOW.indexOf(status) === -1) return '';
    if (Object.prototype.hasOwnProperty.call(appMap, status)) return appMap[status];
    var names = Object.keys(map).filter(function (n) {
      return map[n] === status;
    });
    return names.length === 1 ? names[0] : '';
  }

  /** 'site/project/type/ref' of a full Taiga item link, or null. @param {any} url */
  function taigaKey(url) {
    var m = /^https?:\/\/([^/\s?#]+)\/project\/([^/\s?#]+)\/(us|task|issue|epic)\/(\d+)/i.exec(clean(url));
    return m ? (m[1] + '/' + m[2] + '/' + m[3]).toLowerCase() + '/' + Number(m[4]) : null;
  }

  /**
   * Newest state of every Taiga item. Every event carries the item's status; only a status move says who and when.
   * @param {Array<{kind:string, link:string, from:string, to:string, by:string, at:number|null}>} events oldest first
   */
  function taigaLatest(events) {
    /** @type {Object<string, {status:string, from:string, by:string, at:number|null, deleted:boolean}>} */
    var out = {};
    events.forEach(function (e) {
      var key = e.kind === 'ทดสอบ' ? null : taigaKey(e.link);
      if (!key) return;
      var cur = out[key] || (out[key] = { status: '', from: '', by: '', at: null, deleted: false });
      cur.deleted = e.kind === 'ลบ';
      if (clean(e.to)) cur.status = clean(e.to);
      if (e.kind === 'สถานะ' || e.kind === 'เสร็จ') {
        cur.from = clean(e.from);
        cur.by = clean(e.by);
        cur.at = e.at;
      }
    });
    return out;
  }

  // ---------------------------------------------------------------- daily report (user request 2026-11-26)

  /** '26/11/2026 09:05:00' (_app_log, Bangkok) -> {date, hm}; null when unreadable. @param {any} text */
  function logTime(text) {
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/.exec(clean(text));
    if (!m) return null;
    var p = parseDate(m[1] + '/' + m[2] + '/' + m[3]);
    if (!p.date) return null;
    return { date: p.date, hm: (m[4].length < 2 ? '0' : '') + m[4] + ':' + m[5] };
  }

  /** A Taiga event time (ms) as a Bangkok day and HH:mm. @param {number|null} ms */
  function bangkokTime(ms) {
    if (typeof ms !== 'number' || !isFinite(ms)) return null;
    var t = new Date(ms + 7 * 3600000);
    var p = function (/** @type {number} */ n) {
      return n < 10 ? '0' + n : String(n);
    };
    return {
      date: { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() },
      hm: p(t.getUTCHours()) + ':' + p(t.getUTCMinutes()),
    };
  }

  /** @param {any} v */
  function orEmpty(v) {
    return clean(v) === '' ? '(ว่าง)' : clean(v);
  }

  /** One _app_log entry as a report line ('' = leave out). @param {any} e */
  function logLine(e) {
    if (e.action === 'CREATE') return 'เพิ่มรายการใหม่';
    if (e.action === 'DELETE') return 'ลบรายการ';
    if (e.action === 'RESTORE') return 'กู้คืนรายการ';
    if (e.action === 'TAIGA_PUSH') return 'ส่งสถานะไป Taiga: ' + orEmpty(e.from) + ' → ' + orEmpty(e.to);
    if (e.action === 'UPDATE') return clean(e.column) + ': ' + orEmpty(e.from) + ' → ' + orEmpty(e.to);
    return '';
  }

  /** One Taiga event as a report line ('' = leave out). @param {any} e */
  function taigaLine(e) {
    if (e.kind === 'ทดสอบ') return '';
    if (e.kind === 'สถานะ' || e.kind === 'เสร็จ') return 'Taiga: ' + orEmpty(e.from) + ' → ' + orEmpty(e.to);
    if (e.kind === 'คอมเมนต์') return 'Taiga: มีคอมเมนต์ใหม่';
    if (e.kind === 'ลบ') return 'Taiga: ถูกลบ';
    return 'Taiga: ' + clean(e.kind) + (clean(e.to) ? ' (' + clean(e.to) + ')' : '');
  }

  /**
   * What changed on one day (sheet via _app_log, Taiga via the bot's log) and so far this week (Monday..date).
   * Changes typed straight into the sheet are not in _app_log; they show only through วันที่เสร็จ.
   * @param {{date:SheetDate, rows:any[], log:any[], taiga:any[]}} o
   */
  function dailyReport(o) {
    var day = o.date;
    var week = { from: weekRange(day).from, to: day };
    var STATUS = COLUMN_BY_KEY.status.header;
    /** @type {Object<string, any>} */
    var bySeq = {};
    /** @type {Object<string, any>} */
    var byKey = {};
    o.rows.forEach(function (r) {
      if (r.seq !== null) bySeq[r.seq] = r;
      var k = taigaKey(taigaLink(r));
      if (k && !byKey[k]) byKey[k] = r;
    });
    /** @type {any[]} */
    var events = [];
    (o.log || []).forEach(function (e, i) {
      var t = logTime(e.time);
      var seq = Number(e.seq);
      var text = logLine(e);
      if (!t || !text || !clean(e.seq) || !isFinite(seq)) return;
      // a new item writes one log row per cell: keep the first
      var dup = events.some(function (x) {
        return e.action === 'CREATE' && x.action === 'CREATE' && x.seq === seq;
      });
      if (dup) return;
      var isStatus = e.action === 'UPDATE' && clean(e.column) === STATUS;
      events.push({
        source: 'sheet',
        action: e.action,
        date: t.date,
        hm: t.hm,
        order: i,
        seq: seq,
        who: clean(e.who),
        text: text,
        moved: isStatus,
        closed: isStatus && CLOSED.indexOf(clean(e.to)) !== -1,
      });
    });
    (o.taiga || []).forEach(function (e, i) {
      var t = bangkokTime(e.at);
      var text = taigaLine(e);
      var key = taigaKey(e.link);
      if (!t || !text || !key) return;
      var row = byKey[key];
      if (!row) return; // Taiga items without a row in the sheet are not reported (user request 2026-11-26)
      events.push({
        source: 'taiga',
        action: e.kind,
        date: t.date,
        hm: t.hm,
        order: 1e6 + i,
        seq: row ? row.seq : null,
        key: row ? null : key,
        link: clean(e.link),
        who: clean(e.by),
        text: text,
        moved: false,
        closed: false,
      });
    });
    events.sort(function (a, b) {
      return compareDate(a.date, b.date) || (a.hm < b.hm ? -1 : a.hm > b.hm ? 1 : a.order - b.order);
    });
    /** @param {any[]} list */
    function group(list) {
      /** @type {Object<string, any>} */
      var at = {};
      /** @type {any[]} */
      var out = [];
      list.forEach(function (e) {
        var id = e.seq !== null ? 's' + e.seq : 'k' + e.key;
        var g = at[id];
        if (!g) {
          var row = e.seq !== null ? bySeq[e.seq] || null : null;
          g = at[id] = {
            seq: e.seq,
            row: row,
            key: e.key || null,
            link: row ? taigaLink(row) : e.link,
            lines: [],
          };
          out.push(g);
        }
        g.lines.push({ source: e.source, hm: e.hm, who: e.who, text: e.text, action: e.action });
      });
      return out;
    }
    /** @param {any[]} list @param {(e:any)=>boolean} f */
    var count = function (list, f) {
      return list.filter(f).length;
    };
    /** @param {any} g @param {string} src */
    var has = function (g, src) {
      return g.lines.some(function (/** @type {any} */ l) {
        return l.source === src;
      });
    };
    var today = events.filter(function (e) {
      return compareDate(e.date, day) === 0;
    });
    var inWeek = events.filter(function (e) {
      return inRange(e.date, week);
    });
    var items = group(today);
    var weekItems = group(inWeek).sort(function (a, b) {
      if (a.seq === null || b.seq === null) return (a.seq === null ? 1 : 0) - (b.seq === null ? 1 : 0);
      return a.seq - b.seq;
    });
    /** @type {Object<string, boolean>} */
    var closedSeen = {};
    /** @type {any[]} */
    var closed = [];
    /** @param {any} r */
    var addClosed = function (r) {
      if (!r || closedSeen[r.seq] || r.isOpen) return;
      closedSeen[r.seq] = true;
      closed.push(r);
    };
    inWeek.forEach(function (e) {
      if (e.closed) addClosed(bySeq[e.seq]);
    });
    o.rows.forEach(function (r) {
      if (r.seq !== null && r.doneDate && inRange(r.doneDate.date, week)) addClosed(r);
    });
    closed.sort(function (a, b) {
      return a.seq - b.seq;
    });
    var isCreate = function (/** @type {any} */ e) {
      return e.action === 'CREATE';
    };
    return {
      date: day,
      day: {
        items: items,
        counts: {
          items: items.length,
          sheet: count(items, function (g) {
            return has(g, 'sheet');
          }),
          taiga: count(items, function (g) {
            return has(g, 'taiga');
          }),
          created: count(today, isCreate),
          moved: count(today, function (e) {
            return e.moved;
          }),
          closed: count(today, function (e) {
            return e.closed;
          }),
          pushed: count(today, function (e) {
            return e.action === 'TAIGA_PUSH';
          }),
        },
      },
      week: { range: week, items: weekItems, closed: closed, created: count(inWeek, isCreate) },
    };
  }

  /** "#688 [INV] detail" on one line; a Taiga item the sheet does not know by its number. @param {any} r @param {string|null} [key] */
  function reportTitle(r, key) {
    if (!r) return 'Taiga #' + clean(key).split('/').pop() + ' (ไม่พบในชีต)';
    var detail = clean(r.detail).replace(/\s+/g, ' ');
    if (detail.length > 140) detail = detail.slice(0, 139) + '…';
    return '#' + r.seq + (clean(r.platform) ? ' [' + clean(r.platform) + ']' : '') + ' ' + detail;
  }

  /**
   * The daily report as plain text in the team's format, ready to paste into a blog, LINE or e-mail.
   * @param {any} rep dailyReport() @param {{reporter?:string, today?:SheetDate, rows?:any[]}} [opts]
   */
  function dailyReportText(rep, opts) {
    opts = opts || {};
    var c = rep.day.counts;
    /** @type {string[]} */
    var L = [];
    L.push('📋 สรุปรายงานประจำวัน');
    L.push('วันที่ปฏิบัติงาน : ' + formatThaiLong(rep.date));
    if (opts.reporter) L.push('ผู้รายงาน : ' + opts.reporter);
    L.push('');
    L.push('สรุปการดำเนินการ :');
    if (!c.items) L.push('- ไม่มีการเปลี่ยนแปลงในชีตหรือ Taiga ในวันนี้');
    else {
      L.push(
        '- ติดตามและปรับปรุงรายการขอแก้ไขโปรแกรม ' +
          c.items +
          ' รายการ (แก้ในชีต ' +
          c.sheet +
          ' · เปลี่ยนใน Taiga ' +
          c.taiga +
          ')',
      );
      var parts = [];
      if (c.created) parts.push('เพิ่มรายการใหม่ ' + c.created);
      if (c.moved) parts.push('เปลี่ยนสถานะ ' + c.moved);
      if (c.closed) parts.push('ปิดงาน ' + c.closed);
      if (c.pushed) parts.push('ส่งสถานะไป Taiga ' + c.pushed);
      if (parts.length) L.push('- ' + parts.join(' · ') + ' รายการ');
    }
    if (opts.rows && opts.today) {
      var m = computeMetrics(opts.rows, opts.today);
      L.push(
        '- งานค้างทั้งหมด ' + m.openCount + ' รายการ · เกินกำหนด ' + m.overdueCount + ' รายการ (ณ วันนี้)',
      );
    }
    L.push('');
    L.push('รายละเอียดการดำเนินการ :');
    if (!rep.day.items.length) L.push('- ไม่มี');
    rep.day.items.forEach(function (/** @type {any} */ g, /** @type {number} */ i) {
      L.push(i + 1 + '. ' + reportTitle(g.row, g.key));
      g.lines.forEach(function (/** @type {any} */ l) {
        L.push(
          '   - ' +
            l.hm +
            ' ' +
            l.text +
            ' (' +
            (l.source === 'taiga' ? 'Taiga' : 'ชีต') +
            (l.who ? ' · ' + l.who : '') +
            ')',
        );
      });
      if (g.row) L.push('   สถานะตอนนี้: ' + statusLabel(g.row.status));
      if (g.link) L.push('   🔗 ' + g.link);
    });
    L.push('');
    var w = rep.week;
    L.push('สรุปสิ่งที่แก้ไขในสัปดาห์นี้ (สะสม ' + thaiRange(w.range) + ') :');
    L.push(
      '- มีความเคลื่อนไหว ' +
        w.items.length +
        ' รายการ · ปิดงาน ' +
        w.closed.length +
        ' รายการ · เพิ่มรายการใหม่ ' +
        w.created +
        ' รายการ',
    );
    if (w.closed.length) {
      L.push('ปิดงานแล้ว:');
      w.closed.forEach(function (/** @type {any} */ r, /** @type {number} */ i) {
        L.push(
          i +
            1 +
            '. ' +
            reportTitle(r) +
            ' — ' +
            statusLabel(r.status) +
            (r.doneDate && r.doneDate.date ? ' ' + formatThai(r.doneDate.date) : ''),
        );
      });
    }
    var closedSeq = w.closed.map(function (/** @type {any} */ r) {
      return r.seq;
    });
    var others = w.items.filter(function (/** @type {any} */ g) {
      return g.seq === null || closedSeq.indexOf(g.seq) === -1;
    });
    if (others.length) {
      L.push('กำลังดำเนินการ:');
      others.forEach(function (/** @type {any} */ g, /** @type {number} */ i) {
        L.push(
          i + 1 + '. ' + reportTitle(g.row, g.key) + (g.row ? ' — ' + statusLabel(g.row.status) : ''), // no "(n ครั้ง)" (user request 2026-11-26)
        );
      });
    }
    return L.join('\n');
  }

  /** How many rows point at each Taiga item. @param {any[]} rows */
  function taigaKeyCounts(rows) {
    /** @type {Object<string, number>} */
    var counts = {};
    rows.forEach(function (r) {
      var key = taigaKey(taigaLink(r));
      if (key) counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }

  /**
   * Compare one row with Taiga. state: none (nothing known) | deleted | unmapped | match | diff.
   * Never guesses a status: only an exact map entry that is a workflow status counts. canApply = a person may
   * press "ปรับตาม Taiga" (one row per Taiga item, and the row has a ลำดับ).
   * A status an admin paired by hand with this Taiga status (appMap) counts as a match.
   * pushTo = the Taiga status a person may send with "ปรับ Taiga ตามชีต" ('' = not offered), same rules as canApply.
   * @param {any} r @param {any} latest taigaLatest() @param {Object<string,string>} map @param {Object<string,number>} counts
   * @param {Object<string,string>} [appMap] statusTaigaMap()
   */
  function taigaCompare(r, latest, map, counts, appMap) {
    var key = taigaKey(taigaLink(r));
    var t = key && Object.prototype.hasOwnProperty.call(latest, key) ? latest[key] : null;
    var out = { state: 'none', taiga: t, expected: '', duplicate: false, canApply: false, pushTo: '' };
    if (!key || !t || (!t.status && !t.deleted)) return out;
    out.duplicate = counts[key] > 1;
    if (t.deleted) {
      out.state = 'deleted';
      return out;
    }
    var byHand = appMap && Object.prototype.hasOwnProperty.call(appMap, r.status) ? appMap[r.status] : '';
    if (r.status && byHand && taigaName(byHand) === taigaName(t.status)) {
      out.expected = r.status;
      out.state = 'match';
      return out;
    }
    var want = Object.prototype.hasOwnProperty.call(map, t.status) ? map[t.status] : '';
    if (r.status !== want && !out.duplicate && r.seq !== null)
      out.pushTo = statusTaigaTarget(r.status, map, appMap || {});
    if (WORKFLOW.indexOf(want) === -1) {
      out.state = 'unmapped';
      return out;
    }
    out.expected = want;
    out.state = r.status === want ? 'match' : 'diff';
    out.canApply = out.state === 'diff' && !out.duplicate && r.seq !== null;
    return out;
  }

  /**
   * The tick next to the status on the item form: what saving would send to Taiga, or why it cannot.
   * @param {{item:any, rows:any[], host:any, latest:any, map:any, appMap:any}} o item = what the form shows now
   */
  function taigaFormSync(o) {
    var key = taigaKey(taigaLink(o.item));
    var out = { show: false, target: '', now: '', match: false, reason: '' };
    if (!key || !o.host || key.split('/')[0] !== o.host) return out;
    out.show = true;
    var others = o.rows.filter(function (r) {
      return r.id !== o.item.id && taigaKey(taigaLink(r)) === key;
    }).length;
    /** @type {Object<string, number>} */
    var counts = {};
    counts[key] = others + 1;
    var cmp = taigaCompare(o.item, o.latest, o.map, counts, o.appMap);
    out.now = cmp.taiga ? cmp.taiga.status : '';
    out.match = cmp.state === 'match';
    out.target = statusTaigaTarget(o.item.status, o.map, o.appMap || {});
    if (others) out.reason = 'duplicate';
    else if (cmp.state === 'deleted') out.reason = 'deleted';
    else if (!out.target && !out.match) out.reason = 'unmapped';
    return out;
  }

  var SENT_KEEP_MS = 10 * 60000;
  /**
   * The bot's log runs a little behind: keep showing what was just sent until it logs something newer.
   * @param {any} latest taigaLatest() @param {any} sent the same shape @param {number} now ms
   */
  function taigaWithSent(latest, sent, now) {
    var out = Object.assign({}, latest);
    Object.keys(sent).forEach(function (key) {
      var logged = out[key];
      if (now - sent[key].at > SENT_KEEP_MS || (logged && logged.at > sent[key].at)) return;
      out[key] = sent[key];
    });
    return out;
  }

  // The PM has not passed the Taiga item: exactly these two sheet statuses (user, 2026-11-24).
  var WAIT_PM = [PM_REVIEW, PM_RETURN];
  // Development has begun: from กำลังพัฒนา to the compile steps, and done.
  var DEV_STEPS = WORKFLOW.slice(WORKFLOW.indexOf('กำลังพัฒนา'), WORKFLOW.indexOf(CANCELLED)).concat(DONE);

  /**
   * Signs that development has begun although the sheet still waits for the PM to pass the Taiga item, or null.
   * A future date is a plan, not a start.
   * @param {any} r @param {any} cmp taigaCompare() or null @param {any} today
   * @returns {string[] | null}
   */
  function devBeforeReview(r, cmp, today) {
    if (WAIT_PM.indexOf(r.status) === -1) return null;
    /** @type {string[]} */
    var signs = [];
    if (cmp && DEV_STEPS.indexOf(cmp.expected) !== -1) signs.push('Taiga: ' + cmp.taiga.status);
    ['devStart', 'devEnd'].forEach(function (key) {
      var date = r[key].date;
      if (date && compareDate(date, today) <= 0)
        signs.push(COLUMN_BY_KEY[key].header + ' ' + formatDate(date));
    });
    return signs.length ? signs : null;
  }

  /** CSV of the register (CRLF lines); the caller adds the UTF-8 BOM for Excel. @param {any[]} rows */
  function taigaRegisterCsv(rows) {
    var cols = [
      [
        'ลำดับ',
        function (r) {
          return r.raw.seq;
        },
      ],
      [
        'แพลตฟอร์ม',
        function (r) {
          return r.raw.platform;
        },
      ],
      [
        'ระบบงาน',
        function (r) {
          return r.raw.system;
        },
      ],
      [
        'รายละเอียด',
        function (r) {
          return r.raw.detail;
        },
      ],
      [
        'ลิงก์ Taiga',
        function (r) {
          return taigaLink(r) || '';
        },
      ],
      [
        'สถานะ',
        function (r) {
          return r.raw.status;
        },
      ],
      [
        'ความคืบหน้า',
        function (r) {
          var p = progressOf(r.status);
          return p.label + (p.pct === null ? '' : ' (' + p.pct + '%)');
        },
      ],
      [
        'นักพัฒนา',
        function (r) {
          return r.raw.developer;
        },
      ],
      [
        'ผู้ทดสอบ',
        function (r) {
          return r.raw.tester;
        },
      ],
      [
        'PM',
        function (r) {
          return r.raw.pm;
        },
      ],
      [
        'วันที่ต้องได้',
        function (r) {
          return r.raw.dueDate;
        },
      ],
      [
        'วันที่เลื่อน',
        function (r) {
          return r.raw.postponedDate;
        },
      ],
      [
        'วันที่เสร็จ',
        function (r) {
          return r.raw.doneDate;
        },
      ],
    ];
    var lines = [
      cols
        .map(function (c) {
          return csvCell(c[0]);
        })
        .join(','),
    ];
    rows.forEach(function (r) {
      lines.push(
        cols
          .map(function (c) {
            return csvCell(c[1](r));
          })
          .join(','),
      );
    });
    return lines.join('\r\n');
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

  /** The urgency to show: an empty cell reads as ปกติ (user, 2026-11-25); the sheet is not changed. @param {any} u */
  function urgencyOf(u) {
    return clean(u) || DEFAULT_URGENCY;
  }

  /** 0 = ด่วนที่สุด … URGENCY.length = unknown; empty counts as ปกติ. @param {any} u */
  function urgencyRank(u) {
    var i = URGENCY.indexOf(urgencyOf(u));
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
            ? key === 'tester'
              ? 'เป็นชื่อผู้ทดสอบใหม่ที่ยังไม่มีในรายการ'
              : 'เป็นชื่อนักพัฒนาใหม่ที่ยังไม่มีในรายการ'
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

  // ---------------------------------------------------------------- presence (2026-11-18)

  /**
   * Who is online and what they are doing. The map is {email: {name, view, seq, at}} kept in the
   * script cache; an entry is online while nowMs - at <= TTL_MS. Pure: the clock is passed in.
   */
  var presence = (function () {
    var TTL_MS = 180000;
    /** @typedef {{name:string, view:string, seq:number|null, at:number}} PresenceEntry */

    /** @param {Object<string, PresenceEntry>|null} map @param {number} nowMs */
    function active(map, nowMs) {
      return Object.keys(map || {})
        .filter(function (email) {
          var e = /** @type {any} */ (map)[email];
          return e && typeof e.at === 'number' && nowMs - e.at <= TTL_MS;
        })
        .map(function (email) {
          var e = /** @type {any} */ (map)[email];
          return {
            email: email,
            name: String(e.name || ''),
            view: String(e.view || ''),
            seq: typeof e.seq === 'number' ? e.seq : null,
            at: e.at,
          };
        })
        .sort(function (a, b) {
          return a.name.localeCompare(b.name, 'th') || a.email.localeCompare(b.email);
        });
    }

    /**
     * @param {Object<string, PresenceEntry>|null} map @param {string} email
     * @param {{name:string, view:string, seq:number|null}} entry @param {number} nowMs
     * @returns {Object<string, PresenceEntry>}
     */
    function touch(map, email, entry, nowMs) {
      /** @type {Object<string, PresenceEntry>} */
      var out = {};
      active(map, nowMs).forEach(function (e) {
        out[e.email] = { name: e.name, view: e.view, seq: e.seq, at: e.at };
      });
      out[email] = { name: entry.name, view: entry.view, seq: entry.seq, at: nowMs };
      return out;
    }

    /** Names of others editing item `seq`. @param {Object<string, PresenceEntry>|null} map @param {number} seq @param {string} selfEmail @param {number} nowMs */
    function editorsOf(map, seq, selfEmail, nowMs) {
      return active(map, nowMs)
        .filter(function (e) {
          return e.view === 'edit' && e.seq === seq && e.email !== selfEmail;
        })
        .map(function (e) {
          return e.name;
        });
    }

    return { TTL_MS: TTL_MS, touch: touch, active: active, editorsOf: editorsOf };
  })();

  return {
    presence: presence,
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
    taigaLink: taigaLink,
    progressOf: progressOf,
    taigaRegister: taigaRegister,
    taigaRegisterCsv: taigaRegisterCsv,
    TAIGA_DEFAULT_MAP: TAIGA_DEFAULT_MAP,
    taigaName: taigaName,
    taigaEffectiveMap: taigaEffectiveMap,
    statusTaigaMap: statusTaigaMap,
    statusTaigaGaps: statusTaigaGaps,
    statusTaigaTarget: statusTaigaTarget,
    taigaNames: taigaNames,
    taigaKey: taigaKey,
    taigaLatest: taigaLatest,
    taigaKeyCounts: taigaKeyCounts,
    taigaCompare: taigaCompare,
    taigaFormSync: taigaFormSync,
    taigaWithSent: taigaWithSent,
    logTime: logTime,
    bangkokTime: bangkokTime,
    dailyReport: dailyReport,
    dailyReportText: dailyReportText,
    DEV_STEPS: DEV_STEPS,
    devBeforeReview: devBeforeReview,
    TAIGA_STEPS: TAIGA_STEPS,
    enrich: enrich,
    countSeq: countSeq,
    detectIssues: detectIssues,
    applyFilters: applyFilters,
    computeMetrics: computeMetrics,
    pmBreakdown: pmBreakdown,
    pmTeams: pmTeams,
    ALL_DEVELOPERS: ALL_DEVELOPERS,
    pmFilter: pmFilter,
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
    closedByMonth: closedByMonth,
    openByPlatform: openByPlatform,
    doneRange: doneRange,
    doneReport: doneReport,
    doneYears: doneYears,
    doneReportCsv: doneReportCsv,
    search: search,
    validateCreate: validateCreate,
    validateUpdate: validateUpdate,
    diffChanges: diffChanges,
    nextSeq: nextSeq,
    URGENCY: URGENCY,
    DEFAULT_URGENCY: DEFAULT_URGENCY,
    urgencyOf: urgencyOf,
    urgencyRank: urgencyRank,
    isColumnKey: isColumnKey,
    clean: clean,
    toInt: toInt,
  };
})();

if (typeof module === 'object' && module.exports) module.exports = Domain;
