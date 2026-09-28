import type { Game } from './simulation.ts';
import type { View } from './render.ts';

export class UI {
  canvas: HTMLCanvasElement; root: HTMLElement; help = false; lastPhase = '';
  private hud: HTMLElement; private hp: HTMLElement; private hpText: HTMLElement; private objective: HTMLElement;
  private region: HTMLElement; private message: HTMLElement; private interaction: HTMLElement; private boss: HTMLElement;
  private bossFill: HTMLElement; private overlay: HTMLElement; private bars: HTMLElement; private controls: HTMLElement;
  private shade: HTMLElement; private mute: HTMLButtonElement; private startCallback = () => {};
  constructor() {
    this.root = document.getElementById('app')!;
    this.root.innerHTML = `
      <canvas id="scene" aria-label="잔광의 계곡 게임 화면"></canvas>
      <div id="vignette" aria-hidden="true"></div><div id="hit-flash" aria-hidden="true"></div>
      <div class="letterbox top"></div><div class="letterbox bottom"></div>
      <section id="hud" aria-label="게임 상태">
        <div class="vitals"><span class="portrait" aria-hidden="true">✦</span><div class="vitals-body"><div class="vitals-label"><strong>불씨지기</strong><span id="hp-text">120 / 120</span></div><div class="health-track"><i id="health-fill"></i></div><div class="dash-hint" id="dash-hint">회피 준비</div></div></div>
        <div class="quest"><span class="quest-symbol" aria-hidden="true">◇</span><div><small id="chapter">되살아날 빛</small><p id="objective"></p></div></div>
      </section>
      <div id="enemy-bars" aria-hidden="true"></div>
      <div id="region" aria-live="polite"></div>
      <section id="boss-hud" aria-label="보스 상태"><small>잊힌 등불의 수호자</small><h2>이끼 왕관, 오르</h2><div class="boss-track"><i id="boss-fill"></i></div></section>
      <div id="message" role="status"></div>
      <div id="interaction"></div>
      <div id="controls"><span><kbd>W A S D</kbd> 이동</span><span><kbd>마우스</kbd> 조준 · <kbd>좌클릭</kbd> 연속 공격</span><span><kbd>Space</kbd> 회피</span><span><kbd>E</kbd> 대화 · 등불</span></div>
      <div id="utility"><button id="help" aria-label="조작 안내">조작 <kbd>H</kbd></button><button id="mute" aria-label="음소거">소리 켜짐 <kbd>M</kbd></button><button id="pause" aria-label="일시정지">멈춤 <kbd>Esc</kbd></button></div>
      <div id="overlay"></div>
      <div id="fatal" role="alert" hidden></div>`;
    this.canvas = document.getElementById('scene') as HTMLCanvasElement;
    const el = (id: string) => document.getElementById(id)!;
    this.hud = el('hud'); this.hp = el('health-fill'); this.hpText = el('hp-text'); this.objective = el('objective'); this.region = el('region');
    this.message = el('message'); this.interaction = el('interaction'); this.boss = el('boss-hud'); this.bossFill = el('boss-fill');
    this.overlay = el('overlay'); this.bars = el('enemy-bars'); this.controls = el('controls'); this.shade = el('hit-flash'); this.mute = el('mute') as HTMLButtonElement;
    document.getElementById('help')!.addEventListener('click', () => this.help = !this.help);
  }
  onStart(cb: () => void) { this.startCallback = cb; }
  setMuted(muted: boolean) { this.mute.innerHTML = `${muted ? '소리 꺼짐' : '소리 켜짐'} <kbd>M</kbd>`; this.mute.setAttribute('aria-pressed', String(muted)); }
  showError(error: string) { const e = document.getElementById('fatal')!; e.hidden = false; e.textContent = error; }
  update(game: Game, view: View) {
    const p = game.player, title = game.phase === 'title', cinematic = ['intro', 'boss-intro'].includes(game.phase);
    this.root.classList.toggle('cinematic', cinematic); this.root.classList.toggle('title-screen', title);
    this.hud.hidden = title || cinematic || game.phase === 'victory';
    this.hp.style.transform = `scaleX(${p.hp / p.maxHp})`; this.hpText.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
    document.getElementById('dash-hint')!.textContent = p.cooldown > 0 ? '회피 회복 중' : '회피 준비';
    this.hp.classList.toggle('critical', p.hp / p.maxHp < 0.3);
    this.objective.textContent = game.objective;
    document.getElementById('chapter')!.textContent = game.lit.filter(Boolean).length < 2 ? `길잡이 등불 ${game.lit.filter(Boolean).length} / 2` : '마지막 불씨';
    this.region.textContent = cinematic && game.phase === 'boss-intro' ? '이끼 왕관, 오르' : game.region;
    this.region.classList.toggle('show', !title && ((game.regionAge < 3.5 && game.phase === 'play') || game.phase === 'boss-intro'));
    this.boss.hidden = !(game.bossAwake && !game.bossDefeated && game.phase === 'play'); this.bossFill.style.transform = `scaleX(${game.boss.hp / game.boss.maxHp})`;
    this.message.textContent = game.messageTime > 0 && game.phase === 'play' ? game.message : '';
    this.message.classList.toggle('show', Boolean(this.message.textContent));
    this.interaction.innerHTML = game.interaction && game.phase === 'play' ? `<kbd>E</kbd> ${game.interaction}` : '';
    this.controls.classList.toggle('show', !title && !cinematic && (this.help || game.elapsed < 17));
    this.shade.style.opacity = p.action === 'hurt' ? '0.35' : '0';
    if (view.contextLost) this.showError('그래픽 연결이 끊겼습니다. 연결이 복구되면 자동으로 이어집니다.');
    else document.getElementById('fatal')!.hidden = true;
    this.bars.innerHTML = game.phase === 'play' ? game.enemies.filter(e => e.hp > 0 && e.hp < e.maxHp && e.kind !== 'guardian').map(e => {
      const v = view.project(e.x, e.z, 1.85); return v.visible ? `<div class="enemy-bar" style="transform:translate(${Math.round(v.x)}px,${Math.round(v.y)}px)"><i style="transform:scaleX(${e.hp / e.maxHp})"></i></div>` : '';
    }).join('') : '';
    const overlayState = game.paused ? 'paused' : game.phase;
    const ready = game.phase === 'dead' ? game.phaseTime > 0.85 : game.phase === 'victory' ? game.phaseTime > 2.8 : true;
    const key = overlayState + ready;
    if (key !== this.lastPhase) {
      this.lastPhase = key; this.overlay.innerHTML = ''; this.overlay.className = '';
      if (title) {
        this.overlay.className = 'title-overlay';
        this.overlay.innerHTML = `<section class="title-panel"><div class="eyebrow"><span></span>안개 끝에, 아직 남아 있는 온기</div><h1>잔광의<br><em>계곡</em></h1><p class="title-story">꺼져 가는 계곡에<br>마지막 불씨를 전하는 작은 여정.</p><button class="primary" id="start">불씨를 들고 떠나기 <span>↗</span></button><p class="title-meta">키보드와 마우스로 플레이 · 약 5–8분</p><div class="title-ornament">◇<span></span>◇</div></section><div class="title-caption"><span class="small-diamond">✦</span> 황혼의 마을<br><small>따뜻한 등불 아래에서 시작합니다.</small></div>`;
      } else if (game.paused) {
        this.overlay.className = 'modal-overlay';
        this.overlay.innerHTML = `<section class="modal"><div class="eyebrow">잠시 쉬어 가기</div><h2>불씨는 기다립니다.</h2><p>WASD 이동 · 마우스 조준 · 좌클릭 공격<br>Space 회피 · E 상호작용 · M 음소거<br>H 조작 안내 · P 분위기 효과 · Esc 계속</p><button class="primary" id="resume">여정 계속하기</button></section>`;
      } else if (game.phase === 'dialogue') {
        this.overlay.className = 'dialogue-overlay';
        this.overlay.innerHTML = `<section class="dialogue"><div class="speaker-icon">✦</div><div><small>등불지기</small><h2>연</h2><p>숲의 그림자를 걷어 내고, <b>두 길잡이 등불</b>을 이어 주세요.<br>다리 너머 신전에서 수호자가 마지막 불씨를 기다리고 있어요.</p><p class="dialogue-tip">공격의 빛을 보고 회피하세요. 등불을 켜면 체력이 모두 회복됩니다.</p><button id="continue" class="text-button">불씨를 받아 들기 <kbd>E</kbd></button></div></section>`;
      } else if (game.phase === 'dead' && ready) {
        this.overlay.className = 'modal-overlay';
        this.overlay.innerHTML = `<section class="modal"><div class="eyebrow">아직, 끝나지 않은 이야기</div><h2>불씨가 잠들었습니다.</h2><p>적의 예고가 끝나기 전에 회피하세요.<br>세 번째 연속 공격은 더 강하게 밀쳐냅니다.</p><button class="primary" id="start">다시 불씨를 들기 <span>↻</span></button></section>`;
      } else if (game.phase === 'victory' && ready) {
        this.overlay.className = 'victory-overlay';
        this.overlay.innerHTML = `<section class="victory-panel"><div class="eyebrow">빛은, 다시 이어지고</div><div class="victory-mark">✦</div><h2>계곡에 온기가<br>돌아왔습니다.</h2><p>당신이 건넨 작은 불씨가<br>내일의 길을 비춥니다.</p><div class="run-stats"><span>${Math.floor(game.elapsed / 60)}분 ${Math.floor(game.elapsed % 60)}초<small>여정의 시간</small></span><span>${game.kills}<small>잠재운 그림자</small></span><span>${game.dodges}<small>회피</small></span></div><button class="primary" id="start">다시 계곡으로 <span>↻</span></button></section>`;
      }
      document.getElementById('start')?.addEventListener('click', this.startCallback);
      document.getElementById('resume')?.addEventListener('click', () => { game.paused = false; });
      document.getElementById('continue')?.addEventListener('click', () => { game.talked = true; game.phase = 'play'; game.phaseTime = 0; });
    }
  }
}
