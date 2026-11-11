import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// GitHub Pages entry page (docs/index.html): only links/redirects to the Apps Script app.
const page = pathToFileURL(resolve('docs/index.html')).href;
const APP =
  'https://script.google.com/macros/s/AKfycbz_ElEdO0SWkeYFwl92D4yKOFupRmlFjKNuFvUIoUje7Y02yjL3wdSKMvdi0Vk8lA8V/exec';

test('entry page links to the production app and keeps deep links', async ({ page: p }) => {
  await p.goto(page + '?stay=1#/kanban');
  const go = p.getByRole('link', { name: 'เปิดแอป' });
  await expect(go).toHaveAttribute('href', APP + '#/kanban');
  await expect(p.getByRole('status')).toHaveText('กดปุ่มเพื่อเข้าใช้งาน');
});

test('entry page redirects to the app', async ({ page: p }) => {
  await p.route('https://script.google.com/**', (route) =>
    route.fulfill({ body: 'app', contentType: 'text/plain' }),
  );
  await p.goto(page);
  await p.waitForURL(APP, { timeout: 5000 });
});

test('entry page holds no app data or API calls (constitution VIII)', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync('docs/index.html', 'utf8');
  expect(html).not.toMatch(/google\.script\.run|SpreadsheetApp|1voV3mHQi7bH2PbBeWaVrk0EaUs/);
});
