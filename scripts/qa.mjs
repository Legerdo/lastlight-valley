import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

export const URL = process.env.GAME_URL ?? 'http://127.0.0.1:4173';
export async function boot(dir, video = false) {
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1' });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1,
    ...(video ? { recordVideo: { dir: `${dir}/video`, size: { width: 1280, height: 720 } } } : {}) });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto(URL, { waitUntil: 'networkidle' }); await page.waitForFunction(() => Boolean(window.__LASTLIGHT__));
  return { browser, context, page, errors };
}
export const state = page => page.evaluate(() => window.__LASTLIGHT__.state());
const yaw = Math.atan2(9, 14), c = Math.cos(yaw), s = Math.sin(yaw);
export class Controller {
  held = new Set(); down = false; dodgeAt = 0; log = [];
  constructor(page) { this.page = page; }
  async keys(list) {
    const wanted = new Set(list);
    for (const key of this.held) if (!wanted.has(key)) await this.page.keyboard.up(key);
    for (const key of wanted) if (!this.held.has(key)) await this.page.keyboard.down(key);
    this.held = wanted;
  }
  async move(dx, dz) {
    const len = Math.hypot(dx, dz); if (len < 0.05) { await this.keys([]); return; }
    const x = (dx * c - dz * s) / len, y = (-dx * s - dz * c) / len;
    const a = Math.atan2(y, x), index = (Math.round(a / (Math.PI / 4)) + 8) % 8;
    await this.keys([['KeyD'], ['KeyD', 'KeyW'], ['KeyW'], ['KeyW', 'KeyA'], ['KeyA'], ['KeyA', 'KeyS'], ['KeyS'], ['KeyS', 'KeyD']][index]);
  }
  async aim(x, z) {
    const p = await this.page.evaluate(({ x, z }) => window.__LASTLIGHT__.project(x, z), { x, z });
    await this.page.mouse.move(Math.max(1, Math.min(1919, p.x)), Math.max(1, Math.min(1079, p.y)));
  }
  async attack(down) {
    if (this.down === down) return;
    if (down) await this.page.mouse.down(); else await this.page.mouse.up();
    this.down = down;
  }
  async release() { await this.keys([]); await this.attack(false); }
  async navigate(x, z, tolerance = 0.6, timeout = 30000) {
    await this.attack(false); const end = Date.now() + timeout;
    while (Date.now() < end) {
      const s = await state(this.page); if (s.phase === 'dead') throw new Error('Died during traversal');
      if (s.phase === 'boss-intro') { await this.release(); await this.page.waitForTimeout(3100); continue; }
      const dx = x - s.player.x, dz = z - s.player.z;
      if (Math.hypot(dx, dz) <= tolerance) { await this.keys([]); return; }
      await this.move(dx, dz); await this.page.waitForTimeout(90);
    }
    await this.release(); const s = await state(this.page); throw new Error(`Traversal stuck: target ${x},${z}; player ${s.player.x},${s.player.z}`);
  }
  async fight(group, { capture, limit = 240000, untilMs = 0, measure = false } = {}) {
    const begin = Date.now(), end = begin + limit; let captured = false, perfStart = 0, measured = false, lastHp = 120, lastAi = '', trace = [];
    while (Date.now() < end) {
      const s = await state(this.page), p = s.player;
      if (group === 2) {
        const bossState = s.enemies.find(e => e.kind === 'guardian');
        if (p.hp !== lastHp || bossState.ai !== lastAi) {
          trace.push({ wallSeconds: (Date.now() - begin) / 1000, player: p, boss: bossState, pulses: s.pulses, projectiles: s.projectiles });
          await mkdir('evidence/diagnostics', { recursive: true });
          await writeFile('evidence/diagnostics/boss-input-trace.json', JSON.stringify(trace, null, 2));
          lastHp = p.hp; lastAi = bossState.ai;
        }
      }
      if (measure && !perfStart && Date.now() - begin >= 5000) { await this.page.evaluate(() => window.__LASTLIGHT__.perfReset()); perfStart = Date.now(); }
      if (perfStart && !measured && Date.now() - perfStart >= 30000) {
        const stats = await this.page.evaluate(() => window.__LASTLIGHT__.stats());
        const frameTimes = await this.page.evaluate(() => window.__LASTLIGHT__.frameTimes());
        await mkdir('evidence/performance', { recursive: true });
        await writeFile('evidence/performance/combat-30s.json', JSON.stringify({ ...stats, durationSeconds: (Date.now() - perfStart) / 1000, combatPhase: s.phase, bossHp: s.enemies.find(e => e.kind === 'guardian')?.hp, recordingVideo: process.env.VIDEO !== '0', frameTimes }, null, 2));
        measured = true; console.log(`30s performance: ${stats.averageFPS.toFixed(1)} FPS, p95 ${stats.p95FrameMs.toFixed(2)}ms`);
      }
      if (s.phase === 'dead') { await this.release(); throw new Error(`Player died in group ${group}: ${JSON.stringify({ elapsed: s.elapsed, hp: p.hp, remaining: s.enemies.filter(e => e.group === group && e.hp > 0).map(e => [e.kind, e.hp]) })}`); }
      if (s.phase === 'boss-intro') { await this.release(); await this.page.waitForTimeout(3000); continue; }
      const enemies = s.enemies.filter(e => e.group === group && e.hp > 0).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
      if (!enemies.length || untilMs && Date.now() - begin >= untilMs) { await this.release(); return; }
      const e = enemies[0], dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz), boss = e.kind === 'guardian';
      await this.aim(e.x, e.z);
      // During a locked-on fan tell, walk around the target rather than roll early into its muzzle.
      // Stop swinging while waiting for the wave: input buffering should not hide a bad test tactic.
      if (boss && e.ai === 'windup') {
        await this.attack(false);
        if (e.pattern % 2 !== 0) await this.move(-dz, dx);
        else if (d < 2.6) await this.move(-dx, -dz);
        else await this.keys([]);
        await this.page.waitForTimeout(65);
        continue;
      }
      let escape = null;
      for (const enemy of enemies) {
        const dd = Math.hypot(enemy.x - p.x, enemy.z - p.z);
        if (enemy.ai === 'windup' && enemy.timer < 0.25 && dd < (enemy.kind === 'wolf' ? 4 : 7) && enemy.kind !== 'guardian') {
          escape = { x: -(enemy.z - p.z), z: enemy.x - p.x };
        }
      }
      for (const ring of s.pulses) {
        const dd = Math.hypot(ring.x - p.x, ring.z - p.z);
        if (dd - ring.radius > -0.2 && dd - ring.radius < 1.65) escape = { x: ring.x - p.x, z: ring.z - p.z };
      }
      for (const b of s.projectiles) if (Math.hypot(b.x - p.x, b.z - p.z) < 1.65 && (p.x - b.x) * b.vx + (p.z - b.z) * b.vz > 0) escape = { x: -b.vz, z: b.vx };
      if (escape && p.cooldown <= 0 && Date.now() - this.dodgeAt > 650) {
        await this.move(escape.x, escape.z); await this.page.keyboard.press('Space'); this.dodgeAt = Date.now();
      } else if (p.action !== 'dodge') {
        if (d > (boss ? 2.45 : 1.75)) await this.move(dx, dz); else await this.keys([]);
      }
      await this.attack(d < (boss ? 2.65 : 2.02));
      if (capture && !captured && Date.now() - begin > 3800 && p.action === 'attack' && (!boss || p.z > e.z + 0.2 || Math.abs(p.x - e.x) > 1.5)) { await this.page.screenshot({ path: capture }); captured = true; }
      await this.page.waitForTimeout(80);
    }
    await this.release(); throw new Error(`Combat timeout group ${group}`);
  }
}
