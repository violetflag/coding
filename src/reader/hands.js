// 책을 잡은 두 손: 무료 손 모델(WebXR Input Profiles generic-hand, MIT, public/models/hand)을 불러와 뼈를 돌려 책을 쥐는 자세를 만든다.
// 각 손은 책의 한쪽 면(L/R)에 붙어 펼친 각도를 따라 움직인다. 손바닥은 뒤표지를 받치고 손가락은 책등 쪽을 향하며,
// 엄지만 책 바깥 가장자리를 돌아 앞쪽 종이 여백 위에 얹힌다. 읽은 만큼 종이 두께가 바뀌면 엄지 끝을 다시 맞춘다(CCD 역운동학).
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PW, PH } from './book3d.js';

const BACK = -0.0028;                         // 뒤표지 판 뒷면(면 좌표 z)
const FINGERS = ['index', 'middle', 'ring', 'pinky'];
// 이 손 모델은 마디(뼈)가 모두 한 부모 아래 나란히 있다(WebXR 손 관절처럼 마디마다 자세가 따로). 그래서 한 마디를 굽히면
// 그 뒤 마디들의 위치·방향을 직접 같이 돌려 준다. chain = [뿌리 … 끝] 마디들, 좌표는 모두 그 부모(Armature) 기준.
function turn(chain, k, q) {
  const p = chain[k].position;
  for (let j = k; j < chain.length; j++) { const b = chain[j]; if (j > k) b.position.sub(p).applyQuaternion(q).add(p); b.quaternion.premultiply(q); }
}
const _ax = new THREE.Vector3(), _tq = new THREE.Quaternion();
function bend(chain, k, angle) { _ax.set(1, 0, 0).applyQuaternion(chain[k].quaternion); turn(chain, k, _tq.setFromAxisAngle(_ax, angle)); }
// CCD 역운동학: ks의 마디들을 차례로 돌려 chain[eff]를 target에 가깝게. 한 번에 크게 돌지 않게 나눠 돈다
function ccd(chain, ks, eff, target, iters) {
  const e = new THREE.Vector3(), t = new THREE.Vector3(), q = new THREE.Quaternion(), id = new THREE.Quaternion();
  for (let it = 0; it < iters; it++) {
    for (const k of ks) {
      const p = chain[k].position; e.copy(chain[eff].position).sub(p).normalize(); t.copy(target).sub(p).normalize();
      const ang = Math.acos(Math.min(1, Math.max(-1, e.dot(t)))); if (ang < 1e-4) continue;
      q.setFromUnitVectors(e, t); if (ang > 0.3) q.slerp(id, 1 - 0.3 / ang);
      turn(chain, k, q);
    }
    if (chain[eff].position.distanceTo(target) < 0.001) break;
  }
}
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _n = new THREE.Matrix4();

export class BookHands {
  constructor(book, { url = 'models/hand/' } = {}) {
    this.book = book; this.rigs = []; this.visible = false; this.key = '';
    this.skin = new THREE.MeshStandardMaterial({ color: 0xc39274, roughness: 0.62, metalness: 0 });
    this.sleeve = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.95 });
    const loader = new GLTFLoader();
    this.ready = Promise.all(['L', 'R'].map((side) => loader.loadAsync(url + (side === 'R' ? 'right' : 'left') + '.glb').then((g) => this._rig(side, g.scene))))
      .then(() => { this.key = ''; this.setVisible(this.visible); })
      .catch((e) => console.warn('손 모델을 불러오지 못했습니다', e));
  }

  _rig(side, model) {
    const s = side === 'R' ? 1 : -1, root = new THREE.Group(); root.name = '손 ' + side;
    model.traverse((o) => { if (o.isMesh) { o.material = this.skin; o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    root.add(model);
    const bone = (n) => model.getObjectByName(n), bind = new Map();
    model.traverse((o) => { if (o.isBone) bind.set(o, [o.position.clone(), o.quaternion.clone()]); });
    model.updateMatrixWorld(true);
    // 모델 좌표의 손 방향: 손가락(F), 손등(D), 엄지 쪽(T). 이것을 책 면 좌표의 방향으로 돌린다
    const wq = bone('middle-finger-phalanx-proximal').getWorldQuaternion(new THREE.Quaternion());
    const Fm = new THREE.Vector3(0, 0, -1).applyQuaternion(wq), Dm = new THREE.Vector3(0, 1, 0).applyQuaternion(wq);
    Dm.addScaledVector(Fm, -Dm.dot(Fm)).normalize(); const Cm = new THREE.Vector3().crossVectors(Fm, Dm);
    // 손가락은 뒤표지 뒤에서 책등 쪽으로 조금 올라가며, 손바닥은 책(읽는 사람 쪽)을 본다
    const F = new THREE.Vector3(-s * 0.86, 0.5, 0).normalize(), D = new THREE.Vector3(0, 0, -1), C = new THREE.Vector3().crossVectors(F, D);
    _m.makeBasis(F, D, C); _n.makeBasis(Fm, Dm, Cm).transpose(); root.quaternion.setFromRotationMatrix(_m.multiply(_n));
    // 손목 뒤로 소매
    const cuff = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.16, 6, 14), this.sleeve); cuff.castShadow = true; cuff.receiveShadow = true;
    const chain = (f) => ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'].map((j) => bone(`${f}-finger-${j}`)).filter(Boolean);
    const rig = { side, s, root, model, bone, bind, cuff, arm: bone('wrist').parent, fingers: FINGERS.map(chain), thumb: ['metacarpal', 'phalanx-proximal', 'phalanx-distal', 'tip'].map((j) => bone('thumb-' + j)), knuckle: bone('index-finger-phalanx-proximal'), wrist: bone('wrist') };
    this.book.side[side].add(root, cuff); this.rigs.push(rig);
  }

  setVisible(v) { this.visible = v; for (const r of this.rigs) r.root.visible = r.cuff.visible = v; if (v) this.update(); }

  // 종이 두께가 바뀌었을 때만 다시 맞춘다
  update() {
    if (!this.visible || !this.rigs.length) return;
    const key = this.book.tL.toFixed(4) + '/' + this.book.tR.toFixed(4); if (key === this.key) return; this.key = key;
    for (const r of this.rigs) this._pose(r);
  }

  _pose(r) {
    const { s, root, model, side } = r, book = this.book, sg = book.side[side];
    // 모든 마디를 처음 자세로 돌려 놓고 시작한다(매번 같은 데서 풀어야 자세가 흔들리지 않는다)
    for (const [b, [p, q]] of r.bind) { b.position.copy(p); b.quaternion.copy(q); }
    // 손가락은 표지 판을 따라 거의 편 채로, 마디마다 아주 조금 굽힌다(판을 파고들지 않을 만큼)
    for (const c of r.fingers) { bend(c, 1, -0.05); bend(c, 2, -0.1); bend(c, 3, -0.06); }
    root.position.set(0, 0, 0); sg.updateMatrixWorld(true);
    const local = (o, out) => sg.worldToLocal(o.getWorldPosition(out));
    // 손가락 마디가 모두 뒤표지 뒤에(마디 굵기만큼 떨어져) 오도록 앞뒤를 맞추고, 검지 뿌리 마디는 책 바깥 가장자리 조금 안쪽, 아래쪽 1/3 높이에
    let zmax = -Infinity;
    model.traverse((o) => { if (o.isBone && /finger/.test(o.name)) zmax = Math.max(zmax, local(o, _v).z); });
    local(r.knuckle, _v);
    root.position.set(s * (PW - 0.03) - _v.x, -PH * 0.3 - _v.y, BACK - 0.0105 - zmax);
    sg.updateMatrixWorld(true);
    // 엄지: 먼저 뿌리 뼈만 돌려 엄지 둘째 마디를 책 바깥 가장자리 바로 밖, 종이 높이로 올리고(책을 뚫고 지나가지 않게),
    // 나머지 두 마디로 엄지 끝을 가장자리에서 2cm 안쪽 종이 여백 위에 얹는다
    const T = r.thumb, cmc = local(T[0], _b).clone(), d = PW - 0.015, toArm = (v) => r.arm.worldToLocal(sg.localToWorld(v));
    const way = toArm(new THREE.Vector3(s * (PW + 0.011), cmc.y + 0.012, book.pageTop(side, PW) + 0.004));
    const target = toArm(new THREE.Vector3(s * d, cmc.y + 0.026, book.pageTop(side, d) + 0.0075));
    ccd(T, [0], 1, way, 10);
    ccd(T, [2, 1], 3, target, 14);
    r.model.updateMatrixWorld(true);
    // 소매: 손목에서 팔꿈치 쪽(아래, 바깥, 읽는 사람 쪽)으로
    local(r.wrist, _v); const dir = _w.set(s * 0.45, -0.65, 0.6).normalize();
    r.cuff.position.copy(_v).addScaledVector(dir, 0.105); r.cuff.quaternion.setFromUnitVectors(_b.set(0, 1, 0), dir);
  }
}
