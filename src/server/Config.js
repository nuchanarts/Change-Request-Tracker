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
    NO_ACCESS: 'บัญชีนี้ไม่มีสิทธิ์เปิดชีตข้อมูล กรุณาขอสิทธิ์จาก PM เจ้าของชีต แล้วเปิดแอปใหม่',
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
    },
    LOG_HEADERS: ['เวลา', 'ผู้ใช้', 'การกระทำ', 'เลขแถว', 'ลำดับ', 'คอลัมน์', 'ค่าเดิม', 'ค่าใหม่'],
    USERS_HEADERS: ['email', 'ชื่อ', 'อัปเดตเมื่อ'],
    ALLOWED_HEADERS: ['email', 'ชื่อ', 'หมายเหตุ', 'บทบาท', 'สถานะ'],
    ROLE: { admin: 'ผู้ดูแล', editor: 'ผู้แก้ไข' },
    ACCESS: { allowed: 'อนุญาต', pending: 'รออนุมัติ', suspended: 'ระงับ' },
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
    LOCK_MS: 10000,
    CACHE_SECONDS: 300,
    CACHE_KEYS: { options: 'options:v1' },
    EDIT_PROBE_KEY: 'bgs_app_edit_probe',
    EDIT_PROBE_CACHE_SECONDS: 21600,
    EDIT_CACHE_PREFIX: 'canEdit:v3:',
    MESSAGES: MESSAGES,
    ok: ok,
    fail: fail,
  };
})();

if (typeof module === 'object' && module.exports) module.exports = Config;
