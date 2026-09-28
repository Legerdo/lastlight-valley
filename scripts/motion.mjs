import { writeFile, mkdir } from 'node:fs/promises';
import { boot, Controller, state } from './qa.mjs';
const dir = 'evidence/motion'; await mkdir(dir, { recursive: true });
const { browser, context, page, errors } = await boot(dir, true);
const control = new Controller(page), frames = [], samples = [], checks = {};
let failure;
async function capture(name, delay = 80, clip = { x: 620, y: 340, width: 640, height: 520 }) {
  await page.waitForTimeout(delay);
  const data = await page.screenshot({ path: `${dir}/${String(frames.length).padStart(3, '0')}-${name}.png`, clip });
  frames.push({ name, data: data.toString('base64') });
  samples.push({ name, wallTime: Date.now(), state: await state(page) });
}
try {
  await page.getByRole('button', { name: /불씨를 들고 떠나기/ }).click(); await page.waitForTimeout(2450);
  for (const key of ['KeyD', 'KeyW', 'KeyA', 'KeyS']) {
    await control.keys([key]);
    for (let i = 0; i < 4; i++) await capture(`walk-${key}-${i}`);
  }
  await control.release();
  let s = await state(page); await control.aim(s.player.x + 2, s.player.z - 1);
  await control.attack(true);
  for (let i = 0; i < 8; i++) await capture(`attack-${i}`, 55);
  await control.attack(false); await page.waitForTimeout(600);
  await control.keys(['KeyD']); await page.keyboard.press('Space');
  for (let i = 0; i < 6; i++) await capture(`dodge-${i}`, 35);
  await control.release();
  // A complete, normally traversed line passes behind the near-side tree trunk and canopy.
  await control.navigate(0, 36.6); await control.navigate(-8.8, 36.6);
  for (let i = 0; i < 11; i++) {
    await control.move(1, 0);
    await capture(`foreground-${i}`, 130, { x: 350, y: 170, width: 1120, height: 780 });
  }
  await control.release();
  await page.keyboard.press('KeyP'); await page.waitForTimeout(250); await page.screenshot({ path: `${dir}/effects-off.png` });
  checks.effectsOff = !(await page.evaluate(() => window.__LASTLIGHT__.stats())).effects;
  await page.keyboard.press('KeyP');
  await page.keyboard.press('KeyM'); checks.mute = await page.getByRole('button', { name: '음소거' }).getAttribute('aria-pressed');
  await page.keyboard.press('Escape'); await page.waitForTimeout(120);
  const before = await state(page); await page.keyboard.down('KeyW'); await page.waitForTimeout(400); await page.keyboard.up('KeyW');
  const after = await state(page); checks.pauseFreezesPlayer = before.player.x === after.player.x && before.player.z === after.player.z;
  await page.getByRole('button', { name: '여정 계속하기' }).click();
  checks.resume = !(await state(page)).paused;
  // Contact sheets contain actual consecutive browser screenshots, not redrawn motion.
  const groups = [['walking', frames.slice(0,16)], ['attack-dodge', frames.slice(16,30)], ['occlusion', frames.slice(30)]];
  for (const [name, group] of groups) {
    const png = await page.evaluate(async entries => {
      const cols = 4, cw = 400, ch = 325;
      const canvas = document.createElement('canvas'); canvas.width = cols * cw; canvas.height = Math.ceil(entries.length / cols) * ch;
      const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.fillStyle = '#162b35'; ctx.fillRect(0,0,canvas.width,canvas.height);
      for (let i = 0; i < entries.length; i++) {
        const image = new Image(); image.src = `data:image/png;base64,${entries[i].data}`; await image.decode();
        const x = i % cols * cw, y = Math.floor(i / cols) * ch;
        ctx.drawImage(image, x, y + 22, cw, ch - 22); ctx.fillStyle = '#ecd4a6'; ctx.font = '12px monospace'; ctx.fillText(entries[i].name, x + 8, y + 15);
      }
      return canvas.toDataURL('image/png').split(',')[1];
    }, group);
    await writeFile(`${dir}/${name}-contact.png`, Buffer.from(png, 'base64'));
  }
} catch (e) { failure = e.stack ?? String(e); console.error(failure); }
finally {
  await control.release().catch(() => {});
  const video = page.video(); await context.close();
  if (video) await video.saveAs(`${dir}/motion.webm`);
  await writeFile(`${dir}/report.json`, JSON.stringify({ failure, errors, checks, video: `${dir}/motion.webm`, capture: 'Normal real-time browser input and actual screenshot sequences; 1280x720 video also recorded. Contact sheets are only overview; originals retained.', samples }, null, 2));
  await browser.close(); if (failure || errors.length) process.exitCode = 1;
}
