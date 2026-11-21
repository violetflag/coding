// 소리 섞기: 채널(불, 환경, 효과, 음악)마다 볼륨을 따로 두고 전체 볼륨을 곱한다. 값은 브라우저에 저장한다.
// 음악(유튜브)은 Web Audio를 거치지 않으므로 6단계에서 같은 값(volume('music') × volume('master'))을 플레이어에 직접 넣는다.
const KEY = 'nanro.volume';
export const CHANNELS = ['fire', 'ambient', 'effects', 'music'];
const DEFAULTS = { master: 0.8, fire: 0.8, ambient: 0.6, effects: 0.7, music: 0.5 };

export class Mixer {
  constructor() {
    this.vol = { ...DEFAULTS };
    try { Object.assign(this.vol, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* 저장소 사용 불가 */ }
    this.ctx = null; this.nodes = {}; this.scale = 1;
  }
  // 사용자 조작(클릭) 안에서 불러야 브라우저가 소리를 허용한다.
  start() {
    if (this.ctx) { this.ctx.resume().catch(() => {}); return this.ctx; }
    this.ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
    const master = (this.nodes.master = new GainNode(this.ctx, { gain: this.vol.master }));
    master.connect(this.ctx.destination);
    for (const c of CHANNELS) { if (c === 'music') continue; (this.nodes[c] = new GainNode(this.ctx, { gain: this.vol[c] })).connect(master); }
    return this.ctx;
  }
  channel(name) { return this.nodes[name]; }
  // 전체 소리를 일시적으로 줄인다 (낭독 중, 잠들기 모드). 저장되는 볼륨 값은 그대로 둔다.
  setScale(k, tc = 0.4) { this.scale = k; const n = this.nodes.master; if (n) n.gain.setTargetAtTime(this.vol.master * k, this.ctx.currentTime, tc); this.onChange?.('scale', k); }
  volume(name) { return this.vol[name]; }
  setVolume(name, v) {
    this.vol[name] = Math.max(0, Math.min(1, +v || 0));
    const n = this.nodes[name]; if (n) n.gain.setTargetAtTime(this.vol[name] * (name === 'master' ? this.scale : 1), this.ctx.currentTime, 0.03);
    try { localStorage.setItem(KEY, JSON.stringify(this.vol)); } catch { /* 무시 */ }
    this.onChange?.(name, this.vol[name]);
  }
}
