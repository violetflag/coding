// 펼친 책의 3D 모형: 표지, 양쪽 책장 더미(읽은 만큼 왼쪽이 두꺼워진다), 넘어가는 한 장, 가름끈.
// 쪽은 Canvas2D로 그린 텍스처이고 방의 조명을 그대로 받는다: 불빛이 흔들리면 종이 밝기도 함께 흔들린다.
// 책 좌표: 책등이 Y축, 오른쪽 쪽이 +X, 읽는 사람 쪽이 +Z. 단위 m.
import * as THREE from 'three/webgpu';
import { PAGE } from './typeset.js';

export const PW = 0.14, PH = 0.21;
export const SS = 1.5;
const SEG = 24, TMAX = 0.016, TMIN = 0.0025;
const ease = (t) => t * t * (3 - 2 * t);
// 책등에서 d만큼 떨어진 곳의 종이 높이 (더미 두께 t): 책등 쪽으로 말려 들어간다
const prof = (d, t) => t * (0.12 + 0.88 * (1 - Math.exp(-d / 0.02))) + 0.0012 * Math.sin((d / PW) * Math.PI);

export class Book3D {
  constructor() {
    const g = (this.group = new THREE.Group()); g.name = 'book'; g.visible = false;
    this.cv = {}; this.tex = {}; this.mat = {};
    for (const k of ['L', 'R', 'F', 'B']) {
      const c = (this.cv[k] = document.createElement('canvas')); c.width = PAGE.w * SS; c.height = PAGE.h * SS;      // 글자가 또렷하도록 1.5배로 그린다
      const t = (this.tex[k] = new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
      this.mat[k] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.93, metalness: 0, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0, side: k === 'B' ? THREE.BackSide : THREE.FrontSide });
    }
    // 책장 더미 윗면 (왼쪽, 오른쪽)
    const surf = (side) => {
      const geo = new THREE.PlaneGeometry(PW, PH, SEG, 1), uv = geo.attributes.uv;
      if (side === 'L') for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i));          // 위치는 setThickness에서 채운다
      const m = new THREE.Mesh(geo, this.mat[side]); m.receiveShadow = true; m.userData.side = side; g.add(m); return m;
    };
    this.left = surf('L'); this.right = surf('R');
    // 책장 옆면(배·머리·밑)
    const ec = document.createElement('canvas'); ec.width = 4; ec.height = 64; const e2 = ec.getContext('2d');
    for (let y = 0; y < 64; y++) { const v = 196 + ((y * 7919) % 5) * 9; e2.fillStyle = `rgb(${v},${v - 12},${v - 44})`; e2.fillRect(0, y, 4, 1); }
    const et = new THREE.CanvasTexture(ec); et.colorSpace = THREE.SRGBColorSpace;
    this.edgeMat = new THREE.MeshStandardMaterial({ map: et, roughness: 1, side: THREE.DoubleSide });
    this.edges = { L: new THREE.Mesh(new THREE.BufferGeometry(), this.edgeMat), R: new THREE.Mesh(new THREE.BufferGeometry(), this.edgeMat) }; g.add(this.edges.L, this.edges.R);
    // 표지와 책등
    this.coverMat = new THREE.MeshStandardMaterial({ color: 0x5b2a22, roughness: 0.75 });
    const cover = new THREE.Mesh(new THREE.BoxGeometry(PW * 2 + 0.014, PH + 0.012, 0.004), this.coverMat); cover.position.z = -0.002; cover.receiveShadow = true; g.add(cover);
    // 가름끈
    const rib = new THREE.Mesh(new THREE.PlaneGeometry(0.006, PH + 0.05), new THREE.MeshStandardMaterial({ color: 0x8a1c1c, roughness: 0.8, side: THREE.DoubleSide })); rib.position.set(0.004, -0.025, 0.0015); g.add(rib); this.ribbon = rib;
    // 넘어가는 한 장 (앞면·뒷면이 위치를 함께 쓴다)
    const fg = new THREE.PlaneGeometry(PW, PH, SEG, 1), bg = new THREE.BufferGeometry();
    bg.setIndex(fg.index); bg.setAttribute('position', fg.attributes.position); bg.setAttribute('normal', fg.attributes.normal);
    const buv = fg.attributes.uv.clone(); for (let i = 0; i < buv.count; i++) buv.setX(i, 1 - buv.getX(i)); bg.setAttribute('uv', buv);
    this.flipF = new THREE.Mesh(fg, this.mat.F); this.flipB = new THREE.Mesh(bg, this.mat.B); this.flipF.visible = this.flipB.visible = false; g.add(this.flipF, this.flipB);
    this.flip = null; this.progress = 0; this.tL = this.tR = 0.008;
    this.setThickness(0.3);
    this.ray = new THREE.Raycaster();
  }

  // p = 읽은 비율 0…1
  setThickness(p) {
    this.progress = p; this.tL = TMIN + (TMAX - TMIN) * p; this.tR = TMIN + (TMAX - TMIN) * (1 - p);
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? -1 : 1, t = side === 'L' ? this.tL : this.tR, mesh = side === 'L' ? this.left : this.right, pos = mesh.geometry.attributes.position;
      // PlaneGeometry 정점: 위 줄(0…SEG), 아래 줄. u는 왼→오. 왼쪽 쪽은 u=1이 책등.
      for (let r = 0; r < 2; r++) for (let i = 0; i <= SEG; i++) { const u = i / SEG, d = (side === 'L' ? 1 - u : u) * PW; pos.setXYZ(r * (SEG + 1) + i, s * d, (r ? -0.5 : 0.5) * PH, prof(d, t)); }
      pos.needsUpdate = true; mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingSphere(); mesh.geometry.computeBoundingBox();
      // 옆면: 머리·밑(윤곽을 따라 내려오는 띠)과 배
      const P = [], U = [], I = []; let n = 0;
      const quad = (a, b, c2, d2) => { P.push(...a, ...b, ...c2, ...d2); U.push(0, 0, 1, 0, 1, 1, 0, 1); I.push(n, n + 1, n + 2, n, n + 2, n + 3); n += 4; };
      for (const y of [0.5 * PH, -0.5 * PH]) for (let i = 0; i < SEG; i++) { const d0 = i / SEG * PW, d1 = (i + 1) / SEG * PW; quad([s * d0, y, 0], [s * d1, y, 0], [s * d1, y, prof(d1, t)], [s * d0, y, prof(d0, t)]); }
      quad([s * PW, -0.5 * PH, 0], [s * PW, 0.5 * PH, 0], [s * PW, 0.5 * PH, prof(PW, t)], [s * PW, -0.5 * PH, prof(PW, t)]);
      const eg = this.edges[side].geometry; eg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); eg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); eg.setIndex(I); eg.computeVertexNormals();
    }
  }
  setCover(color) { this.coverMat.color.set(color); }
  // 고대비 종이: 조명과 상관없이 종이가 스스로 빛나는 정도
  setGlow(v) { for (const k in this.mat) this.mat[k].emissiveIntensity = v; }
  refresh(...keys) { for (const k of keys.length ? keys : ['L', 'R', 'F', 'B']) this.tex[k].needsUpdate = true; }

  get flipping() { return !!this.flip; }
  // dir +1 = 다음 쪽으로(오른쪽 장이 왼쪽으로 넘어감), -1 = 이전 쪽으로
  startFlip(dir, dur, onDone) { this.flip = { dir, t: 0, dur, onDone }; this.flipF.visible = this.flipB.visible = true; this._bend(dir > 0 ? 0 : 1); }
  _bend(e) {
    const pos = this.flipF.geometry.attributes.position, tA = this.tR, tB = this.tL;
    let x = 0, z = prof(0, tA) * (1 - e) + prof(0, tB) * e + 0.0006, prevD = 0;
    const lift = Math.sin(Math.PI * e);
    for (let i = 0; i <= SEG; i++) {
      const d = i / SEG * PW, u = d / PW;
      const phi = Math.max(0, Math.min(Math.PI, Math.PI * (e + lift * 0.42 * (u - 0.45))));
      if (i) { const ds = d - prevD; x += Math.cos(phi) * ds; z += Math.sin(phi) * ds; }
      // 내려앉은 쪽에서는 더미의 윤곽을 따른다
      const rest = e < 0.5 ? prof(Math.abs(x), tA) : prof(Math.abs(x), tB), zz = Math.max(z, rest + 0.0006);
      pos.setXYZ(i, x, 0.5 * PH, zz); pos.setXYZ(SEG + 1 + i, x, -0.5 * PH, zz); prevD = d;
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
