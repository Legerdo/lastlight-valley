import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, emptyInput, ATTACK_HIT } from '../src/simulation.ts';
import { ALTAR, heightAt, move, walkable } from '../src/world.ts';

test('bridge, water and ramps use the visible support surface', () => {
  assert.equal(heightAt(0, -10), 0.9); assert.equal(heightAt(3, -10), undefined);
  assert.equal(walkable(3, -10), false); assert.ok(Math.abs(heightAt(0, -3.5)! - 0.45) < 1e-9);
  const p = { x: 0, z: 0 }; move(p, 0, -20); assert.ok(Math.abs(p.z + 20) < 0.01);
  const edge = { x: 1.5, z: -10 }; move(edge, 20, 0); assert.ok(edge.x < 1.76);
});
test('stairs have monotone physical risers and connect to the temple', () => {
  let last = 0; for (let z = -40.1; z >= -48; z -= 0.2) { const y = heightAt(0, z)!; assert.ok(y >= last); last = y; }
  const p = { x: 0, z: -39 }; move(p, 0, -11); assert.ok(Math.abs(p.z + 50) < 0.01); assert.equal(heightAt(p.x, p.z), 2.4);
  assert.equal(walkable(7, -44), false);
});
test('buildings, tree trunks, columns and altar are solid', () => {
  assert.equal(walkable(-10.3, 31), false); assert.equal(walkable(-6, 39), false);
  assert.equal(walkable(-7.3, -70.8), false); assert.equal(walkable(ALTAR.x, ALTAR.z), false);
});
test('attack damage starts on the active beat, not on button down', () => {
  const g = new Game(); g.phase = 'play'; g.player.x = 0; g.player.z = 12;
  const e = g.enemies[0]; e.x = 0; e.z = 10.5; g.enemies = [e]; e.timer = 99;
  const input = emptyInput(); input.aim = { x: 0, z: 10.5 }; input.attack = true;
  g.update(1 / 60, input); input.attack = false;
  const hp = e.hp; for (let i = 0; i < 8; i++) g.update(1 / 60, input); assert.equal(e.hp, hp);
  for (let i = 0; i < 8; i++) g.update(1 / 60, input); assert.ok(e.hp < hp); assert.ok(g.player.actionTime >= ATTACK_HIT);
});
test('dodge grants a bounded invulnerability interval', () => {
  const g = new Game(); g.phase = 'play'; g.enemies = [];
  const input = emptyInput(); input.dodge = true; input.y = 1; g.update(1 / 60, input); input.dodge = false;
  g.damagePlayer(20, { x: g.player.x + 1, z: g.player.z }); assert.equal(g.player.hp, 120);
  for (let i = 0; i < 30; i++) g.update(1 / 60, input);
  g.damagePlayer(20, { x: g.player.x + 1, z: g.player.z }); assert.equal(g.player.hp, 100);
});
test('victory requires a defeated guardian and an altar interaction', () => {
  const g = new Game(); g.phase = 'play'; g.player.x = 0; g.player.z = ALTAR.z + 2.5;
  g.interact(); assert.equal(g.phase, 'play');
  g.bossDefeated = true; g.interact(); assert.equal(g.phase, 'victory');
});
test('restart resets combat, progression and player state', () => {
  const g = new Game(); g.lit = [true, true]; g.player.hp = 0; g.phase = 'dead'; g.kills = 12; g.start();
  assert.equal(g.phase, 'intro'); assert.equal(g.player.hp, 120); assert.deepEqual(g.lit, [false, false]); assert.equal(g.kills, 0); assert.equal(g.enemies.length, 12);
});

test('actors cannot rest inside a guardian and lantern plinths are solid', () => {
  const g = new Game(); g.phase = 'play'; g.bossAwake = true; g.player.x = 0; g.player.z = -57.1;
  g.resolveActorContacts(); assert.ok(Math.hypot(g.player.x - g.boss.x, g.player.z - g.boss.z) >= 1.39);
  assert.equal(walkable(-3.6, 2.1), false); assert.equal(walkable(3.2, -30.5), false);
});
