import type { GameEvent } from './simulation.ts';

/** Local Web Audio score and foley. Starts only after an explicit input gesture. */
export class AudioScene {
  context?: AudioContext; master?: GainNode; muted = false; lastStep = 0; nextChime = 0;
  async start() {
    if (!this.context) {
      this.context = new AudioContext(); this.master = this.context.createGain(); this.master.gain.value = this.muted ? 0 : 0.28; this.master.connect(this.context.destination);
      const c = this.context, buffer = c.createBuffer(1, c.sampleRate * 4, c.sampleRate), data = buffer.getChannelData(0);
      let seed = 93821, prev = 0;
      for (let i = 0; i < data.length; i++) { seed = (seed * 16807) % 2147483647; prev = prev * 0.965 + (seed / 2147483647 * 2 - 1) * 0.035; data[i] = prev; }
      const wind = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain(); wind.buffer = buffer; wind.loop = true;
      filter.type = 'lowpass'; filter.frequency.value = 650; gain.gain.value = 0.2;
      wind.connect(filter).connect(gain).connect(this.master); wind.start();
      for (const hz of [110, 164.81, 220]) {
        const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = hz; g.gain.value = 0.006;
        o.connect(g).connect(this.master); o.start();
      }
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }
  setMuted(muted: boolean) { this.muted = muted; if (this.context && this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.28, this.context.currentTime, 0.04); }
  tone(frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.15, end?: number, delay = 0) {
    const c = this.context; if (!c || !this.master) return;
    const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + delay;
    o.type = type; o.frequency.setValueAtTime(frequency, t); if (end) o.frequency.exponentialRampToValueAtTime(end, t + duration);
    g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(volume, t + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + duration + 0.04);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }
  noise(duration: number, cutoff: number, volume: number) {
    const c = this.context; if (!c || !this.master) return;
    const b = c.createBuffer(1, Math.ceil(c.sampleRate * duration), c.sampleRate), data = b.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = b; f.type = 'bandpass'; f.frequency.value = cutoff; f.Q.value = 0.7; g.gain.value = volume;
    s.connect(f).connect(g).connect(this.master); s.start(); s.onended = () => { s.disconnect(); f.disconnect(); g.disconnect(); };
  }
  event(e: GameEvent) {
    if (e.type === 'swing') { this.noise(0.12, 1600, 0.32); this.tone(300, 0.1, 'triangle', 0.1, 90); }
    else if (e.type === 'hit') { this.tone(150 * e.strength, 0.12, 'triangle', 0.32, 45); this.noise(0.08, 2400, 0.4); this.tone(1100, 0.075, 'square', 0.035, 420); }
    else if (e.type === 'hurt') { this.tone(210, 0.22, 'sawtooth', 0.12, 65); this.noise(0.16, 450, 0.4); }
    else if (e.type === 'dodge') this.noise(0.21, 850, 0.27);
    else if (e.type === 'cast') { this.tone(300, 0.23, 'sine', 0.16, 1100); this.tone(90, 0.25, 'triangle', 0.14); }
    else if (e.type === 'death') { this.tone(170, 0.45, 'triangle', 0.18, 38); this.noise(0.22, 500, 0.2); }
    else if (e.type === 'boss') { this.tone(55, 1.6, 'triangle', 0.34); this.tone(82.4, 1.4, 'sine', 0.2); }
    else if (e.type === 'ignite' || e.type === 'win') {
      [261.63, 329.63, 392, 523.25, 659.25].forEach((note, i) => this.tone(note, 1.3, 'sine', 0.18, undefined, i * 0.14));
    }
  }
  tick(moving: boolean, time: number) {
    if (moving && time - this.lastStep > 0.29) { this.lastStep = time; this.noise(0.07, 380, 0.085); this.tone(95, 0.045, 'triangle', 0.06, 65); }
    if (time > this.nextChime && this.context) { this.nextChime = time + 8; const notes = [440, 523.25, 659.25, 587.33]; this.tone(notes[Math.floor(time / 8) % 4], 1.9, 'sine', 0.024); }
  }
  click() { this.tone(660, 0.11, 'sine', 0.09, 990); }
}
