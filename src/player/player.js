// 1인칭 플레이어: 걷기·충돌(room-at-dawn의 src/game/game.js를 바탕으로 함, MIT), 바라보고 상호작용, 의자에 앉기.
// 상태: walk → sitting(전환) → seated ⇄ reading → standing(전환) → walk   (기획서 7.3)
import * as THREE from 'three/webgpu';
import { ROOM, PLAYER_START } from '../scene/layout.js';

const R = 0.2, EYE = 1.62, EYE_CROUCH = 0.98;
const ease = (t) => t * t * (3 - 2 * t);
// 시선(원점 o, 방향 d)이 상자 [mn, mx]에 처음 닿는 거리, 안 닿으면 null
const rayBox = (o, d, mn, mx) => {
  let t0 = -Infinity, t1 = Infinity;
  for (let a = 0; a < 3; a++) {
    const oa = o.getComponent(a), da = d.getComponent(a);
    if (Math.abs(da) < 1e-9) { if (oa < mn[a] || oa > mx[a]) return null; continue; }
    let ta = (mn[a] - oa) / da, tb = (mx[a] - oa) / da; if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return null;
  }
  return t1 < 0 ? null : t0;
};
const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

export class Player {
  constructor({ camera, canvas, ctx, onInteract, onState }) {
    this.camera = camera; this.canvas = canvas; this.ctx = ctx; this.onInteract = onInteract; this.onState = onState;
    this.pos = new THREE.Vector3(PLAYER_START.x, 0, PLAYER_START.z); this.vel = new THREE.Vector3();
    this.feet = 0; this.yaw = PLAYER_START.yaw; this.pitch = -0.05; this.eye = EYE; this.bob = 0; this.breath = 0;
    this.state = 'walk'; this.chair = null; this.tween = null; this.focus = null;
    this.keys = new Set(); this.sens = 0.0019; this.baseFov = 62; this.fov = 62; this.invertY = false; this.sway = true; this.readPitch = -0.5; this.readFov = 42; this.readYaw = 0;
    this.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._bind();
  }

  get locked() { return document.pointerLockElement === this.canvas; }
  lock() { this.canvas.requestPointerLock?.(); }

  _bind() {
    document.addEventListener('mousemove', (e) => {
      if (!this.locked || this.tween) return;
      this.yaw -= e.movementX * this.sens; this.pitch -= e.movementY * this.sens * (this.invertY ? -1 : 1);
      this._clampLook();
    });
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyE') this.interact();
      if (e.code === 'Space' && this.state === 'seated' && !this.tween) { e.preventDefault(); this.stand(); }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    this.canvas.addEventListener('mousedown', (e) => { if (this.locked && e.button === 0) this.interact(); });
  }

  _clampLook() {
    if (this.state === 'seated' || this.state === 'reading') {
      const c = this.chair, dy = Math.atan2(Math.sin(this.yaw - c.yaw), Math.cos(this.yaw - c.yaw));
      this.yaw = c.yaw + Math.max(-1.22, Math.min(1.22, dy));           // 좌우 ±70°
      this.pitch = Math.max(-1.32, Math.min(0.7, this.pitch));          // 무릎 위 책까지 내려다볼 수 있게
    } else this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
  }

  blocked(x, z) {
    // 걸을 수 있는 곳: 방 안, 열린 문, 집 밖 마당(src/scene/outdoor.js). 없으면 방 안만
    if (this.ctx.walkable ? !this.ctx.walkable(x, z, R) : x < R + 0.02 || x > ROOM.W - R - 0.02 || z < R + 0.05 || z > ROOM.D - R - 0.02) return true;
    const f = this.ctx.groundAt ? this.ctx.groundAt(x, z) : 0;
    for (const c of this.ctx.colliders) {
      if (c.max[1] < f + 0.25 || c.min[1] > f + this.eye) continue;
      if (x > c.min[0] - R && x < c.max[0] + R && z > c.min[2] - R && z < c.max[2] + R) return true;
    }
    return false;
  }

  // 바라보는 방향에서 가장 가까운 상호작용 대상 (2m 이내, 시선에서 대상 반지름 안)
  _findFocus() {
    if (this.state !== 'walk') return this.state === 'seated' ? { id: 'book', label: '책 펼치기' } : null;
    const o = this.camera.position, d = new THREE.Vector3(); this.camera.getWorldDirection(d);
    let best = null, bestT = 2.0, boxIt = null, boxT = 2.0;
    for (const it of this.ctx.interact) {
      // 상자로 고르는 대상(책장의 책): 시선이 상자를 지나는 곳까지의 거리
      if (it.box) { const t = rayBox(o, d, it.box.min, it.box.max); if (t !== null && t > 0.2 && t < boxT) { boxIt = it; boxT = t; } continue; }
      const v = new THREE.Vector3(it.pos[0] - o.x, it.pos[1] - o.y, it.pos[2] - o.z), t = v.dot(d);
      if (t < 0.2 || t > bestT + it.radius) continue;
      const miss = v.addScaledVector(d, -t).length();
      if (miss < it.radius * 0.9 && t < bestT + it.radius * 0.5) { best = it; bestT = Math.min(bestT, t); }
    }
    return boxIt && (!best || boxT < bestT + 0.3) ? boxIt : best;
  }

  interact() {
    const f = this.focus; if (!f || this.tween) return;
    if (f.chair) return this.sit(f.chair);
    if (f.id === 'book') return this.openBook();
    this.onInteract?.(f);
  }

  _setState(s) { this.state = s; this.onState?.(s, this); }

  _startTween(dur, to, done) {
    this.tween = { t: 0, dur: this.reduceMotion ? 0.01 : dur, from: { x: this.pos.x, z: this.pos.z, eye: this.eye, yaw: this.yaw, pitch: this.pitch, fov: this.fov }, to: { fov: this.baseFov, ...to }, done };
  }

  sit(chair) {
    this.chair = chair; this.vel.set(0, 0, 0); this._setState('sitting');
    this.standSpot = { x: this.pos.x, z: this.pos.z };
    this._startTween(1.2, { x: chair.pos[0], z: chair.pos[1], eye: chair.eye, yaw: chair.yaw, pitch: -0.12 }, () => this._setState('seated'));
  }
  // 전환 없이 바로 앉은 상태로 (다시 열었을 때 앉아 있던 자리에서 시작)
  seatNow(chair) { this.chair = chair; this.standSpot = { x: this.pos.x, z: this.pos.z }; this.pos.x = chair.pos[0]; this.pos.z = chair.pos[1]; this.eye = chair.eye; this.yaw = chair.yaw; this.pitch = -0.12; this.vel.set(0, 0, 0); this._setState('seated'); }
  stand() {
    if (this.state !== 'seated') return;
    this._setState('standing');
    // 의자 앞쪽의 비어 있는 곳으로 일어선다
    const c = this.chair; let spot = this.standSpot;
    for (const r of [0.75, 0.9, 1.1]) {
      const x = c.pos[0] - Math.sin(c.yaw) * r, z = c.pos[1] - Math.cos(c.yaw) * r;
      const eye = this.eye; this.eye = EYE; const bad = this.blocked(x, z); this.eye = eye;
      if (!bad) { spot = { x, z }; break; }
    }
    this._startTween(1.0, { x: spot.x, z: spot.z, eye: EYE, yaw: this.yaw, pitch: 0 }, () => { this.chair = null; this._setState('walk'); });
  }
  openBook() {
    if (this.state !== 'seated') return;
    this._setState('reading');
    this._startTween(0.8, { x: this.pos.x, z: this.pos.z, eye: this.eye, yaw: this.chair.yaw + this.readYaw, pitch: this.readPitch, fov: this.readFov }, null);
  }
  closeBook() {
    if (this.state !== 'reading') return;
    this._setState('seated');
    this._startTween(0.6, { x: this.pos.x, z: this.pos.z, eye: this.eye, yaw: this.yaw, pitch: -0.12 }, null);
  }

  update(dt) {
    const K = this.keys, cam = this.camera;
    if (this.tween) {
      const tw = this.tween; tw.t = Math.min(1, tw.t + dt / tw.dur);
      const e = ease(tw.t), a = tw.from, b = tw.to;
      this.pos.x = a.x + (b.x - a.x) * e; this.pos.z = a.z + (b.z - a.z) * e;
      // 앉을 때 끝에서 살짝 더 가라앉았다가 올라오는 쿠션 반동
      const settle = this.state === 'sitting' ? -0.035 * Math.sin(Math.PI * Math.max(0, (tw.t - 0.7) / 0.3)) : 0;
      this.eye = a.eye + (b.eye - a.eye) * e + settle;
      // 앉거나 일어설 때는 몸을 앞으로 숙였다가 편다
      const lean = this.state === 'sitting' || this.state === 'standing' ? -0.17 * Math.sin(Math.PI * tw.t) : 0;
      this.yaw = lerpAngle(a.yaw, b.yaw, e); this.pitch = a.pitch + (b.pitch - a.pitch) * e + lean; this.fov = a.fov + (b.fov - a.fov) * e;
      if (tw.t >= 1) { this.tween = null; tw.done?.(); }
    } else if (this.state === 'walk') {
      const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)), right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const wish = new THREE.Vector3();
      if (K.has('KeyW') || K.has('ArrowUp')) wish.add(fwd);
      if (K.has('KeyS') || K.has('ArrowDown')) wish.sub(fwd);
      if (K.has('KeyD') || K.has('ArrowRight')) wish.add(right);
      if (K.has('KeyA') || K.has('ArrowLeft')) wish.sub(right);
      const crouch = K.has('ControlLeft') || K.has('KeyQ');
      const speed = (K.has('ShiftLeft') ? 0.7 : 1.5) * (crouch ? 0.6 : 1);
      if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);
      this.vel.lerp(wish, 1 - Math.exp(-dt * 9));
      const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
      if (!this.blocked(nx, this.pos.z)) this.pos.x = nx; else this.vel.x = 0;
      if (!this.blocked(this.pos.x, nz)) this.pos.z = nz; else this.vel.z = 0;
      const eyeT = crouch ? EYE_CROUCH : EYE; this.eye += (eyeT - this.eye) * (1 - Math.exp(-dt * 7));
      this.bob += Math.hypot(this.vel.x, this.vel.z) * dt * 6.2;
    }
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.breath += dt;
    const still = this.state === 'seated' || this.state === 'reading';
    const sway = this.reduceMotion || !this.sway ? 0 : (still ? Math.sin(this.breath * 1.55) * 0.0015 : Math.sin(this.bob) * 0.011 * Math.min(1, sp));
    // 발 높이(마루, 계단, 마당)는 부드럽게 따라간다
    const gy = this.ctx.groundAt ? this.ctx.groundAt(this.pos.x, this.pos.z) : 0; this.feet += (gy - this.feet) * (1 - Math.exp(-dt * 9)); if (Math.abs(gy - this.feet) < 1e-4) this.feet = gy;
    cam.position.set(this.pos.x, this.feet + this.eye + sway, this.pos.z);
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    if (Math.abs(cam.fov - this.fov) > 1e-4) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld(true);
    this.focus = this.tween ? null : this._findFocus();
    this.stepPhase = this.bob; this.speed = sp;
  }
}
