// 실제 밤하늘: 별(6등급까지, d3-celestial 자료), 행성 넷, 은하수, 별자리 선과 이름, 황도, 해 원반, 위상이 있는 달.
// 모두 방향만으로 그린다: 카메라를 중심으로 한 무한히 먼 구에 놓고 깊이를 맨 끝(먼 평면)에 붙인다.
// 그래서 산과 나무, 집에 가려지고, 마당 어디에 서 있어도 하늘이 따라오며, 카메라의 먼 평면(60m)과 상관이 없다.
// 별 구는 J2000 적도좌표 → (세차, 항성시, 위도) 회전 하나로 돈다(skycalc.js). 몇 초에 한 번 행렬만 바꾼다.
// 그리기 호출: 별+행성 1, 은하수 1, 별자리 선+황도 1, 이름 1, 해 1, 달 1 (낮에는 해와 낮달만).
import * as THREE from 'three/webgpu';
import { Fn, attribute, uniform, uv, vec2, vec3, vec4, float, varying, cameraProjectionMatrix, cameraViewMatrix, screenSize, time, texture, smoothstep, exp, exp2, log2, max, min, sqrt, sin, dot, normalize, cross, select, step, mix, clamp, length } from 'three/tsl';
import { skyMatrix, equVec, planetPositions, bvColor, PLANETS, OBLIQUITY } from './skycalc.js';

const DEG = Math.PI / 180;
const SUN_R = 0.36, MOON_R = 0.7;                 // 원반 반지름(도). 실제는 0.27°: 해는 조금, 달은 위상과 무늬가 보이게 더 크게(눈에 보이는 크기에 가깝게)
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerpTab = (tab, x) => { if (x <= tab[0][0]) return tab[0][1]; for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) { const [a, va] = tab[i - 1], [b, vb] = tab[i]; return va + (vb - va) * (x - a) / (b - a); } return tab[tab.length - 1][1]; };
// 해 고도(도)에 따른 맨눈 한계 등급: 박명 동안 밝은 별부터 하나씩 나온다
const LIM_SUN = [[-18, 6.0], [-15, 5.4], [-12, 4.4], [-9, 3.0], [-6, 1.6], [-4, 0.5], [-2, -1.2], [0, -3.2], [4, -6]];
const PLANET_COL = { venus: [1, 0.97, 0.9], mars: [1, 0.66, 0.46], jupiter: [1, 0.95, 0.86], saturn: [1, 0.9, 0.72] };
export const CONST_MODES = { off: '끄기', lines: '선만', names: '선과 이름' };

// 공통: J2000 방향 → 장면 방향 → 보기 방향(회전만) → 먼 평면에 붙인 클립 좌표
const uRot = uniform(new THREE.Matrix4());
const sceneOf = (equ) => uRot.mul(vec4(equ, 0)).xyz;
const viewOf = (dir) => cameraViewMatrix.mul(vec4(dir, 0)).xyz;
const farClip = (view) => { const c = cameraProjectionMatrix.mul(vec4(view, 1)); return vec4(c.xy, c.w.mul(0.99999), c.w); };
const pxOffset = (clip, px) => vec4(clip.xy.add(px.mul(2).div(screenSize).mul(clip.w)), clip.zw);
const basicMat = (o = {}) => Object.assign(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, toneMapped: true, ...o }));
const geo = (attrs, index) => { const g = new THREE.BufferGeometry(); for (const k in attrs) g.setAttribute(k, attrs[k]); if (index) g.setIndex(index); const n = attrs.aDir.count, nm = new Float32Array(n * 3); for (let i = 0; i < n; i++) nm[i * 3 + 2] = 1; g.setAttribute('normal', new THREE.BufferAttribute(nm, 3)); return g; };
const quadIndex = (n) => { const a = new Uint32Array(n * 6); for (let i = 0; i < n; i++) a.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6); return new THREE.BufferAttribute(a, 1); };
const CORNERS = [-1, -1, 1, -1, 1, 1, -1, 1];

export class Sky {
  constructor(parent) {
    this.group = new THREE.Group(); this.group.name = 'sky'; parent.add(this.group);
    this.u = {
      lim: uniform(6), gain: uniform(1), tw: uniform(1), mw: uniform(0),
      line0: uniform(new THREE.Color()), line1: uniform(new THREE.Color()), line2: uniform(new THREE.Color()), label0: uniform(new THREE.Color()), label1: uniform(new THREE.Color()),
      sunDir: uniform(new THREE.Vector3(0, 1, 0)), sunCol: uniform(new THREE.Color()), sunDisc: uniform(0), sunGlow: uniform(0), sunScale: uniform(1),
      moonDir: uniform(new THREE.Vector3(0, 1, 0)), moonCol: uniform(new THREE.Color()), moonI: uniform(0), earth: uniform(0), moonHalo: uniform(0),
    };
    this._m4 = new THREE.Matrix4(); this._white = new THREE.Color(); this.ready = false;
    this._buildSun(); this._buildMoon();
    this.loaded = this._load().catch((e) => console.warn('별 자료를 읽지 못했습니다', e));
  }

  async _load() {
    const [sb, js] = await Promise.all([fetch('sky/stars.bin').then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }), fetch('sky/sky.json').then((r) => r.json())]);
    this._buildStars(new Int16Array(sb)); this._buildLines(js); this._buildLabels(js.cons);
    new THREE.TextureLoader().load('sky/milkyway.png', (t) => { t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4; this._buildMilkyWay(t); this._apply(); }, undefined, () => {});
    this.ready = true; this._apply();
  }

  // ---- 별과 행성: 별 하나 = 네 꼭짓점 사각형. 크기는 화면 높이에 비례한 픽셀, 밝기는 등급, 색은 B-V.
  _buildStars(sb) {
    const nS = sb.length / 4, n = nS + PLANETS.length, dir = new Float32Array(n * 12), cor = new Float32Array(n * 8), mag = new Float32Array(n * 8), col = new Float32Array(n * 12);
    const put = (i, d, m, seed, c) => { for (let k = 0; k < 4; k++) { dir.set(d, i * 12 + k * 3); cor[i * 8 + k * 2] = CORNERS[k * 2]; cor[i * 8 + k * 2 + 1] = CORNERS[k * 2 + 1]; mag[i * 8 + k * 2] = m; mag[i * 8 + k * 2 + 1] = seed; col.set(c, i * 12 + k * 3); } };
    PLANETS.forEach((p, i) => put(i, [1, 0, 0], 99, -1, PLANET_COL[p]));          // 행성은 앞의 네 칸(위치는 update에서)
    for (let i = 0; i < nS; i++) { const ra = (sb[i * 4] & 0xffff) / 65536 * 360, dec = sb[i * 4 + 1] / 32767 * 90; put(PLANETS.length + i, equVec(ra, dec), sb[i * 4 + 2] / 100, ((i * 0.618034) % 1), bvColor(sb[i * 4 + 3] / 1000)); }
    const aDir = (this.starDir = new THREE.BufferAttribute(dir, 3)), aMag = (this.starMag = new THREE.BufferAttribute(mag, 2));
    const g = geo({ aDir, aCorner: new THREE.BufferAttribute(cor, 2), aMag, aCol: new THREE.BufferAttribute(col, 3) }, quadIndex(n));
    const U = this.u, s = sceneOf(attribute('aDir', 'vec3')), y = s.y, yc = max(y, 0), m = attribute('aMag', 'vec2'), corner = attribute('aCorner', 'vec2');
    const airmass = float(1).div(yc.add(exp(yc.mul(-11)).mul(0.025)));
    const me = m.x.add(airmass.sub(1).mul(0.28));                                // 지평선 가까이는 대기 감광으로 어두워진다
    const P = exp2(me.sub(1).mul(-0.598));                                        // 1등성 = 1. 밝기 차이를 눈처럼 압축(광량^0.45)
    const vis = float(1).sub(smoothstep(U.lim.sub(1.0), U.lim.add(0.25), me));    // 한계 등급 근처는 서서히
    const hz = smoothstep(-0.004, 0.03, y);
    const planet = m.y.lessThan(0), seed = m.y;
    const amp = select(planet, float(0.03), mix(float(0.38), float(0.07), smoothstep(0.02, 0.6, y))).mul(U.tw);   // 반짝임: 낮은 별일수록
    const tw = sin(time.mul(seed.mul(7).add(6)).add(seed.mul(91))).mul(sin(time.mul(seed.mul(3.1).add(2.3)).add(seed.mul(17)))).mul(amp).add(1);
    const rB = screenSize.y.mul(0.00105), rN = rB.mul(log2(max(P, 1)).mul(0.55).add(1)), r = max(rN, 0.85);
    const peak = min(P, 2.4).mul(vis).mul(hz).mul(tw).mul(U.gain).mul(rN.div(r).pow(2));
    const halo = clamp(peak.sub(1).mul(0.04), 0, 0.08);
    const redden = mix(vec3(1, 0.82, 0.62), vec3(1), smoothstep(0.02, 0.35, y));
    const vQ = varying(corner.mul(4)), vI = varying(vec2(peak, halo)), vC = varying(attribute('aCol', 'vec3').mul(redden));
    const mat = basicMat();
    mat.vertexNode = Fn(() => pxOffset(farClip(viewOf(s)), corner.mul(r.mul(4)).mul(step(0.004, peak))))();
    mat.colorNode = Fn(() => { const q2 = dot(vQ, vQ); return vC.mul(vI.x.mul(exp(q2.negate())).add(vI.y.mul(exp(sqrt(q2).mul(-1.6))))); })();
    this.stars = this._mesh(g, mat, -2.2);
  }

  // ---- 은하수: 등장방형 밝기 그림을 같은 회전 구에 입힌다. 궁수자리(은하 중심) 쪽이 더 밝고 따뜻하다.
  _buildMilkyWay(tex) {
    const sg = new THREE.SphereGeometry(1, 96, 48), p = sg.attributes.position, d = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) d.set([-p.getX(i), p.getZ(i), p.getY(i)], i * 3);   // 구의 u = 적경/360, 위 = 천구 북극
    const g = new THREE.BufferGeometry(); g.setAttribute('aDir', new THREE.BufferAttribute(d, 3)); g.setAttribute('uv', sg.attributes.uv); g.setAttribute('normal', sg.attributes.normal); g.setIndex(sg.index);
    const e = attribute('aDir', 'vec3'), s = sceneOf(e), gc = vec3(...equVec(266.4, -28.94));
    const core = varying(max(dot(e, gc), 0)), vy = varying(s.y);
    const mat = basicMat({ side: THREE.DoubleSide });
    mat.vertexNode = Fn(() => farClip(viewOf(s)))();
    mat.colorNode = Fn(() => {
      const v = texture(tex, uv()).r, b = v.mul(v), k = core.pow(3);
      const hz = smoothstep(0.0, 0.25, vy);
      return mix(vec3(0.62, 0.7, 0.9), vec3(0.95, 0.85, 0.7), k).mul(b).mul(k.mul(1.8).add(0.5)).mul(hz).mul(this.u.mw);
    })();
    this.milky = this._mesh(g, mat, -2.6);
  }

  // ---- 별자리 선(황도 12궁은 따로 표시) + 황도
  _buildLines(js) {
    const dir = [], kind = [], zod = js.cons.map((c) => c[4]);
    // 선 끝은 별에서 조금 떨어뜨린다(별빛을 가리지 않게): 양 끝을 서로 쪽으로 0.5°(짧은 선은 1/5)만큼 당긴다
    const pull = (a, b, t) => { const v = a.map((x, i) => x * (1 - t) + b[i] * t), n = Math.hypot(...v); return v.map((x) => x / n); };
    for (const l of js.lines) { const k = zod[l[0]] ? 1 : 0; for (let i = 1; i + 3 < l.length; i += 2) { const a = equVec(l[i], l[i + 1]), b = equVec(l[i + 2], l[i + 3]), ang = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) / DEG, t = Math.min(0.5, ang * 0.2) / Math.max(ang, 1e-3); dir.push(...pull(a, b, t), ...pull(b, a, t)); kind.push(k, k); } }
    const e = OBLIQUITY, ec = (L) => [Math.cos(L), Math.sin(L) * Math.cos(e), Math.sin(L) * Math.sin(e)];
    for (let i = 0; i < 360; i += 2) { dir.push(...ec(i * DEG), ...ec((i + 2) * DEG)); kind.push(2, 2); }
    const g = geo({ aDir: new THREE.Float32BufferAttribute(dir, 3), aKind: new THREE.Float32BufferAttribute(kind, 1) }, new THREE.BufferAttribute(Uint32Array.from(kind, (_, i) => i), 1));   // 위치 속성이 없으니 꼭짓점 수는 색인으로 알린다
    const U = this.u, s = sceneOf(attribute('aDir', 'vec3')), k = attribute('aKind', 'float');
    const c = select(k.lessThan(0.5), U.line0, select(k.lessThan(1.5), U.line1, U.line2));
    const vC = varying(vec3(c).mul(smoothstep(-0.01, 0.1, s.y)));
    const mat = basicMat();
    mat.vertexNode = Fn(() => farClip(viewOf(s)))(); mat.colorNode = vC;
    this.lines = new THREE.LineSegments(g, mat); this.lines.frustumCulled = false; this.lines.renderOrder = -2.4; this.group.add(this.lines);
  }

  // ---- 별자리 이름(한글): 글자 그림 한 장(아틀라스)에 모아 두고 별자리 중심에 작게 띄운다
  _buildLabels(cons) {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 1024; const x = cv.getContext('2d'), FS = 30, RH = 42;
    x.fillStyle = '#000'; x.fillRect(0, 0, 1024, 1024); x.font = `${FS}px "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`; x.fillStyle = '#fff'; x.textBaseline = 'middle';
    const cell = {}; let cx = 4, cy = 4;
    for (const [, name] of cons) { if (cell[name]) continue; const w = Math.ceil(x.measureText(name).width) + 8; if (cx + w > 1020) { cx = 4; cy += RH + 4; } x.fillText(name, cx + 4, cy + RH / 2); cell[name] = [cx, cy, w]; cx += w + 4; }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 4;
    const n = cons.length, dir = new Float32Array(n * 12), off = new Float32Array(n * 8), uvs = new Float32Array(n * 8), zod = new Float32Array(n * 4);
    cons.forEach(([, name, ra, dec, z], i) => {
      const [px, py, w] = cell[name], d = equVec(ra, dec), a = w / RH;
      for (let k = 0; k < 4; k++) { dir.set(d, i * 12 + k * 3); const sx = CORNERS[k * 2], sy = CORNERS[k * 2 + 1]; off[i * 8 + k * 2] = sx * a / 2; off[i * 8 + k * 2 + 1] = sy / 2; uvs[i * 8 + k * 2] = (px + (sx > 0 ? w : 0)) / 1024; uvs[i * 8 + k * 2 + 1] = 1 - (py + (sy > 0 ? 0 : RH)) / 1024; zod[i * 4 + k] = z; }
    });
    const g = geo({ aDir: new THREE.BufferAttribute(dir, 3), aOff: new THREE.BufferAttribute(off, 2), uv: new THREE.BufferAttribute(uvs, 2), aZod: new THREE.BufferAttribute(zod, 1) }, quadIndex(n));
    const U = this.u, s = sceneOf(attribute('aDir', 'vec3')), h = screenSize.y.mul(0.017);
    const vC = varying(select(attribute('aZod', 'float').greaterThan(0.5), vec3(U.label1), vec3(U.label0)).mul(smoothstep(0.02, 0.12, s.y)));
    const mat = basicMat();
    mat.vertexNode = Fn(() => pxOffset(farClip(viewOf(s)), attribute('aOff', 'vec2').mul(h)))();
    mat.colorNode = Fn(() => vC.mul(texture(tex, uv()).r))();
    this.labels = this._mesh(g, mat, -2.1);
  }

  // 해·달 공통: 방향 하나에 놓는 사각형. 가로·세로 축은 지평선 기준(달의 무늬가 하늘에 고정되게).
  _disc(dirU, halfDeg, scale) {
    const corner = attribute('aCorner', 'vec2'), fw = normalize(viewOf(dirU)), upW = viewOf(vec3(0.0001, 1, 0));
    const right = normalize(cross(fw, upW)), up = cross(right, fw);
    const pos = fw.add(right.mul(corner.x).add(up.mul(corner.y)).mul(Math.tan(halfDeg * DEG)).mul(scale));
    return { corner, fw, right, up, clip: Fn(() => farClip(pos))() };
  }
  _quadGeo() { return geo({ aDir: new THREE.BufferAttribute(new Float32Array(12), 3), aCorner: new THREE.BufferAttribute(new Float32Array(CORNERS), 2) }, quadIndex(1)); }

  // ---- 해: 작은 원반 + 부드러운 빛무리. 지평선 가까이는 붉고 조금 커 보인다.
  _buildSun() {
    const U = this.u, Q = 22, d = this._disc(U.sunDir, Q, U.sunScale), vq = varying(d.corner.mul(Q)), vy = varying(U.sunDir.y);
    const mat = basicMat(); mat.vertexNode = d.clip;
    mat.colorNode = Fn(() => {
      const q = length(vq).div(U.sunScale);                                         // 해 중심에서의 각도(도)
      const disc = smoothstep(SUN_R + 0.05, SUN_R - 0.05, q).mul(U.sunDisc);
      const glow = exp(q.mul(-2.2)).mul(1.2).add(exp(q.mul(-0.6)).mul(0.3)).add(exp(q.mul(-0.16)).mul(0.08)).mul(U.sunGlow).mul(smoothstep(Q, Q * 0.6, q));
      return vec3(U.sunCol).mul(disc.add(glow)).mul(smoothstep(-0.03, 0.005, vy));
    })();
    this.sun = this._mesh(this._quadGeo(), mat, -2);
  }

  // ---- 달: 해 방향으로 비추는 구(위상과 밝은 쪽이 저절로 맞는다), 바다 무늬, 어두운 쪽의 지구빛(지구에 반사된 햇빛)
  _buildMoon() {
    const U = this.u, S = 1.25, d = this._disc(U.moonDir, MOON_R * S, float(1));
    const L = normalize(viewOf(U.sunDir));
    const vL = varying(vec3(dot(L, d.right), dot(L, d.up), dot(L, d.fw.negate())));   // 달 좌표계의 햇빛 방향
    const vc = varying(d.corner.mul(S)), vy = varying(U.moonDir.y), tex = moonTexture();
    const mat = basicMat(); mat.vertexNode = d.clip;
    mat.colorNode = Fn(() => {
      const r2 = dot(vc, vc), r = sqrt(r2), mu = sqrt(max(float(1).sub(r2), 0)), n = vec3(vc, mu);
      const mu0 = dot(n, normalize(vL)), lit = max(mu0, 0).div(max(mu0, 0).add(mu).add(1e-4)).mul(2);   // Lommel-Seeliger: 보름달 가장자리가 어두워지지 않는다
      const alb = texture(tex, vc.mul(0.5).add(0.5)).r, inside = smoothstep(1.0, 0.97, r);
      const body = alb.mul(lit.mul(U.moonI).add(U.earth.mul(mu))).mul(inside);
      const halo = exp(r.sub(1).mul(-9)).mul(U.moonHalo).mul(float(1).sub(inside));
      return vec3(U.moonCol).mul(body.add(halo)).mul(smoothstep(-0.02, 0.005, vy));
    })();
    this.moon = this._mesh(this._quadGeo(), mat, -2);
  }

  _mesh(g, mat, order) { const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = order; m.visible = false; this.group.add(m); return m; }

  // environment.recompute()가 몇 초에 한 번 부른다.
  // s: { date, lat, lon, sunDir, moonDir(장면 방향), sunAlt, moonAlt(도), moonFrac, night(0..1), cloud(0..1), opts }
  update(s) { this.s = s; this._apply(); }
  _apply() {
    const s = this.s; if (!s) return;
    const U = this.u, cloud = Math.max(0, Math.min(1, s.cloud || 0)), clear = 1 - cloud, o = s.opts || {};
    const M = skyMatrix(s.date, s.lat, s.lon);
    this._m4.set(M[0], M[1], M[2], 0, M[3], M[4], M[5], 0, M[6], M[7], M[8], 0, 0, 0, 0, 1); uRot.value.copy(this._m4);
    // 별이 보이는 정도: 해 고도 → 한계 등급, 달빛과 구름이 깎는다
    const moonUp = sstep(-3, 25, s.moonAlt), lim = lerpTab(LIM_SUN, s.sunAlt) - 1.8 * Math.pow(s.moonFrac, 1.3) * moonUp - 3.5 * cloud;
    U.lim.value = lim; U.gain.value = Math.pow(clear, 1.5) * 1.05; U.tw.value = 1;
    const starsOn = lim > -5 && clear > 0.02;
    if (this.stars) {
      this.stars.visible = starsOn;
      if (starsOn) { const pl = planetPositions(s.date); pl.forEach((p, i) => { for (let k = 0; k < 4; k++) { this.starDir.array.set(p.dir, i * 12 + k * 3); this.starMag.array[i * 8 + k * 2] = p.mag; } }); for (const a of [this.starDir, this.starMag]) { a.clearUpdateRanges(); a.addUpdateRange(0, PLANETS.length * 4 * a.itemSize); a.needsUpdate = true; } }
    }
    U.mw.value = 0.042 * sstep(4.6, 5.9, lim) * clear * clear; if (this.milky) this.milky.visible = U.mw.value > 0.001;
    // 별자리 선과 이름(설정), 황도 12궁 강조
    const mode = CONST_MODES[o.constellations] ? o.constellations : 'lines', zodiac = o.zodiac !== false;
    const li = sstep(1.0, 3.6, lim) * Math.pow(clear, 1.2);
    U.line0.value.setRGB(0.032, 0.043, 0.066).multiplyScalar(li); U.line1.value.setRGB(0.032, 0.043, 0.066).multiplyScalar(li * (zodiac ? 1.9 : 1)); U.line2.value.setRGB(0.09, 0.07, 0.04).multiplyScalar(zodiac ? li : 0);
    if (this.lines) this.lines.visible = mode !== 'off' && li > 0.01;
    U.label0.value.setRGB(0.26, 0.31, 0.4).multiplyScalar(li); U.label1.value.setRGB(0.26, 0.31, 0.4).multiplyScalar(li * (zodiac ? 1.5 : 1));
    if (this.labels) this.labels.visible = mode === 'names' && li > 0.01;
    // 해
    const a = s.sunAlt, low = 1 - sstep(0, 12, a);
    U.sunDir.value.copy(s.sunDir); U.sunScale.value = 1 + 0.35 * low;
    U.sunCol.value.setRGB(1, 0.4, 0.13).lerp(this._white.setRGB(1, 0.93, 0.82), sstep(0, 25, a));
    U.sunDisc.value = (3 + 22 * sstep(3, 20, a)) * Math.pow(clear, 2.5);     // 지평선 가까이는 붉고 덜 눈부시다
    U.sunGlow.value = (1.6 + 1.2 * low) * sstep(-5, 1, a) * (1 - 0.7 * cloud);
    this.sun.visible = a > -6 && (U.sunDisc.value + U.sunGlow.value) > 0.01;
    // 달: 밤에는 밝게, 낮에는 옅은 낮달. 위상에 따라 밝기가 바뀐다.
    U.moonDir.value.copy(s.moonDir);
    const mHz = sstep(-1, 1.5, s.moonAlt), mc = Math.pow(1 - 0.9 * cloud, 2);
    U.moonI.value = (0.25 + 0.85 * s.night) * (0.55 + 0.45 * s.moonFrac) * mc;
    U.earth.value = 0.06 * Math.pow(1 - s.moonFrac, 2) * s.night * mc;
    U.moonHalo.value = 0.1 * s.moonFrac * s.night * mc;
    U.moonCol.value.setRGB(1, 0.97, 0.9).lerp(this._white.setRGB(1, 0.72, 0.5), 1 - sstep(2, 20, s.moonAlt));
    this.moon.visible = mHz > 0 && U.moonI.value > 0.01;
  }
}

// 달의 바다(맨눈으로 보이는 어두운 무늬): 북쪽이 위인 앞면 그림을 대충 흉내 낸다
function moonTexture() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d');
  x.fillStyle = 'rgb(214,214,214)'; x.fillRect(0, 0, N, N);
  const P = (u, v) => [N / 2 + u * N / 2, N / 2 - v * N / 2];
  x.filter = 'blur(5px)'; x.fillStyle = 'rgb(118,118,122)';
  for (const [u, v, rx, ry, rot] of [[0.68, 0.28, 0.13, 0.1, 0], [0.28, 0.38, 0.16, 0.15, 0], [0.38, 0.1, 0.19, 0.15, 0.3], [-0.3, 0.42, 0.26, 0.22, 0], [-0.58, 0.05, 0.22, 0.42, 0.2], [-0.2, -0.38, 0.2, 0.14, 0], [-0.55, -0.36, 0.1, 0.1, 0], [0.62, -0.12, 0.12, 0.17, 0], [0.4, -0.3, 0.09, 0.09, 0], [0.02, 0.72, 0.42, 0.07, 0], [0.02, -0.05, 0.1, 0.12, 0]]) { const [px, py] = P(u, v); x.beginPath(); x.ellipse(px, py, rx * N / 2, ry * N / 2, rot, 0, 7); x.fill(); }
  x.filter = 'blur(2px)'; x.fillStyle = 'rgb(240,240,240)'; { const [px, py] = P(-0.12, -0.68); x.beginPath(); x.arc(px, py, 4, 0, 7); x.fill(); }
  x.filter = 'none'; const id = x.getImageData(0, 0, N, N); let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < id.data.length; i += 4) { const v = (rnd() - 0.5) * 14; id.data[i] += v; id.data[i + 1] += v; id.data[i + 2] += v; } x.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
}
