// Push guard (constitution XV, research R2/R11).
// Refuses clasp pushes to the sheet-bound LINE bot project, and unguarded production pushes.
// Usage: node scripts/check-clasp-target.mjs <.clasp.*.json> [--prod]
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [file, flag] = process.argv.slice(2);
const die = (msg) => {
  console.error(`✖ ${msg}`);
  process.exit(1);
};

if (!file || !existsSync(file))
  die(`ไม่พบไฟล์ ${file || '(ไม่ได้ระบุ)'} ดูวิธีสร้างใน specs/001-ehp-change-request-tracker/quickstart.md`);
const { scriptId, rootDir } = JSON.parse(readFileSync(file, 'utf8'));
if (!scriptId) die(`${file} ไม่มี scriptId`);
if (rootDir !== 'dist') die(`${file} ต้องตั้ง rootDir เป็น "dist"`);

const denied = readFileSync('scripts/bound-script-ids.txt', 'utf8')
  .split(/\r?\n/)
  .map((l) => l.replace(/#.*/, '').trim())
  .filter(Boolean);
if (denied.includes(scriptId)) {
  die(`scriptId ${scriptId} คือ project ที่ผูกกับชีต (บอท LINE "แมวส้ม") — ห้าม push เพราะจะลบโค้ดบอททิ้ง`);
}

if (flag === '--prod') {
  const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD']).toString().trim();
  if (branch !== 'main') die(`push production ได้จาก branch main เท่านั้น (ตอนนี้อยู่ที่ ${branch})`);
  if (execFileSync('git', ['status', '--porcelain']).toString().trim())
    die('มีไฟล์ที่ยังไม่ commit กรุณา commit ก่อน push production');
}
console.log(`✔ target ${scriptId} ผ่านการตรวจ${flag === '--prod' ? ' (production)' : ''}`);
