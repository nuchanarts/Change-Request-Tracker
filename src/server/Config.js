// @ts-check
/** Server-side constants and Result helpers (constitution IX: no magic values). */
var Config = (function () {
  'use strict';

  var MESSAGES = {
    LOCK_TIMEOUT: 'มีผู้ใช้อื่นกำลังบันทึกอยู่ ระบบยังไม่ได้บันทึกข้อมูลของคุณ กรุณาลองใหม่อีกครั้ง',
    SEQ_MISMATCH:
      'แถวนี้ถูกย้ายหรือมีการเรียงข้อมูลใหม่ในชีต (เลขลำดับไม่ตรง) ระบบจึงไม่บันทึกทับ กรุณาโหลดข้อมูลใหม่แล้วแก้ไขอีกครั้ง',
    CONFLICT: 'มีคนแก้ไขรายการนี้ไปก่อนหน้าคุณ ระบบจึงไม่บันทึกทับ กรุณาโหลดข้อมูลใหม่แล้วตรวจสอบอีกครั้ง',
    SEQ_INVALID: 'รายการนี้ไม่มีเลขลำดับหรือเลขลำดับซ้ำกับแถวอื่น กรุณาแก้เลขลำดับในชีตก่อน',
    NOT_FOUND: 'ไม่พบรายการนี้ในชีตแล้ว กรุณาโหลดข้อมูลใหม่',
    SCHEMA: 'ไม่พบคอลัมน์ที่จำเป็นในชีต ระบบจึงปิดการบันทึกไว้ก่อน: ',
    FORBIDDEN:
      'บัญชีของคุณมีสิทธิ์ดูอย่างเดียว จึงเพิ่มหรือแก้ไขรายการไม่ได้ หากต้องการสิทธิ์แก้ไข กรุณาติดต่อ PM เจ้าของชีต',
    NOT_ALLOWED:
      'บัญชีนี้ยังไม่อยู่ในรายชื่อทีมที่แก้ไขได้ จึงดูข้อมูลได้อย่างเดียว กรุณาให้ PM เพิ่มอีเมลของคุณในชีต _app_allowed',
    NOT_ADMIN: 'เฉพาะผู้ดูแลเท่านั้นที่จัดการสิทธิ์ได้',
    LAST_ADMIN: 'ต้องมีผู้ดูแลอย่างน้อย 1 คนที่ยังใช้งานได้ จึงลดสิทธิ์หรือระงับคนนี้ไม่ได้',
    VALIDATION: 'กรุณาตรวจสอบข้อมูลที่กรอกอีกครั้ง',
    CONFIG: 'ยังไม่ได้ตั้งค่า SPREADSHEET_ID ใน Script Properties ของแอป กรุณาแจ้งผู้ดูแลระบบ',
    NAME_BY_ADMIN: 'ชื่อของแต่ละคนกำหนดโดยผู้ดูแลในหน้า จัดการสิทธิ์ กรุณาแจ้งผู้ดูแลถ้าชื่อไม่ถูกต้อง',
    NO_ACCESS: 'บัญชีนี้ไม่มีสิทธิ์เปิดชีตข้อมูล กรุณาขอสิทธิ์จาก PM เจ้าของชีต แล้วเปิดแอปใหม่',
    SEQ_TAKEN:
      'เลขลำดับของรายการนี้ถูกใช้โดยรายการอื่นในชีตแล้ว จึงกู้คืนไม่ได้ (หรือกู้คืนไปแล้ว) กรุณาโหลดข้อมูลใหม่',
    NOT_DELETED: 'ไม่พบบันทึกการลบนี้ใน _app_log กรุณาโหลดรายการใหม่',
    ERROR: 'เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่ หากยังพบปัญหาให้แจ้งผู้ดูแลระบบ',
  };

  /** @template T @param {T} data */
  function ok(data) {
    return { ok: true, data: data };
  }
  /** @param {keyof MESSAGES} code @param {any} [details] @param {string} [suffix] */
  function fail(code, details, suffix) {
    var r = /** @type {any} */ ({ ok: false, code: code, message: MESSAGES[code] + (suffix || '') });
    if (details !== undefined) r.details = details;
    return r;
  }

  return {
    TZ: 'Asia/Bangkok',
    PROP_SPREADSHEET_ID: 'SPREADSHEET_ID',
    SHEETS: {
      main: 'ข้อมูลขอแก้ไขโปรแกรม',
      people: 'รายชื่อ',
      log: '_app_log',
      users: '_app_users',
      allowed: '_app_allowed',
      notify: '_app_notify', // queue that แมวส้ม reads and sends to LINE (2026-11-11)
      taigaMap: '_app_taiga_map', // Taiga status → app status, set by an admin (2026-11-24)
      taigaLog: '_แมวส้ม_Taiga', // the bot's Taiga event log: READ ONLY, never written by the app (2026-11-24)
    },
    NOTIFY_HEADERS: ['id', 'สร้างเมื่อ', 'ประเภท', 'ข้อความ', 'สถานะ', 'ส่งเมื่อ', 'หมายเหตุ'],
    NOTIFY_STATES: { pending: 'รอส่ง', sent: 'ส่งแล้ว', failed: 'ส่งไม่สำเร็จ' },
    APP_URL: 'https://nuchanarts.github.io/Change-Request-Tracker/',
    HISTORY_LIMIT: 100,
    LOG_HEADERS: ['เวลา', 'ผู้ใช้', 'การกระทำ', 'เลขแถว', 'ลำดับ', 'คอลัมน์', 'ค่าเดิม', 'ค่าใหม่'],
    USERS_HEADERS: ['email', 'ชื่อ', 'อัปเดตเมื่อ'],
    ALLOWED_HEADERS: ['email', 'ชื่อ', 'หมายเหตุ', 'บทบาท', 'สถานะ'],
    ROLE: { admin: 'ผู้ดูแล', editor: 'ผู้แก้ไข' },
    ACCESS: { allowed: 'อนุญาต', pending: 'รออนุมัติ', suspended: 'ระงับ' },
    TAIGA_MAP_HEADERS: ['สถานะใน Taiga', 'สถานะในแอป', 'แก้โดย', 'แก้เมื่อ'],
    /** Columns the app needs from the bot's Taiga log, found by header. */
    TAIGA_LOG_COLUMNS: { at: 'เวลา', kind: 'ชนิด', from: 'จาก', to: 'เป็น', by: 'โดย', link: 'ลิงก์' },
    TAIGA_LOG_MAX: 5000, // newest events read per load
    USER_NAME_LABEL: 'ชื่อผู้ใช้',
    PEOPLE_HEADERS: ['ชื่อ', 'ชื่อ-สกุล', 'ชื่อ - สกุล', 'ชื่อเล่น', 'รายชื่อ', 'Name', 'name'],
    /** Values documented in the constitution's Data Contract (used when a column has no Data Validation). */
    KNOWN_OPTIONS: {
      platform: ['EHP', 'NHIP', 'INV', 'EHP Pharmacy'],
      issueType: [
        'Requement',
        'defect',
        'ลด error',
        'การใช้งาน',
        'ข้อมูลพื้นฐาน',
        'รายงาน',
        'แบบฟอร์ม',
        'ไม่ระบุ',
      ],
      urgency: ['ด่วนที่สุด', 'ด่วน', 'ปกติ'],
    },
    /** PM list set by the PM on 2026-11-11: the only choices for "PM รับผิดชอบ", in this order. */
    PM_LIST: ['นุชนารถ (แก๊ส)', 'วนิดา (แพท)', 'ทิพวรรณ (พี่ส้ม)', 'กษิดิ์เดช (พี่ป้อง)'],
    // People who left the team: hidden from the developer / person pickers (their past rows stay as they are).
    RETIRED: ['แฮ่ม'],
    LOCK_MS: 10000,
    CACHE_SECONDS: 300,
    CACHE_KEYS: { options: 'options:v4' }, // v4: + tester list (2026-11-18)
    // Who is online (2026-11-18): one JSON map in the script cache, never a sheet. Short lock: a busy
    // lock skips the write so heartbeats never slow down real saves.
    // NAME_TTL_MS: how long the online list trusts a remembered name before re-reading _app_users (2026-11-20)
    PRESENCE: {
      CACHE_KEY: 'bgs_presence',
      CACHE_SECONDS: 600,
      LOCK_MS: 1500,
      NAME_KEY_PREFIX: 'bgs_pname:',
      NAME_TTL_MS: 300000,
    },
    EDIT_PROBE_KEY: 'bgs_app_edit_probe',
    EDIT_PROBE_CACHE_SECONDS: 21600,
    EDIT_CACHE_PREFIX: 'canEdit:v3:',
    MESSAGES: MESSAGES,
    ok: ok,
    fail: fail,
  };
})();

if (typeof module === 'object' && module.exports) module.exports = Config;
