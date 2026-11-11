// One-command production release: push → redeploy (same URL) → tag. Run by a person: `npm run release`.
// Guards: main branch, clean tree (via push:prod's check), version not tagged yet, pushed to origin.
// `npm run release -- --dry-run` prints the steps without running them.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const dry = process.argv.includes('--dry-run');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const version = pkg.version;
const deploymentId = pkg.config && pkg.config.prodDeploymentId;
const die = (msg) => {
  console.error(`✖ ${msg}`);
  process.exit(1);
};
const git = (...args) => execFileSync('git', args).toString().trim();
// npm/npx are .cmd files on Windows; arguments below are fixed or validated, never user text.
const run = (cmd, args) => {
  console.log(`→ ${cmd} ${args.join(' ')}`);
  if (dry) return;
  execFileSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
};

if (!/^\d+\.\d+\.\d+$/.test(version)) die(`version ใน package.json ไม่ถูกต้อง: ${version}`);
if (!/^AKfy[\w-]+$/.test(deploymentId || '')) die('ไม่พบ config.prodDeploymentId ใน package.json');
const tag = `v${version}`;
if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') die('release ได้จาก branch main เท่านั้น');
if (git('status', '--porcelain')) die('มีไฟล์ที่ยังไม่ commit กรุณา commit ก่อน');
if (git('tag', '--list', tag)) die(`มี tag ${tag} แล้ว — เพิ่ม version ใน package.json ก่อน release ใหม่`);
git('fetch', '--quiet', 'origin', 'main');
if (git('rev-parse', 'HEAD') !== git('rev-parse', 'origin/main'))
  die('main ยังไม่ตรงกับ GitHub กรุณา git push ก่อน');

console.log(`ปล่อยเวอร์ชัน ${tag}${dry ? ' (dry run)' : ''}`);
run('npm', ['run', 'push:prod']);
run('npx', ['clasp', '-P', '.clasp.prod.json', 'redeploy', deploymentId, '-d', tag]);
run('git', ['tag', '-a', tag, '-m', `${tag} (released with npm run release)`]);
run('git', ['push', 'origin', tag]);
console.log(`✔ ${tag} ขึ้นระบบจริงแล้ว เปิดแอปแล้วกด F5 ป้ายมุมบนซ้ายควรเป็น ${tag}`);
