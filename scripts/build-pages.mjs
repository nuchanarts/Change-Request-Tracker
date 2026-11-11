// Build the GitHub Pages entry page: docs/index.html from docs/index.template.html,
// injecting the shared illustration (src/client/Illustration.html) so app and entry page match.
import { readFileSync, writeFileSync } from 'node:fs';

const tpl = readFileSync('docs/index.template.html', 'utf8');
const art = readFileSync('src/client/Illustration.html', 'utf8').trim();
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const out = tpl.split('<!-- ILLUSTRATION -->').join(art).split('__APP_VERSION__').join(version);
writeFileSync('docs/index.html', out);
console.log(`built docs/index.html (v${version})`);
