/*
 * The whole soundtrack is synthesised with Web Audio: an original minor-key
 * calliope waltz whose tempo and tuning sag when you stop scrolling, wind,
 * heartbeat, thunder, fireworks and a formant-filtered laugh.
 */

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// Original waltz in D minor (3/4): [midi, beats]
const MELODY: [number, number][] = [
  [69, 1], [74, 1], [77, 1], [76, 2], [74, 1],
  [73, 1], [76, 1], [79, 1], [77, 2], [76, 1],
  [76, 1], [73, 1], [69, 1], [70, 2], [69, 1],
  [69, 1], [74, 1], [77, 1], [74, 3],
  [70, 1], [74, 1], [79, 1], [77, 2], [74, 1],
  [73, 1], [76, 1], [79, 1], [77, 2], [76, 1],
  [79, 1], [77, 1], [74, 1], [77, 1], [76, 1], [74, 1],
  [73, 1], [69, 1], [73, 1], [74, 3],
];
type Chord = [number, number[]];
const DM: Chord = [50, [57, 62, 65]], A7: Chord = [45, [55, 61, 64]], GM: Chord = [43, [55, 58, 62]];
const CHORDS: Chord[] = [DM, DM, A7, A7, A7, A7, DM, DM, GM, DM, A7, DM, GM, DM, A7, DM];

class Engine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private reverbSend!: GainNode;
  private detuneSrc!: ConstantSourceNode;
  private windGain!: GainNode;
  private heartGain!: GainNode;
  private noiseBuf!: AudioBuffer;
  enabled = true;
  private nextTime = 0;
  private beat = 0;
  private melIdx = 0;
  private melLeft = 0;
  private rate = 0.8;
  private heartLevel = 0;
  private nextHeart = 0;
  /** audio-clock times of scheduled beats, so lights can pulse on the beat */
  private beatTimes: number[] = [];
  beatCount = 0;
  private suspendTimer = 0;

  private init() {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
    comp.connect(this.master).connect(ctx.destination);

    const reverb = ctx.createConvolver();
    reverb.buffer = this.impulse(3.6, 2.4);
    this.reverbSend = ctx.createGain(); this.reverbSend.gain.value = 0.55;
    this.reverbSend.connect(reverb).connect(comp);

    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.42;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 3200;
    this.musicBus.connect(tone); tone.connect(comp); tone.connect(this.reverbSend);

    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(comp); this.sfxBus.connect(this.reverbSend);

    this.detuneSrc = ctx.createConstantSource(); this.detuneSrc.offset.value = 0; this.detuneSrc.start();
    this.noiseBuf = this.makeNoise();

    const wind = ctx.createBufferSource(); wind.buffer = this.noiseBuf; wind.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.7;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 260;
    lfo.connect(lfoAmt).connect(bp.frequency);
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0.09;
    wind.connect(bp).connect(this.windGain).connect(comp);
    wind.start(); lfo.start();

    this.heartGain = ctx.createGain(); this.heartGain.connect(comp);
    this.nextTime = ctx.currentTime + 0.1;
    setInterval(() => this.schedule(), 25);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend(); else if (this.enabled) this.ctx.resume();
    });
  }

  private impulse(seconds: number, decay: number) {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  private makeNoise() {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.6 + last * 3.2; }
    return buf;
  }

  private osc(type: OscillatorType, freq: number, when: number, dur: number, gain: number, dest: AudioNode, { vib = 0, detune = true } = {}) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    if (detune) {
      this.detuneSrc.connect(o.detune);
      o.onended = () => { try { this.detuneSrc.disconnect(o.detune); } catch { /* gone */ } };
    }
    if (vib) {
      const l = ctx.createOscillator(); l.frequency.value = 5.2 + Math.random();
      const la = ctx.createGain(); la.gain.value = vib;
      l.connect(la).connect(o.detune); l.start(when); l.stop(when + dur + 0.3);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.015);
    g.gain.setTargetAtTime(gain * 0.7, when + 0.03, 0.1);
    g.gain.setTargetAtTime(0, when + dur, 0.06);
    o.connect(g).connect(dest);
    o.start(when); o.stop(when + dur + 0.4);
  }

  private pipe(midi: number, when: number, dur: number, vel = 1) {
    const ctx = this.ctx!;
    const f = mtof(midi);
    this.osc('triangle', f, when, dur, 0.22 * vel, this.musicBus, { vib: 14 });
    this.osc('square', f, when, dur, 0.035 * vel, this.musicBus, { vib: 14 });
    this.osc('sine', f * 2, when, dur, 0.06 * vel, this.musicBus, { vib: 10 });
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 8;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.05 * vel, when); g.gain.setTargetAtTime(0, when + 0.05, 0.08);
    n.connect(bp).connect(g).connect(this.musicBus);
    n.start(when, Math.random()); n.stop(when + 0.4);
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const beatDur = 60 / (138 * this.rate);
    while (this.nextTime < ctx.currentTime + 0.15) {
      const bar = Math.floor(this.beat / 3) % CHORDS.length;
      const inBar = this.beat % 3;
      const [bass, notes] = CHORDS[bar];
      if (inBar === 0) { this.osc('triangle', mtof(bass), this.nextTime, beatDur * 0.8, 0.3, this.musicBus); this.osc('square', mtof(bass), this.nextTime, beatDur * 0.5, 0.03, this.musicBus); }
      else for (const m of notes) this.osc('square', mtof(m), this.nextTime, beatDur * 0.35, 0.022, this.musicBus);
      if (this.melLeft <= 0) {
        const [m, b] = MELODY[this.melIdx];
        this.pipe(m, this.nextTime, b * beatDur * 0.92, inBar === 0 ? 1 : 0.85);
        this.melLeft = b;
        this.melIdx = (this.melIdx + 1) % MELODY.length;
      }
      this.melLeft -= 1;
      this.beatTimes.push(this.nextTime);
      this.beat += 1;
      this.nextTime += beatDur;
    }
    if (this.heartLevel > 0.02 && ctx.currentTime > this.nextHeart) {
      this.thump(ctx.currentTime + 0.02, 0.9 * this.heartLevel);
      this.thump(ctx.currentTime + 0.27, 0.6 * this.heartLevel);
      this.nextHeart = ctx.currentTime + 60 / (62 + this.heartLevel * 40);
    }
  }

  /** 1 on each beat, decaying; also bumps beatCount so lights can step on the beat. */
  beatPulse() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return -1;
    const now = ctx.currentTime;
    while (this.beatTimes.length > 1 && this.beatTimes[1] <= now) { this.beatTimes.shift(); this.beatCount++; }
    const last = this.beatTimes[0];
    if (last === undefined || last > now) return 0;
    return Math.exp(-(now - last) * 7);
  }

  private thump(when: number, v: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(70, when); o.frequency.exponentialRampToValueAtTime(38, when + 0.18);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(v, when + 0.01); g.gain.exponentialRampToValueAtTime(0.001, when + 0.3);
    o.connect(g).connect(this.heartGain); o.start(when); o.stop(when + 0.35);
  }

  private noiseHit(when: number, { dur = 0.3, type = 'highpass' as BiquadFilterType, f0 = 800, f1 = 4000, q = 0.8, gain = 0.5, dest = null as AudioNode | null } = {}) {
    const ctx = this.ctx!;
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, when); f.frequency.exponentialRampToValueAtTime(f1, when + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, when); g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    n.connect(f).connect(g).connect(dest ?? this.sfxBus);
    n.start(when, Math.random() * 1.5); n.stop(when + dur + 0.05);
  }

  private ping(freq: number, when: number, dur: number, gain: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, when); g.gain.exponentialRampToValueAtTime(0.0008, when + dur);
    o.connect(g).connect(this.sfxBus); o.start(when); o.stop(when + dur);
  }

  /** "ha-ha-ha": formant-filtered sawtooth syllables */
  private laugh(when: number, { pitch = 170, n = 7, gain = 0.5, spacing = 0.17 } = {}) {
    const ctx = this.ctx!;
    for (let i = 0; i < n; i++) {
      const t = when + i * spacing * (1 + i * 0.04);
      const f0 = pitch * (1.15 - i * 0.045) * (0.97 + Math.random() * 0.06);
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0 * 1.08, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.9, t + 0.12);
      const breath = ctx.createBufferSource(); breath.buffer = this.noiseBuf;
      const src = ctx.createGain();
      const bg = ctx.createGain(); bg.gain.value = 0.35;
      o.connect(src); breath.connect(bg).connect(src);
      const out = ctx.createGain();
      out.gain.setValueAtTime(0, t);
      out.gain.linearRampToValueAtTime(gain * (1 - i / (n * 1.4)), t + 0.02);
      out.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      for (const [fr, q, amp] of [[760, 6, 1], [1250, 8, 0.6], [2600, 10, 0.25]]) {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fr; bp.Q.value = q;
        const a = ctx.createGain(); a.gain.value = amp;
        src.connect(bp).connect(a).connect(out);
      }
      out.connect(this.sfxBus);
      o.start(t); o.stop(t + 0.2);
      breath.start(t, Math.random()); breath.stop(t + 0.2);
    }
  }

  private get ready() { return !!this.ctx && this.enabled && this.ctx.state === 'running'; }
  private get now() { return this.ctx!.currentTime; }

  /** Fade the master in or out. Once faded out, the context is suspended: a muted
   *  carnival needn't keep synthesising a waltz nobody hears (lights fall back to a clock). */
  private fade(on: boolean, seconds: number) {
    const ctx = this.ctx!;
    clearTimeout(this.suspendTimer);
    if (on) ctx.resume();
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, seconds);
    if (!on) this.suspendTimer = window.setTimeout(() => { if (!this.enabled) ctx.suspend(); }, seconds * 5000);
  }

  start(enabled: boolean) {
    this.enabled = enabled;
    this.init();
    if (this.ctx) this.fade(enabled, 0.8);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    try { localStorage.setItem('evilcarnival:sound', on ? 'on' : 'off'); } catch { /* storage blocked */ }
    if (this.ctx) this.fade(on, 0.15);
  }

  update(vel: number, dt: number, time: number, { heart = 0, duck = 0 } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const moving = Math.min(Math.abs(vel) * 40, 1);
    this.rate += (0.62 + moving * 0.5 - this.rate) * Math.min(dt * 1.5, 1);
    const sag = (1 - moving) * (-38 + Math.sin(time * 0.4) * 22) + Math.sin(time * 3.1) * 4;
    this.detuneSrc.offset.setTargetAtTime(sag, ctx.currentTime, 0.3);
    this.heartLevel = heart;
    this.musicBus.gain.setTargetAtTime(0.42 * (1 - duck * 0.85), ctx.currentTime, 0.2);
    this.windGain.gain.setTargetAtTime(0.07 + moving * 0.08 + duck * 0.05, ctx.currentTime, 0.4);
  }

  tear() { if (!this.ready) return; const t = this.now; this.noiseHit(t, { dur: 0.45, f0: 900, f1: 5200, gain: 0.7 }); for (let i = 0; i < 6; i++) this.noiseHit(t + 0.03 * i + Math.random() * 0.03, { dur: 0.04, type: 'bandpass', f0: 3000, f1: 2400, q: 3, gain: 0.35 }); this.laugh(t + 0.6, { pitch: 190, n: 6, gain: 0.28 }); }
  rip(amount: number) { if (!this.ready || Math.random() > amount) return; this.noiseHit(this.now, { dur: 0.03, type: 'bandpass', f0: 2600 + Math.random() * 1200, f1: 2000, q: 4, gain: 0.25 }); }
  coin() { if (!this.ready) return; const t = this.now; this.ping(2637, t, 0.5, 0.25); this.ping(3520, t + 0.005, 0.35, 0.12); this.ping(2349, t + 0.14, 0.4, 0.2); this.noiseHit(t + 0.32, { dur: 0.12, type: 'lowpass', f0: 600, f1: 120, gain: 0.6 }); }
  whir() {
    if (!this.ready) return;
    const ctx = this.ctx!, t = this.now;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(55, t); o.frequency.linearRampToValueAtTime(110, t + 0.9);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.2); g.gain.linearRampToValueAtTime(0, t + 1.1);
    o.connect(lp).connect(g).connect(this.sfxBus); o.start(t); o.stop(t + 1.2);
    [74, 77, 81, 86, 89].forEach((m, i) => this.ping(mtof(m), t + 0.15 + i * 0.16, 1.2, 0.09));
  }
  whoosh() { if (!this.ready) return; this.noiseHit(this.now, { dur: 0.55, type: 'bandpass', f0: 350, f1: 2400, q: 1.2, gain: 0.5 }); }
  flip() { if (!this.ready) return; this.noiseHit(this.now, { dur: 0.07, type: 'highpass', f0: 2500, f1: 4000, gain: 0.4 }); this.laugh(this.now + 0.35, { pitch: 260, n: 5, gain: 0.22, spacing: 0.13 }); }
  pop() { if (!this.ready) return; const t = this.now; this.noiseHit(t, { dur: 0.08, type: 'highpass', f0: 1200, f1: 600, gain: 0.9 }); this.ping(90, t, 0.15, 0.4); }
  scare() {
    if (!this.ready) return;
    const ctx = this.ctx!, t = this.now;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + 1.6);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
    o.connect(g).connect(this.sfxBus); o.start(t); o.stop(t + 2.3);
    for (const m of [61, 62, 68, 73, 74]) {
      const s = ctx.createOscillator(); s.type = 'sawtooth'; s.frequency.value = mtof(m);
      const sg = ctx.createGain(); sg.gain.setValueAtTime(0.06, t); sg.gain.exponentialRampToValueAtTime(0.001, t + 2.4);
      s.connect(sg).connect(this.sfxBus); s.start(t); s.stop(t + 2.5);
    }
    this.noiseHit(t, { dur: 1.2, type: 'lowpass', f0: 4000, f1: 200, gain: 0.5 });
    this.laugh(t + 0.9, { pitch: 120, n: 8, gain: 0.35, spacing: 0.2 });
  }
  burn() { if (!this.ready) return; const t = this.now; this.noiseHit(t, { dur: 1.8, type: 'bandpass', f0: 200, f1: 3000, q: 0.6, gain: 0.45 }); for (let i = 0; i < 18; i++) this.noiseHit(t + Math.random() * 1.6, { dur: 0.03, type: 'highpass', f0: 3000, f1: 5000, gain: 0.3 }); this.laugh(t + 0.2, { pitch: 140, n: 9, gain: 0.4, spacing: 0.18 }); }
  buzz() {
    if (!this.ready) return;
    const ctx = this.ctx!, t = this.now;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 120;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 2;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
    for (let i = 0; i < 6; i++) g.gain.setValueAtTime(Math.random() * 0.14, t + i * 0.035);
    g.gain.setValueAtTime(0, t + 0.24);
    o.connect(bp).connect(g).connect(this.sfxBus); o.start(t); o.stop(t + 0.3);
  }
  powerDown() {
    if (!this.ready) return;
    const ctx = this.ctx!, t = this.now;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(240, t); o.frequency.exponentialRampToValueAtTime(30, t + 1.4);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
    o.connect(lp).connect(g).connect(this.sfxBus); o.start(t); o.stop(t + 1.6);
    this.noiseHit(t, { dur: 0.25, type: 'lowpass', f0: 3000, f1: 200, gain: 0.5 });
    this.laugh(t + 2.2, { pitch: 110, n: 6, gain: 0.18, spacing: 0.24 });
  }
  thunder(distance = 0.5) {
    if (!this.ready) return;
    const t = this.now + 0.3 + distance * 1.8;
    this.noiseHit(t, { dur: 0.35, type: 'lowpass', f0: 2400, f1: 300, gain: 0.8 * (1 - distance * 0.5) });
    this.noiseHit(t + 0.1, { dur: 3.2, type: 'lowpass', f0: 380, f1: 60, q: 0.5, gain: 1.2 * (1 - distance * 0.4) });
    for (let i = 0; i < 5; i++) this.noiseHit(t + 0.3 + Math.random() * 1.8, { dur: 0.6, type: 'lowpass', f0: 250, f1: 70, gain: 0.4 });
  }
  firework(size = 1) {
    if (!this.ready) return;
    const ctx = this.ctx!, t = this.now;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(34, t + 0.6);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.7 * size, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    o.connect(g).connect(this.sfxBus); o.start(t); o.stop(t + 1);
    this.noiseHit(t, { dur: 0.5, type: 'lowpass', f0: 1800, f1: 200, gain: 0.6 * size });
    for (let i = 0; i < 14; i++) this.noiseHit(t + 0.25 + Math.random() * 1.2, { dur: 0.025, type: 'highpass', f0: 3500, f1: 6000, gain: 0.18 });
  }
  launch() { if (!this.ready) return; this.noiseHit(this.now, { dur: 0.9, type: 'bandpass', f0: 600, f1: 2600, q: 2, gain: 0.18 }); }
  claim() { if (!this.ready) return; const t = this.now; this.ping(1568, t, 0.9, 0.25); this.ping(2093, t + 0.1, 1.2, 0.2); this.laugh(t + 0.4, { pitch: 150, n: 9, gain: 0.35 }); }
  golden() { if (!this.ready) return; const t = this.now; [81, 85, 88, 93].forEach((m, i) => this.ping(mtof(m), t + i * 0.09, 1.4, 0.16)); }
}

export const audio = new Engine();
