import { ALTAR, CAMERA_YAW, ENCOUNTERS, FORWARD, LANTERNS, NPC, RIGHT, SPAWN, distance, heightAt, move, normalize, region } from './world.ts';
import type { V2 } from './world.ts';
import type { Action, ActorKind } from './art.ts';

export type Phase = 'title' | 'intro' | 'play' | 'dialogue' | 'boss-intro' | 'victory' | 'dead';
export interface Actor extends V2 {
  id: number; kind: ActorKind; hp: number; maxHp: number; action: Action; anim: number; facing: V2;
  actionTime: number; cooldown: number; invulnerable: number; moving: boolean;
}
export interface Enemy extends Actor {
  ai: 'idle' | 'chase' | 'windup' | 'strike' | 'recover' | 'dead';
  timer: number; target: V2; group: number; pattern: number; home: V2; hitDone: boolean;
}
export interface Projectile extends V2 { id: number; vx: number; vz: number; life: number; damage: number; radius: number; }
export interface Pulse extends V2 { id: number; radius: number; life: number; hit: boolean; maxRadius: number; }
export interface GameEvent extends V2 { type: 'swing' | 'hit' | 'hurt' | 'dodge' | 'death' | 'ignite' | 'boss' | 'win' | 'step' | 'cast'; dir: V2; strength: number; }
export interface Input { x: number; y: number; aim: V2; attack: boolean; dodge: boolean; interact: boolean; skip: boolean; }
export const emptyInput = (): Input => ({ x: 0, y: 0, aim: { x: 0, z: 28 }, attack: false, dodge: false, interact: false, skip: false });
export const ATTACK_TIME = 0.56, ATTACK_HIT = 0.19, DODGE_TIME = 0.32;

export class Game {
  phase: Phase = 'title'; paused = false; elapsed = 0; phaseTime = 0; time = 0; hitStop = 0;
  player: Actor = this.makeActor(0, 'hero', SPAWN.x, SPAWN.z, 120);
  enemies: Enemy[] = []; projectiles: Projectile[] = []; pulses: Pulse[] = []; events: GameEvent[] = [];
  lit = [false, false]; talked = false; bossAwake = false; bossDefeated = false;
  message = ''; messageTime = 0; kills = 0; dodges = 0; hitsTaken = 0; combo = 0; comboGrace = 0;
  attackHitDone = false; dodgeBuffer = 0; dodgeDirection: V2 = { x: 0, z: -1 }; nextId = 100;
  interaction = ''; region = region(SPAWN.z); regionAge = 0;
  constructor() { this.populate(); }
  makeActor(id: number, kind: ActorKind, x: number, z: number, hp: number): Actor {
    return { id, kind, x, z, hp, maxHp: hp, action: 'idle', anim: 0, facing: { x: 0, z: 1 }, actionTime: 0, cooldown: 0, invulnerable: 0, moving: false };
  }
  populate() {
    this.enemies = ENCOUNTERS.map((e, i) => ({ ...this.makeActor(i + 1, e.kind, e.x, e.z, e.kind === 'wolf' ? 78 : 91), ai: 'idle', timer: 0.6 + i % 4 * 0.23, target: { x: 0, z: 0 }, home: { x: e.x, z: e.z }, group: e.group, pattern: 0, hitDone: false }));
    this.enemies.push({ ...this.makeActor(50, 'guardian', 0, -57.5, 780), ai: 'idle', timer: 2, target: { x: 0, z: 0 }, home: { x: 0, z: -57.5 }, group: 2, pattern: 0, hitDone: false });
  }
  start() {
    const fresh = new Game(); Object.assign(this, fresh); this.phase = 'intro';
  }
  say(message: string, duration = 4) { this.message = message; this.messageTime = duration; }
  emit(type: GameEvent['type'], at: V2, strength = 1, dir = this.player.facing) {
    this.events.push({ type, x: at.x, z: at.z, dir: { ...dir }, strength });
  }
  get boss() { return this.enemies.find(e => e.kind === 'guardian')!; }
  get objective(): string {
    if (!this.talked) return '등불지기 연에게 말을 걸기';
    if (!this.lit[0]) { const left = this.enemies.filter(e => e.group === 0 && e.hp > 0).length; return left ? `남쪽 숲 · 남은 그림자 ${left}체` : '남쪽 길잡이 등불에 불씨 건네기'; }
    if (!this.lit[1]) { const left = this.enemies.filter(e => e.group === 1 && e.hp > 0).length; return left ? `다리 너머 북쪽 숲 · 남은 그림자 ${left}체` : '북쪽 길잡이 등불에 불씨 건네기'; }
    if (!this.bossAwake) return '계단을 올라 잊힌 신전으로';
    if (!this.bossDefeated) return '잠든 수호자를 안식으로 이끌기';
    return '신전의 등불에 마지막 불씨 건네기';
  }
  setAction(a: Actor, action: Action) {
    if (a.action !== action) { a.action = action; a.anim = 0; }
  }
  update(dt: number, input: Input) {
    this.time += dt; this.phaseTime += dt;
    if (this.paused) return;
    if (this.phase === 'title') return;
    if (this.phase === 'intro') { if (this.phaseTime > 2.1 || input.skip || input.interact) { this.phase = 'play'; this.phaseTime = 0; } return; }
    if (this.phase === 'dialogue') {
      if (input.interact || input.skip) { this.phase = 'play'; this.phaseTime = 0; this.talked = true; this.say('두 길잡이 등불을 잇고, 신전의 불씨를 되살리자.', 4); }
      return;
    }
    if (this.phase === 'boss-intro') { if (this.phaseTime > 2.8 || input.skip) { this.phase = 'play'; this.phaseTime = 0; } return; }
    if (this.phase === 'dead' || this.phase === 'victory') { this.player.anim += dt; this.enemies.filter(e => e.ai === 'dead').forEach(e => e.anim += dt); return; }
    this.elapsed += dt; this.regionAge += dt; this.messageTime = Math.max(0, this.messageTime - dt);
    if (input.dodge) this.dodgeBuffer = 0.14;
    if (this.hitStop > 0) { this.hitStop -= dt; return; }
    const p = this.player;
    p.anim += dt; p.invulnerable = Math.max(0, p.invulnerable - dt); p.cooldown = Math.max(0, p.cooldown - dt);
    this.dodgeBuffer = Math.max(0, this.dodgeBuffer - dt);
    this.comboGrace -= dt; if (this.comboGrace <= 0) this.combo = 0;
    const moveDir = normalize(RIGHT.x * input.x + FORWARD.x * input.y, RIGHT.z * input.x + FORWARD.z * input.y);
    const moving = Math.hypot(input.x, input.y) > 0.1;
    const aim = normalize(input.aim.x - p.x, input.aim.z - p.z);
    p.moving = false;
    if (this.dodgeBuffer > 0 && p.cooldown <= 0 && p.action !== 'dodge' && (p.action !== 'attack' || p.actionTime < ATTACK_HIT || p.actionTime > 0.33)) {
      this.setAction(p, 'dodge'); p.actionTime = 0; p.invulnerable = DODGE_TIME; p.cooldown = 0.78;
      this.dodgeDirection = moving ? moveDir : aim; p.facing = this.dodgeDirection; this.dodgeBuffer = 0; this.dodges++;
      this.emit('dodge', p, 1, this.dodgeDirection);
    }
    if (p.action === 'dodge') {
      p.actionTime += dt; move(p, this.dodgeDirection.x * 10.2 * dt, this.dodgeDirection.z * 10.2 * dt);
      if (p.actionTime >= DODGE_TIME) this.setAction(p, 'idle');
    } else if (p.action === 'attack') {
      p.actionTime += dt;
      if (p.actionTime >= ATTACK_HIT && !this.attackHitDone) { this.attackHitDone = true; this.strike(); }
      if (p.actionTime < 0.3 && p.actionTime > 0.14) move(p, p.facing.x * dt * 2.3, p.facing.z * dt * 2.3);
      if (p.actionTime >= ATTACK_TIME + (this.combo === 3 ? 0.09 : 0)) this.setAction(p, 'idle');
    } else if (p.action === 'hurt') {
      p.actionTime += dt; if (p.actionTime > 0.23) this.setAction(p, 'idle');
    } else {
      if (moving) {
        move(p, moveDir.x * dt * 3.8, moveDir.z * dt * 3.8); p.moving = true;
        this.setAction(p, 'walk'); p.facing = input.attack ? aim : moveDir;
      } else { this.setAction(p, 'idle'); p.facing = aim; }
      if (input.attack) {
        this.setAction(p, 'attack'); p.actionTime = 0; p.facing = aim; this.attackHitDone = false;
        this.combo = this.combo % 3 + 1; this.comboGrace = 1.3;
      }
    }
    for (const e of this.enemies) this.updateEnemy(e, dt);
    this.resolveActorContacts();
    for (const b of this.projectiles) {
      b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt;
      if (distance(p, b) < 0.35 + b.radius) { this.damagePlayer(b.damage, b); b.life = 0; }
    }
    this.projectiles = this.projectiles.filter(b => b.life > 0);
    for (const ring of this.pulses) {
      ring.life -= dt; ring.radius += dt * 6.5;
      if (!ring.hit && Math.abs(distance(p, ring) - ring.radius) < 0.46) { ring.hit = true; this.damagePlayer(25, ring); }
    }
    this.pulses = this.pulses.filter(r => r.life > 0 && r.radius < r.maxRadius);
    if (p.hp <= 0) return;
    const newRegion = region(p.z); if (newRegion !== this.region) { this.region = newRegion; this.regionAge = 0; }
    if (p.z < -49 && !this.bossAwake) {
      if (this.lit.every(Boolean)) {
        this.bossAwake = true; this.phase = 'boss-intro'; this.phaseTime = 0; this.boss.timer = 1.5; this.emit('boss', this.boss, 2);
        this.say('파동은 회피로 통과하세요. 공격 뒤 드러난 핵이 약점입니다.', 7);
      } else { p.z = -48.8; this.say('두 길잡이 등불이 신전의 봉인을 풀어 준다.'); }
    }
    this.updateInteraction();
    if (input.interact && this.interaction) this.interact();
  }
  strike() {
    const p = this.player, power = this.combo === 3 ? 2 : 1;
    this.emit('swing', p, power);
    for (const e of this.enemies) {
      if (e.hp <= 0 || (e.kind === 'guardian' && !this.bossAwake)) continue;
      const d = distance(p, e), dir = normalize(e.x - p.x, e.z - p.z);
      if (d > (e.kind === 'guardian' ? 2.8 : 2.2) || dir.x * p.facing.x + dir.z * p.facing.z < -0.02 || Math.abs((heightAt(e.x, e.z) ?? 0) - (heightAt(p.x, p.z) ?? 0)) > 0.9) continue;
      const damage = (this.combo === 3 ? 27 : this.combo === 2 ? 18 : 15) * (e.kind === 'guardian' && e.ai !== 'recover' ? 0.45 : 1);
      e.hp = Math.max(0, e.hp - Math.round(damage));
      this.hitStop = this.combo === 3 ? 0.075 : 0.045; e.invulnerable = 0.14;
      this.emit('hit', e, power, dir);
      if (e.kind !== 'guardian') {
        move(e, dir.x * (power === 2 ? 0.58 : 0.25), dir.z * (power === 2 ? 0.58 : 0.25), 0.34);
        if (e.ai === 'chase' || e.ai === 'idle' || e.ai === 'recover' || power === 2 && e.ai === 'windup') { e.ai = 'recover'; e.timer = power === 2 ? 0.7 : 0.3; this.setAction(e, 'hurt'); }
      }
      if (e.hp === 0) {
        e.ai = 'dead'; this.setAction(e, 'death'); e.anim = 0; this.kills++; this.emit('death', e, e.kind === 'guardian' ? 3 : 1);
        p.hp = Math.min(p.maxHp, p.hp + (e.kind === 'guardian' ? 25 : 7));
        if (e.kind === 'guardian') {
          this.bossDefeated = true; this.projectiles = []; this.pulses = [];
          this.say('수호자는 잠들었다. 신전의 등불에 불씨를 건네자.', 7);
        }
      }
    }
  }
  damagePlayer(amount: number, from: V2) {
    const p = this.player;
    if (p.invulnerable > 0 || this.phase !== 'play') return;
    p.hp = Math.max(0, p.hp - amount); this.hitsTaken++; p.invulnerable = 0.85;
    const dir = normalize(p.x - from.x, p.z - from.z);
    move(p, dir.x * 0.4, dir.z * 0.4); this.setAction(p, 'hurt'); p.actionTime = 0;
    this.hitStop = 0.065; this.emit('hurt', p, 1, dir);
    if (p.hp <= 0) { this.phase = 'dead'; this.phaseTime = 0; this.setAction(p, 'death'); p.anim = 0; this.emit('death', p); }
  }
  resolveActorContacts() {
    // Dodge can pass an enemy, but resting inside its silhouette is never a valid stance.
    const p = this.player;
    if (p.action === 'dodge' || p.hp <= 0) return;
    for (const e of this.enemies) {
      if (e.hp <= 0 || e.kind === 'guardian' && !this.bossAwake) continue;
      const min = e.kind === 'guardian' ? 1.4 : 0.72, d = distance(p, e);
      if (d < min) {
        const n = d < 0.001 ? { x: -p.facing.x, z: -p.facing.z } : normalize(p.x - e.x, p.z - e.z);
        move(p, n.x * (min - d), n.z * (min - d));
      }
    }
  }
  updateEnemy(e: Enemy, dt: number) {
    e.anim += dt; e.invulnerable = Math.max(0, e.invulnerable - dt); e.moving = false;
    if (e.ai === 'dead') return;
    const boss = e.kind === 'guardian';
    if (boss && !this.bossAwake) return;
    const p = this.player, d = distance(p, e), dir = normalize(p.x - e.x, p.z - e.z);
    if (!boss && (d > 10.5 || Math.abs((heightAt(p.x, p.z) ?? 0) - (heightAt(e.x, e.z) ?? 0)) > 1.2)) { this.setAction(e, 'idle'); return; }
    e.timer -= dt;
    if (e.ai === 'windup') {
      this.setAction(e, 'attack');
      if (e.timer <= 0) {
        e.ai = 'strike'; e.hitDone = false; e.timer = e.kind === 'wolf' ? 0.3 : 0.18;
        e.anim = e.kind === 'wolf' ? 0.27 : 0.4;
        if (e.kind === 'wraith') this.shoot(e, 1, 5.8);
        if (boss) {
          if (e.pattern % 2 === 0) { this.pulses.push({ id: this.nextId++, x: e.x, z: e.z, radius: 0.3, maxRadius: 8.5, life: 1.6, hit: false }); this.emit('hit', e, 3); }
          else this.shoot(e, e.hp < e.maxHp / 2 ? 7 : 5, 6.4);
        }
      }
    } else if (e.ai === 'strike') {
      if (e.kind === 'wolf') {
        const dash = normalize(e.target.x - e.x, e.target.z - e.z);
        move(e, dash.x * dt * 8.2, dash.z * dt * 8.2, 0.34);
        if (!e.hitDone && distance(p, e) < 1.05) { this.damagePlayer(14, e); e.hitDone = true; }
      }
      if (e.timer <= 0) { e.ai = 'recover'; e.timer = boss ? 1.6 : e.kind === 'wolf' ? 1.35 : 1.5; this.setAction(e, 'idle'); }
    } else if (e.ai === 'recover') {
      if (e.timer <= 0) { e.ai = 'chase'; this.setAction(e, 'idle'); }
    } else {
      e.facing = dir;
      const range = boss ? (e.pattern % 2 === 0 ? 4.6 : 8) : e.kind === 'wolf' ? 3 : 7.5;
      if (d <= range && e.timer <= 0) {
        e.ai = 'windup'; e.target = { x: p.x, z: p.z }; e.anim = 0;
        e.timer = boss ? (e.hp < e.maxHp / 2 ? 0.95 : 1.15) : e.kind === 'wolf' ? 0.7 : 1.05;
        this.setAction(e, 'attack'); e.pattern++;
        // Alternate after choosing the next attack; visible telegraphs read this canonical pattern.
      } else if (d > (boss ? 2.8 : e.kind === 'wolf' ? 1.8 : 5.3)) {
        e.ai = 'chase'; e.moving = true; this.setAction(e, 'walk');
        const speed = boss ? 1.35 : e.kind === 'wolf' ? 2.05 : 1.25;
        const old = { x: e.x, z: e.z };
        move(e, dir.x * speed * dt, dir.z * speed * dt, boss ? 0.75 : 0.32);
        if (distance(old, e) < dt * speed * 0.15) move(e, -dir.z * speed * dt, dir.x * speed * dt, boss ? 0.75 : 0.32);
        if (boss && e.z > -49.3) e.z = -49.3;
      } else this.setAction(e, 'idle');
    }
    // Gentle, symmetric local separation; prevents overlapping silhouettes and stun stacks.
    for (const other of this.enemies) {
      if (other.id >= e.id || other.hp <= 0 || boss || other.kind === 'guardian') continue;
      const sep = distance(e, other);
      if (sep < 0.88 && sep > 0.001) { const v = normalize(e.x - other.x, e.z - other.z); move(e, v.x * dt * 1.2, v.z * dt * 1.2, 0.32); }
    }
  }
  shoot(e: Enemy, count: number, speed: number) {
    const angle = Math.atan2(e.target.z - e.z, e.target.x - e.x);
    for (let i = 0; i < count; i++) {
      const a = angle + (i - (count - 1) / 2) * 0.23;
      this.projectiles.push({ id: this.nextId++, x: e.x, z: e.z, vx: Math.cos(a) * speed, vz: Math.sin(a) * speed, radius: e.kind === 'guardian' ? 0.32 : 0.25, damage: e.kind === 'guardian' ? 19 : 13, life: 3 });
    }
    this.emit('cast', e, e.kind === 'guardian' ? 2 : 1);
  }
  updateInteraction() {
    const p = this.player; this.interaction = '';
    if (distance(p, NPC) < 2.7) this.interaction = '등불지기 연과 대화';
    LANTERNS.forEach((l, i) => { if (!this.lit[i] && distance(p, l) < 2.3) this.interaction = `${i === 0 ? '남쪽' : '북쪽'} 길잡이 등불 켜기`; });
    if (this.bossDefeated && distance(p, ALTAR) < 3.3) this.interaction = '마지막 불씨 건네기';
  }
  interact() {
    const p = this.player;
    if (distance(p, NPC) < 2.7) { this.phase = 'dialogue'; this.phaseTime = 0; return; }
    for (let i = 0; i < LANTERNS.length; i++) {
      if (distance(p, LANTERNS[i]) >= 2.3 || this.lit[i]) continue;
      if (this.enemies.some(e => e.group === i && e.hp > 0)) { this.say('아직 숲의 그림자가 등불을 붙잡고 있다. 주변의 적을 물리치자.'); return; }
      this.lit[i] = true; p.hp = p.maxHp; this.talked = true; this.emit('ignite', LANTERNS[i], 2);
      this.say(i === 0 ? '남쪽 등불이 살아났다. 다리 너머에도 빛을 전하자.' : '두 불빛이 이어졌다. 신전의 봉인이 풀린다.', 5); return;
    }
    if (this.bossDefeated && distance(p, ALTAR) < 3.3) { this.phase = 'victory'; this.phaseTime = 0; this.emit('win', ALTAR, 3); }
  }
  snapshot() {
    return {
      phase: this.phase, paused: this.paused, elapsed: this.elapsed, region: this.region,
      player: { ...this.player, y: heightAt(this.player.x, this.player.z) },
      enemies: this.enemies.map(e => ({ ...e, y: heightAt(e.x, e.z) })),
      projectiles: this.projectiles, pulses: this.pulses, lit: [...this.lit], talked: this.talked,
      bossAwake: this.bossAwake, bossDefeated: this.bossDefeated, interaction: this.interaction,
      kills: this.kills, hitsTaken: this.hitsTaken, dodges: this.dodges,
    };
  }
}

export function facingIndex(facing: V2): number {
  const screenX = facing.x * RIGHT.x + facing.z * RIGHT.z;
  const screenUp = facing.x * FORWARD.x + facing.z * FORWARD.z;
  return Math.abs(screenX) > Math.abs(screenUp) ? (screenX > 0 ? 1 : 3) : screenUp > 0 ? 2 : 0;
}
