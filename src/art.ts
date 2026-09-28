/** All raster art is authored here, at source resolution. No downloaded visual assets.
 * Seed is only for placing authored grass/stone clusters, never for replacing silhouettes.
 * Every actor frame has the same canvas and a stable foot anchor.
 */
import * as THREE from 'three';

export type ActorKind = 'hero' | 'guide' | 'wolf' | 'wraith' | 'guardian';
export type Action = 'idle' | 'walk' | 'attack' | 'dodge' | 'hurt' | 'death';
export const ACTIONS: Action[] = ['idle', 'walk', 'attack', 'dodge', 'hurt', 'death'];
export const FRAME_COUNTS: Record<Action, number> = { idle: 4, walk: 8, attack: 7, dodge: 6, hurt: 3, death: 7 };
export const ART_SEED = 0x1a57_1197;
const P = {
  ink: '#14252f', deep: '#233946', blue: '#355361', teal: '#407d83', mint: '#8fcbc0',
  cream: '#f8deb0', skin: '#dfa583', blush: '#b86a62', hair: '#d6daca', hairShade: '#88a9ab',
  gold: '#ecb15d', goldLight: '#ffe2a0', rust: '#b4654c', red: '#813d40',
  leather: '#513e39', leatherLight: '#866149', iron: '#76959b', ice: '#c5e7df',
};

export function random(seed = ART_SEED): () => number {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
}

export class Pixels {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  constructor(public w: number, public h: number) {
    this.canvas = document.createElement('canvas'); this.canvas.width = w; this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d')!; this.ctx.imageSmoothingEnabled = false;
  }
  rect(x: number, y: number, w: number, h: number, color: string) {
    this.ctx.fillStyle = color; this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  dot(x: number, y: number, color: string, n = 1) { this.rect(x, y, n, n, color); }
  line(x: number, y: number, xx: number, yy: number, color: string, width = 1) {
    x = Math.round(x); y = Math.round(y); xx = Math.round(xx); yy = Math.round(yy);
    const dx = Math.abs(xx - x), sx = x < xx ? 1 : -1, dy = -Math.abs(yy - y), sy = y < yy ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 1000; guard++) {
      this.rect(x - Math.floor(width / 2), y - Math.floor(width / 2), width, width, color);
      if (x === xx && y === yy) break;
      const e = 2 * err; if (e >= dy) { err += dy; x += sx; } if (e <= dx) { err += dx; y += sy; }
    }
  }
  poly(points: number[][], color: string) {
    // Scanline rasterization: every edge is hard, with no canvas antialiasing fringe.
    const min = Math.floor(Math.min(...points.map(p => p[1]))), max = Math.ceil(Math.max(...points.map(p => p[1])));
    for (let y = min; y <= max; y++) {
      const xs: number[] = [];
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i], b = points[j];
        if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i < xs.length; i += 2) this.rect(Math.ceil(xs[i]), y, Math.floor(xs[i + 1]) - Math.ceil(xs[i]) + 1, 1, color);
    }
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, color: string) {
    for (let y = -Math.ceil(ry); y <= ry; y++) {
      const x = Math.floor(rx * Math.sqrt(Math.max(0, 1 - y * y / (ry * ry))));
      this.rect(cx - x, cy + y, x * 2 + 1, 1, color);
    }
  }
}

const gait = [0, 2, 4, 2, 0, -2, -4, -2];
function heroFrame(p: Pixels, action: Action, frame: number, direction: number, guide = false) {
  // Directions: south, east, north, west. West is the authored east pose mirrored.
  if (direction === 3) { p.ctx.translate(64, 0); p.ctx.scale(-1, 1); direction = 1; }
  const side = direction === 1, back = direction === 2;
  const walk = action === 'walk', attack = action === 'attack', dodge = action === 'dodge';
  const dead = action === 'death', hurt = action === 'hurt';
  const f = frame;
  if (dead && f >= 4) {
    const fall = f >= 6 ? 1 : 0;
    p.poly([[17, 52], [20, 46 + fall], [30, 45 + fall], [37, 48], [45, 49], [47, 54], [18, 55]], P.ink);
    p.rect(19, 48, 15, 5, P.teal); p.rect(24, 47, 8, 3, P.hairShade);
    p.rect(31, 50, 7, 4, P.rust); p.rect(39, 51, 8, 3, P.leather); p.line(33, 55, 55, 55, P.iron, 2);
    return;
  }
  const stride = walk ? gait[f % 8] : 0;
  const down = dodge ? [2, 7, 10, 9, 6, 2][f] : dead ? f * 3 : hurt ? [1, 3, 1][f] : walk ? (f % 4 === 1 || f % 4 === 2 ? 1 : 0) : f === 2 ? 1 : 0;
  const lean = attack ? [0, -1, 1, 4, 3, 2, 0][f] : dodge ? [0, 2, 4, 3, 2, 0][f] : hurt ? [-2, -4, -1][f] : 0;
  const x = 32 + lean, y = 30 + down;
  const cloak = guide ? '#745e77' : P.teal, light = guide ? '#b48a94' : P.mint;
  const capeSwing = walk ? Math.sign(stride) * 2 : attack ? (f < 3 ? -4 : 5) : (f % 2);
  // Hood and layered travelling cape, silhouette first, two deliberate interior planes.
  p.poly([[x - 9, y - 5], [x + 7, y - 5], [x + 11 + capeSwing, 48], [x + 3, 51], [x - 4, 47], [x - 11, 49], [x - 9, y + 5]], P.ink);
  p.poly([[x - 7, y - 4], [x + 5, y - 3], [x + 8 + capeSwing, 46], [x + 3, 48], [x - 2, 44], [x - 8, 46]], cloak);
  p.line(x - 7, y, x - 8, 43, light, 2);
  p.poly([[x + 3, y], [x + 6, y + 1], [x + 8 + capeSwing, 46], [x + 3, 48]], P.blue);
  // Legs use distinct planted/airborne frames. Foot origin never moves.
  const knee = dodge ? 4 : 0;
  if (side) {
    p.line(x - 3, 42, x - 4 - stride, 50 - Math.max(0, stride), P.ink, 5);
    p.line(x + 2, 42, x + 3 + stride, 51 - Math.max(0, -stride), P.ink, 5);
    p.line(x - 3, 42, x - 4 - stride, 49 - Math.max(0, stride), P.leatherLight, 3);
    p.line(x + 2, 42, x + 3 + stride, 50 - Math.max(0, -stride), P.leather, 3);
    p.rect(x - 6 - stride, 51 - Math.max(0, stride), 7, 3, P.ink);
    p.rect(x + stride, 52 - Math.max(0, -stride), 8, 3, P.ink);
  } else {
    p.rect(x - 6 - knee, 43, 5, 9 - Math.max(0, stride), P.ink);
    p.rect(x + 1 + knee, 43, 5, 9 - Math.max(0, -stride), P.ink);
    p.rect(x - 5 - knee, 44, 3, 6 - Math.max(0, stride), P.leatherLight);
    p.rect(x + 2 + knee, 44, 3, 6 - Math.max(0, -stride), P.leather);
    p.rect(x - 7 - knee, 52 - Math.max(0, stride), 6, 3, P.ink);
    p.rect(x + 1 + knee, 52 - Math.max(0, -stride), 7, 3, P.ink);
    p.dot(x - 6 - knee, 52 - Math.max(0, stride), P.iron, 2);
  }
  // Tunic, leather belt and amber clasps.
  p.rect(x - 6, y - 1, side ? 10 : 13, 13 - Math.min(7, down), P.ink);
  p.rect(x - 4, y, side ? 7 : 9, 9 - Math.min(5, down), back ? cloak : P.cream);
  p.rect(x - 6, 40 + Math.min(2, down), 13, 3, P.leather);
  p.rect(x - 1, 40 + Math.min(2, down), 3, 2, P.gold);
  if (!back) p.line(x - 4, y, x + 4, 40, P.leatherLight, 2);
  // Head: irregular hair locks and visible front/back distinction, no circles as heads.
  const hx = x + (side ? 2 : 0), hy = y - 13;
  p.poly([[hx - 7, hy - 2], [hx - 4, hy - 5], [hx + 4, hy - 5], [hx + 8, hy - 1], [hx + 8, hy + 8], [hx + 4, hy + 12], [hx - 5, hy + 11], [hx - 9, hy + 6]], P.ink);
  p.poly([[hx - 6, hy - 2], [hx - 3, hy - 4], [hx + 3, hy - 4], [hx + 6, hy - 1], [hx + 6, hy + 8], [hx + 2, hy + 10], [hx - 5, hy + 9], [hx - 7, hy + 4]], back ? P.hairShade : P.skin);
  if (back) {
    p.poly([[hx - 6, hy - 2], [hx + 3, hy - 4], [hx + 6, hy], [hx + 5, hy + 8], [hx + 2, hy + 6], [hx, hy + 10], [hx - 3, hy + 7], [hx - 6, hy + 9]], P.hair);
    p.line(hx - 5, hy, hx - 5, hy + 5, P.ice, 2);
  } else {
    p.poly([[hx - 7, hy], [hx - 3, hy - 4], [hx + 4, hy - 3], [hx + 6, hy], [hx + 4, hy + 4], [hx + 1, hy + 2], [hx - 1, hy + 6], [hx - 3, hy + 3], [hx - 5, hy + 8], [hx - 7, hy + 5]], P.hair);
    p.rect(hx - 5, hy - 1, 6, 2, P.ice);
    if (side) { p.rect(hx + 4, hy + 5, 2, 3, P.ink); p.dot(hx + 7, hy + 7, P.cream, 2); }
    else { p.rect(hx - 3, hy + 5, 2, 3, P.ink); p.rect(hx + 4, hy + 5, 2, 3, P.ink); p.dot(hx - 3, hy + 5, P.ice); p.dot(hx + 4, hy + 5, P.ice); }
    p.rect(hx, hy + 9, 3, 1, P.blush);
  }
  // Asymmetrical scarf and fluttering tail.
  p.rect(x - 7, y - 3, 15, 4, P.rust); p.rect(x - 4, y - 3, 9, 2, P.gold);
  p.poly([[x - 6, y], [x - 9, y + 3], [x - 14 + capeSwing, y + 9], [x - 10 + capeSwing, y + 9], [x - 5, y + 3]], P.rust);
  if (guide) {
    p.line(x + 12, y - 8, x + 12, 55, P.ink, 3); p.line(x + 11, y - 8, x + 11, 53, P.leatherLight);
    p.rect(x + 8, y - 11, 7, 8, P.gold); p.rect(x + 10, y - 9, 3, 4, P.goldLight);
  } else {
    // Weapon/arm is rasterized anew in every attack pose, including anticipation/recovery.
    const angles = side ? [-1.8, -2.3, -0.9, 0.15, 0.8, 0.6, 0.3] : back ? [-2.1, -2.5, -1.6, -0.8, 0.2, 0.4, 0.2] : [-1.3, -1.9, -0.5, 0.65, 1.3, 1.1, 0.65];
    const a = attack ? angles[f] : dodge ? 0.1 : 1.2;
    const shoulderX = x + 6, shoulderY = y + 3, armX = shoulderX + (attack ? 6 : 2), armY = shoulderY + (attack ? Math.sin(a) * 5 : 7);
    p.line(shoulderX, shoulderY, armX, armY, P.ink, 5); p.line(shoulderX, shoulderY, armX, armY, cloak, 3);
    p.dot(armX - 1, armY - 1, P.cream, 3);
    const length = 14, tipX = armX + Math.cos(a) * length, tipY = armY + Math.sin(a) * length;
    p.line(armX, armY, tipX, tipY, P.ink, 5); p.line(armX, armY, tipX, tipY, P.iron, 3); p.line(armX, armY - 1, tipX, tipY - 1, P.ice);
    p.line(armX - Math.sin(a) * 3, armY + Math.cos(a) * 3, armX + Math.sin(a) * 3, armY - Math.cos(a) * 3, P.gold, 2);
    if (attack && (f === 3 || f === 4)) p.line(tipX - 5, tipY - 3, tipX, tipY - 2, P.goldLight, 2);
  }
}

function wolfFrame(p: Pixels, action: Action, f: number, dir: number) {
  const back = dir === 2; if (dir === 3) { p.ctx.translate(64, 0); p.ctx.scale(-1, 1); }
  const hit = action === 'hurt', dead = action === 'death', strike = action === 'attack';
  const stride = action === 'walk' ? gait[f % 8] : 0;
  const crouch = dead ? Math.min(9, f * 2) : strike ? [2, 4, 3, -2, -1, 1, 0][f] : hit ? 2 : 0;
  const y = 37 + crouch, lunge = strike && f === 3 ? 4 : 0;
  for (const [x, offset] of [[19, stride], [26, -stride], [39, -stride], [45, stride]]) {
    p.line(x, y + 4, x + offset, 53, P.ink, 4); p.line(x, y + 5, x + offset, 51, '#57634e', 2);
    p.rect(x + offset - 2, 53, 5, 2, P.cream);
  }
  p.poly([[10, y - 7], [18, y - 3], [22, y - 8], [35, y - 10], [45, y - 5], [50 + lunge, y + 4], [44, y + 11], [21, y + 10], [15, y + 3], [7, y]], P.ink);
  p.poly([[16, y - 3], [24, y - 6], [35, y - 8], [44, y - 3], [46, y + 5], [40, y + 9], [22, y + 7], [19, y + 1]], '#536753');
  p.poly([[19, y - 4], [28, y - 8], [37, y - 9], [41, y - 4], [33, y - 3], [30, y], [24, y - 1]], '#9dba79');
  p.line(23, y - 5, 26, y - 16, '#6e8260', 3); p.line(26, y - 13, 21, y - 16, '#b7c894', 2);
  const hx = (dir === 0 || back) ? 34 : 46 + lunge;
  p.poly([[hx - 8, y - 10], [hx - 9, y - 19], [hx - 2, y - 15], [hx + 6, y - 19], [hx + 7, y - 9], [hx + 11, y - 5], [hx + 9, y + 3], [hx, y + 6], [hx - 9, y + 1]], P.ink);
  p.poly([[hx - 6, y - 12], [hx - 2, y - 9], [hx + 4, y - 13], [hx + 6, y - 6], [hx + 9, y - 4], [hx + 6, y + 1], [hx - 2, y + 3], [hx - 6, y - 1]], back ? '#6c8567' : '#b4c7a0');
  if (!back) { p.rect(hx - 5, y - 6, 3, 2, '#efbc6b'); p.rect(hx + 3, y - 6, 3, 2, '#efbc6b'); p.rect(hx, y - 1, 4, 2, P.ink); }
  if (strike && f >= 3 && f <= 4) { p.rect(hx - 1, y + 2, 7, 3, P.ink); p.rect(hx, y + 2, 2, 2, P.cream); }
  if (dead) p.rect(hx - 5, y - 6, 12, 2, '#5c7562');
}

function wraithFrame(p: Pixels, action: Action, f: number, dir: number) {
  if (dir === 3) { p.ctx.translate(64, 0); p.ctx.scale(-1, 1); }
  const dead = action === 'death', attack = action === 'attack';
  if (dead && f >= 4) {
    p.poly([[18,53],[25,46],[34,47],[42,52],[48,54],[25,55]], P.ink);
    p.poly([[21,52],[27,48],[34,49],[42,53],[28,54]], '#806779');
    p.rect(28,46,7,4,'#c3c8b4'); p.rect(30,47,3,1,P.ink); return;
  }
  const y = 25 + (dead ? Math.min(4, f * 2) : f % 3 === 0 ? 1 : 0);
  const spread = attack ? [0, 2, 5, 9, 8, 5, 1][f] : 0;
  p.poly([[28, y - 7], [38, y - 5], [44, y + 10], [43 + spread, y + 19], [38, 53], [33, 48], [27, 54], [26, 46], [18 - spread, y + 18], [23, y + 5]], P.ink);
  p.poly([[28, y - 4], [36, y - 2], [41, y + 13], [38, 48], [33, 44], [28, 50], [29, y + 14], [22, y + 16]], '#68546e');
  p.poly([[26, y + 5], [30, y + 3], [28, y + 15], [24, y + 26], [21, y + 17]], '#a38a9c');
  p.line(32, y + 4, 34, 44, '#baa2b0', 2);
  p.poly([[25, y - 6], [28, y - 12], [35, y - 13], [40, y - 8], [38, y + 3], [32, y + 7], [26, y + 2]], P.ink);
  p.poly([[27, y - 6], [29, y - 10], [35, y - 11], [38, y - 7], [36, y + 2], [32, y + 4], [28, y]], dir === 2 ? '#81788a' : '#d9d2c1');
  if (dir !== 2) { p.rect(28, y - 5, 3, 2, P.ink); p.rect(34, y - 5, 3, 2, P.ink); p.line(32, y - 2, 33, y + 2, '#80747b'); }
  p.line(23, y + 8, 16 - spread, y + 17 - spread, P.ink, 4); p.line(40, y + 8, 46 + spread, y + 17 - spread, P.ink, 4);
  p.dot(14 - spread, y + 16 - spread, '#b4dcc7', 4); p.dot(44 + spread, y + 16 - spread, '#b4dcc7', 4);
  p.line(47, y + 14 - spread, 49, y + 24 - spread, '#9e8d71');
  p.rect(44, y + 23 - spread, 9, 7, P.ink); p.rect(46, y + 24 - spread, 5, 4, '#79cdb9');
  if (dead) p.rect(25, y, 13, 2, '#5c536a');
}

function guardianFrame(p: Pixels, action: Action, f: number, dir: number) {
  if (dir === 3) { p.ctx.translate(96, 0); p.ctx.scale(-1, 1); }
  const dead = action === 'death', attack = action === 'attack', walk = action === 'walk';
  const down = dead ? f * 3 : attack ? [2, 4, 6, -2, 2, 5, 1][f] : walk ? f % 2 : 0;
  const x = 48, y = 42 + down, stride = walk ? gait[f % 8] : 0;
  for (const [xx, s] of [[35, stride], [58, -stride]]) {
    p.poly([[xx - 6, y + 17], [xx + 7, y + 18], [xx + 6 + s, 81], [xx + 10 + s, 84], [xx - 9 + s, 85], [xx - 7 + s, 78]], P.ink);
    p.rect(xx - 4, y + 18, 8, Math.max(3, 77 - y - 18), '#607b7c'); p.rect(xx - 6 + s, 78, 12, 5, '#91a69a');
    p.line(xx - 5 + s, 82, xx + 5 + s, 82, '#bfd0b0');
  }
  p.poly([[27, y - 12], [40, y - 19], [57, y - 19], [70, y - 10], [66, y + 18], [58, y + 25], [37, y + 24], [29, y + 14]], P.ink);
  p.poly([[31, y - 10], [42, y - 15], [56, y - 15], [66, y - 8], [62, y + 17], [54, y + 20], [37, y + 19], [33, y + 10]], '#728d86');
  p.poly([[33, y - 10], [42, y - 15], [45, y - 12], [41, y + 15], [36, y + 17]], '#abc0a5');
  p.line(52, y - 10, 60, y - 2, '#304b55', 2); p.line(60, y - 2, 56, y + 10, '#304b55', 2);
  p.poly([[46, y - 9], [54, y - 5], [56, y + 3], [49, y + 12], [42, y + 2]], '#254a55');
  p.poly([[47, y - 6], [52, y - 3], [53, y + 2], [49, y + 8], [45, y + 1]], dead ? '#526d70' : '#8defd2');
  if (!dead) p.rect(48, y - 2, 3, 5, '#e2ffe7');
  const raise = attack ? [0, -7, -14, 7, 10, 7, 0][f] : 0;
  for (const side of [-1, 1]) {
    const ax = x + side * 25;
    p.poly([[ax - 8, y - 12], [ax + 8, y - 14], [ax + 11, y - 4], [ax + 7, y + 5], [ax - 7, y + 4], [ax - 11, y - 4]], P.ink);
    p.rect(ax - 7, y - 9, 14, 10, '#9faf92'); p.rect(ax - 6, y - 9, 10, 3, '#ccceb0');
    p.line(ax, y + 2, ax + side * 4, y + 19 + raise, P.ink, 11);
    p.line(ax - 1, y + 2, ax + side * 4 - 1, y + 17 + raise, '#648083', 7);
    p.rect(ax + side * 4 - 7, y + 16 + raise, 15, 11, P.ink); p.rect(ax + side * 4 - 5, y + 17 + raise, 10, 7, '#a1b19b');
  }
  const hy = y - 25;
  p.poly([[36, hy - 5], [40, hy - 10], [55, hy - 10], [61, hy - 3], [59, hy + 10], [50, hy + 16], [39, hy + 10]], P.ink);
  p.poly([[39, hy - 3], [42, hy - 7], [54, hy - 7], [58, hy - 2], [56, hy + 8], [50, hy + 12], [42, hy + 8]], '#a7b79d');
  p.poly([[49, hy - 7], [54, hy - 7], [58, hy - 2], [56, hy + 8], [50, hy + 12]], '#6e8b82');
  p.line(42, hy + 2, 47, hy + 3, dead ? '#445f66' : '#adffdf', 2); p.line(51, hy + 3, 56, hy + 2, dead ? '#445f66' : '#adffdf', 2);
  p.line(45, hy + 8, 53, hy + 8, P.ink, 2);
  // Branching crown, moss clusters and gold carved runes are part of the silhouette.
  for (const s of [-1, 1]) {
    p.line(48 + s * 10, hy - 5, 48 + s * 17, hy - 10, P.ink, 5);
    p.line(48 + s * 17, hy - 10, 48 + s * 15, hy - 12, '#93a28b', 3);
    p.line(48 + s * 17, hy - 10, 48 + s * 24, hy - 9, '#93a28b', 3);
  }
  p.rect(30, y - 13, 7, 3, '#749755'); p.rect(32, y - 15, 9, 2, '#aec07c');
  p.line(36, y, 39, y + 8, P.gold, 2);
}

export interface Sheet { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; size: number; foot: number; rows: number; frames: Record<Action, { row: number; count: number }>; }
export function createSheet(kind: ActorKind): Sheet {
  const size = kind === 'guardian' ? 96 : 72, foot = kind === 'guardian' ? 85 : 59;
  const cols = 8, rows = ACTIONS.length * 4;
  const atlas = new Pixels(size * cols, size * rows);
  const frames = {} as Sheet['frames'];
  ACTIONS.forEach((action, ai) => {
    frames[action] = { row: ai * 4, count: FRAME_COUNTS[action] };
    for (let d = 0; d < 4; d++) for (let f = 0; f < FRAME_COUNTS[action]; f++) {
      const p = new Pixels(size, size);
      if (kind !== 'guardian') p.ctx.translate(4, 4);
      if (kind === 'hero' || kind === 'guide') heroFrame(p, action, f, d, kind === 'guide');
      else if (kind === 'wolf') wolfFrame(p, action, f, d);
      else if (kind === 'wraith') wraithFrame(p, action, f, d);
      else guardianFrame(p, action, f, d);
      atlas.ctx.drawImage(p.canvas, f * size, (ai * 4 + d) * size);
    }
  });
  const texture = textureOf(atlas.canvas, false); texture.repeat.set(1 / cols, 1 / rows);
  return { canvas: atlas.canvas, texture, size, foot, rows, frames };
}

export function textureOf(canvas: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter; t.minFilter = repeat ? THREE.NearestMipmapLinearFilter : THREE.NearestFilter;
  t.generateMipmaps = repeat;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function makeTile(kind: 'grass' | 'path' | 'stone' | 'wall' | 'wood' | 'roof' | 'moss'): THREE.CanvasTexture {
  const p = new Pixels(96, 96), r = random(ART_SEED + kind.charCodeAt(0) * 731);
  if (kind === 'wood') {
    p.rect(0, 0, 96, 96, '#5c4941');
    for (let y = 0; y < 96; y += 16) {
      p.rect(0, y, 96, 1, '#2c3033'); p.rect(0, y + 2, 96, 2, '#a1805d');
      for (let n = 0; n < 6; n++) p.rect(r() * 90, y + 4 + r() * 8, 9 + r() * 16, 1, n % 2 ? '#7b614b' : '#493d39');
      p.rect(5, y + 6, 2, 2, '#282e31'); p.rect(88, y + 6, 2, 2, '#282e31');
    }
  } else if (kind === 'roof') {
    p.rect(0, 0, 96, 96, '#462f3b');
    for (let y = -12; y < 96; y += 12) for (let x = -12; x < 96; x += 24) {
      const xx = x + ((y / 12) % 2) * 12, col = ['#985e53', '#a66959', '#80504d', '#b57961'][Math.floor(r() * 4)];
      p.poly([[xx, y], [xx + 22, y], [xx + 21, y + 9], [xx + 17, y + 11], [xx + 3, y + 11], [xx, y + 8]], col);
      p.rect(xx + 2, y + 1, 18, 1, '#c08b70'); p.rect(xx + 3, y + 10, 14, 1, '#563e43');
    }
  } else if (kind === 'stone' || kind === 'wall') {
    p.rect(0, 0, 96, 96, '#3d5558');
    for (let y = 0; y < 96; y += 24) for (let x = -24; x < 96; x += 48) {
      const xx = x + (y / 24 % 2) * 24, c = ['#6f8580', '#819087', '#627c78', '#8d998b'][Math.floor(r() * 4)];
      p.poly([[xx + 2, y + 3], [xx + 43, y + 2], [xx + 46, y + 6], [xx + 44, y + 22], [xx + 4, y + 21]], c);
      p.rect(xx + 5, y + 4, 35, 2, '#aab09a'); p.rect(xx + 4, y + 20, 36, 2, '#526b68');
      if (r() < 0.7) { p.line(xx + 29, y + 4, xx + 23, y + 9, '#536c6b'); p.line(xx + 23, y + 9, xx + 24, y + 13, '#536c6b'); }
      if (kind === 'wall') p.rect(xx + 3, y + 19, 13, 3, '#5b765e');
    }
  } else {
    const base = kind === 'path' ? '#9a9176' : kind === 'moss' ? '#4b7065' : '#59775f';
    p.rect(0, 0, 96, 96, base);
    const colors = kind === 'path' ? ['#b2a58a', '#817e6b', '#cac09d', '#8f8b71'] : ['#638b67', '#73956a', '#446652', '#839e70'];
    for (let n = 0; n < 85; n++) {
      const x = Math.floor(r() * 96), y = Math.floor(r() * 96);
      if (kind === 'path') {
        p.poly([[x, y], [x + 8, y - 1], [x + 11, y + 3], [x + 9, y + 5], [x + 1, y + 4]], colors[n % 4]);
        p.line(x + 1, y, x + 6, y, '#bdb295');
      } else {
        p.rect(x, y, 3, 2, colors[n % 4]); p.rect(x + 2, y - 2, 2, 3, colors[n % 4]);
        if (n % 3 === 0) p.dot(x + 4, y + 2, colors[(n + 1) % 4], 2);
      }
    }
  }
  return textureOf(p.canvas);
}

export function treeArt(autumn = false): THREE.CanvasTexture {
  const p = new Pixels(144, 176), r = random(autumn ? 9531 : 4531);
  p.poly([[64, 170], [66, 93], [47, 59], [50, 50], [69, 74], [77, 40], [84, 42], [79, 90], [85, 155], [95, 174]], '#1d3839');
  p.line(72, 164, 72, 77, '#617158', 7); p.line(74, 92, 98, 63, '#394e43', 6);
  p.line(67, 113, 43, 90, '#243e3c', 5);
  const dark = autumn ? '#846044' : '#385e4d', mid = autumn ? '#b28a54' : '#57875d', light = autumn ? '#d0ab69' : '#91ae72';
  p.poly([[24,111],[9,106],[5,92],[11,80],[7,72],[15,62],[27,59],[24,48],[35,39],[47,37],[47,28],[61,16],[76,16],[83,7],[100,17],[107,33],[118,35],[130,46],[127,61],[137,76],[137,89],[128,100],[112,104],[102,117],[86,121],[77,114],[63,119],[51,112],[35,119]], dark);
  const clusters = [[31,88,22,17],[44,63,27,21],[67,35,23,19],[88,39,25,24],[104,69,29,21],[77,83,33,25],[58,104,25,16],[115,92,20,18]];
  for (const [cx, cy, rx, ry] of clusters) {
    p.poly([[cx-rx,cy],[cx-rx+4,cy-ry*.5],[cx-rx*.45,cy-ry*.6],[cx-rx*.4,cy-ry],[cx+rx*.2,cy-ry*.9],[cx+rx*.6,cy-ry*.55],[cx+rx,cy-ry*.15],[cx+rx*.8,cy+ry*.4],[cx+rx*.35,cy+ry*.5],[cx+rx*.1,cy+ry*.85],[cx-rx*.5,cy+ry*.6]], mid);
    for (let i = 0; i < 27; i++) {
      const x = cx + (r() - 0.5) * rx * 1.5, y = cy + (r() - 0.66) * ry * 1.3;
      p.poly([[x, y], [x + 4, y - 2], [x + 8, y], [x + 7, y + 3], [x + 2, y + 4], [x - 1, y + 2]], i % 5 === 0 ? dark : light);
      if (i % 3 === 0) p.rect(x + 1, y, 3, 1, autumn ? '#e7c38b' : '#b6c98e');
    }
  }
  p.line(69, 166, 77, 146, '#8a8e67', 2); p.line(78, 162, 81, 171, '#688369', 3);
  return textureOf(p.canvas, false);
}

export function plantArt(flower = false): THREE.CanvasTexture {
  const p = new Pixels(32, 32);
  for (const [x, top] of [[8, 14], [13, 7], [17, 11], [23, 15]]) {
    p.line(16, 31, x, top, '#507555', 2); p.line(x, top + 7, x - 5, top + 4, '#87a373', 2);
    p.line(x, top + 10, x + 6, top + 6, '#98b378', 2);
    if (flower) { p.rect(x - 2, top - 2, 5, 4, '#bca6bf'); p.rect(x, top - 1, 2, 2, '#ffe2a0'); }
  }
  return textureOf(p.canvas, false);
}

export function glowTexture(): THREE.CanvasTexture {
  const p = new Pixels(64, 64);
  const gradient = p.ctx.createRadialGradient(32, 32, 1, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(255,231,172,.8)'); gradient.addColorStop(0.2, 'rgba(255,197,119,.36)'); gradient.addColorStop(1, 'rgba(255,159,94,0)');
  p.ctx.fillStyle = gradient; p.ctx.fillRect(0, 0, 64, 64);
  const t = textureOf(p.canvas, false); t.magFilter = t.minFilter = THREE.LinearFilter; return t;
}

export function mistTexture(): THREE.CanvasTexture {
  const p = new Pixels(128, 64);
  const g = p.ctx.createRadialGradient(64, 32, 2, 64, 32, 62);
  g.addColorStop(0, 'rgba(216,239,228,.32)'); g.addColorStop(.45, 'rgba(196,225,221,.17)'); g.addColorStop(1, 'rgba(196,225,221,0)');
  p.ctx.fillStyle = g; p.ctx.fillRect(0, 0, 128, 64);
  const t = textureOf(p.canvas, false); t.magFilter = t.minFilter = THREE.LinearFilter; return t;
}
