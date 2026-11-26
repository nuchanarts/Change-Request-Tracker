import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { open } from './helpers.js';

// Taiga status in the register, mismatch filter, "ปรับตาม Taiga" and the status map (user request 2026-11-24).
// The mock log is built from the fixture: the first three open rows with a Taiga link have Taiga events.
const setup = async (page, { map = {}, query = '', dev = '' } = {}) => {
  await page.addInitScript(
    ([m, d]) => {
      window.__taigaMap = m;
      if (d) window.__mockUserName = d;
      window.__beforeMock = (rows) => {
        const D = window.Domain;
        // the newest rows: they are on the first page of the register
        const linked = rows
          .filter((r) => D.isOpen(r.status) && r.detail && /^\d+$/.test(r.seq))
          .sort((x, y) => y.seq - x.seq);
        [0, 1, 2].forEach((i) => {
          linked[i].ticketLinks = [`https://taiga.example/project/sync/us/${i + 1}`];
          linked[i].status = 'รอทีมพัฒนา';
        });
        if (d) Object.assign(linked[0], { developer: d, dueDate: '1/1/2020', postponedDate: '' }); // overdue: on the นักพัฒนา page
        window.__taigaSeqs = linked.slice(0, 3).map((r) => r.seq);
        const ev = (n, to) => ({
          kind: 'สถานะ',
          link: `https://taiga.example/project/sync/us/${n}`,
          from: 'New',
          to,
          by: 'ริว',
          at: Date.UTC(2026, 10, 24, 3, 5),
        });
        window.__taigaEvents = [ev(1, 'In progress'), ev(2, 'Ready'), ev(3, 'Strange')];
      };
    },
    [map, dev],
  );
  await open(page, `/${query}#/taiga`);
  if (!query.includes('notaiga')) await expect(page.locator('#tg-table .tg-taiga').first()).toBeVisible();
  return page.evaluate(() => window.__taigaSeqs);
};
const MAP = { 'In progress': 'กำลังพัฒนา', Ready: 'รอทีมพัฒนา' };
const rowOf = (page, seq) => page.locator(`#tg-table tr[data-id="${seq}"]`);

test('shows the Taiga status, who moved it and when, next to the sheet status', async ({ page }) => {
  const [a, b, c] = await setup(page, { map: MAP });
  await expect(rowOf(page, a).locator('.tg-taiga')).toContainText('In progress');
  await expect(rowOf(page, a).locator('.tg-taiga')).toContainText('ริว');
  await expect(rowOf(page, a).locator('.tg-taiga')).toContainText('24/11/2026 10:05');
  await expect(rowOf(page, a).locator('.tg-sync-diff')).toContainText('กำลังพัฒนา');
  await expect(rowOf(page, b).locator('.tg-sync-match')).toBeVisible();
  await expect(rowOf(page, c).locator('.tg-sync-unmapped')).toBeVisible();
});

test('filters the items that differ from Taiga', async ({ page }) => {
  const [a] = await setup(page, { map: MAP });
  await page.locator('#f-tg-sync').selectOption('diff');
  await expect(page.locator('#tg-table tbody tr')).toHaveCount(1);
  await expect(rowOf(page, a)).toBeVisible();
  await expect(page.locator('#tg-count')).toHaveText('1');
});

test('"ปรับตาม Taiga" asks first, then saves the status through the normal write path', async ({ page }) => {
  const [a] = await setup(page, { map: MAP });
  const status = () => page.evaluate((s) => window.__mockSheet.rows.find((r) => r.seq === s).status, a);
  await rowOf(page, a)
    .getByRole('button', { name: /ปรับตาม Taiga/ })
    .click();
  await expect(page).toHaveURL(/#\/taiga$/); // the row itself is clickable: the button must not open the item
  await page.locator('#dialog').getByRole('button', { name: 'ยกเลิก' }).click();
  expect(await status()).toBe('รอทีมพัฒนา');
  await rowOf(page, a)
    .getByRole('button', { name: /ปรับตาม Taiga/ })
    .click();
  await page.locator('#dialog').getByRole('button', { name: 'ปรับสถานะ' }).click();
  await expect(page.locator('.toast')).toContainText('บันทึกการแก้ไขแล้ว');
  expect(await status()).toBe('กำลังพัฒนา');
  await expect(rowOf(page, a).locator('.tg-sync-match')).toBeVisible();
  expect(await page.evaluate(() => window.__mockLog.map((e) => e.column + '>' + e.to))).toEqual([
    'สถานะ>กำลังพัฒนา',
  ]);
});

test('Esc never confirms, even after an earlier confirmation', async ({ page }) => {
  const [a, b] = await setup(page, { map: { 'In progress': 'กำลังพัฒนา', Ready: 'กำลังทดสอบ' } });
  await rowOf(page, a)
    .getByRole('button', { name: /ปรับตาม Taiga/ })
    .click();
  await page.locator('#dialog').getByRole('button', { name: 'ปรับสถานะ' }).click();
  await expect(rowOf(page, a).locator('.tg-sync-match')).toBeVisible();
  await rowOf(page, b)
    .getByRole('button', { name: /ปรับตาม Taiga/ })
    .click();
  await expect(page.locator('#dialog')).toContainText('#' + b);
  await page.keyboard.press('Escape');
  await expect(page.locator('#dialog')).toBeHidden();
  await page.waitForTimeout(600); // longer than the mock latency: a wrong save would have landed
  expect(await page.evaluate((s) => window.__mockSheet.rows.find((r) => r.seq === s).status, b)).toBe(
    'รอทีมพัฒนา',
  );
});

test('a change made in the sheet meanwhile is never overwritten', async ({ page }) => {
  const [a] = await setup(page, { map: MAP });
  await page.evaluate((s) => window.__mockSheet.edit(s, 'status', 'กำลังทดสอบ'), a);
  await rowOf(page, a)
    .getByRole('button', { name: /ปรับตาม Taiga/ })
    .click();
  await page.locator('#dialog').getByRole('button', { name: 'ปรับสถานะ' }).click();
  await expect(page.locator('.toast')).toContainText('มีคนแก้ไขรายการนี้ไปก่อน');
  expect(await page.evaluate((s) => window.__mockSheet.rows.find((r) => r.seq === s).status, a)).toBe(
    'กำลังทดสอบ',
  );
});

test('admins pair a Taiga status with an app status; nothing changes until a person applies it', async ({
  page,
}) => {
  const [, , a] = await setup(page);
  await expect(rowOf(page, a).locator('.tg-sync-unmapped')).toBeVisible();
  await page.locator('#tg-map summary').click();
  await page.locator('#tg-map select[data-taiga="Strange"]').selectOption('กำลังพัฒนา');
  await expect(page.locator('.toast')).toContainText('Strange');
  await expect(rowOf(page, a).locator('.tg-sync-diff')).toContainText('กำลังพัฒนา');
  await expect(page.locator('#tg-map')).toHaveAttribute('open', '');
  expect(await page.evaluate(() => window.__mockLog.length)).toBe(0);
});

test('view-only people see the statuses but no buttons and no map', async ({ page }) => {
  const [a] = await setup(page, { map: MAP, query: '?viewer=1' });
  await expect(rowOf(page, a).locator('.tg-sync-diff')).toBeVisible();
  await expect(page.getByRole('button', { name: /ปรับตาม Taiga/ })).toHaveCount(0);
  await expect(page.locator('#tg-map')).toHaveCount(0);
});

test('without the Taiga log the register works as before', async ({ page }) => {
  await setup(page, { query: '?notaiga=1' });
  await expect(page.locator('#tg-table tbody tr').first()).toBeVisible();
  await expect(page.locator('#tg-nolog')).toBeVisible();
  await expect(page.locator('.tg-taiga')).toHaveCount(0);
  await expect(page.locator('#f-tg-sync')).toHaveCount(0);
});

test('no sideways page scroll at any width', async ({ page }) => {
  await setup(page, { map: MAP });
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(over).toBeLessThanOrEqual(0);
});

test('the team table works without any setup, and an admin can switch a pair off', async ({ page }) => {
  const [a] = await setup(page);
  await expect(rowOf(page, a).locator('.tg-sync-diff')).toContainText('กำลังพัฒนา');
  await page.locator('#tg-map summary').click();
  await expect(page.locator('#tg-map select[data-taiga="Done"]')).toHaveValue('0.แก้ไขเรียบร้อย');
  await page.locator('#tg-map select[data-taiga="In progress"]').selectOption('');
  await expect(rowOf(page, a).locator('.tg-sync-unmapped')).toBeVisible();
});

test('applying a status that closes the item says so before saving', async ({ page }) => {
  const [a] = await setup(page, { map: { 'In progress': '0.แก้ไขเรียบร้อย' } });
  await rowOf(page, a)
    .getByRole('button', { name: /ปรับตาม Taiga/ })
    .click();
  await expect(page.locator('#dialog')).toContainText('จะปิดงาน');
});

// "PM ยังไม่ตรวจสอบ Taiga แต่มีการพัฒนาแล้ว" (user request 2026-11-24)
const waitForPm = (page, seq) =>
  page.evaluate((x) => {
    window.__mockSheet.rows.find((r) => r.seq === x).status = 'รอ PM ตรวจสอบ Taiga';
  }, seq);
const reload = (page) => page.getByRole('button', { name: 'โหลดข้อมูลใหม่' }).click();

test('flags items developed before the PM reviewed them and can show only those', async ({ page }) => {
  const [a, b] = await setup(page);
  await expect(rowOf(page, a).locator('.tg-review')).toHaveCount(0);
  await waitForPm(page, a);
  await reload(page);
  await expect(rowOf(page, a).locator('.tg-review')).toContainText(
    'PM ยังไม่ตรวจผ่าน Taiga แต่เริ่มพัฒนาแล้ว',
  );
  await expect(rowOf(page, a).locator('.tg-review')).toContainText('Taiga: In progress');
  await expect(rowOf(page, b).locator('.tg-review')).toHaveCount(0);
  const n = Number(await page.locator('#tg-review-count').textContent());
  const only = page.getByRole('button', { name: /PM ยังไม่ตรวจ Taiga/ });
  await expect(only).toHaveAttribute('aria-pressed', 'false');
  await only.click();
  await expect(only).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#tg-table tbody tr')).toHaveCount(Math.min(50, n));
  await expect(rowOf(page, a)).toBeVisible();
  await only.click();
  await expect(rowOf(page, b)).toBeVisible();
});

test('"ปรับตาม Taiga" says when it would skip the PM review', async ({ page }) => {
  const [a] = await setup(page);
  await waitForPm(page, a);
  await reload(page);
  await expect(rowOf(page, a).locator('.tg-review')).toBeVisible();
  await rowOf(page, a)
    .getByRole('button', { name: /ปรับตาม Taiga/ })
    .click();
  await expect(page.locator('#dialog')).toContainText('PM ยังไม่ตรวจผ่าน Taiga');
});

test('works from the sheet dates when there is no Taiga log', async ({ page }) => {
  await setup(page, { query: '?notaiga=1' });
  const [a] = await page.evaluate(() => window.__taigaSeqs);
  await waitForPm(page, a);
  await page.evaluate((x) => {
    window.__mockSheet.rows.find((r) => r.seq === x).devStart = '1/1/2026';
  }, a);
  await reload(page);
  await expect(rowOf(page, a).locator('.tg-review')).toContainText('เริ่มพัฒนา 1/1/2026');
});

// Sheet statuses without exactly one Taiga status are paired in the same panel (user request 2026-11-25)
test('admins see the sheet statuses without a Taiga status and can pair them', async ({ page }) => {
  const APP = '0.รอแจ้งทีมพัฒนา';
  const [a] = await setup(page);
  await page.evaluate(
    ([s, st]) => {
      window.__mockSheet.rows.find((r) => r.seq === s).status = st;
    },
    [a, APP],
  );
  await page.locator('#tg-map summary').click();
  await reload(page);
  await expect(rowOf(page, a)).toContainText('รอแจ้ง');
  await expect(page.locator('#tg-map')).toHaveAttribute('open', ''); // a reload does not close it
  await expect(page.locator('#tg-map summary')).toContainText('ยังไม่จับคู่ 9'); // Ready, Strange + 7
  await expect(page.locator('#tg-app-map select')).toHaveCount(7);
  await expect(page.locator('#tg-app-map')).toContainText('ตรงกับ Waiting Compile, compile from dev');
  const select = page.getByLabel(APP, { exact: true });
  await select.selectOption('In progress');
  await expect(page.locator('.toast')).toContainText('In progress');
  await expect(rowOf(page, a).locator('.tg-sync-match')).toBeVisible();
  await expect(page.locator('#tg-map')).toHaveAttribute('open', '');
  await expect(page.locator('#tg-map summary')).toContainText('ยังไม่จับคู่ 8');
  await expect(select).toHaveValue('In progress');
  await reload(page);
  await expect(page.getByLabel(APP, { exact: true })).toHaveValue('In progress');
  await page.getByLabel(APP, { exact: true }).selectOption('');
  await expect(rowOf(page, a).locator('.tg-sync-diff')).toBeVisible();
  expect(await page.evaluate(() => window.__mockLog.length)).toBe(0); // no item changed
});

test('the open status map has no accessibility problems and no sideways scroll', async ({ page }) => {
  await setup(page);
  await page.locator('#tg-map summary').click();
  await expect(page.locator('#tg-app-map select').first()).toBeVisible();
  const results = await new AxeBuilder({ page }).include('#tg-map').analyze();
  expect(results.violations).toEqual([]);
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(over).toBeLessThanOrEqual(0);
});

test('both warnings are small chips on the summary line, not full-width banners (2026-11-25)', async ({
  page,
}, info) => {
  const [a] = await setup(page);
  await waitForPm(page, a);
  await reload(page);
  await expect(page.locator('#tg-review-btn')).toBeVisible();
  await expect(page.locator('#tg-nolink')).toContainText('ไม่มีลิงก์ Taiga');
  await expect(page.locator('#tg-nolink .tip')).toHaveAttribute('aria-label', /วางลิงก์/);
  await expect(page.locator('#main .banner, main .banner')).toHaveCount(0);
  if (info.project.name === 'desktop') {
    const mid = async (sel) => {
      const box = await page.locator(sel).boundingBox();
      return box.y + box.height / 2;
    };
    await expect(async () => {
      const line = await mid('#tg-count'); // measured again when the page is drawn in between
      expect(Math.abs((await mid('#tg-review-btn')) - line)).toBeLessThan(8);
      expect(Math.abs((await mid('#tg-nolink')) - line)).toBeLessThan(8);
    }).toPass();
  }
  await expect(async () => {
    await page.locator('#tg-nolink .tip').focus(); // a late re-render may take the focus away
    await expect(page.locator('#tg-nolink .tip-body')).toBeVisible({ timeout: 300 });
  }).toPass();
  await expect(async () => {
    await page.locator('#tg-nolink .tip').focus();
    const tip = await page.locator('#tg-nolink .tip-body').boundingBox();
    expect(tip.x).toBeGreaterThanOrEqual(0);
    expect(tip.x + tip.width).toBeLessThanOrEqual(page.viewportSize().width);
  }).toPass();
});

// "ปรับ Taiga ตามชีต" (user request 2026-11-25). The mock answers for Taiga; nothing leaves the browser.
const pushButton = (page, seq) => rowOf(page, seq).getByRole('button', { name: /ปรับ Taiga ตามชีต/ });
const dialog = (page) => page.locator('#dialog');
const login = async (page, word = 'mock') => {
  await page.getByLabel('ชื่อผู้ใช้ Taiga').fill('someone');
  await page.getByLabel('รหัสผ่าน Taiga').fill(word);
  await dialog(page).getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
};
const taigaOf = (page, n) => page.evaluate((k) => window.__taiga.items['sync/us/' + k].status, n);
const patches = (page) =>
  page.evaluate(() => window.__taiga.calls.filter((c) => c.method === 'PATCH').length);

test('"ปรับ Taiga ตามชีต" logs in, asks, then changes Taiga only and logs it', async ({ page }) => {
  const [a] = await setup(page);
  await expect(pushButton(page, a)).toBeVisible();
  await pushButton(page, a).click();
  await login(page);
  await expect(dialog(page)).toContainText('ตามสถานะในชีต');
  await expect(dialog(page)).toContainText('"In progress"');
  await expect(dialog(page)).toContainText('"Ready for DEV"');
  expect(await patches(page)).toBe(0);
  await dialog(page).getByRole('button', { name: 'ส่งไป Taiga' }).click();
  await expect(page.locator('.toast')).toContainText('Ready for DEV');
  await expect(rowOf(page, a).locator('.tg-sync-match')).toBeVisible();
  expect(await taigaOf(page, 1)).toBe('Ready for DEV');
  expect(await page.evaluate(() => window.__mockLog.length)).toBe(0); // the sheet did not change
  expect(await page.evaluate(() => window.__taigaLog.map((e) => [e.from, e.to]))).toEqual([
    ['In progress', 'Ready for DEV'],
  ]);
  const stored = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]));
  expect(stored).not.toContain('"mock"'); // the password is never stored
});

test('cancelling the login or the question sends nothing', async ({ page }) => {
  const [a] = await setup(page);
  await pushButton(page, a).click();
  await expect(page.getByLabel('รหัสผ่าน Taiga')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await pushButton(page, a).click();
  await login(page);
  await expect(dialog(page)).toContainText('ตามสถานะในชีต');
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await page.waitForTimeout(400);
  expect(await patches(page)).toBe(0);
});

test('a wrong password stays in the login; a second item needs no new login; logout forgets it', async ({
  page,
}) => {
  const [a, , c] = await setup(page);
  await pushButton(page, a).click();
  await login(page, 'wrong');
  await expect(dialog(page).getByRole('alert')).toContainText('ไม่ถูกต้อง');
  await login(page);
  await dialog(page).getByRole('button', { name: 'ส่งไป Taiga' }).click();
  await expect(rowOf(page, a).locator('.tg-sync-match')).toBeVisible();
  await pushButton(page, c).click(); // "Strange" is not paired, but the sheet status is
  await dialog(page).getByRole('button', { name: 'ส่งไป Taiga' }).click();
  await expect(rowOf(page, c).locator('.tg-sync-match')).toBeVisible();
  await page.getByRole('button', { name: /ออกจาก Taiga/ }).click();
  await expect(page.getByRole('button', { name: /ออกจาก Taiga/ })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage }))).not.toContain('mock-token');
});

test('never overwrites: someone changed Taiga after the question, or the sheet before sending', async ({
  page,
}) => {
  const [a] = await setup(page);
  await pushButton(page, a).click();
  await login(page);
  await expect(dialog(page)).toContainText('ตามสถานะในชีต');
  await page.evaluate(() => {
    Object.assign(window.__taiga.items['sync/us/1'], { status: 'Done', version: 9 });
  });
  await dialog(page).getByRole('button', { name: 'ส่งไป Taiga' }).click();
  await expect(page.locator('.toast')).toContainText('มีคนแก้รายการนี้ใน Taiga');
  expect(await taigaOf(page, 1)).toBe('Done');

  await page.evaluate((s) => window.__mockSheet.edit(s, 'status', 'กำลังทดสอบ'), a);
  await pushButton(page, a).click();
  await dialog(page).getByRole('button', { name: 'ส่งไป Taiga' }).click();
  await expect(page.locator('.toast').last()).toContainText('มีคนแก้ไขรายการนี้ไปก่อน');
  expect(await taigaOf(page, 1)).toBe('Done');
  expect(await page.evaluate(() => window.__taigaLog.length)).toBe(0);
});

test('says so when Taiga is already there, lacks the status, or refuses', async ({ page }) => {
  const [a] = await setup(page);
  await page.evaluate(() => (window.__taiga.items['sync/us/1'].status = 'Ready for DEV'));
  await pushButton(page, a).click();
  await login(page);
  await expect(page.locator('.toast').last()).toContainText('อยู่ที่ "Ready for DEV" อยู่แล้ว');
  await expect(rowOf(page, a).locator('.tg-sync-match')).toBeVisible();
  await page.evaluate(() => {
    window.__taiga.statuses = window.__taiga.statuses.filter((s) => s !== 'Ready for DEV');
  });
  await reload(page);
  await expect(pushButton(page, a)).toBeVisible();
  await page.evaluate(() => (window.__taiga.items['sync/us/1'].status = 'In progress'));
  await pushButton(page, a).click();
  await expect(page.locator('.toast').last()).toContainText('ไม่มีสถานะ "Ready for DEV"');
  await page.evaluate(() => (window.__taiga.denied = true));
  await pushButton(page, a).click();
  await expect(page.locator('.toast').last()).toContainText('ไม่มีสิทธิ์');
  expect(await patches(page)).toBe(0);
});

test('an expired Taiga login asks to log in again', async ({ page }) => {
  const [a] = await setup(page);
  await pushButton(page, a).click();
  await login(page);
  await expect(dialog(page)).toContainText('ตามสถานะในชีต');
  await page.keyboard.press('Escape');
  await page.evaluate(() => (window.__taiga.token = 'another'));
  await pushButton(page, a).click();
  await expect(page.getByLabel('รหัสผ่าน Taiga')).toBeVisible();
});

test('view-only people get no button to change Taiga', async ({ page }) => {
  await setup(page, { query: '?viewer=1' });
  await expect(page.getByRole('button', { name: /ปรับ Taiga ตามชีต/ })).toHaveCount(0);
});

test('the login remembers the username only, and only while the box is ticked (2026-11-25)', async ({
  page,
}) => {
  const [a, , c] = await setup(page);
  const user = page.getByLabel('ชื่อผู้ใช้ Taiga', { exact: true });
  const keep = page.getByLabel('จำชื่อผู้ใช้ในเครื่องนี้');
  await pushButton(page, a).click();
  await expect(keep).toBeChecked();
  await expect(page.getByLabel('รหัสผ่าน Taiga')).toHaveAttribute('autocomplete', 'current-password');
  await login(page, 'wrong');
  await expect(dialog(page).getByRole('alert')).toContainText('ไม่ถูกต้อง');
  expect(await page.evaluate(() => localStorage.getItem('ehp.taigaUser.v1'))).toBeNull(); // a failed login is not kept
  await login(page);
  await expect(dialog(page)).toContainText('ตามสถานะในชีต');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /ออกจาก Taiga/ }).click();

  await pushButton(page, c).click();
  await expect(user).toHaveValue('someone');
  await expect(page.getByLabel('รหัสผ่าน Taiga')).toHaveValue('');
  await expect(page.getByLabel('รหัสผ่าน Taiga')).toBeFocused();
  const kept = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(kept).not.toContain('mock-token');
  expect(kept).not.toContain('"mock"');
  await keep.uncheck();
  await login(page);
  await expect(dialog(page)).toContainText('ตามสถานะในชีต');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /ออกจาก Taiga/ }).click();
  await pushButton(page, a).click();
  await expect(user).toHaveValue('');
  await expect(keep).not.toBeChecked();
});

// The tick next to "สถานะ" on the item form (user request 2026-11-25).
const FORM_MAP = { ...MAP, 'Ready for test': 'กำลังทดสอบ' };
const openItem = async (page, seq) => {
  await page.goto('/#/items/' + seq);
  await expect(page.locator('#item-form')).toBeVisible();
};
const tick = (page) => page.getByLabel('ปรับ Taiga ด้วย');
const sheetStatus = (page, seq) =>
  page.evaluate((s) => window.__mockSheet.rows.find((r) => r.seq === s).status, seq);

test('form tick: saving the status also sends it to Taiga after a person confirms', async ({ page }) => {
  const [a] = await setup(page, { map: FORM_MAP });
  await openItem(page, a);
  await expect(tick(page)).not.toBeChecked(); // nothing is sent unless the person ticks it
  await page.locator('#f-status').selectOption('กำลังทดสอบ');
  await expect(page.locator('#tg-form-sync')).toContainText('Ready for test');
  // the label fits on one line; the hint breaks between phrases, never inside a Thai word
  const label = page.locator('#tg-form-sync label');
  const lineHeight = parseFloat(await label.evaluate((el) => getComputedStyle(el).lineHeight));
  expect((await label.locator('.nw').boundingBox()).height).toBeLessThan(lineHeight * 1.5);
  await expect(page.locator('#tg-form-why .nw').first()).toHaveCSS('white-space', 'nowrap');
  await tick(page).check();
  await page.locator('#save-btn').click();
  await login(page);
  await expect(dialog(page)).toContainText('ตามสถานะในชีต');
  expect(await sheetStatus(page, a)).toBe('กำลังทดสอบ'); // the sheet is saved first
  expect(await patches(page)).toBe(0);
  await dialog(page).getByRole('button', { name: 'ส่งไป Taiga' }).click();
  await expect(page).toHaveURL(/#\/taiga$/);
  expect(await taigaOf(page, 1)).toBe('Ready for test');
  await expect(rowOf(page, a).locator('.tg-taiga')).toContainText('Ready for test'); // not the older log
  await openItem(page, a);
  await expect(tick(page)).toBeChecked(); // remembered
  await page.locator('#save-btn').click(); // no change in the sheet: only checks Taiga
  await expect(page.locator('.toast').last()).toContainText('อยู่แล้ว');
  expect(await patches(page)).toBe(1);
});

test('form tick: without the tick Taiga is not called; cancelling keeps the sheet save', async ({ page }) => {
  const [a] = await setup(page, { map: FORM_MAP });
  await openItem(page, a);
  await page.locator('#f-status').selectOption('กำลังทดสอบ');
  await expect(tick(page)).toBeVisible();
  await page.locator('#save-btn').click();
  await expect(page).toHaveURL(/#\/taiga$/);
  expect(await page.evaluate(() => window.__taiga.calls.length)).toBe(0);
  await openItem(page, a);
  await page.locator('#f-status').selectOption('ส่งกลับนักพัฒนาแก้ไข');
  await tick(page).check();
  await page.locator('#save-btn').click();
  await expect(page.getByLabel('รหัสผ่าน Taiga')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.toast').last()).toContainText('ยังไม่ได้ปรับ Taiga');
  expect(await sheetStatus(page, a)).toBe('ส่งกลับนักพัฒนาแก้ไข');
  expect(await patches(page)).toBe(0);
});

test('form tick: says why it cannot send, keeps typed text, and passes axe', async ({ page }) => {
  const [a] = await setup(page, { map: FORM_MAP });
  await openItem(page, a);
  await page.locator('#f-detail').fill('ข้อความที่กำลังพิมพ์');
  await page.locator('#f-status').selectOption('dev ขอ Sourecode อจ.');
  await expect(tick(page)).toBeDisabled();
  await expect(page.locator('#tg-form-sync')).toContainText('ยังไม่จับคู่');
  await page.locator('#f-ticket').fill('12345');
  await expect(tick(page)).toHaveCount(0);
  await page.locator('#f-ticket').fill('https://taiga.example/project/sync/us/2');
  await expect(page.locator('#tg-form-sync')).toContainText('ลิงก์ Taiga นี้'); // used by another item
  await expect(page.locator('#f-detail')).toHaveValue('ข้อความที่กำลังพิมพ์');
  const axe = await new AxeBuilder({ page }).include('#tg-form-sync').analyze();
  expect(axe.violations).toEqual([]);
});

test('form tick: hidden for an item without a Taiga link', async ({ page }) => {
  await setup(page, { map: FORM_MAP });
  const seq = await page.evaluate(
    () =>
      window.__mockSheet.rows.find(
        (r) => /^\d+$/.test(r.seq) && r.detail && !/taiga/i.test(r.ticket) && !(r.ticketLinks || []).length,
      ).seq,
  );
  await openItem(page, seq);
  await page.waitForTimeout(500);
  await expect(tick(page)).toHaveCount(0);
});

test('form tick: a new item is saved first, then sent to its Taiga link', async ({ page }) => {
  await setup(page, { map: FORM_MAP });
  await page.evaluate(() => {
    window.__taiga.items['sync/us/99'] = { id: 999, version: 1, status: 'New' };
  });
  await page.evaluate(() => (location.hash = '#/new'));
  await page.selectOption('#f-platform', 'NHIP');
  await page.selectOption('#f-issueType', 'Requement');
  await page.fill('#f-system', 'เวชระเบียน');
  await page.fill('#f-detail', 'ทดสอบเพิ่มรายการพร้อม Taiga');
  await page.locator('input[name="pm-pick"]').first().check();
  await expect(tick(page)).toHaveCount(0);
  await page.locator('#f-ticket').fill('https://taiga.example/project/sync/us/99');
  await page.locator('#f-status').selectOption('กำลังทดสอบ');
  await tick(page).check();
  await page.locator('#save-btn').click();
  await login(page);
  await expect(dialog(page)).toContainText('"Ready for test"');
  await dialog(page).getByRole('button', { name: 'ส่งไป Taiga' }).click();
  await expect(page).toHaveURL(/#\/items\/\d+$/);
  expect(await taigaOf(page, 99)).toBe('Ready for test');
  expect(await page.evaluate(() => window.__taigaLog.length)).toBe(1);
});

test('Escape never counts as yes, also after an earlier question was answered yes', async ({ page }) => {
  const [a, , c] = await setup(page);
  await pushButton(page, a).click();
  await login(page);
  await dialog(page).getByRole('button', { name: 'ส่งไป Taiga' }).click();
  await expect(rowOf(page, a).locator('.tg-sync-match')).toBeVisible();
  expect(await patches(page)).toBe(1);
  await pushButton(page, c).click();
  await expect(dialog(page)).toContainText('ตามสถานะในชีต');
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await page.waitForTimeout(500);
  expect(await patches(page)).toBe(1);
});

test('form tick: the box has the size of a checkbox and sits next to its text', async ({ page }) => {
  const [a] = await setup(page, { map: FORM_MAP });
  await openItem(page, a);
  const box = await tick(page).boundingBox();
  expect(box.width).toBeLessThanOrEqual(24);
  const status = await page.locator('#f-status').boundingBox();
  expect(Math.abs(box.x - status.x)).toBeLessThan(8);
});

// The นักพัฒนา page: a tick next to "เปลี่ยนสถานะ" (user request 2026-11-26).
test('นักพัฒนา card tick: the sheet is saved first, then Taiga after a person confirms', async ({ page }) => {
  const dev = 'นักพัฒนา แดง';
  const [a] = await setup(page, { map: FORM_MAP, dev });
  await page.goto('/#/my-work');
  const card = page.locator('.work', { hasText: '#' + a + ' ' }).first();
  const box = card.getByLabel('ปรับ Taiga ด้วย');
  await expect(box).not.toBeChecked(); // nothing is sent unless the person ticks it
  await card.locator('select[name="to"]').selectOption('กำลังทดสอบ');
  await box.check();
  await card.getByRole('button', { name: 'เปลี่ยนสถานะ' }).click();
  await login(page);
  await expect(dialog(page)).toContainText('ตามสถานะในชีต');
  expect(await sheetStatus(page, a)).toBe('กำลังทดสอบ');
  expect(await patches(page)).toBe(0);
  await dialog(page).getByRole('button', { name: 'ส่งไป Taiga' }).click();
  await expect.poll(() => taigaOf(page, 1)).toBe('Ready for test');
  await openItem(page, a);
  await expect(tick(page)).toBeChecked(); // one remembered choice for both places
});

test('the back button has an arrow icon and the accent colour', async ({ page }) => {
  const [a] = await setup(page);
  await openItem(page, a);
  const back = page.getByRole('button', { name: 'กลับ', exact: true }).first();
  await expect(back.locator('svg')).toBeVisible();
  const bg = await back.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).not.toBe('rgb(255, 255, 255)');
});
