// 벽난로 불 레이어 (1단계: "Plan B").
// procedural-fire(MIT, Leon Lin)의 연소 시뮬레이션과 볼륨 렌더러를 자체 WebGPU 장치로 돌려 별도 캔버스에 그린다.
// 그 캔버스는 방(three.js) 캔버스 아래에 깔리고, 방 쪽은 화구 입구에 알파 0의 "구멍"을 뚫어 불이 비쳐 보인다.
// 카메라는 매 프레임 플레이어 시점과 맞춘다. 불의 좌표계는 장작 받침대 중심이 원점, +z가 방 쪽이다.
import { initGPU } from './vendor/gpu.js';
import * as THREE from 'three/webgpu';
import { FireSim } from './vendor/sim.js';
import { Renderer } from './vendor/renderer.js';
import { Sparks } from './vendor/sparks.js';
import { makeNoiseTexture, makeCurlTexture } from './vendor/noise.js';
import { FIREPLACE as FP, ROOM } from '../scene/layout.js';

// 품질 값은 src/ui/fireConfig.js의 프리셋과 설정창에서 온다. 계산 영역은 화구 안쪽(0.9 × 1.1 × 0.56 m)만 덮는다.

// 장작 받침대 위 가로 장작 3개 + 숯 속 토막 1개 (참고 이미지의 배치). a, b = 양 끝, r = 반지름, burn = 타는 정도.
const LOGS = [
  { a: [-0.27, 0.085, -0.10], b: [0.28, 0.095, -0.08], r: 0.060, burn: 0.8 },
  { a: [-0.25, 0.080, 0.07], b: [0.26, 0.075, 0.09], r: 0.055, burn: 0.8 },
  { a: [-0.21, 0.195, -0.035], b: [0.23, 0.21, 0.015], r: 0.052, burn: 1.0 },
  { a: [-0.09, 0.035, 0.0], b: [0.08, 0.03, -0.03], r: 0.032, burn: 1.0 },
];
const pack = (items, fn, max = 16) => { const f = new Float32Array(max * 8); items.slice(0, max).forEach((it, i) => f.set(fn(it), i * 8)); return f; };

export class FireLayer {
  // q = toQuality(설정값) (src/ui/fireConfig.js), name = 표시용 이름
  static async create(canvas, { q, name = '', debug = {} }) {
    const { device, features } = await initGPU();
    const layer = new FireLayer(canvas, device, features, q, name); layer.debug = debug; return layer;
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
    if (q.pre) this.sim.mgPre = q.pre; if (q.post) this.sim.mgPost = q.post; if (q.coarse) this.sim.mgCoarse = q.coarse; // 압력 풀이 반복 횟수
    const scene = { logs: LOGS, stones: [] };
    this.renderer = new Renderer(device, { sim: this.sim, scene, noiseTex, curlTex, logsF32, stonesF32: new Float32Array(16 * 8), format: this.format });
    Object.assign(this.renderer.params, {
      stepMul: q.stepMul, vignette: 0, grain: 0, chroma: 0, moon: 0, fogK: 0,
      // 화구 안쪽 치수 (불 좌표계): 반폭, 뒷벽 z, 입구 z, 높이
      fbX: FP.openW / 2, fbZB: -(ROOM.W - FP.fire.x), fbZF: FP.fire.x - FP.faceX, fbH: FP.openH,
    });
    if (q.render) Object.assign(this.renderer.params, q.render);
    this.renderer.surfScale = q.surfScale;
    this.sparks = new Sparks(device, { count: q.sparks, sim: this.sim, renderer: this.renderer, curlTex });
    // 벽난로 크기의 불: 모닥불(60kW)보다 훨씬 작게. 2단계에서 화구 경계 조건과 함께 다시 맞춘다.
    this.sim.setParams({ bedRadius: 0.17, hotR0: 0.08, hotR1: 0.3, hotY1: 0.35 });
    this.power = 0.03; this.target = 0.62; this.acc = 0; this.frame = 0; this.w = 0; this.h = 0;
    this.light = { level: 1, raw: 0, ref: 0, power: 0, at: 0 };
    this._prevSeq = 0; this._prevT = 0; this.burstUntil = 0; this.popClock = 1; this.lost = false; this.simMs = 0;
    device.lost.then(() => { this.lost = true; });
  }

  // 화실 벽돌의 사진 텍스처(ambientCG)를 읽어 불 셰이더에 넘긴다. 읽지 못하면 코드로 그린 벽돌이 남는다.
  async loadBrick(dir = 'textures/firebrick/', size = 512) {
    try {
      const load = async (name, format) => {
        const r = await fetch(dir + name); if (!r.ok) throw new Error(name + ' ' + r.status);
        const bmp = await createImageBitmap(await r.blob(), { resizeWidth: size, resizeHeight: size, resizeQuality: 'high', colorSpaceConversion: 'none' });
        const t = this.device.createTexture({ size: [size, size], format, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
        this.device.queue.copyExternalImageToTexture({ source: bmp }, { texture: t }, [size, size]); bmp.close(); return t;
      };
      const [c, n] = await Promise.all([load('color.jpg', 'rgba8unorm-srgb'), load('normal.jpg', 'rgba8unorm')]);
      this.renderer.setBrick(c, n); return true;
    } catch (e) { console.warn('[fire] 화실 벽돌 텍스처를 읽지 못했습니다', e); return false; }
  }
  // 화면(방 캔버스)의 CSS 크기와 픽셀 배율을 알려 준다. 실제 불 화면 크기는 매 프레임 구멍 영역에 맞춰 정한다.
  resize(cssW, cssH, dpr = 1) { this.view = { w: cssW, h: cssH, dpr }; }

  // 벽난로 구멍이 화면에서 차지하는 사각형을 구한다(NDC, 여유 포함). 보이지 않으면 null.
  _holeRect(camera) {
    const v = this._v || (this._v = new THREE.Vector3()), hw = FP.openW / 2 + 0.02;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, behind = 0;
    for (let i = 0; i < 8; i++) {
      // 구멍 입구 네 모서리와 화실 안쪽 네 모서리 (안쪽은 비스듬히 볼 때 필요)
      v.set(i & 4 ? FP.faceX + FP.depth : FP.faceX, FP.hearthH + (i & 2 ? FP.openH + 0.02 : -0.02), FP.zc + (i & 1 ? hw : -hw));
      v.applyMatrix4(camera.matrixWorldInverse);
      if (v.z > -0.05) { behind++; continue; }
      v.applyMatrix4(camera.projectionMatrix);
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
    }
    if (behind === 8) return null;
    if (behind) return { x0: -1, y0: -1, x1: 1, y1: 1 }; // 구멍에 바짝 붙었을 때는 화면 전체
    x0 = Math.max(-1, x0); y0 = Math.max(-1, y0); x1 = Math.min(1, x1); y1 = Math.min(1, y1);
    if (x1 - x0 < 0.004 || y1 - y0 < 0.004) return null;
    return { x0, y0, x1, y1 };
  }
  // 구멍 사각형에 맞춰 불 캔버스의 위치와 해상도를 정한다. 해상도는 계단식으로만 바꿔 잦은 재할당을 피한다.
  _fitCrop(rect) {
    const V = this.view, cw = (rect.x1 - rect.x0) / 2 * V.w, ch = (rect.y1 - rect.y0) / 2 * V.h;
    const st = this.canvas.style;
    st.left = ((rect.x0 + 1) / 2 * V.w) + 'px'; st.top = ((1 - rect.y1) / 2 * V.h) + 'px'; st.width = cw + 'px'; st.height = ch + 'px';
    const STEP = 64, budget = this.q.maxPixels || 1e6;
    let k = V.dpr * this.q.scale;
    if (cw * ch * k * k > budget) k = Math.sqrt(budget / (cw * ch)); // 가까이 다가가면 밀도를 낮춰 픽셀 수를 상한 안에 둔다
    let w = Math.max(128, Math.ceil(cw * k / STEP) * STEP), h = Math.max(128, Math.ceil(ch * k / STEP) * STEP);
    // 조금 줄어든 정도로는 다시 만들지 않는다(걸을 때 깜박임 방지)
    if (this.w && w <= this.w && h <= this.h && w >= this.w - 2 * STEP && h >= this.h - 2 * STEP) { w = this.w; h = this.h; }
    if (w !== this.w || h !== this.h) {
      this.w = w; this.h = h; this.canvas.width = w; this.canvas.height = h;
      this.renderer.resize(w, h, this.q.volScale);
    }
    // 화면에서의 위치(0..1, 위가 0): 개발용 캡처가 합성할 때 쓴다
    this.crop = { u0: (rect.x0 + 1) / 2, v0: (1 - rect.y1) / 2, u1: (rect.x1 + 1) / 2, v1: (1 - rect.y0) / 2 };
  }

  // 방 좌표 → 불 좌표: (x, y, z)불 = (z - zc, y - 화로대 높이, -(x - 불 중심 x))
  camPos(camera) { const e = camera.matrixWorld.elements, f = FP.fire; return [e[14] - f.z, e[13] - f.y, -(e[12] - f.x)]; }
  _cam(camera) {
    const e = camera.matrixWorld.elements, f = FP.fire;
    const P = (x, y, z) => [z - f.z, y - f.y, -(x - f.x)], D = (x, y, z) => [z, y, -x];
    // 구멍 영역만 그리는 비대칭 시야: 세로 시야는 영역 높이만큼, 중심은 shift만큼 옮긴다
    const T = Math.tan(camera.fov * Math.PI / 360), A = camera.aspect, r = this.rect;
    const hx = (r.x1 - r.x0) / 2, hy = (r.y1 - r.y0) / 2, cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
    return { pos: P(e[12], e[13], e[14]), fwd: D(-e[8], -e[9], -e[10]), right: D(e[0], e[1], e[2]), up: D(e[4], e[5], e[6]),
      fovY: 2 * Math.atan(T * hy), tanFov: T * hy, aspect: (A * hx) / hy, shiftX: cx * T * A, shiftY: cy * T };
  }

  // 설정창에서 바로 바꿀 수 있는 값(다시 불러오지 않아도 되는 그리기 매개변수)
  setLive(v) {
    const p = this.renderer.params;
    for (const k of ['cubic', 'flameSharp', 'detailAmt', 'sootEdge', 'stepMul']) if (v[k] != null) p[k] = v[k];
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
    if (this.popClock <= 0 && !this.popsFromAudio) { this.popClock = 0.8 + Math.random() * 3; this.event({ type: 'pop', strength: 0.2 + Math.random() * 0.6 }); }
    this.acc += dtReal;
    let n = 0;
    this._t0 = this._t0 || now; const simOff = this.debug?.nosim && now - this._t0 > 20000; if (simOff) this.acc = 0; // 측정용: 불이 붙은 뒤 시뮬레이션 정지
    while (this.acc >= this.q.dt && n < (this.q.maxSteps || 2)) {
      const enc = d.createCommandEncoder();
      sim.step(enc, this.q.dt);
      this.sparks.rate = this.power; this.sparks.step(enc, this.q.dt);
      d.queue.submit([enc.finish()]);
      this.acc -= this.q.dt; n++;
    }
    if (n === (this.q.maxSteps || 2)) this.acc = Math.min(this.acc, this.q.dt);

    // 구멍이 화면에 없으면 불은 그리지 않고 시뮬레이션만 돌린다(불빛은 마지막 값 유지 → main이 대체 흔들림으로 잇는다)
    this.rect = this.debug?.norender ? null : this._holeRect(camera);
    this.canvas.style.visibility = this.rect ? 'visible' : 'hidden';
    if (!this.rect) { this.frame++; this.hidden = true; return; }
    this.hidden = false;
    this._fitCrop(this.rect);
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
