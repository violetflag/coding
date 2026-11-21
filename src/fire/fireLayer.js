// 벽난로 불 레이어 (1단계: "Plan B").
// procedural-fire(MIT, Leon Lin)의 연소 시뮬레이션과 볼륨 렌더러를 자체 WebGPU 장치로 돌려 별도 캔버스에 그린다.
// 그 캔버스는 방(three.js) 캔버스 아래에 깔리고, 방 쪽은 화구 입구에 알파 0의 "구멍"을 뚫어 불이 비쳐 보인다.
// 카메라는 매 프레임 플레이어 시점과 맞춘다. 불의 좌표계는 장작 받침대 중심이 원점, +z가 방 쪽이다.
import { initGPU } from './vendor/gpu.js';
import { FireSim } from './vendor/sim.js';
import { Renderer } from './vendor/renderer.js';
import { Sparks } from './vendor/sparks.js';
import { makeNoiseTexture, makeCurlTexture } from './vendor/noise.js';
import { FIREPLACE as FP, ROOM } from '../scene/layout.js';

// 격자 한 칸은 약 1.4cm. 계산 영역은 화구 안쪽(0.9 × 1.1 × 0.56 m)만 덮는다.
export const FIRE_QUALITY = {
  low: { res: [48, 64, 32], dt: 1 / 45, vcycles: 1, scale: 0.5, volScale: 0.5, surfScale: 0.5, stepMul: 1.0, sparks: 2048 },
  med: { res: [64, 80, 40], dt: 1 / 60, vcycles: 1, scale: 0.66, volScale: 0.5, surfScale: 0.6, stepMul: 0.9, sparks: 4096 },
  high: { res: [96, 120, 60], dt: 1 / 90, vcycles: 2, scale: 1.0, volScale: 0.6, surfScale: 0.75, stepMul: 0.7, sparks: 8192 },
};

// 장작 받침대 위 가로 장작 3개 + 숯 속 토막 1개 (참고 이미지의 배치). a, b = 양 끝, r = 반지름, burn = 타는 정도.
const LOGS = [
  { a: [-0.27, 0.085, -0.10], b: [0.28, 0.095, -0.08], r: 0.060, burn: 0.8 },
  { a: [-0.25, 0.080, 0.07], b: [0.26, 0.075, 0.09], r: 0.055, burn: 0.8 },
  { a: [-0.21, 0.195, -0.035], b: [0.23, 0.21, 0.015], r: 0.052, burn: 1.0 },
  { a: [-0.09, 0.035, 0.0], b: [0.08, 0.03, -0.03], r: 0.032, burn: 1.0 },
];
const pack = (items, fn, max = 16) => { const f = new Float32Array(max * 8); items.slice(0, max).forEach((it, i) => f.set(fn(it), i * 8)); return f; };

export class FireLayer {
  static async create(canvas, { quality = 'med' } = {}) {
    const { device, features } = await initGPU();
    return new FireLayer(canvas, device, features, FIRE_QUALITY[quality] || FIRE_QUALITY.med, quality);
  }

  constructor(canvas, device, features, q, qualityName) {
    this.canvas = canvas; this.device = device; this.q = q; this.quality = qualityName; this.features = features;
    this.ctx = canvas.getContext('webgpu');
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.ctx.configure({ device, format: this.format, alphaMode: 'opaque' });
    const logsF32 = pack(LOGS, l => [...l.a, l.r, ...l.b, l.burn]);
    const noiseTex = makeNoiseTexture(device, 128, 1), curlTex = makeCurlTexture(device, noiseTex, 128);
    const size = [0.9, 0.9 * q.res[1] / q.res[0], 0.9 * q.res[2] / q.res[0]];
    this.sim = new FireSim(device, { res: q.res, size, logs: logsF32, vcycles: q.vcycles, noiseTex, curlTex });
    const scene = { logs: LOGS, stones: [] };
    this.renderer = new Renderer(device, { sim: this.sim, scene, noiseTex, curlTex, logsF32, stonesF32: new Float32Array(16 * 8), format: this.format });
    Object.assign(this.renderer.params, {
      stepMul: q.stepMul, vignette: 0, grain: 0, chroma: 0, moon: 0, fogK: 0,
      // 화구 안쪽 치수 (불 좌표계): 반폭, 뒷벽 z, 입구 z, 높이
      fbX: FP.openW / 2, fbZB: -(ROOM.W - FP.fire.x), fbZF: FP.fire.x - FP.faceX, fbH: FP.openH,
    });
    this.renderer.surfScale = q.surfScale;
    this.sparks = new Sparks(device, { count: q.sparks, sim: this.sim, renderer: this.renderer, curlTex });
    // 벽난로 크기의 불: 모닥불(60kW)보다 훨씬 작게. 2단계에서 화구 경계 조건과 함께 다시 맞춘다.
    this.sim.setParams({ bedRadius: 0.17, hotR0: 0.08, hotR1: 0.3, hotY1: 0.35 });
    this.power = 0.03; this.target = 0.62; this.acc = 0; this.frame = 0; this.w = 0; this.h = 0;
    this.light = { level: 1, raw: 0, ref: 0, power: 0, at: 0 };
    this._prevSeq = 0; this._prevT = 0; this.burstUntil = 0; this.popClock = 1; this.lost = false; this.simMs = 0;
    device.lost.then(() => { this.lost = true; });
  }

  resize(cssW, cssH, dpr = 1) {
    const w = Math.max(64, Math.round(cssW * dpr * this.q.scale)), h = Math.max(64, Math.round(cssH * dpr * this.q.scale));
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h; this.canvas.width = w; this.canvas.height = h;
    this.renderer.resize(w, h, this.q.volScale);
  }

  // 방 좌표 → 불 좌표: (x, y, z)불 = (z - zc, y - 화로대 높이, -(x - 불 중심 x))
  _cam(camera) {
    const e = camera.matrixWorld.elements, f = FP.fire;
    const P = (x, y, z) => [z - f.z, y - f.y, -(x - f.x)], D = (x, y, z) => [z, y, -x];
    return { pos: P(e[12], e[13], e[14]), fwd: D(-e[8], -e[9], -e[10]), right: D(e[0], e[1], e[2]), up: D(e[4], e[5], e[6]), fovY: camera.fov * Math.PI / 180 };
  }

  event(e) {
    const s = e.strength ?? 1, pos = e.pos || [(Math.random() - 0.5) * 0.3, 0.1 + Math.random() * 0.1, (Math.random() - 0.5) * 0.12];
    if (e.type === 'log-shift') this.sparks.burst({ n: Math.round(120 * s), pos, speed: 3.2, radius: 0.1, dur: 0.15, fan: 0.7, size: 1.4 });
    else if (e.type === 'pop') this.sparks.burst({ n: Math.round(3 + 14 * s), pos, speed: 2.5 + 2.5 * s, radius: 0.02, dur: 0.04, fan: 0.8, size: 1.3 });
  }
  // 부지깽이로 뒤적이기: 잠깐 불이 일고 불티가 튄다
  stoke() {
    const pos = [(Math.random() - 0.5) * 0.2, 0.1, (Math.random() - 0.5) * 0.08];
    this.event({ type: 'log-shift', strength: 0.8, pos });
    this.sim.setParams({ burstX: pos[0], burstY: 0.08, burstZ: pos[2] }); this.burstUntil = performance.now() + 250;
    this.target = Math.min(1, this.target + 0.08);
  }
  // 장작 넣기: 잠깐 식었다가 더 크게 타오른다 (연료 모델은 2단계)
  addLog() { this.power *= 0.75; this.target = Math.min(1, this.target + 0.25); this.event({ type: 'log-shift', strength: 0.5 }); }

  update(dtReal, camera, present = true) {
    if (this.lost) return;
    const d = this.device, sim = this.sim, r = this.renderer, now = performance.now();
    const k = this.power < this.target ? 1.5 : 0.8;
    this.power += (this.target - this.power) * (1 - Math.exp(-k * dtReal));
    sim.setParams({ intensity: this.power, burstAmt: now < this.burstUntil ? 1 : 0 });
    this.popClock -= dtReal;
    if (this.popClock <= 0) { this.popClock = 0.8 + Math.random() * 3; this.event({ type: 'pop', strength: 0.2 + Math.random() * 0.6 }); }
    this.acc += dtReal;
    let n = 0;
    while (this.acc >= this.q.dt && n < 2) {
      const enc = d.createCommandEncoder();
      sim.step(enc, this.q.dt);
      this.sparks.rate = this.power; this.sparks.step(enc, this.q.dt);
      d.queue.submit([enc.finish()]);
      this.acc -= this.q.dt; n++;
    }
    if (n === 2) this.acc = Math.min(this.acc, this.q.dt);

    r.setCamera(this._cam(camera));
    const j = (this.frame % 16) + 1, hal = (i, b) => { let f = 1, v = 0; while (i > 0) { f /= b; v += f * (i % b); i = Math.floor(i / b); } return v; };
    r.uploadParams(sim.time, this.frame++, [hal(j, 2) - 0.5, hal(j, 3) - 0.5]);
    const enc = d.createCommandEncoder();
    r.renderHDR(enc);
    this.sparks.draw(enc, 1 / 120);
    r.temporal(enc, this.moving ? 0.8 : 0.4);
    r.bloom(enc, true);
    if (present) r.final(enc, this.ctx.getCurrentTexture().createView(), this.format, true);
    // 헤드리스 캡처(present=false)에서는 불빛 읽어오기를 쉰다: 소프트웨어 WebGPU에서 버퍼 매핑이 밀려 캡처가 멈춘다.
    if (present) r.readLights(enc);
    d.queue.submit([enc.finish()]);
    if (present) r.collectLights().then((ls) => {
      if (!ls.seq || ls.seq === this._prevSeq) return;
      const dt = this._prevSeq ? Math.max((ls.t - this._prevT) / 1000, 1e-3) : 1;
      const L = this.light;
      L.ref = L.ref ? L.ref + (ls.L - L.ref) * (1 - Math.exp(-Math.min(dt, 1) / 3.3)) : ls.L;
      L.raw = ls.L; L.level = L.ref > 0 ? ls.L / L.ref : 1; L.power = this.power; L.at = performance.now();
      this._prevSeq = ls.seq; this._prevT = ls.t;
    }).catch(() => {});
  }

  // 개발용: 현재 프레임을 RGBA8로 읽어 온다 (src/dev/capture.js)
  async readPixels() {
    const d = this.device, w = this.w, h = this.h, bpr = Math.ceil(w * 4 / 256) * 256;
    const tex = d.createTexture({ size: [w, h], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    const buf = d.createBuffer({ size: bpr * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = d.createCommandEncoder();
    this.renderer.final(enc, tex.createView(), 'rgba8unorm', true);
    enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: bpr }, [w, h]);
    d.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(buf.getMappedRange()), data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) data.set(src.subarray(y * bpr, y * bpr + w * 4), y * w * 4);
    buf.unmap(); buf.destroy(); tex.destroy();
    return { data, w, h };
  }
}
