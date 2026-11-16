// Build the GitHub Pages pages from their templates:
//  - docs/index.html (entry page), injecting the shared illustration (src/client/Illustration.html)
//  - docs/sop.html (team SOP), injecting the SOP shown on the app's help page (src/client/Sop.html)
import { readFileSync, writeFileSync } from 'node:fs';

const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const parts = {
  '<!-- ILLUSTRATION -->': readFileSync('src/client/Illustration.html', 'utf8').trim(),
  '<!-- SOP -->': readFileSync('src/client/Sop.html', 'utf8').trim(),
  __APP_VERSION__: version,
};

for (const name of ['index', 'sop']) {
  let out = readFileSync(`docs/${name}.template.html`, 'utf8');
  for (const [key, value] of Object.entries(parts)) out = out.split(key).join(value);
  writeFileSync(`docs/${name}.html`, out);
  console.log(`built docs/${name}.html (v${version})`);
}
