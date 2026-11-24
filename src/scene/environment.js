// 창밖 세계와 시간: 컴퓨터 시계와 위치로 해·달을 놓고, 하늘색·햇빛·달빛·실내 주변광을 맞춘다.
// 계절은 실제 날짜를 따르고(남반구는 반대), 숲과 땅의 색이 계절에 따라 바뀐다.
// 날씨는 기본이 실제 날씨(weather.js: 구름 양, 안개, 비, 눈, 바람, 지난 기록으로 계산한 쌓인 눈)이고 직접 고를 수도 있다.
// 구름 clouds.js, 비와 눈 precip.js, 지붕·마루의 눈 snowcover.js. 안개는 방 안을 채우지 않는다(장면 안개를 바깥에만 건다).
// 창은 남쪽(-Z)을 본다: 북 = +Z, 동 = -X.
// 기획서의 "광원별 분리 굽기" 대신 실시간 조명(그림자 있는 해/달빛 + 하늘 주변광 + 창가 보조광)으로 단순화했다.
import * as THREE from 'three/webgpu';
import { ROOM, WINDOW } from './layout.js';
import { sunPosition, moonPosition, moonPhase, seasonOf } from './astro.js';
import { rng } from './textures.js';
import { buildForest } from './trees.js';
import { Sky } from './sky.js';
import { Weather, WEATHER_MODES, KIND_NAMES, presetWeather } from './weather.js';
import { Clouds, noiseTexture, threshold } from './clouds.js';
import { Precip } from './precip.js';
import { SnowCover } from './snowcover.js';
import { FOOT, DECK, STEP, ROOF } from './outdoor.js';
import { Fn, uniform, texture, uv, mix, smoothstep, positionWorld, positionView, cameraPosition, length, exp, max, float, vec3, fog, select } from 'three/tsl';

const KEY = 'nanro.env', DEG = Math.PI / 180;
export const SEOUL = { lat: 37.5665, lon: 126.978 };
export const WEATHERS = WEATHER_MODES;          // 설정창의 날씨 고르기 (?weather=auto 는 예전처럼 계절에 맞춘 날씨)
export { KIND_NAMES };
export const SEASONS = { auto: '자동 (오늘 날짜)', winter: '겨울', spring: '봄', summer: '여름', autumn: '가을' };
const lerpTab = (tab, x) => { if (x <= tab[0][0]) return tab[0][1]; for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) { const [a, va] = tab[i - 1], [b, vb] = tab[i]; return va + (vb - va) * (x - a) / (b - a); } return tab[tab.length - 1][1]; };
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const C = (hex) => new THREE.Color(hex);

// 해 고도(도)에 따른 하늘색 (천정, 지평선)
const SKY_KEYS = [
  [-18, 0x04060d, 0x0a101c], [-8, 0x0a1226, 0x1d2238], [-3, 0x18274a, 0x7a4a4a], [0.5, 0x2c4f86, 0xe89350],
  [6, 0x3a6fb4, 0xd9c0a0], [16, 0x3a76c4, 0xb9d0e6], [60, 0x2f6fc8, 0xa9c8ea],
];
const PALETTE = {
  winter: { ground: 0xdfe6ee, bare: 0x6e6a4c, conifer: 0x243a2c, crown: null, hill: 0x8f9bab },   // bare = 눈 없는 겨울의 마른 풀
  spring: { ground: 0x5f7d3a, conifer: 0x1f3d27, crown: [0x8fbf5a, 0xa8cf6a, 0x9cc860, 0xe8b7c8], hill: 0x4c6a4a },
  summer: { ground: 0x3f6a2c, conifer: 0x173220, crown: [0x2f6a2a, 0x3d7a30, 0x27581f], hill: 0x2f5238 },
  autumn: { ground: 0x7d6a38, conifer: 0x1c3522, crown: [0xc2571a, 0xd98a1e, 0xa8321a, 0xc9a227, 0x7a5a20], hill: 0x6a5a3a },
};

export class Environment {
  constructor(scene, ctx, renderer, { url } = {}) {
    this.scene = scene; this.ctx = ctx; this.renderer = renderer;
    this.opts = { timeMode: 'real', hour: 21, weather: 'real', season: 'auto', lat: SEOUL.lat, lon: SEOUL.lon, located: false };
    try { Object.assign(this.opts, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* 저장소 없음 */ }
    if (!this.opts.wv) { if (this.opts.weather === 'auto') this.opts.weather = 'real'; this.opts.wv = 2; }   // 예전 기본값(계절 자동)은 실제 날씨로
    if (url) {                                             // 주소 옵션: ?time=18.5 ?weather=snow ?season=winter ?date=2026-01-15
      if (url.has('time')) { this.opts.timeMode = 'manual'; this.opts.hour = Number(url.get('time')); }
      if (url.has('weather')) this.opts.weather = url.get('weather');
      if (url.has('season')) this.opts.season = url.get('season');
      if (url.has('date')) this.dateOverride = new Date(url.get('date') + 'T12:00:00');
      this.fromUrl = url.has('time') || url.has('weather') || url.has('season');
    }
    this.state = { sunAlt: 0, day: 0, night: 1, season: 'winter', weather: 'clear', overcast: 0, cloud: 0, moonFrac: 0, snowDepth: 0, wind: 0, rain: 0, thunderN: 0 };
    this.dirty = true; this.acc = 0; this.flashT = -1; this.boltT = 6;
    this.weather = new Weather({ url, getLoc: () => this.opts, active: () => this.opts.weather === 'real', onData: () => { this.dirty = true; } });
    this._build();
  }
  save() { if (!this.fromUrl) try { localStorage.setItem(KEY, JSON.stringify(this.opts)); } catch { /* 무시 */ } }
  set(patch) { Object.assign(this.opts, patch); this.dirty = true; this.save(); if (patch.weather === 'real' || 'lat' in patch) this.weather.tick(); }
  // 위치를 묻는다. 실패하면 서울(기본값)을 그대로 쓰고, 까닭을 locStatus 에 남긴 뒤 1분, 3분, 10분 뒤에 다시 묻는다.
  // 윈도우는 켤 때 위치 서비스가 늦게 답하는 일이 많아 기다리는 시간을 넉넉히 둔다. 돌려주는 것: 끝나면 풀리는 약속
  locate(again = 0) {
    clearTimeout(this._locT);
    if (this.opts.located) { this.locStatus = 'ok'; return Promise.resolve(true); }
    if (!navigator.geolocation) { this.locStatus = 'none'; return Promise.resolve(false); }
    this.locStatus = 'asking';
    return new Promise((done) => navigator.geolocation.getCurrentPosition(
      (p) => { this.locStatus = 'ok'; this.set({ lat: +p.coords.latitude.toFixed(2), lon: +p.coords.longitude.toFixed(2), located: true }); done(true); },
      (e) => { this.locStatus = e?.code === 1 ? 'denied' : e?.code === 3 ? 'timeout' : 'unavailable'; this.locError = e?.message || ''; if (e?.code !== 1 && again < 3) this._locT = setTimeout(() => this.locate(again + 1), [60, 180, 600][again] * 1000); done(false); },
      { timeout: 30000, maximumAge: 864e5, enableHighAccuracy: false }));
  }
  now() {
    const d = this.dateOverride ? new Date(this.dateOverride) : new Date();
    if (this.opts.timeMode === 'manual') { const h = this.opts.hour; d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0); }
    return d;
  }

  _build() {
    const g = (this.group = new THREE.Group()); g.name = 'outside'; this.scene.add(g);
    const r = rng(404), wx = (WINDOW.x0 + WINDOW.x1) / 2;
    // ---- 하늘 (세로 그라데이션 텍스처를 씌운 구). 별·해·달은 sky.js 가 그린다.
    const cv = (this.skyCv = document.createElement('canvas')); cv.width = 4; cv.height = 256;
    this.skyTex = new THREE.CanvasTexture(cv); this.skyTex.colorSpace = THREE.SRGBColorSpace;
    this.skyMat = new THREE.MeshBasicMaterial({ map: this.skyTex, side: THREE.BackSide, fog: false, depthWrite: false });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(48, 24, 16), this.skyMat); sky.renderOrder = -3; sky.position.set(wx, 0, 0); g.add(sky);
    this.sky = new Sky(g);                                 // 별·은하수·별자리·해·달 (src/scene/sky.js)
    this.clouds = new Clouds(g, sky.position);            // 구름 (별과 해·달 위에 그린다)
    for (let i = 0; i < 31200; i++) r();                   // 예전 별 그림이 쓰던 난수만큼 건너뛴다(숲과 능선 배치가 그대로 남게)

    // ---- 땅, 먼 능선, 숲
    this.groundMat = this._groundMaterial();   // 방 안을 찍은 반사 그림은 바깥 땅에 비치면 안 된다(풀밭이 반짝이는 점무늬로 보인다)
    const gg = new THREE.PlaneGeometry(160, 90, 96, 54); { const uv = gg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 160, uv.getY(i) * 90); }  // 미터 단위 UV
    // 완만한 굴곡과 눈 둔덕 (집 가까이는 평평하게). 평면의 +y가 집 쪽이고, 눕히면 z가 높이가 된다.
    { const p = gg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = -p.getY(i), far = sstep(40, 34, y); p.setZ(i, far * (0.22 * Math.sin(x * 0.31 + y * 0.17) * Math.sin(y * 0.23 + 1.3) + 0.12 * Math.sin(x * 0.83 + 2.1) * Math.sin(y * 0.71) + 0.02 * (45 - y) * 0.6 * sstep(20, -30, y))); } gg.computeVertexNormals(); }
    const ground = new THREE.Mesh(gg, this.groundMat); ground.rotation.x = -Math.PI / 2; ground.position.set(wx, -0.45, -44.6); ground.receiveShadow = true; g.add(ground);
    // 집 옆과 뒤의 평평한 땅(문밖으로 나갔을 때 보인다). 위 땅의 집 쪽 끝(z = 0.4)에서 북쪽으로 이어진다.
    { const g2 = new THREE.PlaneGeometry(160, 60); const uv = g2.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 160, uv.getY(i) * 60);
      const back = (this.backGround = new THREE.Mesh(g2, this.groundMat)); back.rotation.x = -Math.PI / 2; back.position.set(wx, -0.45, 30.4); back.receiveShadow = true; g.add(back); }
    this.hillMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: false });
    for (const [z, base, amp, seed] of [[-40, 1.2, 2.6, 1], [-46, 2.4, 4.2, 2]]) {
      const n = 80, pos = [], idx = [];
      for (let i = 0; i <= n; i++) { const x = -70 + 140 * i / n, h = base + amp * (0.5 + 0.5 * Math.sin(i * 0.21 + seed * 2)) * (0.6 + 0.4 * Math.sin(i * 0.07 + seed)) + (r() - 0.5) * 0.8; pos.push(x, -1, 0, x, h, 0); if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, this.hillMat); m.position.set(wx, 0, z); g.add(m);
    }
    // 숲: 그림으로 그린 전나무와 넓은잎나무 (src/scene/trees.js)
    const spot = () => { for (;;) { const z = -4.5 - Math.pow(r(), 0.8) * 32, x = wx + (r() - 0.5) * (14 + -z * 1.3); if (z > -16 && Math.abs(x - wx) < 3.2 + (z + 16) * 0.12) continue; return [x, z]; } };
    this.forest = buildForest({ spot }); g.add(this.forest.group);
    // 집 옆과 뒤의 숲: 문을 열었거나 밖에 있을 때만 그린다(방 안에서는 보이지 않는다). 마당(걸을 수 있는 곳) 안에는 심지 않는다.
    const spot2 = () => { for (;;) { const x = ROOM.W / 2 + (r() - 0.5) * 70, z = -4 + r() * 40; if (x > -10 && x < ROOM.W + 13 && z < ROOM.D + 11) continue; if (z < -4.5 && Math.abs(x - wx) < 18) continue; return [x, z]; } };
    this.forestBack = buildForest({ seed: 505, spot: spot2, conifers: 130, broadleaf: 45 }); this.forestBack.group.visible = false; g.add(this.forestBack.group); this.backGround.visible = false;
    // 먼 숲의 윤곽: 전나무 숲 그림자를 그린 띠를 두 겹 세운다 (깊이감)
    { const fc2 = document.createElement('canvas'); fc2.width = 2048; fc2.height = 256; const f = fc2.getContext('2d'); f.fillStyle = '#fff';
      for (let i = 0; i < 520; i++) { const x = r() * 2048, hh = 70 + r() * 150, w2 = hh * (0.2 + r() * 0.1); for (let k = 0; k < 6; k++) { const t = k / 6, yy = 256 - hh * (1 - t), hw = w2 * (0.15 + 0.85 * t); f.beginPath(); f.moveTo(x, yy - hh * 0.22); f.lineTo(x + hw, yy + hh * 0.05); f.lineTo(x - hw, yy + hh * 0.05); f.fill(); } }
      f.fillRect(0, 236, 2048, 20);
      const mkTex = () => { const tl = new THREE.CanvasTexture(fc2); tl.wrapS = THREE.RepeatWrapping; tl.anisotropy = 8; return tl; };
      this.lineMats = [];
      for (const [z, h2, rep, y0] of [[-30, 7, 3, -0.6], [-37, 10, 2, -0.4]]) { const mt = new THREE.MeshBasicMaterial({ map: mkTex(), transparent: true, alphaTest: 0.5, fog: true }); mt.map.repeat.set(rep, 1); mt.map.offset.x = z * 0.13; mt.map.needsUpdate = true; this.lineMats.push(mt); const m = new THREE.Mesh(new THREE.PlaneGeometry(150, h2), mt); m.position.set(wx, y0 + h2 / 2, z); g.add(m); } }
    // 창 바깥의 눈: 창턱과 창살 위에 쌓인 눈, 유리 구석의 성에 (눈이 있는 철에만 보인다)
    { const sg = (this.sillSnow = new THREE.Group()), sm = (this.sillSnowMat = new THREE.MeshStandardMaterial({ color: 0xeef2f7, roughness: 0.95 }));
      const ww = WINDOW.x1 - WINDOW.x0, wh = WINDOW.y1 - WINDOW.y0, heaps = (this.heaps = []), heap = (w2, h2, d2, x, y, z) => { const geo = new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), m = new THREE.Mesh(geo, sm); m.scale.set(w2, h2 * 2, d2); m.position.set(x, y, z); sg.add(m); heaps.push([m, h2 * 2]); };
      heap(ww + 0.1, 0.07, 0.16, wx, WINDOW.y0 - 0.0, -0.17); for (let i = 0; i < 5; i++) heap(0.25 + r() * 0.3, 0.05 + r() * 0.05, 0.15, WINDOW.x0 + ww * (0.1 + 0.2 * i) + (r() - 0.5) * 0.1, WINDOW.y0, -0.17);
      for (let j = 1; j < WINDOW.rows; j++) for (let i = 0; i < WINDOW.cols; i++) heap(ww / WINDOW.cols * (0.5 + r() * 0.4), 0.018 + r() * 0.02, 0.05, WINDOW.x0 + ww * (i + 0.5) / WINDOW.cols + (r() - 0.5) * 0.08, WINDOW.y0 + wh * j / WINDOW.rows + 0.012, -0.15);
      const fr = document.createElement('canvas'); fr.width = 512; fr.height = 640; const x2 = fr.getContext('2d');
      for (let j = 0; j < WINDOW.rows; j++) for (let i = 0; i < WINDOW.cols; i++) { const cw = 512 / WINDOW.cols, ch = 640 / WINDOW.rows, x0 = i * cw, y0 = j * ch;
        // 유리 아래쪽과 구석에 낀 성에: 위 가장자리가 고르지 않은 띠
        x2.save(); x2.beginPath(); x2.rect(x0 + 2, y0, cw - 4, ch); x2.clip(); x2.filter = 'blur(5px)'; x2.fillStyle = 'rgba(232,240,250,.8)'; x2.beginPath(); x2.moveTo(x0 - 10, y0 + ch + 10);
        const p1 = r() * 6, p2 = r() * 6; for (let k = 0; k <= 24; k++) { const u = k / 24, edge = Math.pow(Math.abs(u - 0.5) * 2, 2.2); x2.lineTo(x0 + u * cw, y0 + ch - ch * (0.035 + 0.16 * edge + 0.025 * Math.sin(u * 19 + p1) + 0.02 * Math.sin(u * 43 + p2))); }
        x2.lineTo(x0 + cw + 10, y0 + ch + 10); x2.fill(); x2.restore(); }
      const id = x2.getImageData(0, 0, 512, 640); for (let i = 3; i < id.data.length; i += 4) id.data[i] *= 0.45 + 0.55 * r(); x2.putImageData(id, 0, 0);
      const ft = new THREE.CanvasTexture(fr); ft.colorSpace = THREE.SRGBColorSpace;
      this.frostMat = new THREE.MeshBasicMaterial({ map: ft, transparent: true, depthWrite: false, fog: false, opacity: 0.5 });
      const frost = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), this.frostMat); frost.position.set(wx, (WINDOW.y0 + WINDOW.y1) / 2, -0.128); sg.add(frost); g.add(sg); }
    // ---- 비와 눈 (집과 처마 밑에는 오지 않는다), 지붕·마루·계단에 쌓인 눈
    const ridgeY = ROOF.base + (ROOF.zr - FOOT.z0) * Math.tan(ROOF.a) + 0.3;
    this.precip = new Precip(g, { x0: -ROOF.side - 0.15, x1: ROOM.W + ROOF.side + 0.15, z0: FOOT.z0 - ROOF.over - 0.05, z1: FOOT.z1 + ROOF.over + 0.05, y1: ridgeY });
    this.snowMat = new THREE.MeshStandardNodeMaterial({ color: 0xeef2f7, roughness: 0.92, envMapIntensity: 0 });
    { const sc = (this.snowCover = new SnowCover()), eave = ROOM.W + ROOF.side + 0.05, path = [3.1, 4.1], dz = (DECK.z1 - DECK.z0 - 0.3) / 2, dzc = (DECK.z0 + DECK.z1) / 2;
      for (const [i, m] of (this.ctx.roofSlabs || []).entries()) sc.onBox(m, 0.9, [0.06, 0.06, i ? -0.05 : 0.05, i ? 0.05 : -0.05], i ? [1, 1, 0, 1] : [1, 1, 1, 0]);   // 용마루 쪽은 둥글리지 않고 조금 늘여 두 면이 맞닿게
      // 마루와 계단: 처마 밑으로 갈수록 얇아지고, 문에서 계단까지는 사람이 쓸어 낸 길이라 얕게 파여 있다
      const sst = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
      const trench = (x, z) => 1 - 0.93 * sst(path[0] - 0.2, path[0] + 0.1, z) * sst(path[1] + 0.2, path[1] - 0.1, z), cuts = [path[0] - 0.2, path[0] - 0.05, path[0] + 0.1, path[1] - 0.1, path[1] + 0.05, path[1] + 0.2];
      sc.field(ROOM.W + 0.2, DECK.x1 + 0.01, 0, DECK.z0 + 0.01, DECK.z1 - 0.01, [eave - ROOM.W - 0.1, 0.16, 0.16, 0.16], trench, cuts);
      for (let k = 1; k <= STEP.n; k++) { const x0 = DECK.x1 + (k - 1) * STEP.run + 0.02, x1 = DECK.x1 + k * STEP.run + 0.01;
        sc.field(x0, x1, -k * STEP.rise, dzc - dz + 0.01, dzc + dz - 0.01, [0.08, 0.1, 0.12, 0.12], (x, z) => 0.6 * trench(x, z), cuts); }
      sc.build(g, this.snowMat); }

    // ---- 조명: 해 또는 달(그림자), 하늘 주변광, 창으로 들어오는 하늘빛 보조광
    const sun = (this.sunLight = new THREE.DirectionalLight(0xffffff, 0));
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0015; sun.shadow.normalBias = 0.02;
    const sc2 = sun.shadow.camera; sc2.left = -5; sc2.right = 5; sc2.top = 5; sc2.bottom = -5; sc2.near = 1; sc2.far = 34;
    sun.shadow.autoUpdate = false;                          // 해는 천천히 움직인다: 위치를 다시 계산할 때만 그림자를 갱신
    sun.target.position.set(ROOM.W / 2, 0.6, ROOM.D / 2 - 0.6); this.scene.add(sun, sun.target);
    this.hemi = new THREE.HemisphereLight(0x223355, 0x1a0f08, 0.5); this.scene.add(this.hemi);
    this.fill = new THREE.PointLight(0x9fb8d8, 0, 9, 1.6); this.fill.position.set(wx, 1.5, 0.9); this.scene.add(this.fill);
    this.scene.fog = new THREE.Fog(0x000000, 9, 70);
    // 장면 안개: 예전의 거리 안개(먼 숲이 흐려지는 공기 원근) + 보이는 거리(가시거리)에 따른 안개. 방 안의 물체에는 걸지 않는다.
    // 장면의 먼 것(숲 끝, 산)은 실제로는 수 km 밖이라, 거리를 멀수록 크게 늘여(d·e^(d/12)) 가시거리와 비교한다.
    { const F = this.scene.fog, U = (this.fogU = { near: uniform(9), far: uniform(70), vis: uniform(30000) });
      const d = length(positionView), base = smoothstep(U.near, U.far, d), vf = float(1).sub(exp(d.mul(exp(d.div(12))).mul(-3.912).div(U.vis)));
      const inRoom = (p, e) => p.x.greaterThan(-e).and(p.x.lessThan(ROOM.W + e)).and(p.z.greaterThan(-e)).and(p.z.lessThan(ROOM.D + e)).and(p.y.lessThan(ROOF.base + 2.2));
      const box = (p, x0, x1, z0, z1) => p.x.greaterThan(x0).and(p.x.lessThan(x1)).and(p.z.greaterThan(z0)).and(p.z.lessThan(z1));
      // 집 껍데기: 벽 두께(창틀·창살·유리 포함)와, 천장 높이 위로는 처마까지의 지붕(방 안에서 천장 너머로 비치는 지붕 밑면)
      const shell = (p) => p.y.lessThan(ROOF.base + 2.2).and(box(p, FOOT.x0 - 0.02, FOOT.x1 + 0.02, FOOT.z0 - 0.02, FOOT.z1 + 0.02)
        .or(p.y.greaterThan(ROOM.H - 0.1).and(box(p, -ROOF.side - 0.2, ROOM.W + ROOF.side + 0.2, FOOT.z0 - ROOF.over - 0.1, FOOT.z1 + ROOF.over + 0.1))));
      const inside = shell(positionWorld).and(inRoom(cameraPosition, 0.3));   // 방 안에서 본 방과 집(벽 안쪽 면, 천장, 창)
      this.fogCol = uniform(new THREE.Color()); this.scene.fogNode = fog(this.fogCol, select(inside, float(0), max(base, vf))); }
  }

  // 바깥 땅: 풀밭(또는 마른 땅) 사진과 눈 사진을 잡음 얼룩으로 섞는다. 눈이 얕으면 군데군데, 5cm쯤이면 다 덮인다.
  _groundMaterial() {
    const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); white.colorSpace = THREE.SRGBColorSpace; white.needsUpdate = true;
    const nz = noiseTexture(), U = (this.gU = { th: uniform(2), grassCol: uniform(new THREE.Color()), snowCol: uniform(new THREE.Color()), gRep: uniform(1), sRep: uniform(1), rough: uniform(1), glowG: uniform(new THREE.Color()), glowS: uniform(new THREE.Color()) });
    this.gTex = { grass: texture(white, uv().mul(U.gRep)), snow: texture(white, uv().mul(U.sRep)) };
    const n = texture(nz.tex, uv().mul(0.06)).b, cover = smoothstep(U.th.sub(0.035), U.th.add(0.035), n);
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 1, envMapIntensity: 0 });   // 방 안을 찍은 반사 그림은 바깥 땅에 비치면 안 된다(풀밭이 반짝이는 점무늬로 보인다)
    m.colorNode = mix(this.gTex.grass.rgb.mul(U.grassCol), this.gTex.snow.rgb.mul(U.snowCol), cover);
    m.roughnessNode = mix(U.rough, float(0.85), cover);
    m.emissiveNode = mix(vec3(U.glowG), vec3(U.glowS), cover);
    return m;
  }

  _skyColors(altDeg) {
    let i = 0; while (i < SKY_KEYS.length - 2 && altDeg > SKY_KEYS[i + 1][0]) i++;
    const a = SKY_KEYS[i], b = SKY_KEYS[i + 1], t = Math.max(0, Math.min(1, (altDeg - a[0]) / (b[0] - a[0])));
    return [C(a[1]).lerp(C(b[1]), t), C(a[2]).lerp(C(b[2]), t)];
  }
  _dir(az, alt, out = new THREE.Vector3()) { return out.set(-Math.sin(az) * Math.cos(alt), Math.sin(alt), Math.cos(az) * Math.cos(alt)); }

  // 문이 열렸거나 밖에 있을 때만 집 옆과 뒤의 땅과 숲을 그린다
  // 밖에서는 안개를 멀리 밀고(가까운 나무가 뿌옇지 않게), 해 그림자가 집 둘레 마당까지 닿게 넓힌다
  setOutdoorView(on) {
    this.outdoorView = on; this.forestBack.group.visible = on; this.backGround.visible = on;
    const c = this.sunLight.shadow.camera, s = on ? 13 : 5; c.left = c.bottom = -s; c.right = c.top = s; c.far = on ? 50 : 34; c.updateProjectionMatrix();
    this.sunLight.shadow.needsUpdate = true; this.dirty = true;
  }
  setGroundTextures(t) {
    this.groundTex = t;
    for (const k of ['grass', 'snow']) { const m = t?.[k]?.map; if (m) { this.gTex[k].value = m; this.gU[k === 'grass' ? 'gRep' : 'sRep'].value = m.repeat.x; } }
    if (t?.grass?.map && t?.snow?.map) this.groundMat.needsUpdate = true;
    this.recompute();
  }
  // 지금 쓸 날씨(장면 값). 실제 날씨가 없으면(받기 전, 받지 못함, 시험 모드) 예전처럼 계절에 맞춘 날씨
  _weatherNow(season) {
    const o = this.opts;
    if (o.weather === 'real') { const w = this.weather.get(); if (w) return w; }
    if (o.weather !== 'real' && o.weather !== 'auto' && WEATHERS[o.weather]) return presetWeather(o.weather, season);
    const w = presetWeather(season === 'winter' ? 'snow' : 'clear', season); w.source = 'season'; return w;
  }
  // 해·달·하늘·계절·날씨를 다시 계산한다 (몇 초에 한 번, 또는 설정이 바뀌었을 때)
  recompute() {
    const o = this.opts, date = this.now(), S = this.state;
    const sp = sunPosition(date, o.lat, o.lon), mp = moonPosition(date, o.lat, o.lon), ph = moonPhase(date);
    const alt = sp.alt / DEG, season = o.season !== 'auto' && PALETTE[o.season] ? o.season : seasonOf(date, o.lat);
    const W = this._weatherNow(season), day = sstep(-6, 8, alt), night = 1 - sstep(-14, -4, alt);
    // 쌓인 눈(cm): 받은 뒤로 흐른 시간만큼 지금도 눈이 오면 쌓이고, 영상이면 녹는다(다음에 받을 때까지)
    let depth = W.depth;
    if (W.source === 'real') { const h = Math.max(0, Math.min(6, (Date.now() - W.at) / 3.6e6)); depth = Math.max(0, depth + (W.snow > 0.01 ? W.snow * 0.9 * h : W.temp > 0 ? -0.06 * W.temp * h : 0)); }
    const vis = Math.max(50, W.vis), fogDense = sstep(5000, 600, vis);
    const cloud = Math.max(W.cloud, 0.95 * fogDense);                                // 짙은 안개도 별을 가린다
    const storm = Math.min(1, W.rain / 8 + W.snow / 3 + (W.thunder ? 0.5 : 0));
    const oc = Math.min(1, 0.9 * Math.pow(cloud, 1.6) + 0.15 * storm + 0.2 * fogDense);   // 흐림 정도(빛이 줄고 하늘이 회색이 된다)
    const cover = lerpTab([[0.2, 0], [1, 0.3], [3, 0.72], [5, 0.97], [6, 1]], depth); // 땅을 덮은 눈의 비율
    const weather = W.kind;
    Object.assign(S, { sunAlt: alt, sunAz: sp.az, moonAlt: mp.alt / DEG, day, night, season, weather, overcast: oc, cloud, moonFrac: ph.fraction, date,
      snowDepth: depth, snowCover: cover, vis, temp: W.temp, wind: W.wind, windDir: W.windDir, rain: Math.min(1, Math.sqrt(W.rain / 8)), snowRate: W.snow, thunder: W.thunder, source: W.source, label: W.label, wx: W });

    // 하늘
    let [zen, hor] = this._skyColors(alt);
    // 아침은 저녁보다 맑고 차가운 빛: 해가 동쪽에 낮게 있을 때 지평선을 연한 분홍, 하늘을 옅은 푸른빛으로 돌린다
    const dawn = (Math.sin(sp.az) > 0 ? 1 : 0) * sstep(-8, -1, alt) * (1 - sstep(5, 16, alt)) * (1 - 0.8 * oc);
    hor.lerp(C(0xe9b9b4), 0.6 * dawn); zen.lerp(C(0x7f9cc8), 0.5 * dawn); S.dawn = dawn;
    // 달 밝은 맑은 밤은 깊은 남색 하늘
    const moonLit = night * ph.fraction * sstep(-2, 25, S.moonAlt) * (1 - oc);
    zen.lerp(C(0x0c1a38), 0.75 * moonLit); hor.lerp(C(0x1a2844), 0.65 * moonLit);
    // 흐린 하늘: 밝기만 남은 고르고 평평한 회색(밤에는 어두운 회색, 눈 덮인 땅이 있으면 조금 밝다)
    const flat = sstep(0.45, 1, cloud), ovC = C(0x252830).lerp(C(0x30343c), cover * 0.7).lerp(C(0x8e949c).multiplyScalar(1 - 0.3 * storm), day);
    zen.lerp(ovC, 0.92 * flat); hor.lerp(ovC.clone().multiplyScalar(1.08), 0.85 * flat);
    // 안개와 눈보라: 하늘이 안개 색으로 묻힌다
    const fogC = ovC.clone().lerp(hor, 0.4).multiplyScalar(1.05);
    hor.lerp(fogC, sstep(15000, 1200, vis)); zen.lerp(fogC, 0.9 * sstep(4000, 300, vis));
    const x = this.skyCv.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, zen.getStyle()); gr.addColorStop(0.32, zen.clone().lerp(hor, 0.35).getStyle()); gr.addColorStop(0.5, hor.getStyle()); gr.addColorStop(1, hor.clone().multiplyScalar(0.6).getStyle());
    x.fillStyle = gr; x.fillRect(0, 0, 4, 256); this.skyTex.needsUpdate = true;
    this.skyScale = 1 + 1.6 * day; this.skyMat.color.setScalar(this.skyScale);
    const F = this.scene.fog; F.color.copy(hor).multiplyScalar(0.9 + 1.2 * day); F.near = this.outdoorView ? 22 : 9; F.far = 75 * (this.outdoorView ? 1.3 : 1);
    this.fogCol.value.copy(F.color); this.fogU.near.value = F.near; this.fogU.far.value = F.far; this.fogU.vis.value = vis;

    // 해와 달의 방향, 별 하늘 (구름 양은 state.cloud)
    const sd = this._dir(sp.az, sp.alt), md = this._dir(mp.az, mp.alt);
    this.sky.update({ date, lat: o.lat, lon: o.lon, sunDir: sd, moonDir: md, sunAlt: alt, moonAlt: S.moonAlt, moonFrac: ph.fraction, night, cloud: S.cloud, opts: o });

    // 햇빛 또는 달빛 (그림자 하나를 둘이 나눠 쓴다). 구름이 많을수록 부드럽게 줄어든다.
    const L = this.sunLight, sunI = 3.4 * sstep(-1.5, 12, alt) * (1 - 0.85 * oc);
    const moonI = alt < -4 ? 0.42 * (0.25 + 0.75 * ph.fraction) * sstep(1, 12, S.moonAlt) * (1 - oc) : 0;
    if (sunI > 0.01) { L.intensity = sunI; L.color.copy(C(0xff8344).lerp(C(0xfff0da), sstep(0, 18, alt))).lerp(C(0xdde4ee), 0.6 * oc); L.position.copy(L.target.position).addScaledVector(sd, 18); }
    else { L.intensity = moonI; L.color.set(0x9db8e8); L.position.copy(L.target.position).addScaledVector(md, 18); }
    L.castShadow = L.intensity > 0.01; L.shadow.needsUpdate = true;
    this.hemi.color.copy(zen).lerp(hor, 0.4).lerp(C(0xffffff), 0.55 * day).multiplyScalar(1 + day); this.hemi.groundColor.set(0x1a0f08).lerp(C(0x4a3a2c), day).lerp(C(0x8a9098), day * cover * 0.6);
    this.hemi.intensity = 0.3 + 0.5 * dawn + 0.2 * night * (0.3 + 0.7 * ph.fraction) * (1 - oc) + 1.5 * day * (1 - 0.35 * oc);
    this.fill.color.copy(hor).lerp(zen, 0.5).lerp(C(0xffffff), 0.5 * day); this.fill.color.lerp(C(0xffe9cf), 0.45 * day * (1 - oc)); this.fill.intensity = (10 * day + 5 * dawn + 0.5 * (1 - day) * (0.4 + 0.6 * Math.max(oc, cover))) * (1 - 0.3 * oc);
    this.renderer.toneMappingExposure = 1.12 - 0.2 * day;
    this._base = { hemi: this.hemi.intensity, fill: this.fill.intensity };

    // 구름: 양과 층, 바람, 색(낮에는 흰 윗면과 회색 밑면, 해 쪽 가장자리는 밝게, 밤에는 달빛과 땅빛에 옅게 뜬다)
    { const cl = this.clouds, U = cl.u, k = this.skyScale, lowSun = sstep(-6, 2, alt) * (1 - sstep(4, 18, alt));
      cl.set(W);
      const nightC = C(0x2e3139).lerp(C(0x3a4150), moonLit * 1.3).lerp(C(0x2a2d33), cover * 0.5);
      U.top.value.copy(nightC).lerp(C(0xffffff).multiplyScalar(0.86 - 0.3 * storm), day).lerp(hor.clone().multiplyScalar(1.6), 0.55 * lowSun).multiplyScalar(k);
      U.base.value.copy(nightC).multiplyScalar(0.6).lerp(C(0x9aa1ad).multiplyScalar(1 - 0.45 * storm), day).lerp(hor.clone().multiplyScalar(0.8), 0.4 * lowSun).multiplyScalar(k);
      U.sunCol.value.copy(L.color).multiplyScalar(sunI > 0.01 ? 0.7 * (1 - flat) : 0);
      U.sunDir.value.copy(sunI > 0.01 ? sd : md);
      U.hor.value.copy(hor).multiplyScalar(k); U.flatCol.value.copy(ovC).multiplyScalar(k); U.fogK.value = sstep(6000, 400, vis); }

    // 계절과 눈: 땅, 능선, 나무색
    const P = PALETTE[season], snowC = C(0xdfe6ee), bare = P.bare ?? P.ground;
    // 사진 텍스처가 있으면 풀밭/눈 사진을 깔고, 계절 색은 옅게 곱한다
    const gt = this.groundTex, gU = this.gU;
    if (gt?.grass?.map && gt?.snow?.map) { gU.grassCol.value.set(bare).lerp(C(0xffffff), 0.35).multiplyScalar(1.15); gU.snowCol.value.set(0xf2f5f8); }
    else { gU.grassCol.value.set(bare); gU.snowCol.value.copy(snowC); }
    gU.th.value = threshold(noiseTexture().qB, cover); gU.rough.value = 1 - 0.45 * W.wet;
    const nm = cover > 0.5 ? gt?.snow?.normalMap : gt?.grass?.normalMap, gm = this.groundMat;
    if (gt && gm.normalMap !== (nm || null)) { gm.normalMap = nm || null; gm.normalScale.setScalar(cover > 0.5 ? 0.8 : 0.45); gm.needsUpdate = true; }
    this.hillMat.color.set(P.hill).lerp(C(PALETTE.winter.hill), cover).multiplyScalar(0.05 + 0.6 * day).lerp(hor.clone().multiplyScalar(1 + 1.2 * day), 0.55 + 0.4 * sstep(20000, 1500, vis));   // 먼 산은 지평선 색에 물든다(안개 속에서는 사라진다)
    // 밤의 바깥: 달빛과 하늘빛에 눈이 푸르스름하게 떠오른다 (실내 조명과 섞이지 않게 바깥 재질의 자체 밝기로 준다)
    const glow = (1 - day) * (0.28 + 0.5 * ph.fraction * sstep(0, 12, S.moonAlt) * (1 - oc) + 0.3 * oc);
    gU.glowG.value.set(0x0c1a14).multiplyScalar(glow * 0.25); gU.glowS.value.set(0x3a517c).multiplyScalar(glow * 0.5);
    // 창턱과 창살 위의 눈, 지붕·마루·계단의 눈: 쌓인 깊이만큼 두껍게
    this.sillSnow.visible = depth > 0.3 || W.temp < 0; this.frostMat.opacity = 0.12 + 0.3 * sstep(3, -6, W.temp);
    this.heaps.forEach(([m, h], i) => { m.visible = depth > 0.3; m.scale.y = h * (i < 6 ? Math.max(0.15, Math.min(2.6, depth / 10)) : Math.max(0.15, Math.min(1, depth / 5))); });
    this.sillSnowMat.emissive.set(0x3a517c).multiplyScalar(glow * 0.3);
    this.snowCover.set(depth); this.snowMat.emissive.set(0x3a517c).multiplyScalar(glow * 0.3);
    // 나무 그림의 밝기와 색: 밤에는 달빛의 푸른 기운만 남고, 낮에는 햇빛 색을 조금 띤다. 흐린 날은 가라앉는다. 바람에 흔들린다.
    const treeLight = C(0x4a6696).multiplyScalar(glow * 0.62).lerp(C(0xffffff).lerp(L.color, 0.35 * (sunI > 0.01 ? 1 : 0)).multiplyScalar(1.55 - 0.5 * oc), day);
    const az = ((W.windDir ?? 270) + 180) * DEG, windTo = new THREE.Vector3(-Math.sin(az), 0, Math.cos(az));
    const fs = { snowy: !!W.treeSnow || (W.snow > 0.01 && depth > 1), crownColors: P.crown, light: treeLight, wind: W.wind, windTo };
    this.forest.set(fs); this.forestBack.set(fs);
    const lc = C(P.conifer).lerp(C(0x2a3a44), fs.snowy ? 1 : cover * 0.5).multiplyScalar(0.25 + 1.1 * day + 0.5 * glow);
    this.lineMats[0].color.copy(lc).lerp(hor.clone().multiplyScalar(1 + 1.2 * day), 0.3); this.lineMats[1].color.copy(lc).lerp(hor.clone().multiplyScalar(1 + 1.2 * day), 0.55);
    // 비와 눈
    this.precip.set({ rain: W.rain, snow: W.snow, wind: W.wind, windDir: W.windDir });
    const pu = this.precip.u; pu.snowCol.value.setScalar(0.4 + 1.5 * day); pu.rainCol.value.copy(C(0xc4ccd6)).multiplyScalar(0.1 + 1.1 * day);
    // 날씨가 눈에 띄게 바뀌면 방의 반사 그림을 다시 찍는다
    const sig = `${weather}|${Math.round(cloud * 5)}|${Math.round(cover * 4)}|${Math.round(fogDense * 3)}`;
    if (this._sig && sig !== this._sig) this.ctx.refreshEnv?.(0.5); this._sig = sig;
    this.dirty = false; this.onChange?.(S);
  }

  // 번개: 가끔 하늘과 방이 번쩍이고, 몇 초 뒤 멀리서 천둥이 운다(소리는 sfx.js의 Ambient가 state.thunderN을 보고 낸다)
  _lightning(dt) {
    const S = this.state;
    if (S.thunder && this.flashT < 0 && (this.boltT -= dt) <= 0) { this.flashT = 0; this.boltT = 10 + Math.random() * 35; this.boltK = 0.5 + Math.random() * 0.5; }
    if (this.flashT < 0) return;
    const t = (this.flashT += dt), f = this.boltK * (t < 0.07 ? 1 : t < 0.16 ? 0.15 : t < 0.24 ? 0.75 : Math.exp(-(t - 0.24) * 9) * 0.6);
    this.hemi.intensity = this._base.hemi + 2.5 * f; this.fill.intensity = this._base.fill + 25 * f;
    this.skyMat.color.setScalar(this.skyScale * (1 + 5 * f)); this.clouds.u.flash.value = 0.5 * f;
    if (t > 0.8) { this.flashT = -1; this.hemi.intensity = this._base.hemi; this.fill.intensity = this._base.fill; this.skyMat.color.setScalar(this.skyScale); this.clouds.u.flash.value = 0; S.thunderN++; S.thunderDelay = 1.5 + Math.random() * 7; S.thunderLoud = this.boltK; }
  }

  update(dt, t, cam) {
    this.acc += dt;
    if (this.dirty || this.acc > 5) { this.acc = 0; this.recompute(); }
    this.clouds.update(dt);
    if (this.state.thunder || this.flashT >= 0) this._lightning(dt);
    if (this.precip.rain.visible || this.precip.snow.visible) { this.precip.update(dt); this.precip.place(this.outdoorView, cam || this.scene.position, (WINDOW.x0 + WINDOW.x1) / 2, -0.45); }
  }
}
