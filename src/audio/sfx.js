// 효과음과 환경음: 모두 Web Audio로 그 자리에서 합성한다 (녹음 파일 없음).
// 기획서는 earshot(파이썬 도구)으로 파일을 만들어 쓰는 안이었지만, 저장소에 음원 파일을 두지 않도록 같은 방식(잡음 + 필터 + 포락선)을 브라우저에서 직접 구현했다.
// 효과음은 작은 나무 방의 잔향(합성한 충격 응답)을 거친다.
const rnd = (a, b) => a + Math.random() * (b - a);

export class Sfx {
  constructor(mixer) {
    const ctx = (this.ctx = mixer.ctx); this.mixer = mixer;
    // 잡음 버퍼(2초)와 잔향
    const n = ctx.sampleRate * 2, buf = (this.noise = ctx.createBuffer(1, n, ctx.sampleRate)), d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const irN = Math.floor(ctx.sampleRate * 0.55), ir = ctx.createBuffer(2, irN, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const x = ir.getChannelData(c); for (let i = 0; i < irN; i++) { const t = i / irN; x[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) * (i < 400 ? i / 400 : 1) * (0.6 + 0.4 * Math.exp(-t * 6)); } }
    this.out = new GainNode(ctx, { gain: 1 }); this.out.connect(mixer.channel('effects'));
    const conv = new ConvolverNode(ctx, { buffer: ir }), wet = new GainNode(ctx, { gain: 0.22 }), damp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 3800 });
    this.out.connect(conv); conv.connect(damp); damp.connect(wet); wet.connect(mixer.channel('effects'));
  }
  // 잡음 한 덩이: { dur, f0, f1(끝 주파수), q, gain, attack, type, pan, delay }
  burst({ dur = 0.2, f0 = 2000, f1 = f0, q = 1, gain = 0.3, attack = 0.01, type = 'bandpass', pan = 0, delay = 0, curve = 2 }) {
    const c = this.ctx, t = c.currentTime + delay, src = new AudioBufferSourceNode(c, { buffer: this.noise, loop: true, loopStart: rnd(0, 1), playbackRate: rnd(0.9, 1.1) });
    const f = new BiquadFilterNode(c, { type, frequency: f0, Q: q }), g = new GainNode(c, { gain: 0 }), p = new StereoPannerNode(c, { pan });
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.setTargetAtTime(0, t + attack, dur / (curve * 2.2));
    src.connect(f); f.connect(g); g.connect(p); p.connect(this.out); src.start(t, rnd(0, 1.5)); src.stop(t + dur + 0.3);
  }
  tone({ f = 440, dur = 0.5, gain = 0.2, type = 'sine', delay = 0, f1 = f, pan = 0 }) {
    const c = this.ctx, t = c.currentTime + delay, o = new OscillatorNode(c, { type, frequency: f }), g = new GainNode(c, { gain: 0 }), p = new StereoPannerNode(c, { pan });
    o.frequency.setValueAtTime(f, t); if (f1 !== f) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.004); g.gain.setTargetAtTime(0, t + 0.004, dur / 4.5);
    o.connect(g); g.connect(p); p.connect(this.out); o.start(t); o.stop(t + dur + 0.2);
  }
  play(name, { pan = 0, gain = 1 } = {}) {
    const B = (o) => this.burst({ ...o, pan: o.pan ?? pan, gain: (o.gain ?? 0.3) * gain }), T = (o) => this.tone({ ...o, pan, gain: (o.gain ?? 0.2) * gain });
    switch (name) {
      case 'page': B({ dur: 0.32, f0: rnd(2600, 3400), f1: rnd(5200, 6800), q: 0.9, gain: 0.2, attack: 0.07 }); B({ dur: 0.1, f0: 900, f1: 500, q: 1.2, gain: 0.09, delay: 0.24 }); break;
      case 'open': B({ dur: 0.22, f0: 1800, f1: 3600, q: 0.8, gain: 0.16, attack: 0.05 }); B({ dur: 0.14, f0: 160, f1: 90, q: 1.4, gain: 0.3, type: 'lowpass', delay: 0.02 }); break;
      case 'close': B({ dur: 0.16, f0: 240, f1: 80, q: 1, gain: 0.5, type: 'lowpass' }); B({ dur: 0.12, f0: 2400, f1: 1200, q: 0.8, gain: 0.1 }); break;
      case 'step': B({ dur: 0.11, f0: rnd(150, 210), f1: 70, q: 1.2, gain: 0.3, type: 'lowpass', attack: 0.004 }); B({ dur: 0.05, f0: rnd(1100, 1700), q: 2.5, gain: 0.035 }); break;
      case 'steprug': B({ dur: 0.12, f0: rnd(110, 150), f1: 60, q: 0.8, gain: 0.2, type: 'lowpass', attack: 0.012 }); break;
      case 'sit': B({ dur: 0.3, f0: 130, f1: 60, q: 1, gain: 0.45, type: 'lowpass', attack: 0.03 }); for (let i = 0; i < 3; i++) B({ dur: 0.16, f0: rnd(500, 900), f1: rnd(300, 500), q: 14, gain: 0.07, delay: 0.08 + i * 0.11, attack: 0.03 }); break;
      case 'stand': for (let i = 0; i < 2; i++) B({ dur: 0.18, f0: rnd(400, 700), f1: rnd(600, 950), q: 12, gain: 0.06, delay: i * 0.12, attack: 0.03 }); break;
      case 'dooropen': for (let i = 0; i < 4; i++) B({ dur: 0.22, f0: rnd(380, 520), f1: rnd(620, 820), q: 16, gain: 0.05, delay: 0.08 + i * 0.16, attack: 0.05 }); B({ dur: 0.06, f0: 1400, q: 3, gain: 0.12, attack: 0.002 }); break;
      case 'doorclose': B({ dur: 0.25, f0: 150, f1: 60, q: 1, gain: 0.6, type: 'lowpass', delay: 0.55 }); B({ dur: 0.05, f0: 1800, q: 4, gain: 0.14, delay: 0.6, attack: 0.002 }); for (let i = 0; i < 2; i++) B({ dur: 0.2, f0: rnd(420, 560), f1: rnd(300, 380), q: 16, gain: 0.04, delay: i * 0.16, attack: 0.05 }); break;
      case 'click': B({ dur: 0.03, f0: 2600, q: 3, gain: 0.25, attack: 0.001 }); B({ dur: 0.04, f0: 900, q: 4, gain: 0.2, delay: 0.035, attack: 0.001 }); break;
      case 'match': B({ dur: 0.35, f0: 3500, f1: 6500, q: 0.7, gain: 0.16, attack: 0.02 }); B({ dur: 0.5, f0: 500, f1: 250, q: 0.8, gain: 0.12, delay: 0.16, attack: 0.05 }); break;
      case 'blow': B({ dur: 0.35, f0: 700, f1: 300, q: 0.6, gain: 0.22, attack: 0.05 }); break;
      case 'pour': B({ dur: 1.6, f0: 700, f1: 1900, q: 5, gain: 0.2, attack: 0.15, curve: 0.7 }); B({ dur: 1.6, f0: 2400, f1: 3600, q: 1.5, gain: 0.06, attack: 0.2, curve: 0.7 }); break;
      case 'clink': T({ f: 2150, dur: 0.5, gain: 0.07 }); T({ f: 4380, dur: 0.3, gain: 0.04 }); T({ f: 5900, dur: 0.18, gain: 0.02 }); break;
      case 'sip': B({ dur: 0.35, f0: 1500, f1: 2600, q: 6, gain: 0.07, attack: 0.1 }); break;
      case 'pencil': for (let i = 0; i < 3; i++) B({ dur: 0.13, f0: rnd(3200, 4600), q: 1.2, gain: 0.07, delay: i * 0.1, attack: 0.03 }); break;
      case 'book': B({ dur: 0.2, f0: 1500, f1: 800, q: 0.9, gain: 0.12, attack: 0.04 }); B({ dur: 0.1, f0: 200, f1: 90, q: 1, gain: 0.25, type: 'lowpass', delay: 0.12 }); break;
      case 'chime': T({ f: 880, dur: 2.4, gain: 0.09 }); T({ f: 1318.5, dur: 2.0, gain: 0.05, delay: 0.02 }); T({ f: 2637, dur: 1.0, gain: 0.02, delay: 0.02 }); T({ f: 659.3, dur: 2.6, gain: 0.07, delay: 0.5 }); break;
      case 'log': B({ dur: 0.2, f0: 300, f1: 110, q: 1.2, gain: 0.5, type: 'lowpass' }); B({ dur: 0.12, f0: 1600, q: 2, gain: 0.08, delay: 0.03 }); break;
      default: break;
    }
  }
}

// 환경음: 벽 너머 바람, 빗소리, 먼 천둥, 방의 고요, 시계 초침, 낮의 새소리, 주전자 끓는 소리. update()로 날씨와 듣는 위치를 넘긴다.
export class Ambient {
  constructor(mixer, noise) {
    const c = (this.ctx = mixer.ctx); this.out = mixer.channel('ambient'); this.noise = noise;
    const loop = (rate) => { const s = new AudioBufferSourceNode(c, { buffer: noise, loop: true, playbackRate: rate }); s.start(0, Math.random()); return s; };
    // 바람: 낮게 걸러 벽 너머에서 들리는 소리 + 창틈으로 새는 높은 휘파람
    this.windLow = new GainNode(c, { gain: 0 }); const lp = new BiquadFilterNode(c, { type: 'lowpass', frequency: 320, Q: 0.4 }), bp = (this.windBp = new BiquadFilterNode(c, { type: 'bandpass', frequency: 260, Q: 0.9 }));
    loop(0.5).connect(bp); bp.connect(lp); lp.connect(this.windLow); this.windLow.connect(this.out);
    this.whistle = new GainNode(c, { gain: 0 }); const wb = (this.whBp = new BiquadFilterNode(c, { type: 'bandpass', frequency: 900, Q: 22 })); loop(1).connect(wb); wb.connect(this.whistle); this.whistle.connect(this.out);
    // 방의 고요(아주 낮은 웅웅거림)
    const tone = new GainNode(c, { gain: 0.012 }), tl = new BiquadFilterNode(c, { type: 'lowpass', frequency: 110 }); loop(0.3).connect(tl); tl.connect(tone); tone.connect(this.out);
    // 주전자
    this.kettle = new GainNode(c, { gain: 0 }); const kb = new BiquadFilterNode(c, { type: 'bandpass', frequency: 520, Q: 2.2 }), kl = new GainNode(c, { gain: 1 }); loop(0.8).connect(kb); kb.connect(kl); kl.connect(this.kettle); this.kettle.connect(this.out); this.kLfo = kl;
    // 비: 지붕과 땅을 두드리는 넓은 쉬익 소리(밖) + 지붕 너머로 먹먹하게 들리는 낮은 소리(방 안). 밖에 나가거나 문을 열면 밝고 커진다.
    this.rainG = new GainNode(c, { gain: 0 }); this.rainLp = new BiquadFilterNode(c, { type: 'lowpass', frequency: 1200, Q: 0.3 }); const rh = new BiquadFilterNode(c, { type: 'highpass', frequency: 350 });
    loop(1.05).connect(rh); rh.connect(this.rainLp); this.rainLp.connect(this.rainG); this.rainG.connect(this.out);
    this.roofG = new GainNode(c, { gain: 0 }); const rl = new BiquadFilterNode(c, { type: 'bandpass', frequency: 420, Q: 0.6 }); loop(0.7).connect(rl); rl.connect(this.roofG); this.roofG.connect(this.out);
    this.wind = 0.2; this.gustT = 0; this.tickT = 0; this.birdT = 5; this.clock = true; this.kOn = 0; this.rainOn = -1; this.thunderN = null;
  }
  // o: { weather, wind(m/s), rain(0…1), thunderN(번개 수), thunderDelay(초), thunderLoud(0…1), outside(0…1), day, season, clockDist(m), kettle(0…1), dt }
  update(o) {
    const c = this.ctx, t = c.currentTime;
    // 방 안에서는 바람을 아주 작게만(주인님: 바람 소리가 너무 많다). 밖에 나가 있으면(o.outside) 제대로 들린다.
    const ws = o.wind ?? (o.weather === 'heavy' ? 10 : o.weather === 'snow' ? 4 : 2);    // 바람 세기(m/s) → 소리 크기
    const base = Math.min(1, 0.05 + 0.06 * ws + (o.weather === 'heavy' ? 0.2 : 0)) * (0.25 + 0.75 * (o.outside || 0));
    // 빗소리: 세기와 듣는 곳(방 안은 작고 먹먹하게)
    const rn = o.rain || 0, out = o.outside || 0, rk = rn * 10 + out;
    if (Math.abs(rk - this.rainOn) > 0.02) {
      this.rainOn = rk;
      this.rainG.gain.setTargetAtTime(rn * (0.018 + 0.1 * out), t, 0.6); this.rainLp.frequency.setTargetAtTime(900 + 6000 * out, t, 0.4);
      this.roofG.gain.setTargetAtTime(rn * 0.05 * (1 - 0.6 * out), t, 0.6);
    }
    // 천둥: 번개가 친 뒤 몇 초 지나 낮게 우르릉
    if (this.thunderN == null) this.thunderN = o.thunderN || 0;
    else if ((o.thunderN || 0) > this.thunderN) { this.thunderN = o.thunderN; this.thunder(o.thunderDelay || 3, o.thunderLoud || 0.7, out); }
    this.gustT -= o.dt;
    if (this.gustT <= 0) {                                                  // 몇 초마다 바람 세기를 새로 정한다(돌풍)
      this.gustT = rnd(1.5, 5); const g = base * rnd(0.45, 1.5);
      this.windLow.gain.setTargetAtTime(g * 0.5, t, rnd(0.8, 2)); this.windBp.frequency.setTargetAtTime(180 + g * 260, t, 1.5);
      this.whistle.gain.setTargetAtTime(Math.max(0, g - 0.5) * 0.05, t, 1.2); this.whBp.frequency.setTargetAtTime(rnd(650, 1200), t, 2);
    }
    // 시계 초침 (가까울수록 크게)
    this.tickT -= o.dt;
    if (this.clock && this.tickT <= 0) {
      this.tickT += 1; if (this.tickT < 0) this.tickT = 1;
      const g = 0.05 / (1 + o.clockDist * o.clockDist * 0.6), src = new AudioBufferSourceNode(c, { buffer: this.noise }), f = new BiquadFilterNode(c, { type: 'bandpass', frequency: this._tock ? 2100 : 2700, Q: 6 }), gn = new GainNode(c, { gain: g });
      this._tock = !this._tock; gn.gain.setTargetAtTime(0, t + 0.003, 0.012); src.connect(f); f.connect(gn); gn.connect(this.out); src.start(t, Math.random()); src.stop(t + 0.08);
    }
    // 새소리: 봄·여름·가을의 맑은 낮에 가끔
    this.birdT -= o.dt;
    if (this.birdT <= 0) {
      this.birdT = rnd(4, 14);
      if (o.day > 0.6 && o.season !== 'winter' && (o.weather === 'clear' || o.weather === 'partly') && !(o.rain > 0)) {
        const n = 2 + Math.floor(Math.random() * 4), f0 = rnd(2600, 4200), pan = rnd(-0.7, 0.2);
        for (let i = 0; i < n; i++) { const ts = t + i * rnd(0.09, 0.16), osc = new OscillatorNode(c, { frequency: f0 }), g = new GainNode(c, { gain: 0 }), p = new StereoPannerNode(c, { pan }), lp = new BiquadFilterNode(c, { type: 'lowpass', frequency: 3000 }); osc.frequency.setValueAtTime(f0 * rnd(0.9, 1.1), ts); osc.frequency.exponentialRampToValueAtTime(f0 * rnd(1.15, 1.5), ts + 0.06); g.gain.setValueAtTime(0, ts); g.gain.linearRampToValueAtTime(0.012, ts + 0.012); g.gain.linearRampToValueAtTime(0, ts + 0.075); osc.connect(lp); lp.connect(g); g.connect(p); p.connect(this.out); osc.start(ts); osc.stop(ts + 0.1); }
      }
    }
    // 주전자 끓는 소리 (보글거림: 음량을 불규칙하게 흔든다)
    const k = o.kettle || 0; if (Math.abs(k - this.kOn) > 0.01) { this.kOn = k; this.kettle.gain.setTargetAtTime(k * 0.1, t, 0.8); }
    if (k > 0.01) this.kLfo.gain.setTargetAtTime(rnd(0.4, 1.2), t, 0.05);
  }
  // 먼 천둥: 걸러 낸 낮은 잡음 몇 덩이가 겹쳐 굴러간다
  thunder(delay, loud, out) {
    const c = this.ctx, t0 = c.currentTime + delay, g0 = (0.25 + 0.35 * out) * loud;
    for (let i = 0; i < 4; i++) {
      const t = t0 + i * rnd(0.25, 0.9), dur = rnd(1.5, 3.5), src = new AudioBufferSourceNode(c, { buffer: this.noise, loop: true, playbackRate: rnd(0.25, 0.45) });
      const f = new BiquadFilterNode(c, { type: 'lowpass', frequency: rnd(90, 180), Q: 0.7 }), g = new GainNode(c, { gain: 0 }), p = new StereoPannerNode(c, { pan: rnd(-0.6, 0.6) });
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(g0 * (i ? 0.6 : 1), t + rnd(0.1, 0.4)); g.gain.setTargetAtTime(0, t + 0.4, dur / 3);
      src.connect(f); f.connect(g); g.connect(p); p.connect(this.out); src.start(t, rnd(0, 1.5)); src.stop(t + dur + 1.5);
    }
  }
}
