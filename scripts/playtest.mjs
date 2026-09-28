import { writeFile, mkdir } from 'node:fs/promises';
import { boot, state, Controller, URL } from './qa.mjs';
const dir = process.env.EVIDENCE_DIR ?? 'evidence/final-playthrough'; await mkdir(dir, { recursive: true });
const { browser, context, page, errors } = await boot(dir, process.env.VIDEO !== '0');
const control = new Controller(page), checkpoints = [], startAt = Date.now(); let outcome = 'failed', failure = '';
const checkpoint = async name => { const s = await state(page); checkpoints.push({ name, wallSeconds: (Date.now() - startAt) / 1000, ...s }); console.log(`${name}: ${s.phase}, ${s.elapsed.toFixed(1)}s, HP ${s.player.hp}, kills ${s.kills}`); await writeFile(`${dir}/progress.json`, JSON.stringify(checkpoints, null, 2)); };
try {
  await page.screenshot({ path: `${dir}/01-title.png` });
  await page.getByRole('button', { name: /불씨를 들고 떠나기/ }).click(); await page.waitForTimeout(2500);
  await page.screenshot({ path: `${dir}/02-village.png` });
  await control.navigate(-2, 30.5); await page.keyboard.press('KeyE'); await page.waitForTimeout(250);
  if ((await state(page)).phase !== 'dialogue') throw new Error('Guide dialogue did not open');
  await page.keyboard.press('KeyE'); await page.waitForTimeout(120); await checkpoint('guide');
  await control.navigate(0, 20.5);
  await control.fight(0, { capture: `${dir}/03-forest-combat.png` }); await checkpoint('south-cleared');
  await control.navigate(-3.5, 3.4); await page.keyboard.press('KeyE'); await page.waitForTimeout(200);
  if (!(await state(page)).lit[0]) throw new Error('South lantern failed');
  await checkpoint('south-lit');
  await control.navigate(0, 0); await control.navigate(0, -3.7); await control.navigate(0, -10);
  await page.screenshot({ path: `${dir}/04-bridge.png` });
  await control.navigate(0, -18.5);
  await control.fight(1, { capture: `${dir}/05-north-forest.png` }); await checkpoint('north-cleared');
  await control.navigate(3.1, -29.1); await page.keyboard.press('KeyE'); await page.waitForTimeout(250);
  if (!(await state(page)).lit[1]) throw new Error('North lantern failed');
  await checkpoint('north-lit');
  await control.navigate(0, -38.5); await control.navigate(0, -45);
  await page.screenshot({ path: `${dir}/06-stairs.png` }); await control.navigate(0, -50.5);
  await page.waitForTimeout(3000); await page.screenshot({ path: `${dir}/07-boss-arrival.png` });
  await control.fight(2, { capture: `${dir}/08-boss-combat.png`, limit: 240000, measure: true }); await checkpoint('guardian-defeated');
  await control.navigate(0, -63.1); await page.keyboard.press('KeyE'); await page.waitForTimeout(3300);
  if ((await state(page)).phase !== 'victory') throw new Error('Altar did not complete the run');
  await page.screenshot({ path: `${dir}/09-victory.png` }); await checkpoint('victory');
  await page.getByRole('button', { name: /다시 계곡으로/ }).click(); await page.waitForTimeout(2450);
  const restart = await state(page); if (restart.phase !== 'play' || restart.player.hp !== 120 || restart.kills !== 0 || restart.lit.some(Boolean)) throw new Error('Victory restart was not clean');
  await checkpoint('victory-restart');
  // Death is caused by normal enemy attacks. No HP/state/time mutation is used.
  await control.navigate(0, 12.5); await control.release();
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline && (await state(page)).phase !== 'dead') await page.waitForTimeout(300);
  if ((await state(page)).phase !== 'dead') throw new Error('Death flow did not trigger');
  await page.waitForTimeout(1100); await page.screenshot({ path: `${dir}/10-death.png` }); await checkpoint('death');
  await page.getByRole('button', { name: /다시 불씨를 들기/ }).click(); await page.waitForTimeout(2450);
  const afterDeath = await state(page); if (afterDeath.phase !== 'play' || afterDeath.player.hp !== 120 || afterDeath.kills !== 0) throw new Error('Death restart failed');
  await checkpoint('death-restart');
  if (errors.length) throw new Error(errors.join('\n'));
  outcome = 'passed';
} catch (e) {
  failure = e.stack ?? String(e); console.error(failure);
  await control.release().catch(() => {}); await page.screenshot({ path: `${dir}/failure.png` }).catch(() => {});
  await checkpoint('failure').catch(() => {});
} finally {
  const report = { outcome, failure, url: URL, evidence: 'Production URL, normal keyboard/mouse input, read-only state observation; no forced victory or dev scene entry.', errors, checkpoints, browser: browser.version(), stats: await page.evaluate(() => window.__LASTLIGHT__.stats()).catch(() => null) };
  await writeFile(`${dir}/report.json`, JSON.stringify(report, null, 2)); await context.close(); await browser.close();
  if (outcome !== 'passed') process.exitCode = 1;
}
