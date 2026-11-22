// 쌓인 눈의 두께: 지붕 두 면, 문밖 마루와 돌계단 위의 눈 더미. 모두 한 덩어리 기하(그리기 호출 1)이고,
// 두께는 셰이더의 값 하나(uDepth, m)로 늘고 준다: 윗면 꼭짓점이 그만큼 바깥(면의 법선)으로 올라오고 가장자리는 둥글게 안으로 든다.
// 문 앞에서 계단까지는 사람이 쓸어 낸 길이라 얇게(최대 1.5cm) 남는다. 처마 밑은 눈이 들이치지 않는다.
import * as THREE from 'three/webgpu';
import { Fn, attribute, uniform, positionLocal, float, select, min } from 'three/tsl';

const MAXD = 0.32;            // 가장 두꺼운 눈(m). 가장자리 둥글림이 면을 넘지 않게 이 값으로 계산한다

export class SnowCover {
  constructor() {
    this.P = []; this.G = []; this.I = []; this.K = []; this.N = []; this.idx = [];
    this.u = { depth: uniform(0), thin: uniform(0) };
  }
  // 한 더미: o = 바닥 중심(세계), ax/az = 면 위의 두 축(단위), up = 면의 법선, hx/hz = 반너비, k = 두께 배율(-1 = 쓸어 낸 길),
  // bev = [x-, x+, z-, z+] 가장자리를 둥글릴지
  pad(o, ax, up, az, hx, hz, k = 1, bev = [1, 1, 1, 1], sink = 0.012) {
    const b = this.P.length / 3, v = new THREE.Vector3(), n = new THREE.Vector3();
    const ix = Math.min(1, (0.45 * hx) / (0.8 * MAXD)), iz = Math.min(1, (0.45 * hz) / (0.8 * MAXD));
    for (const top of [0, 1]) for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      v.copy(o).addScaledVector(ax, sx * hx).addScaledVector(az, sz * hz).addScaledVector(up, top ? -sink + 0.002 : -sink);
      this.P.push(v.x, v.y, v.z);
      const g = top ? up : null; this.G.push(g ? g.x : 0, g ? g.y : 0, g ? g.z : 0);
      const bx = sx < 0 ? bev[0] : bev[1], bz = sz < 0 ? bev[2] : bev[3];
      const inw = new THREE.Vector3().addScaledVector(ax, top ? -sx * ix * bx : 0).addScaledVector(az, top ? -sz * iz * bz : 0);
      this.I.push(inw.x, inw.y, inw.z); this.K.push(k);
      n.copy(up).multiplyScalar(top ? 1 : 0.15).addScaledVector(ax, sx * (top ? 0.55 * bx : 1)).addScaledVector(az, sz * (top ? 0.55 * bz : 1)).normalize(); this.N.push(n.x, n.y, n.z);
    }
    const q = (a, b2, c, d) => this.idx.push(b + a, b + b2, b + c, b + a, b + c, b + d);
    q(4, 7, 6, 5); q(1, 0, 4, 5); q(2, 1, 5, 6); q(3, 2, 6, 7); q(0, 3, 7, 4);   // 윗면과 네 옆면(밑면은 없다)
  }
  // 바닥에 쌓인 눈 판(높이 격자): 가장자리는 둥글게 0으로 내려가고, k(x, z)로 쓸어 낸 길 같은 두께 차이를 준다.
  // edge = [x-, x+, z-, z+] 가장자리가 둥글게 내려가는 너비(m)
  field(x0, x1, y, z0, z1, edge, k = () => 1, extraZ = []) {
    const sst = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
    const axis = (a0, a1, e0, e1, extra) => { const n = Math.max(2, Math.ceil((a1 - a0) / 0.12)), v = new Set();
      for (let i = 0; i <= n; i++) v.add(+(a0 + (a1 - a0) * i / n).toFixed(4));
      for (const t of [0.3, 0.6, 1]) { v.add(+(a0 + e0 * t).toFixed(4)); v.add(+(a1 - e1 * t).toFixed(4)); }
      for (const x of extra) if (x > a0 && x < a1) v.add(x);
      return [...v].sort((p, q) => p - q); };
    const xs = axis(x0, x1, edge[0], edge[1], []), zs = axis(z0, z1, edge[2], edge[3], extraZ), b = this.P.length / 3, W = xs.length;
    for (const z of zs) for (const x of xs) {
      const f = sst((x - x0) / edge[0]) * sst((x1 - x) / edge[1]) * sst((z - z0) / edge[2]) * sst((z1 - z) / edge[3]) * k(x, z);
      this.P.push(x, y - 0.012, z); this.G.push(0, f, 0); this.I.push(0, 0, 0); this.K.push(1); this.N.push(0, 1, 0);
    }
    for (let j = 0; j + 1 < zs.length; j++) for (let i = 0; i + 1 < W; i++) { const a = b + j * W + i; this.idx.push(a, a + W, a + W + 1, a, a + W + 1, a + 1); }
  }
  // 세계 축에 맞춘 평평한 더미: x0..x1, z0..z1, 윗면 높이 y
  rect(x0, x1, y, z0, z1, k = 1, bev = [1, 1, 1, 1]) {
    this.pad(new THREE.Vector3((x0 + x1) / 2, y, (z0 + z1) / 2), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), (x1 - x0) / 2, (z1 - z0) / 2, k, bev);
  }
  // 상자(BoxGeometry) 물체의 윗면(지역 +y) 위. inset = [x-, x+, z-, z+] 줄일 길이(음수면 늘인다)
  onBox(mesh, k, inset, bev) {
    mesh.updateWorldMatrix(true, false);
    const p = mesh.geometry.parameters, m = mesh.matrixWorld, ax = new THREE.Vector3(), up = new THREE.Vector3(), az = new THREE.Vector3(); m.extractBasis(ax, up, az); ax.normalize(); up.normalize(); az.normalize();
    const x0 = -p.width / 2 + inset[0], x1 = p.width / 2 - inset[1], z0 = -p.depth / 2 + inset[2], z1 = p.depth / 2 - inset[3];
    const o = new THREE.Vector3((x0 + x1) / 2, p.height / 2, (z0 + z1) / 2).applyMatrix4(m);
    this.pad(o, ax, up, az, (x1 - x0) / 2, (z1 - z0) / 2, k, bev);
  }
  build(parent, material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('aGrow', new THREE.Float32BufferAttribute(this.G, 3)); g.setAttribute('aIn', new THREE.Float32BufferAttribute(this.I, 3)); g.setAttribute('aK', new THREE.Float32BufferAttribute(this.K, 1));
    g.setIndex(this.idx);
    // 법선: 두께 20cm일 때의 모양으로 한 번 계산한다(둥근 가장자리가 부드럽게 보이게)
    { const t = new THREE.BufferGeometry(), P = this.P.map((v, i) => v + (this.G[i] + this.I[i] * 0.8) * 0.2 * (this.K[Math.floor(i / 3)] < 0 ? 0.05 : Math.abs(this.K[Math.floor(i / 3)])));
      t.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); t.setIndex(this.idx); t.computeVertexNormals(); g.setAttribute('normal', t.attributes.normal); }
    g.computeBoundingSphere(); g.boundingSphere.radius += 1;
    const U = this.u, k = attribute('aK', 'float'), d = select(k.lessThan(0), min(U.depth, U.thin), U.depth.mul(k));
    material.positionNode = Fn(() => positionLocal.add(attribute('aGrow', 'vec3').mul(d)).add(attribute('aIn', 'vec3').mul(d.mul(0.8))))();
    this.mesh = new THREE.Mesh(g, material); this.mesh.receiveShadow = true; this.mesh.name = 'snowcover'; this.mesh.visible = false; parent.add(this.mesh);
    return this.mesh;
  }
  // 쌓인 눈(cm)
  set(cm) { const d = Math.min(MAXD, cm / 100); this.u.depth.value = d; this.u.thin.value = Math.min(0.015, d * 0.25); this.mesh.visible = d > 0.004; }
}
