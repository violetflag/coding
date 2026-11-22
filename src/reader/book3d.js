// 펼친 책의 3D 모형: 표지, 양쪽 책장 더미(읽은 만큼 왼쪽이 두꺼워진다), 넘어가는 한 장, 가름끈.
// 쪽은 Canvas2D로 그린 텍스처이고 방의 조명을 그대로 받는다: 불빛이 흔들리면 종이 밝기도 함께 흔들린다.
// 책 좌표: 책등이 Y축, 오른쪽 쪽이 +X, 읽는 사람 쪽이 +Z. 단위 m.
import * as THREE from 'three/webgpu';
import { PAGE } from './typeset.js';

export const PW = 0.14, PH = 0.21;
export const SS = 1.5;
const SEG = 32, TMAX = 0.02, TMIN = 0.003;
const SQ = 0.0035, BOARD = 0.0028;                 // 표지가 종이보다 밖으로 나온 너비, 표지 판 두께
const ease = (t) => t * t * (3 - 2 * t);
// 책등에서 d만큼 떨어진 곳의 종이 높이 (더미 두께 t, 표지 판 기준): 가운데 골에서 가파르게 올라와 책등 쪽 3분의 1 지점에서 가장 높고,
// 바깥으로 완만하게 내려간다. 두꺼운 쪽일수록 더 볼록하다.
const prof = (d, t) => { const u = Math.min(1, d / PW); return t * (0.16 + 0.84 * (1 - Math.exp(-d / 0.015))) + (0.0032 + 0.26 * t) * Math.sin(Math.PI * Math.pow(u, 0.62)); };
const slant = (t) => 0.45 * t + 0.001;             // 배(앞마구리)의 비스듬함: 아래 책장일수록 더 밖으로 나온다

export class Book3D {
  constructor() {
    const g = (this.group = new THREE.Group()); g.name = 'book'; g.visible = false;
    this.cv = {}; this.tex = {}; this.mat = {};
    // 종이의 잔결(섬유): 빛이 비스듬히 닿을 때 종이가 매끈한 판으로 보이지 않게 한다
    const fb = document.createElement('canvas'); fb.width = fb.height = 256; { const c = fb.getContext('2d'), im = c.createImageData(256, 256); let sd = 11; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 65536; i++) { const v = 118 + r() * 20; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; } c.putImageData(im, 0, 0);
      c.globalAlpha = 0.5; for (let i = 0; i < 900; i++) { const x = r() * 256, y = r() * 256, a = r() * 7, l = 3 + r() * 9; c.strokeStyle = r() > 0.5 ? '#9a9a9a' : '#5c5c5c'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke(); } }
    const fibre = new THREE.CanvasTexture(fb); fibre.wrapS = fibre.wrapT = THREE.RepeatWrapping; fibre.repeat.set(3, 4.5);
    for (const k of ['L', 'R', 'F', 'B']) {
      const c = (this.cv[k] = document.createElement('canvas')); c.width = PAGE.w * SS; c.height = PAGE.h * SS;      // 글자가 또렷하도록 1.5배로 그린다
      const t = (this.tex[k] = new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
      this.mat[k] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.96, metalness: 0, bumpMap: fibre, bumpScale: 0.35, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0, side: k === 'B' ? THREE.BackSide : THREE.FrontSide,
        polygonOffset: k === 'F' || k === 'B', polygonOffsetFactor: -2, polygonOffsetUnits: -8 });   // 넘어가는 장은 아래 쪽과 거의 붙어 있어도 항상 위에 그려진다
    }
    // 양쪽 면은 책등을 축으로 조금 접힌다(펼친 각도). 각 면의 좌표: 책등에서 바깥으로 ±X, 표지 판에서 종이 쪽으로 +Z.
    this.side = { L: new THREE.Group(), R: new THREE.Group() }; g.add(this.side.L, this.side.R);
    // 책장 더미 윗면 (왼쪽, 오른쪽)
    const surf = (side) => {
      const geo = new THREE.PlaneGeometry(PW, PH, SEG, 1);                                   // 위치는 setThickness에서 채운다
      const m = new THREE.Mesh(geo, this.mat[side]); m.receiveShadow = true; m.userData.side = side; this.side[side].add(m); return m;
    };
    this.left = surf('L'); this.right = surf('R');
    // 책장 옆면(배·머리·밑): 책장이 한 장씩 쌓인 결
    const ec = document.createElement('canvas'); ec.width = 64; ec.height = 256; const e2 = ec.getContext('2d');
    { let sd = 5; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      for (let y = 0; y < 256; y++) { const v = 176 + r() * 52 - (y % 2) * 22 - (r() < 0.06 ? 46 : 0); e2.fillStyle = `rgb(${v},${v - 10},${v - 38})`; e2.fillRect(0, y, 64, 1); }
      e2.globalAlpha = 0.12; for (let i = 0; i < 300; i++) { e2.fillStyle = r() > 0.5 ? '#fff' : '#3a2a18'; e2.fillRect(r() * 64, r() * 256, 6 + r() * 20, 1); } }
    const et = new THREE.CanvasTexture(ec); et.colorSpace = THREE.SRGBColorSpace; et.wrapS = et.wrapT = THREE.RepeatWrapping; et.anisotropy = 8;
    this.edgeMat = new THREE.MeshStandardMaterial({ map: et, roughness: 1, side: THREE.DoubleSide });
    this.edges = { L: new THREE.Mesh(new THREE.BufferGeometry(), this.edgeMat), R: new THREE.Mesh(new THREE.BufferGeometry(), this.edgeMat) }; this.side.L.add(this.edges.L); this.side.R.add(this.edges.R);
    // 표지: 천을 씌운 두 장의 판과 둥근 책등. 종이보다 사방으로 조금 나온다.
    const cc = document.createElement('canvas'); cc.width = cc.height = 128; { const c = cc.getContext('2d'); c.fillStyle = '#d8d8d8'; c.fillRect(0, 0, 128, 128); let sd = 3; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      for (let y = 0; y < 128; y += 2) for (let x = 0; x < 128; x += 2) { c.globalAlpha = 0.12 + r() * 0.3; c.fillStyle = (x / 2 + y / 2) % 2 ? '#fff' : '#555'; c.fillRect(x, y, 2, 2); } }
    const ct = new THREE.CanvasTexture(cc); ct.colorSpace = THREE.SRGBColorSpace; ct.wrapS = ct.wrapT = THREE.RepeatWrapping; ct.repeat.set(5, 7);
    this.coverMat = new THREE.MeshStandardMaterial({ color: 0x5b2a22, map: ct, bumpMap: ct, bumpScale: 0.6, roughness: 0.88 });
    this.boards = {};
    for (const side of ['L', 'R']) { const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.coverMat); b.receiveShadow = true; b.castShadow = true; this.side[side].add(b); this.boards[side] = b; }
    const spine = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, PH + 2 * SQ, 20, 1, false, Math.PI / 2, Math.PI), this.coverMat); spine.castShadow = true; g.add(spine); this.spine = spine;
    // 가름끈: 가운데 골을 따라 내려와 책 밑으로 늘어진다
    const rib = new THREE.Mesh(new THREE.PlaneGeometry(0.005, PH * 0.62), new THREE.MeshStandardMaterial({ color: 0x8a1c1c, roughness: 0.8, side: THREE.DoubleSide })); g.add(rib); this.ribbon = rib;
    // 넘어가는 한 장 (앞면·뒷면이 위치를 함께 쓴다)
    const fg = new THREE.PlaneGeometry(PW, PH, SEG, 1), bg = new THREE.BufferGeometry();
    bg.setIndex(fg.index); bg.setAttribute('position', fg.attributes.position); bg.setAttribute('normal', fg.attributes.normal);
    const buv = fg.attributes.uv.clone(); for (let i = 0; i < buv.count; i++) buv.setX(i, 1 - buv.getX(i)); bg.setAttribute('uv', buv);
    this.flipF = new THREE.Mesh(fg, this.mat.F); this.flipB = new THREE.Mesh(bg, this.mat.B); this.flipF.visible = this.flipB.visible = false; g.add(this.flipF, this.flipB);
    this.flip = null; this.progress = 0; this.tL = this.tR = 0.008; this.theta = 0;
    this.setOpen(16); this.setThickness(0.3);
    this.ray = new THREE.Raycaster();
  }

  // 펼친 정도: 양쪽 면이 평평한 상태에서 각각 deg도씩 읽는 사람 쪽으로 접힌다 (0 = 완전히 펼쳐 눕힘)
  setOpen(deg) {
    const th = (Math.max(0, Math.min(85, deg)) * Math.PI) / 180; if (th === this.theta && this._opened) return; this._opened = true;
    this.theta = th; this.side.R.rotation.y = -th; this.side.L.rotation.y = th; if (this.flip) this._bend(this._e ?? 0);
  }
  // 면 좌표(책등에서의 거리 d, 판에서의 높이 h) → 책 좌표 [x, z]
  _w(s, d, h) { const c = Math.cos(this.theta), sn = Math.sin(this.theta); return [s * (d * c - h * sn), d * sn + h * c]; }
  // 책 좌표 x에서 쉬고 있는 종이 면의 높이
  _restZ(x, t) { const c = Math.cos(this.theta), sn = Math.sin(this.theta), ax = Math.abs(x); let d = ax / c; d = Math.min(PW, (ax + prof(d, t) * sn) / c); return d * sn + prof(d, t) * c; }

  // p = 읽은 비율 0…1
  setThickness(p) {
    this.progress = p; this.tL = TMIN + (TMAX - TMIN) * p; this.tR = TMIN + (TMAX - TMIN) * (1 - p);
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? -1 : 1, t = side === 'L' ? this.tL : this.tR, mesh = side === 'L' ? this.left : this.right, pos = mesh.geometry.attributes.position;
      // PlaneGeometry 정점: 위 줄(0…SEG), 아래 줄. u는 왼→오. 왼쪽 쪽은 u=1이 책등.
      for (let r = 0; r < 2; r++) for (let i = 0; i <= SEG; i++) { const u = i / SEG, d = (side === 'L' ? 1 - u : u) * PW; pos.setXYZ(r * (SEG + 1) + i, s * d, (r ? -0.5 : 0.5) * PH, prof(d, t)); }
      pos.needsUpdate = true; mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingSphere(); mesh.geometry.computeBoundingBox();
      // 옆면: 머리·밑(윤곽을 따라 내려오는 띠)과 비스듬한 배. 결의 촘촘함이 두께와 상관없이 같도록 v = 높이 / TMAX.
      const P = [], U = [], I = []; let n = 0; const sl = slant(t), V = (h) => (h / TMAX) * 0.9;
      const quad = (a, b, c2, d2, u0, u1) => { P.push(...a, ...b, ...c2, ...d2); U.push(u0, 0, u1, 0, u1, V(c2[2]), u0, V(d2[2])); I.push(n, n + 1, n + 2, n, n + 2, n + 3); n += 4; };
      const top = (d) => (d <= PW ? prof(d, t) : prof(PW, t) * (1 - (d - PW) / sl));
      const N2 = SEG + 3;
      for (const y of [0.5 * PH, -0.5 * PH]) for (let i = 0; i < N2; i++) { const d0 = i < SEG ? (i / SEG) * PW : PW + ((i - SEG) / 3) * sl, d1 = i + 1 <= SEG ? ((i + 1) / SEG) * PW : PW + ((i + 1 - SEG) / 3) * sl; quad([s * d0, y, 0], [s * d1, y, 0], [s * d1, y, top(d1)], [s * d0, y, top(d0)], d0 * 6, d1 * 6); }
      quad([s * (PW + sl), -0.5 * PH, 0], [s * (PW + sl), 0.5 * PH, 0], [s * PW, 0.5 * PH, prof(PW, t)], [s * PW, -0.5 * PH, prof(PW, t)], 0, 1.5);
      const eg = this.edges[side].geometry; eg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); eg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); eg.setIndex(I); eg.computeVertexNormals(); eg.computeBoundingSphere();
      // 표지 판: 책등 옆 홈에서 배 바깥까지
      const d0 = 0.003, d1 = PW + sl + SQ, b = this.boards[side]; b.scale.set(d1 - d0, PH + 2 * SQ, BOARD); b.position.set(s * (d0 + d1) / 2, 0, -BOARD / 2);
    }
    this.spine.scale.set(0.0065, 1, 0.005); this.spine.position.set(0, 0, -BOARD * 0.4);
    const gz = prof(0, Math.max(this.tL, this.tR)) * Math.cos(this.theta) + 0.0012; this.ribbon.position.set(0.0015, -PH * 0.24, gz); this.ribbon.rotation.x = -0.035;
  }
  setCover(color) { this.coverMat.color.set(color); }
  // 고대비 종이: 조명과 상관없이 종이가 스스로 빛나는 정도
  setGlow(v) { for (const k in this.mat) this.mat[k].emissiveIntensity = v; }
  refresh(...keys) { for (const k of keys.length ? keys : ['L', 'R', 'F', 'B']) this.tex[k].needsUpdate = true; }

  get flipping() { return !!this.flip; }
  // dir +1 = 다음 쪽으로(오른쪽 장이 왼쪽으로 넘어감), -1 = 이전 쪽으로
  startFlip(dir, dur, onDone) { this.flip = { dir, t: 0, dur, onDone }; this.flipF.visible = this.flipB.visible = true; this._bend(dir > 0 ? 0 : 1); }
  _bend(e) {
    this._e = e;
    const pos = this.flipF.geometry.attributes.position, tA = this.tR, tB = this.tL, th = this.theta, EPS = 0.0014;
    const g0 = (prof(0, tA) * (1 - e) + prof(0, tB) * e) * Math.cos(th) + EPS;
    let x = 0, z = g0, prevD = 0;
    const lift = Math.sin(Math.PI * e), w = Math.min(1, lift * 3.2);                          // w: 더미에서 떨어져 나온 정도
    const sR = e < 0.5 ? 1 : -1, tRest = e < 0.5 ? tA : tB;
    for (let i = 0; i <= SEG; i++) {
      const d = (i / SEG) * PW, u = d / PW;
      // 책등에서 바깥으로 갈수록 뒤따라오는 휜 종이. 양 끝에서는 접힌 면의 각도(th)에서 출발하고 도착한다.
      const phi = Math.max(th, Math.min(Math.PI - th, th + (Math.PI - 2 * th) * (e + lift * 0.42 * (u - 0.45))));
      if (i) { const ds = d - prevD; x += Math.cos(phi) * ds; z += Math.sin(phi) * ds; }
      // 내려앉은 쪽에서는 더미의 윤곽을 그대로 따른다
      const [rx, rz] = this._w(sR, d, prof(d, tRest) + EPS);
      let fx = rx + (x - rx) * w, fz = rz + (z - rz) * w;
      fz = Math.max(fz, this._restZ(fx, fx >= 0 ? tA : tB) + EPS);
      pos.setXYZ(i, fx, 0.5 * PH, fz); pos.setXYZ(SEG + 1 + i, fx, -0.5 * PH, fz); prevD = d;
    }
    pos.needsUpdate = true; this.flipF.geometry.computeVertexNormals(); this.flipF.geometry.computeBoundingSphere();
  }
  update(dt) {
    const f = this.flip; if (!f) return;
    f.t = Math.min(1, f.t + dt / f.dur);
    const e = ease(f.t); this._bend(f.dir > 0 ? e : 1 - e);
    if (f.t >= 1) { this.flip = null; this.flipF.visible = this.flipB.visible = false; f.onDone?.(); }
  }

  // 화면의 점(ndc)에서 쪽 위의 위치를 찾는다 → { side, x, y } (쪽 텍스처 px)
  pick(ndc, camera) {
    this.ray.setFromCamera(ndc, camera);
    const hit = this.ray.intersectObjects([this.left, this.right], false)[0]; if (!hit || !hit.uv) return null;
    return { side: hit.object.userData.side, x: hit.uv.x * PAGE.w, y: (1 - hit.uv.y) * PAGE.h };
  }
}
