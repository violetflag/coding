// 미리 만든 초고화질 불(src/fire/bake.js 가 만든 동영상)을 앉아 있을 때 틀어 준다.
// 동영상은 의자에 앉은 눈 자리에서 본 벽난로 속 그림이다. 방 안의 정해진 네모(불이 있는 깊이)에 붙어 있는 그림으로 보고,
// 그 네 귀퉁이가 지금 화면의 어디에 오는지 계산해 동영상을 그 모양으로 늘여 붙인다(CSS 투영 변환). 눈 자리가 같으면 고개를 돌려도 정확히 맞는다.
// 동영상은 방 캔버스 아래, 실시간 불 캔버스 위에 놓인다. 켜지고 꺼질 때는 실시간 불 위에서 서서히 나타나고 사라진다.
import * as THREE from 'three/webgpu';
import { FIREPLACE as FP } from '../scene/layout.js';

export const BAKE_DIR = 'fire-bake', BAKE_JOB = 'nanro.bakeJob';
// 타고 있는 장작 수(0~3)마다의 대표 장작 상태. 불 세기는 cozy.js 와 같은 식으로 남은 장작에서 나온다.
export const FUELS = [[0, 0, 0], [0.6, 0, 0], [0.6, 0.6, 0], [0.6, 0.6, 0.6]];
export const fuelPower = (fuel) => fuel.reduce((p, f) => p + 0.16 * Math.min(1, Math.max(0, f) / 0.3), 0.2);
const FADE = 0.8, GAIN_T = 0.45, NEAR = 0.03;   // 이어 붙는 시간(초), 켜지고 꺼지는 시간(초), 같은 자리로 보는 거리(m)

// 의자에 앉은 눈 자리에서 벽난로 구멍 한가운데를 보는 시점
export function seatCamera(eye, fov, aspect) {
  const c = new THREE.PerspectiveCamera(fov, aspect, 0.05, 50);
  c.position.set(eye[0], eye[1], eye[2]); c.lookAt(FP.faceX, FP.hearthH + FP.openH / 2, FP.zc);
  c.updateMatrixWorld(true); c.updateProjectionMatrix(); c.matrixWorldInverse.copy(c.matrixWorld).invert();
  return c;
}
// 그 시점의 화면 네모(rect, NDC)를 불이 있는 깊이의 방 안 네모로 옮긴다. 귀퉁이 순서: 왼쪽 위, 오른쪽 위, 오른쪽 아래, 왼쪽 아래
export function fireQuad(camera, rect) {
  const T = Math.tan(camera.fov * Math.PI / 360), A = camera.aspect;
  const D = -new THREE.Vector3(FP.fire.x, FP.fire.y + 0.25, FP.fire.z).applyMatrix4(camera.matrixWorldInverse).z;
  return [[rect.x0, rect.y1], [rect.x1, rect.y1], [rect.x1, rect.y0], [rect.x0, rect.y0]].map(([x, y]) => new THREE.Vector3(x * T * A * D, y * T * D, -D).applyMatrix4(camera.matrixWorld).toArray().map((n) => +n.toFixed(5)));
}

// (0,0)-(w,h) 네모를 네 점 p(왼쪽 위부터 시계 방향)로 보내는 투영 변환을 CSS matrix3d 로
function matrix3d(w, h, p) {
  const adj = (m) => [m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4], m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5], m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3]];
  const mul = (a, b) => { const c = Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { let s = 0; for (let k = 0; k < 3; k++) s += a[3 * i + k] * b[3 * k + j]; c[3 * i + j] = s; } return c; };
  const basis = (q) => { const m = [q[0][0], q[1][0], q[2][0], q[0][1], q[1][1], q[2][1], 1, 1, 1], a = adj(m), x = q[3][0], y = q[3][1], v = [a[0] * x + a[1] * y + a[2], a[3] * x + a[4] * y + a[5], a[6] * x + a[7] * y + a[8]]; return mul(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]); };
  const t = mul(basis(p), adj(basis([[0, 0], [w, 0], [w, h], [0, h]]))).map((x, _, a) => x / a[8]);
  return `matrix3d(${[t[0], t[3], 0, t[6], t[1], t[4], 0, t[7], 0, 0, 1, 0, t[2], t[5], 0, t[8]].join(',')})`;
}

export class BakedFire {
  constructor(anchor) {
    this.anchor = anchor; this.seats = []; this.info = null; this.gain = 0; this.seat = null; this.cur = -1; this.fading = null; this.level = 1; this.power = 0.6; this.ready = false;
    this._v = new THREE.Vector3(); this._pts = [[0, 0], [0, 0], [0, 0], [0, 0]];
  }
  // 저장해 둔 동영상 목록을 읽는다. 없으면 seats 가 빈 채로 남는다
  async load() {
    try {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(BAKE_DIR);
      const m = JSON.parse(await (await (await dir.getFileHandle('manifest.json')).getFile()).text());
      const seats = [];
      for (const [id, s] of Object.entries(m.seats)) {
        const clips = {};
        for (const [name, c] of Object.entries(m.clips)) {
          const file = await (await dir.getFileHandle(`${id}-${name}.mp4`)).getFile();
          clips[name] = { name, url: URL.createObjectURL(file), dur: c.dur, power: c.power, light: c.light[id] || [], size: file.size };
        }
        seats.push({ id, label: s.label, eye: new THREE.Vector3(...s.eye), quad: s.quad.map((q) => new THREE.Vector3(...q)), clips });
      }
      this.info = m; this.seats = seats; this._build();
    } catch (e) { if (e?.name !== 'NotFoundError') console.warn('미리 만든 불을 읽지 못했습니다', e); this.seats = []; }
    return this.seats.length;
  }
  _build() {
    if (this.box) return;
    const { w, h } = this.info;
    this.box = Object.assign(document.createElement('div'), { id: 'fireBaked' });
    Object.assign(this.box.style, { position: 'fixed', left: 0, top: 0, width: w + 'px', height: h + 'px', transformOrigin: '0 0', zIndex: 0, pointerEvents: 'none', visibility: 'hidden', opacity: 0, background: '#000', willChange: 'transform, opacity' });
    this.videos = [0, 1].map(() => {
      const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.disablePictureInPicture = true;
      Object.assign(v.style, { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', opacity: 0 });
      return v;
    });
    this.box.append(this.videos[1], this.videos[0]);   // 첫째가 위
    this.anchor.after(this.box);
  }
  // 이 눈 자리에서 쓸 수 있는 자리(없으면 null)
  seatAt(pos) { for (const s of this.seats) if (s.eye.distanceTo(pos) < NEAR) return s; return null; }
  get active() { return this.gain > 0; }
  get full() { return this.gain >= 1; }            // 실시간 불을 완전히 가렸다: 불 계산을 쉬어도 된다
  get video() { return this.cur >= 0 ? this.videos[this.cur] : null; }

  _set(i, clip) {
    const v = this.videos[i]; v._ok = false;
    if (v._clip !== clip) { v._clip = clip; v.src = clip.url; v.load(); }
    else { try { v.currentTime = 0; } catch { /* 아직 못 읽음 */ } }
    v.pause();
  }
  _ok(i) { const v = this.videos[i]; return v.readyState >= 2 && !v.seeking; }
  _show(i, o) { this.videos[i].style.opacity = o; }

  // 매 프레임. seat = 지금 앉은 자리(없으면 null), logs = 타고 있는 장작 수, view = 화면 크기(css px). 돌려주는 값: 동영상이 화면에 나오는 중인지
  update(dt, camera, view, seat, logs) {
    if (!this.box) return false;
    const want = seat ? seat.clips['loop' + logs] || null : null;
    if (seat !== this.seat) { this.seat = seat; if (seat && this.gain <= 0) this.cur = -1; }
    // 켜기: 첫 동영상이 준비되면 서서히 나타난다. 끄기: 서서히 사라진 뒤 멈춘다
    if (want && this.cur < 0) { this.cur = 0; this._set(0, want); this._show(0, 1); this._show(1, 0); this.fading = null; this.ready = false; }
    if (this.cur >= 0 && !this.ready && this._ok(this.cur)) { this.ready = true; this.videos[this.cur].play().catch(() => {}); }
    const on = !!want && this.ready;
    this.gain = Math.min(1, Math.max(0, this.gain + (on ? dt : -dt) / GAIN_T));
    if (!want && this.gain <= 0) { if (this.cur >= 0) { for (const v of this.videos) v.pause(); this.cur = -1; this.ready = false; this.fading = null; } this.box.style.visibility = 'hidden'; return false; }
    if (!this.ready) return false;

    // 이어 붙이기: 끝이 가까우면 같은 동영상을 처음부터, 장작 수가 바뀌면 그 동영상으로 서서히 바꾼다
    const i = this.cur, o = 1 - i, v = this.videos[i], end = (isFinite(v.duration) && v.duration > 0 ? v.duration : v._clip.dur) - 0.1, left = end - v.currentTime;
    const next = want && v._clip !== want ? want : left <= FADE + 0.3 || v.ended ? v._clip : null;
    if (!this.fading && next) { this._set(o, next); this.fading = { t: 0, started: false }; }
    if (this.fading) {
      const F = this.fading, fade = Math.min(FADE, Math.max(0.2, v._clip.dur / 4));
      if (!F.started && this._ok(o) && (v._clip !== this.videos[o]._clip || left <= fade || v.ended)) { F.started = true; this.videos[o].play().catch(() => {}); }
      if (F.started) {
        F.t += dt; const k = Math.min(1, F.t / fade);
        // 첫째 동영상이 늘 위에 있다: 위쪽이 나가는 쪽이면 옅어지며 아래를 드러내고, 들어오는 쪽이면 짙어지며 아래를 덮는다
        if (i === 0) { this._show(1, 1); this._show(0, 1 - k); } else { this._show(1, 1); this._show(0, k); }
        if (k >= 1) { v.pause(); this._show(o, 1); this._show(i, 0); this.cur = o; this.fading = null; }
      }
    }
    // 불빛: 지금 보여 주는 곳의 기록
    const cv = this.videos[this.cur], c = cv._clip, L = c.light;
    if (L.length > 1) { const f = Math.min(L.length - 1, Math.max(0, cv.currentTime * this.info.fps)), a = Math.floor(f), b = Math.min(L.length - 1, a + 1); this.level = L[a] + (L[b] - L[a]) * (f - a); } else this.level = 1;
    this.power = c.power;

    // 네 귀퉁이가 화면의 어디에 오는지. 하나라도 눈 뒤로 가면(벽난로를 등지면) 숨긴다
    const P = this._pts;
    for (let k = 0; k < 4; k++) {
      const p = this._v.copy(seat ? seat.quad[k] : this._quad[k]).applyMatrix4(camera.matrixWorldInverse);
      if (p.z > -0.05) { this.box.style.visibility = 'hidden'; return this.gain > 0; }
      p.applyMatrix4(camera.projectionMatrix); P[k][0] = (p.x + 1) / 2 * view.w; P[k][1] = (1 - p.y) / 2 * view.h;
    }
    if (seat) this._quad = seat.quad;
    const st = this.box.style; st.transform = matrix3d(this.info.w, this.info.h, P); st.opacity = this.gain; st.visibility = 'visible';
    return true;
  }
  // 지금 화면에서 동영상이 차지하는 네모(인용 카드처럼 화면을 그림으로 옮길 때 쓴다)
  bounds() { const P = this._pts, xs = P.map((p) => p[0]), ys = P.map((p) => p[1]); return { left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }; }
  // 저장해 둔 것을 지운다
  static async clear() { try { await (await navigator.storage.getDirectory()).removeEntry(BAKE_DIR, { recursive: true }); } catch { /* 없음 */ } }
}
