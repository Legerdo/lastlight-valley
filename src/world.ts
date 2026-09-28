/** Canonical walkable surfaces and solid props. The renderer consumes these same records. */
export interface V2 { x: number; z: number; }
export interface Solid { x: number; z: number; w: number; d: number; kind: 'house' | 'tree' | 'pillar' | 'rock'; h: number; variant?: number; }
export const SEED = 20260929;
export const NPC: V2 = { x: -2.7, z: 29 };
export const LANTERNS: V2[] = [{ x: -3.6, z: 2.1 }, { x: 3.2, z: -30.5 }];
export const ALTAR: V2 = { x: 0, z: -65.5 };
export const SPAWN: V2 = { x: 0, z: 33 };
export const CAMERA_YAW = Math.atan2(9, 14);
export const RIGHT = { x: Math.cos(CAMERA_YAW), z: -Math.sin(CAMERA_YAW) };
export const FORWARD = { x: -Math.sin(CAMERA_YAW), z: -Math.cos(CAMERA_YAW) };

export const SOLIDS: Solid[] = [
  { x: -10.3, z: 31, w: 7, d: 5.7, h: 4, kind: 'house', variant: 0 },
  { x: 10.2, z: 24, w: 7.5, d: 6, h: 4.4, kind: 'house', variant: 1 },
  { x: -11.2, z: 15.7, w: 6.2, d: 5.5, h: 3.5, kind: 'house', variant: 2 },
  { x: 11, z: 37, w: 5.8, d: 4.8, h: 3.5, kind: 'house', variant: 0 },
];
const trees = [
  [-17, 38], [-16, 25], [-17, 10], [17, 15], [16, 31], [6, 40], [-6, 39],
  [-10, 6], [9, 7], [-14, 1], [12, 0], [-8, -3], [8, -2], [-16, -5], [17, -6],
  [-10, -19], [9, -20], [-16, -23], [15, -25], [-11, -30], [12, -33], [-16, -36], [17, -36],
  [-6.8, -25], [7.7, -36], [-10.3, -38], [-17, -16], [17, -17], [-18, 20], [18, 4],
];
trees.forEach(([x, z], i) => SOLIDS.push({ x, z, w: 0.95, d: 0.95, h: 5.8 + i % 3 * 0.4, kind: 'tree', variant: i < 7 ? 1 : 0 }));
for (const z of [-50, -57, -65, -71]) for (const x of [-11.5, 11.5]) SOLIDS.push({ x, z, w: 1.6, d: 1.6, h: z === -57 && x > 0 ? 2.1 : 5.5, kind: 'pillar' });
for (const x of [-7.3, 7.3]) SOLIDS.push({ x, z: -70.8, w: 1.6, d: 1.6, h: 5.5, kind: 'pillar' });
for (const [x, z] of [[-15, -43], [14, -40], [-13, -28], [13, -17], [-8, 22], [7, 13], [-13, -64]]) SOLIDS.push({ x, z, w: 1.7, d: 1.5, h: 1.2, kind: 'rock' });

/** Undefined means water/cliff. Stair risers, not an invisible ramp, set the foot height. */
export function heightAt(x: number, z: number): number | undefined {
  if (Math.abs(x) > 18.5 || z > 41 || z < -73) return undefined;
  if (z < -40 && z > -48) {
    if (Math.abs(x) > 4.5) return undefined;
    return Math.min(2.4, Math.floor((-40 - z) / 0.8 + 1) * 0.24);
  }
  if (z <= -48) return Math.abs(x) < 15 ? 2.4 : undefined;
  if (z < -5 && z > -15) return Math.abs(x) < 2.05 ? 0.9 : undefined;
  if (Math.abs(x) < 2.4 && z <= -2 && z >= -5) return (-2 - z) * 0.3;
  if (Math.abs(x) < 2.4 && z <= -15 && z >= -18) return (z + 18) * 0.3;
  return 0;
}

export function walkable(x: number, z: number, radius = 0.3): boolean {
  if (heightAt(x, z) === undefined) return false;
  for (const [dx, dz] of [[radius, 0], [-radius, 0], [0, radius], [0, -radius]]) if (heightAt(x + dx, z + dz) === undefined) return false;
  for (const b of SOLIDS) {
    if (Math.abs(x - b.x) < b.w / 2 + radius && Math.abs(z - b.z) < b.d / 2 + radius) return false;
  }
  // The shrine's raised altar is solid; it is activated from its front, not walked through.
  if (Math.abs(x - ALTAR.x) < 1.45 + radius && Math.abs(z - ALTAR.z) < 1.15 + radius) return false;
  for (const lamp of LANTERNS) if (Math.hypot(x - lamp.x, z - lamp.z) < 0.78 + radius) return false;
  for (const lx of [-5.5, 5.5]) if (Math.abs(x - lx) < 0.325 + radius && Math.abs(z + 67.5) < 0.325 + radius) return false;
  return true;
}

export function move(body: V2, dx: number, dz: number, radius = 0.3): void {
  // Substeps preserve collisions during dashes and at low display frame rates.
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.12));
  for (let i = 0; i < n; i++) {
    const allowed = (x: number, z: number) => walkable(x, z, radius) && Math.abs((heightAt(x, z) ?? -99) - (heightAt(body.x, body.z) ?? 0)) <= 0.3;
    if (allowed(body.x + dx / n, body.z)) body.x += dx / n;
    if (allowed(body.x, body.z + dz / n)) body.z += dz / n;
  }
}
export function distance(a: V2, b: V2): number { return Math.hypot(a.x - b.x, a.z - b.z); }
export function normalize(x: number, z: number): V2 { const n = Math.hypot(x, z); return n > 0.0001 ? { x: x / n, z: z / n } : { x: 0, z: -1 }; }
export function region(z: number): string { return z > 8 ? '황혼의 마을' : z > -40 ? '물안개의 숲' : '잊힌 등불의 신전'; }

export const ENCOUNTERS: { kind: 'wolf' | 'wraith'; x: number; z: number; group: number }[] = [
  { kind: 'wolf', x: -2, z: 10, group: 0 }, { kind: 'wolf', x: 3, z: 5, group: 0 },
  { kind: 'wraith', x: 4.5, z: 0, group: 0 }, { kind: 'wolf', x: -5.5, z: -1, group: 0 },
  { kind: 'wraith', x: -3, z: -21, group: 1 }, { kind: 'wolf', x: 3, z: -22, group: 1 },
  { kind: 'wolf', x: -2, z: -28, group: 1 }, { kind: 'wraith', x: 5, z: -29, group: 1 },
  { kind: 'wolf', x: -3.5, z: -35, group: 1 }, { kind: 'wolf', x: 3.5, z: -37, group: 1 },
  { kind: 'wraith', x: -5, z: -33, group: 1 },
];
