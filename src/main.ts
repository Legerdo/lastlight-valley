import './style.css';
import { Game, emptyInput } from './simulation.ts';
import { View } from './render.ts';
import { UI } from './ui.ts';
import { AudioScene } from './audio.ts';

const ui = new UI(), game = new Game(), sound = new AudioScene();
let view: View;
try { view = new View(ui.canvas); }
catch (error) { ui.showError(`그래픽을 시작하지 못했습니다. Chrome의 하드웨어 가속을 확인해 주세요. ${error instanceof Error ? error.message : String(error)}`); throw error; }
const keys = new Set<string>(), input = emptyInput();
const pointer = { x: innerWidth * 0.53, y: innerHeight * 0.43, down: false };
let dodge = false, interact = false, skip = false, accumulator = 0, previous = performance.now(), lastUI = 0;
const clearInput = () => { keys.clear(); pointer.down = false; dodge = interact = skip = false; };
const start = () => { clearInput(); game.start(); sound.start().then(() => sound.click()).catch(console.error); };
ui.onStart(start);
try { sound.setMuted(localStorage.getItem('lastlight-muted') === '1'); } catch { /* Storage is optional. */ }
ui.setMuted(sound.muted);
const toggleMute = () => { sound.setMuted(!sound.muted); ui.setMuted(sound.muted); try { localStorage.setItem('lastlight-muted', sound.muted ? '1' : '0'); } catch { /* Private mode. */ } };
document.getElementById('mute')!.addEventListener('click', toggleMute);
document.getElementById('pause')!.addEventListener('click', () => { if (game.phase === 'play') { game.paused = !game.paused; clearInput(); } });
window.addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys.add(e.code); if (e.repeat) return;
  if (e.code === 'Space') { dodge = true; skip = true; }
  if (e.code === 'KeyE') interact = true;
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyH') ui.help = !ui.help;
  if (e.code === 'KeyP') view.effects = !view.effects;
  if (e.code === 'Escape' && game.phase === 'play') { game.paused = !game.paused; clearInput(); }
  if (e.code === 'Enter' && ['title', 'dead', 'victory'].includes(game.phase)) start();
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('pointermove', e => { pointer.x = e.clientX; pointer.y = e.clientY; });
ui.canvas.addEventListener('pointerdown', e => { if (e.button === 0) { pointer.down = true; sound.start().catch(console.error); } });
window.addEventListener('pointerup', e => { if (e.button === 0) pointer.down = false; });
ui.canvas.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('blur', () => { clearInput(); if (game.phase === 'play') game.paused = true; });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); if (game.phase === 'play') game.paused = true; } previous = performance.now(); accumulator = 0; });
window.addEventListener('resize', () => view.resize());
function frame(now: number) {
  const realDt = Math.min((now - previous) / 1000, 0.1); previous = now;
  accumulator += realDt;
  input.x = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  input.y = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
  input.aim = view.aim(pointer.x, pointer.y, game.player); input.attack = pointer.down;
  while (accumulator >= 1 / 60) {
    input.dodge = dodge; input.interact = interact; input.skip = skip;
    game.update(1 / 60, input); dodge = interact = skip = false; accumulator -= 1 / 60;
  }
  for (const event of game.events) sound.event(event);
  if (game.phase === 'play' && !game.paused) sound.tick(game.player.moving, game.time);
  view.update(game, realDt, now);
  if (now - lastUI > 40) { ui.update(game, view); lastUI = now; }
  requestAnimationFrame(frame);
}
ui.update(game, view); requestAnimationFrame(frame);

// Read-only runtime observation is intentionally also present in the production build.
// QA sends normal keyboard/mouse input; no set-health, advance-time or force-win API exists.
const observation = Object.freeze({
  state: () => game.snapshot(),
  stats: () => view.stats(),
  project: (x: number, z: number, elevation = 0) => view.project(x, z, elevation),
  sheets: () => [...view.sheets].map(([kind, s]) => ({ kind, size: s.size, foot: s.foot, width: s.canvas.width, height: s.canvas.height, frames: s.frames, png: s.canvas.toDataURL('image/png') })),
  perfReset: () => { view.frameTimes.length = 0; },
  frameTimes: () => [...view.frameTimes],
  animation: () => ({ action: game.player.action, animationSeconds: game.player.anim, anchor: { x: game.player.x, y: game.snapshot().player.y, z: game.player.z } }),
});
Object.defineProperty(window, '__LASTLIGHT__', { value: observation, writable: false });
if (import.meta.env.DEV) {
  // Explicit scene entry is limited to development, never used by the full-run test.
  const scene = new URLSearchParams(location.search).get('scene');
  if (scene === 'forest' || scene === 'boss') {
    game.start(); game.phase = 'play'; game.talked = true;
    game.player.x = 0; game.player.z = scene === 'forest' ? 5 : -53;
    if (scene === 'boss') { game.lit = [true, true]; game.bossAwake = true; }
  }
}
