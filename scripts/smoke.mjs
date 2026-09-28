import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const dir = 'evidence/initial';
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.goto(process.env.GAME_URL ?? 'http://127.0.0.1:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${dir}/title.png` });
  await page.getByRole('button', { name: /불씨를 들고 떠나기/ }).click();
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${dir}/village.png` });
  const stats = await page.evaluate(() => window.__LASTLIGHT__.stats());
  const state = await page.evaluate(() => window.__LASTLIGHT__.state());
  const sheet = await page.evaluate(() => window.__LASTLIGHT__.sheets().find(s => s.kind === 'hero'));
  await writeFile(`${dir}/hero-original.png`, Buffer.from(sheet.png.split(',')[1], 'base64'));
  const report = { errors, stats, state, browser: browser.version() };
  await writeFile(`${dir}/smoke.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ errors, stats, phase: state.phase, hero: state.player, browser: browser.version() }, null, 2));
} finally { await browser.close(); }
