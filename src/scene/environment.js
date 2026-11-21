// 창밖 세계와 시간: 컴퓨터 시계와 위치로 해·달을 놓고, 하늘색·햇빛·달빛·실내 주변광을 맞춘다.
// 계절은 실제 날짜를 따르고(남반구는 반대), 숲과 땅의 색이 계절에 따라 바뀐다. 날씨(맑음/눈/거센 눈)는 고를 수 있다.
// 창은 남쪽(-Z)을 본다: 북 = +Z, 동 = -X.
// 기획서의 "광원별 분리 굽기" 대신 실시간 조명(그림자 있는 해/달빛 + 하늘 주변광 + 창가 보조광)으로 단순화했다.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROOM, WINDOW } from './layout.js';
import { sunPosition, moonPosition, moonPhase, seasonOf } from './astro.js';
import { rng } from './textures.js';

const KEY = 'nanro.env', DEG = Math.PI / 180;
export const SEOUL = { lat: 37.5665, lon: 126.978 };
export const WEATHERS = { auto: '자동 (계절에 맞춤)', clear: '맑음', snow: '눈', heavy: '거센 눈' };
export const SEASONS = { auto: '자동 (오늘 날짜)', winter: '겨울', spring: '봄', summer: '여름', autumn: '가을' };
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const C = (hex) => new THREE.Color(hex);

// 해 고도(도)에 따른 하늘색 (천정, 지평선)
const SKY_KEYS = [
  [-18, 0x04060d, 0x0a101c], [-8, 0x0a1226, 0x1d2238], [-3, 0x18274a, 0x7a4a4a], [0.5, 0x2c4f86, 0xe89350],
  [6, 0x3a6fb4, 0xd9c0a0], [16, 0x3a76c4, 0xb9d0e6], [60, 0x2f6fc8, 0xa9c8ea],
];
const PALETTE = {
  winter: { ground: 0xdfe6ee, conifer: 0x243a2c, crown: null, hill: 0x8f9bab },
  spring: { ground: 0x5f7d3a, conifer: 0x1f3d27, crown: [0x8fbf5a, 0xa8cf6a, 0x9cc860, 0xe8b7c8], hill: 0x4c6a4a },
  summer: { ground: 0x3f6a2c, conifer: 0x173220, crown: [0x2f6a2a, 0x3d7a30, 0x27581f], hill: 0x2f5238 },
  autumn: { ground: 0x7d6a38, conifer: 0x1c3522, crown: [0xc2571a, 0xd98a1e, 0xa8321a, 0xc9a227, 0x7a5a20], hill: 0x6a5a3a },
};

export class Environment {
  constructor(scene, ctx, renderer, { url } = {}) {
    this.scene = scene; this.ctx = ctx; this.renderer = renderer;
    this.opts = { timeMode: 'real', hour: 21, weather: 'auto', season: 'auto', lat: SEOUL.lat, lon: SEOUL.lon, located: false };
    try { Object.assign(this.opts, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* 저장소 없음 */ }
    if (url) {                                             // 주소 옵션: ?time=18.5 ?weather=snow ?season=winter ?date=2026-01-15
      if (url.has('time')) { this.opts.timeMode = 'manual'; this.opts.hour = Number(url.get('time')); }
      if (url.has('weather')) this.opts.weather = url.get('weather');
      if (url.has('season')) this.opts.season = url.get('season');
      if (url.has('date')) this.dateOverride = new Date(url.get('date') + 'T12:00:00');
      this.fromUrl = url.has('time') || url.has('weather') || url.has('season');
    }
    this.state = { sunAlt: 0, day: 0, night: 1, season: 'winter', weather: 'clear', overcast: 0, moonFrac: 0 };
    this.dirty = true; this.acc = 0;
    this._build();
  }
  save() { if (!this.fromUrl) try { localStorage.setItem(KEY, JSON.stringify(this.opts)); } catch { /* 무시 */ } }
  set(patch) { Object.assign(this.opts, patch); this.dirty = true; this.save(); }
  // 브라우저 위치를 한 번 묻는다. 실패하면 서울(기본값)을 그대로 쓴다.
  locate() {
    if (this.opts.located || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((p) => this.set({ lat: +p.coords.latitude.toFixed(2), lon: +p.coords.longitude.toFixed(2), located: true }), () => {}, { timeout: 8000, maximumAge: 864e5 });
  }
  now() {
    const d = this.dateOverride ? new Date(this.dateOverride) : new Date();
    if (this.opts.timeMode === 'manual') { const h = this.opts.hour; d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0); }
    return d;
  }

  _build() {
    const g = (this.group = new THREE.Group()); g.name = 'outside'; this.scene.add(g);
    const r = rng(404), wx = (WINDOW.x0 + WINDOW.x1) / 2;
    // ---- 하늘 (세로 그라데이션 텍스처를 씌운 구), 별, 해, 달
    const cv = (this.skyCv = document.createElement('canvas')); cv.width = 4; cv.height = 256;
    this.skyTex = new THREE.CanvasTexture(cv); this.skyTex.colorSpace = THREE.SRGBColorSpace;
    this.skyMat = new THREE.MeshBasicMaterial({ map: this.skyTex, side: THREE.BackSide, fog: false, depthWrite: false });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(48, 24, 16), this.skyMat); sky.renderOrder = -3; sky.position.set(wx, 0, 0); g.add(sky);
    const sc = document.createElement('canvas'); sc.width = 2048; sc.height = 1024; const s2 = sc.getContext('2d');
    s2.fillStyle = '#000'; s2.fillRect(0, 0, 2048, 1024);
    for (let i = 0; i < 2600; i++) { const v = Math.acos(1 - r()) / Math.PI, b = Math.pow(r(), 3), rad = 0.5 + b * 1.4; s2.fillStyle = `rgba(${225 + r() * 30},${225 + r() * 30},${235 + r() * 20},${0.35 + b * 0.65})`; s2.beginPath(); s2.arc(r() * 2048, v * 1024, rad, 0, 7); s2.fill(); }
    const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace;
    this.starMat = new THREE.MeshBasicMaterial({ map: st, side: THREE.BackSide, fog: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
    const stars = new THREE.Mesh(new THREE.SphereGeometry(47, 24, 16), this.starMat); stars.renderOrder = -2; stars.position.copy(sky.position); stars.rotation.z = 0.6; g.add(stars);
    const glowTex = (inner, size = 256) => { const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'), gr = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(inner, 'rgba(255,255,255,1)'); gr.addColorStop(inner + 0.03, 'rgba(255,240,210,.5)'); gr.addColorStop(0.35, 'rgba(255,200,140,.12)'); gr.addColorStop(1, 'rgba(255,180,120,0)'); x.fillStyle = gr; x.fillRect(0, 0, size, size); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
    this.sunMat = new THREE.MeshBasicMaterial({ map: glowTex(0.035), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.sun = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), this.sunMat); this.sun.renderOrder = -1; g.add(this.sun);
    this.moonCv = document.createElement('canvas'); this.moonCv.width = this.moonCv.height = 128;
    this.moonTex = new THREE.CanvasTexture(this.moonCv); this.moonTex.colorSpace = THREE.SRGBColorSpace;
    this.moonMat = new THREE.MeshBasicMaterial({ map: this.moonTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.moon = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), this.moonMat); this.moon.renderOrder = -1; g.add(this.moon);

    // ---- 땅, 먼 능선, 숲
    this.groundMat = new THREE.MeshStandardMaterial({ roughness: 1 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 90), this.groundMat); ground.rotation.x = -Math.PI / 2; ground.position.set(wx, -0.45, -44.6); g.add(ground);
    this.hillMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: false });
    for (const [z, base, amp, seed] of [[-40, 1.2, 2.6, 1], [-46, 2.4, 4.2, 2]]) {
      const n = 80, pos = [], idx = [];
      for (let i = 0; i <= n; i++) { const x = -70 + 140 * i / n, h = base + amp * (0.5 + 0.5 * Math.sin(i * 0.21 + seed * 2)) * (0.6 + 0.4 * Math.sin(i * 0.07 + seed)) + (r() - 0.5) * 0.8; pos.push(x, -1, 0, x, h, 0); if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, this.hillMat); m.position.set(wx, 0, z); g.add(m);
    }
    const cone = (rad, h, y) => { const c = new THREE.ConeGeometry(rad, h, 7); c.translate(0, y + h / 2, 0); return c; };
    const conGeo = mergeGeometries([cone(0.34, 0.5, 0.12), cone(0.27, 0.42, 0.36), cone(0.2, 0.36, 0.56), cone(0.12, 0.3, 0.72)]);
    const trunkGeo = new THREE.CylinderGeometry(0.035, 0.05, 0.4, 5); trunkGeo.translate(0, 0.2, 0);
    const blob = (x, y, z, s) => { const b = new THREE.IcosahedronGeometry(s, 1); b.translate(x, y, z); return b; };
    const crownGeo = mergeGeometries([blob(0, 0.72, 0, 0.3), blob(0.18, 0.6, 0.05, 0.22), blob(-0.17, 0.62, -0.04, 0.23), blob(0.02, 0.9, 0.02, 0.2)]);
    const br = (ang, tilt, len, y) => { const c = new THREE.CylinderGeometry(0.008, 0.018, len, 4); c.translate(0, len / 2, 0); c.rotateZ(tilt); c.rotateY(ang); c.translate(0, y, 0); return c; };
    const dTrunk = new THREE.CylinderGeometry(0.03, 0.05, 0.6, 5); dTrunk.translate(0, 0.3, 0);
    const bareGeo = mergeGeometries([dTrunk, br(0, 0.7, 0.4, 0.5), br(2.1, 0.8, 0.36, 0.45), br(4.2, 0.6, 0.42, 0.52), br(1, 0.3, 0.4, 0.58), br(3.3, 0.45, 0.34, 0.56), br(5.2, 1.0, 0.3, 0.4)]);
    const nC = 150, nD = 70, std = () => new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true });
    this.conifers = new THREE.InstancedMesh(conGeo, std(), nC); this.conTrunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x2a1d14, roughness: 1 }), nC);
    this.crowns = new THREE.InstancedMesh(crownGeo, std(), nD); this.bare = new THREE.InstancedMesh(bareGeo, new THREE.MeshStandardMaterial({ color: 0x2c221b, roughness: 1 }), nD);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const spot = () => { for (;;) { const z = -4.5 - Math.pow(r(), 0.8) * 32, x = wx + (r() - 0.5) * (14 + -z * 1.3); if (z > -16 && Math.abs(x - wx) < 3.2 + (z + 16) * 0.12) continue; return [x, z]; } };
    this.treeTone = [];
    for (let i = 0; i < nC; i++) { const [x, z] = spot(), s = 3.5 + r() * 4; q.setFromAxisAngle(up, r() * 7); m4.compose(new THREE.Vector3(x, -0.45, z), q, new THREE.Vector3(s * (0.8 + r() * 0.4), s, s * (0.8 + r() * 0.4))); this.conifers.setMatrixAt(i, m4); this.conTrunks.setMatrixAt(i, m4); this.treeTone.push(0.7 + r() * 0.6); }
    this.crownPick = [];
    for (let i = 0; i < nD; i++) { const [x, z] = spot(), s = 4 + r() * 3.5; q.setFromAxisAngle(up, r() * 7); m4.compose(new THREE.Vector3(x, -0.45, z), q, new THREE.Vector3(s, s, s)); this.crowns.setMatrixAt(i, m4); this.bare.setMatrixAt(i, m4); this.crownPick.push([r(), 0.75 + r() * 0.5]); }
    g.add(this.conifers, this.conTrunks, this.crowns, this.bare);
    // 창 바로 밖 처마 밑 눈/풀 둔덕
    // ---- 눈송이
    const fc = document.createElement('canvas'); fc.width = fc.height = 32; const f2 = fc.getContext('2d'), fg = f2.createRadialGradient(16, 16, 0, 16, 16, 16); fg.addColorStop(0, '#fff'); fg.addColorStop(0.5, 'rgba(255,255,255,.7)'); fg.addColorStop(1, 'rgba(255,255,255,0)'); f2.fillStyle = fg; f2.fillRect(0, 0, 32, 32);
    this.snowMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(fc), transparent: true, depthWrite: false, fog: false });
    this.snowMax = 3200; this.snow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.snowMat, this.snowMax); this.snow.frustumCulled = false; this.snow.count = 0; g.add(this.snow);
    this.flakes = new Float32Array(this.snowMax * 6);
    for (let i = 0; i < this.snowMax; i++) { const o = i * 6; this.flakes[o] = wx + (r() - 0.5) * 22; this.flakes[o + 1] = r() * 8 - 0.4; this.flakes[o + 2] = -0.5 - Math.pow(r(), 1.4) * 15; this.flakes[o + 3] = 0.55 + r() * 0.6; this.flakes[o + 4] = r() * 6.28; this.flakes[o + 5] = 0.014 + r() * 0.02; }
    const a = this.snow.instanceMatrix.array; a.fill(0); for (let i = 0; i < this.snowMax; i++) { a[i * 16 + 10] = 1; a[i * 16 + 15] = 1; }

    // ---- 조명: 해 또는 달(그림자), 하늘 주변광, 창으로 들어오는 하늘빛 보조광
    const sun = (this.sunLight = new THREE.DirectionalLight(0xffffff, 0));
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0015; sun.shadow.normalBias = 0.02;
    const sc2 = sun.shadow.camera; sc2.left = -5; sc2.right = 5; sc2.top = 5; sc2.bottom = -5; sc2.near = 1; sc2.far = 34;
    sun.shadow.autoUpdate = false;                          // 해는 천천히 움직인다: 위치를 다시 계산할 때만 그림자를 갱신
    sun.target.position.set(ROOM.W / 2, 0.6, ROOM.D / 2 - 0.6); this.scene.add(sun, sun.target);
    this.hemi = new THREE.HemisphereLight(0x223355, 0x1a0f08, 0.5); this.scene.add(this.hemi);
    this.fill = new THREE.PointLight(0x9fb8d8, 0, 9, 1.6); this.fill.position.set(wx, 1.5, 0.9); this.scene.add(this.fill);
    this.scene.fog = new THREE.Fog(0x000000, 9, 70);
  }

  _skyColors(altDeg) {
    let i = 0; while (i < SKY_KEYS.length - 2 && altDeg > SKY_KEYS[i + 1][0]) i++;
    const a = SKY_KEYS[i], b = SKY_KEYS[i + 1], t = Math.max(0, Math.min(1, (altDeg - a[0]) / (b[0] - a[0])));
    return [C(a[1]).lerp(C(b[1]), t), C(a[2]).lerp(C(b[2]), t)];
  }
  _dir(az, alt, out = new THREE.Vector3()) { return out.set(-Math.sin(az) * Math.cos(alt), Math.sin(alt), Math.cos(az) * Math.cos(alt)); }

  // 해·달·하늘·계절을 다시 계산한다 (몇 초에 한 번, 또는 설정이 바뀌었을 때)
  recompute() {
    const o = this.opts, date = this.now(), S = this.state;
    const sp = sunPosition(date, o.lat, o.lon), mp = moonPosition(date, o.lat, o.lon), ph = moonPhase(date);
    const alt = sp.alt / DEG, season = o.season !== 'auto' && PALETTE[o.season] ? o.season : seasonOf(date, o.lat);
    const weather = o.weather === 'auto' || !WEATHERS[o.weather] ? (season === 'winter' ? 'snow' : 'clear') : o.weather;
    const oc = weather === 'heavy' ? 1 : weather === 'snow' ? 0.7 : 0, snowy = oc > 0 || season === 'winter';
    const day = sstep(-6, 8, alt), night = 1 - sstep(-14, -4, alt);
    Object.assign(S, { sunAlt: alt, sunAz: sp.az, moonAlt: mp.alt / DEG, day, night, season, weather, overcast: oc, moonFrac: ph.fraction, date });

    // 하늘
    let [zen, hor] = this._skyColors(alt);
    const grey = (c) => { const l = 0.3 * c.r + 0.55 * c.g + 0.15 * c.b; return new THREE.Color(l * 0.95, l, l * 1.08); };
    zen = zen.lerp(grey(zen).multiplyScalar(1.5 - 0.2 * day), oc * 0.85); hor = hor.lerp(grey(hor).multiplyScalar(1.1), oc * 0.85);
    if (oc > 0 && day < 0.5) { zen.lerp(C(0x1a1d26), oc * (1 - day) * 0.6); hor.lerp(C(0x242833), oc * (1 - day) * 0.6); }  // 눈 오는 밤은 살짝 밝은 회색 하늘
    const x = this.skyCv.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, zen.getStyle()); gr.addColorStop(0.32, zen.clone().lerp(hor, 0.35).getStyle()); gr.addColorStop(0.5, hor.getStyle()); gr.addColorStop(1, hor.clone().multiplyScalar(0.6).getStyle());
    x.fillStyle = gr; x.fillRect(0, 0, 4, 256); this.skyTex.needsUpdate = true;
    this.skyMat.color.setScalar(1 + 1.6 * day);
    this.starMat.opacity = night * (1 - oc) * 0.9;
    this.scene.fog.color.copy(hor).multiplyScalar(0.9 + 1.2 * day); this.scene.fog.near = 9; this.scene.fog.far = oc >= 1 ? 24 : oc > 0 ? 38 : 75;

    // 해와 달의 원반
    const origin = new THREE.Vector3((WINDOW.x0 + WINDOW.x1) / 2, 1.5, 0), sd = this._dir(sp.az, sp.alt), md = this._dir(mp.az, mp.alt);
    this.sun.position.copy(origin).addScaledVector(sd, 44); this.sun.lookAt(origin);
    this.sunMat.opacity = sstep(-3, 1, alt) * (1 - oc); this.sunMat.color.copy(C(0xff9a55).lerp(C(0xfff4e0), sstep(0, 14, alt))).multiplyScalar(3);
    this.sun.visible = this.sunMat.opacity > 0.01;
    this.moon.position.copy(origin).addScaledVector(md, 44); this.moon.lookAt(origin);
    this.moonMat.opacity = sstep(-2, 4, S.moonAlt) * (1 - oc) * (0.35 + 0.65 * night); this.moon.visible = this.moonMat.opacity > 0.01;
    this.moonMat.color.setScalar(1.6);
    this._drawMoon(ph);

    // 햇빛 또는 달빛 (그림자 하나를 둘이 나눠 쓴다)
    const L = this.sunLight, sunI = 3.4 * sstep(-1.5, 12, alt) * (1 - 0.85 * oc);
    const moonI = alt < -4 ? 0.42 * (0.25 + 0.75 * ph.fraction) * sstep(1, 12, S.moonAlt) * (1 - oc) : 0;
    if (sunI > 0.01) { L.intensity = sunI; L.color.copy(C(0xff8344).lerp(C(0xfff0da), sstep(0, 18, alt))); L.position.copy(L.target.position).addScaledVector(sd, 18); }
    else { L.intensity = moonI; L.color.set(0x9db8e8); L.position.copy(L.target.position).addScaledVector(md, 18); }
    L.castShadow = L.intensity > 0.01; L.shadow.needsUpdate = true;
    this.hemi.color.copy(zen).lerp(hor, 0.4).lerp(C(0xffffff), 0.55 * day).multiplyScalar(1 + day); this.hemi.groundColor.set(0x1a0f08).lerp(C(0x4a3a2c), day);
    this.hemi.intensity = 0.22 + 0.2 * night * (0.3 + 0.7 * ph.fraction) * (1 - oc) + 1.5 * day * (1 - 0.35 * oc);
    this.fill.color.copy(hor).lerp(zen, 0.5).lerp(C(0xffffff), 0.5 * day); this.fill.intensity = (16 * day + 0.5 * (1 - day) * (oc > 0 ? 1 : 0.4)) * (1 - 0.3 * oc);
    this.renderer.toneMappingExposure = 1.12 - 0.2 * day;

    // 계절: 땅, 능선, 나무색
    const P = PALETTE[season], col = new THREE.Color(), snowC = C(0xdfe6ee);
    this.groundMat.color.set(snowy ? 0xdfe6ee : P.ground);
    this.hillMat.color.set(snowy ? PALETTE.winter.hill : P.hill).multiplyScalar(0.05 + 0.6 * day).lerp(hor.clone().multiplyScalar(1 + 1.2 * day), 0.55);   // 먼 산은 지평선 색에 물든다
    for (let i = 0; i < this.conifers.count; i++) { col.set(P.conifer).multiplyScalar(this.treeTone[i]); if (snowy) col.lerp(snowC, 0.3 + 0.3 * (this.treeTone[i] - 0.7)); this.conifers.setColorAt(i, col); }
    this.conifers.instanceColor.needsUpdate = true;
    const leafy = !!P.crown; this.crowns.visible = leafy; this.bare.visible = !leafy;
    if (leafy) { for (let i = 0; i < this.crowns.count; i++) { const [k, tone] = this.crownPick[i]; col.set(P.crown[Math.floor(k * P.crown.length)]).multiplyScalar(tone); if (oc > 0) col.lerp(snowC, 0.4); this.crowns.setColorAt(i, col); } this.crowns.instanceColor.needsUpdate = true; }
    // 눈
    this.snow.count = weather === 'heavy' ? this.snowMax : weather === 'snow' ? 1300 : 0; this.snow.visible = this.snow.count > 0;
    this.snowMat.color.setScalar(0.4 + 1.5 * day); this.wind = weather === 'heavy' ? 1.6 : 0.25; this.fall = weather === 'heavy' ? 1.7 : 1;
    this.dirty = false; this.onChange?.(S);
  }

  _drawMoon(ph) {
    const key = Math.round(ph.phase * 60); if (key === this._moonKey) return; this._moonKey = key;
    const c = this.moonCv.getContext('2d'), R = 44, cx = 64, cy = 64;
    c.clearRect(0, 0, 128, 128); c.fillStyle = '#000'; c.fillRect(0, 0, 128, 128);
    const gl = c.createRadialGradient(cx, cy, R, cx, cy, 64); gl.addColorStop(0, `rgba(150,170,210,${0.25 * ph.fraction})`); gl.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gl; c.fillRect(0, 0, 128, 128);
    // 밝은 쪽: 차오르는 달은 오른쪽이 밝다(북반구 기준)
    const k = Math.cos(ph.phase * 2 * Math.PI), right = ph.phase < 0.5;        // k: 1 삭 → -1 보름
    c.save(); c.beginPath(); c.arc(cx, cy, R, 0, 7); c.clip();
    c.fillStyle = '#0a0c12'; c.fillRect(0, 0, 128, 128);
    c.fillStyle = '#f2ecd8'; c.beginPath(); c.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, !right); c.fill();
    c.fillStyle = ph.fraction > 0.5 ? '#f2ecd8' : '#0a0c12'; c.beginPath(); c.ellipse(cx, cy, Math.abs(k) * R, R, 0, 0, 7); c.fill();
    c.globalAlpha = 0.12; c.fillStyle = '#6a6a70'; for (const [x, y, s] of [[50, 50, 10], [74, 60, 13], [60, 80, 8], [80, 42, 6]]) { c.beginPath(); c.arc(x, y, s, 0, 7); c.fill(); }
    c.restore(); this.moonTex.needsUpdate = true;
  }

  update(dt, t) {
    this.acc += dt;
    if (this.dirty || this.acc > 5) { this.acc = 0; this.recompute(); }
    const n = this.snow.count;
    if (n) {
      const f = this.flakes, a = this.snow.instanceMatrix.array, wx = (WINDOW.x0 + WINDOW.x1) / 2;
      for (let i = 0; i < n; i++) {
        const o = i * 6; f[o + 1] -= f[o + 3] * this.fall * dt; f[o] += (this.wind * (0.6 + 0.4 * Math.sin(t * 0.3 + f[o + 4])) + 0.25 * Math.sin(t * 1.3 + f[o + 4])) * dt;
        if (f[o + 1] < -0.45) f[o + 1] += 8.2; if (f[o] > wx + 11) f[o] -= 22;
        const m = i * 16, s = f[o + 5]; a[m] = s; a[m + 5] = s; a[m + 12] = f[o]; a[m + 13] = f[o + 1]; a[m + 14] = f[o + 2];
      }
      this.snow.instanceMatrix.needsUpdate = true;
    }
  }
}
