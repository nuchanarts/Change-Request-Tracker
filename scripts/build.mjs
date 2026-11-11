// Build: src/ → dist/ (pushed by clasp) and, with --preview, preview/index.html with a mocked backend.
// No dependencies. Usage: node scripts/build.mjs [--preview] [--with-integration]
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  readdirSync,
  copyFileSync,
  existsSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateRows, PEOPLE_PM, PEOPLE_DEV } from '../tests/fixtures/generate.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const read = (p) => readFileSync(join(root, p), 'utf8');
// Single source of the app version: package.json → shown on screen via __APP_VERSION__.
const version = JSON.parse(read('package.json')).version;
const stamp = (text) => text.split('__APP_VERSION__').join(version);

// ---------------------------------------------------------------- dist/
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

copyFileSync(join(root, 'src/appsscript.json'), join(dist, 'appsscript.json'));
const domain = read('src/shared/Domain.js');
writeFileSync(join(dist, 'Domain.js'), domain);
writeFileSync(join(dist, 'DomainClient.html'), `<script>\n${domain}\n</script>\n`);
for (const f of readdirSync(join(root, 'src/server'))) {
  if (f.endsWith('.js')) copyFileSync(join(root, 'src/server', f), join(dist, f));
}
for (const f of readdirSync(join(root, 'src/client'))) {
  if (f.endsWith('.html')) writeFileSync(join(dist, f), stamp(read(`src/client/${f}`)));
}
if (args.has('--with-integration') && existsSync(join(root, 'tests/integration'))) {
  for (const f of readdirSync(join(root, 'tests/integration'))) {
    if (f.endsWith('.js')) copyFileSync(join(root, 'tests/integration', f), join(dist, f));
  }
}
// Guard: every inline <script> in the client files must parse (a lost escape once broke the whole UI).
for (const f of readdirSync(dist).filter((n) => n.endsWith('.html'))) {
  const html = readFileSync(join(dist, f), 'utf8');
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    try {
      new Function(m[1]);
    } catch (e) {
      console.error(`✖ syntax error in ${f}: ${e.message}`);
      process.exit(1);
    }
  }
}
console.log('built dist/ →', readdirSync(dist).join(', '));

// ---------------------------------------------------------------- preview/
if (args.has('--preview')) {
  const preview = join(root, 'preview');
  rmSync(preview, { recursive: true, force: true });
  mkdirSync(preview, { recursive: true });

  const files = { DomainClient: `<script>\n${domain}\n</script>` };
  for (const f of readdirSync(join(root, 'src/client')))
    files[f.replace(/\.html$/, '')] = stamp(read(`src/client/${f}`));
  const mock = '<script src="fixture.js"></script>\n<script src="mock-gas.js"></script>\n';
  const html = files.Index.replace(/<\?!=\s*include\('([^']+)'\);?\s*\?>/g, (_, name) => {
    if (!(name in files)) throw new Error(`include('${name}') not found`);
    return (name === 'App' ? mock : '') + files[name];
  });
  writeFileSync(join(preview, 'index.html'), html);
  writeFileSync(join(preview, 'version.txt'), version);
  copyFileSync(join(root, 'tests/e2e/mock-gas.js'), join(preview, 'mock-gas.js'));

  // Synthetic fixture (no real data), "today" = the real date in Asia/Bangkok so the preview looks live.
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' })
    .format(new Date())
    .split('-')
    .map(Number);
  const today = { y, m, d };
  const rows = generateRows(Number(process.env.ROWS || 720), 7, today);
  // A few rows with real-world data problems (constitution III / FR-031)
  Object.assign(rows[3], { platform: `${d}/${m}/${y}` });
  Object.assign(rows[10], { issueType: PEOPLE_DEV[0] });
  Object.assign(rows[17], { dueDate: 'ปลายเดือน', postponedDate: '' });
  Object.assign(rows[25], { deployDate: `1/${m}/${y + 543}` });
  Object.assign(rows[40], { seq: rows[41].seq });
  Object.assign(rows[60], { status: '' }); // blank status = still open (constitution IV)
  const options = {
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
    system: [...new Set(rows.map((r) => r.system))].sort(),
    pm: PEOPLE_PM,
    developer: PEOPLE_DEV,
    person: [...PEOPLE_PM, ...PEOPLE_DEV],
  };
  writeFileSync(
    join(preview, 'fixture.js'),
    `window.__FIXTURE__ = ${JSON.stringify({ today, rows, options })};\n`,
  );
  console.log(`built preview/ (${rows.length} synthetic rows, today ${d}/${m}/${y})`);
}
