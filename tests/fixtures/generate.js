// Synthetic, deterministic fixture rows (no real data — constitution XV).

const PLATFORMS = ['EHP', 'NHIP', 'INV', 'EHP Pharmacy'];
const TYPES = [
  'Requement',
  'defect',
  'ลด error',
  'การใช้งาน',
  'ข้อมูลพื้นฐาน',
  'รายงาน',
  'แบบฟอร์ม',
  'ไม่ระบุ',
];
const URGENCY = ['ด่วนที่สุด', 'ด่วน', 'ปกติ', 'ปกติ', 'ปกติ'];
const STATUSES = [
  '0.รอแจ้งทีมพัฒนา',
  'รอทีมพัฒนา',
  'กำลังพัฒนา',
  'กำลังพัฒนา',
  '0.จัดทำไฟล์แก้ไข',
  'รอ compile',
  'รอ Complie ต้องแจ้งอจ.',
  'กำลังทดสอบ',
  'ส่งกลับนักพัฒนาแก้ไข',
  'รอ PM ตรวจสอบ Taiga',
  '0.จัดทำ Taiga',
  'dev ขอ Sourecode อจ.',
  '0.แก้ไขเรียบร้อย',
  '0.แก้ไขเรียบร้อย',
  '0.แก้ไขเรียบร้อย',
  '0.ใช้งานได้อยู่แล้ว',
  '0.ยกเลิก',
];
const SYSTEMS = [
  'เวชระเบียน',
  'Dispensary',
  'ส่งออกข้อมูล',
  'การเงิน',
  'ห้องยา',
  'ห้องแล็บ',
  'นัดหมาย',
  'Workbeanch',
];
export const PEOPLE_PM = ['พีเอ็ม สมใจ', 'พีเอ็ม ใจดี', 'พีเอ็ม มานะ'];
export const PEOPLE_DEV = ['นักพัฒนา แดง', 'นักพัฒนา ดำ', 'นักพัฒนา ขาว', 'นักพัฒนา เขียว', 'นักพัฒนา ฟ้า'];
const WHAT = [
  'เพิ่มรายงาน',
  'แก้หน้าจอ',
  'ปรับสิทธิ์',
  'เพิ่มคอลัมน์',
  'แก้ error ตอนบันทึก',
  'ส่งออก Excel',
  'ปรับแบบฟอร์ม',
];

/** Small deterministic PRNG (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fmt = (dt) => `${dt.getUTCDate()}/${dt.getUTCMonth() + 1}/${dt.getUTCFullYear()}`;

/**
 * @param {number} n
 * @param {number} seed
 * @param {{y:number,m:number,d:number}} [today]
 */
export function generateRows(n, seed = 1, today = { y: 2026, m: 11, d: 11 }) {
  const r = rng(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const base = Date.UTC(today.y, today.m - 1, today.d);
  const day = (offset) => fmt(new Date(base + offset * 86400000));
  const rows = [];
  for (let i = 1; i <= n; i++) {
    const status = pick(STATUSES);
    const closed = ['0.แก้ไขเรียบร้อย', '0.ใช้งานได้อยู่แล้ว', '0.ยกเลิก'].includes(status);
    const dueOffset = Math.floor(r() * 60) - 30;
    const hasDev = r() > 0.1;
    rows.push({
      rowNumber: i + 1,
      seq: String(i),
      platform: pick(PLATFORMS),
      issueType: pick(TYPES),
      urgency: pick(URGENCY),
      status,
      system: pick(SYSTEMS),
      detail: `${pick(WHAT)} ระบบ${pick(SYSTEMS)} (ตัวอย่าง #${i})`,
      pm: pick(PEOPLE_PM),
      ticket:
        r() > 0.5 ? String(1000 + i) : r() > 0.5 ? `https://taiga.example/project/ehp/us/${2000 + i}` : '',
      dueDate: r() > 0.05 ? day(dueOffset) : '',
      developer: hasDev ? pick(PEOPLE_DEV) : '',
      postponedDate: !closed && r() > 0.85 ? day(dueOffset + 14) : '',
      doneDate: closed && status !== '0.ยกเลิก' ? day(-Math.floor(r() * 40)) : '',
      deployDate: '',
      devQueue: hasDev && r() > 0.5 ? String(1 + Math.floor(r() * 5)) : '',
      devHours: r() > 0.6 ? String(1 + Math.floor(r() * 16)) : '',
      devStart: '',
      devEnd: '',
    });
  }
  // Like the real sheet: some ticket numbers carry a link inside the cell (rich text). Deterministic, so the
  // random sequence (and every count other tests rely on) stays the same.
  rows.forEach((row, i) => {
    if (/^\d+$/.test(row.ticket) && i % 3 === 0)
      row.ticketLinks = [`https://taiga.example/project/ehp/us/${row.ticket}`];
  });
  return rows;
}
