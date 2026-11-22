// 겹치는 면 정리: 두 물체의 면이 같은 평면에 겹쳐 있으면(창틀과 창살이 만나는 곳, 벽과 창틀 안쪽 등) 깊이 값이 같아서
// 화면에서 두 면이 번갈아 보이며 깜빡인다(z-fighting). 이런 면을 찾아 작은 쪽의 면을 바깥으로 1mm 내밀어 겹치지 않게 한다.
// 상자(BoxGeometry)와 평면(PlaneGeometry)만 본다. 회전이 같은 물체끼리(같은 가구 안의 부품, 방의 벽과 틀) 그 회전의 좌표에서 비교한다.
import * as THREE from 'three/webgpu';

const EPS = 3e-4;          // 이만큼 가까운 두 면은 같은 평면으로 본다(0.3mm)
const PUSH = 0.001;        // 내미는 거리(1mm)
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3();

// 회전 q에서 본 물체의 상자(기준 좌표 축에 맞춘 최소·최대)와, 기준 축 → 물체의 지역 축 대응
function boxIn(mesh, qInv) {
  const g = mesh.geometry; if (!g.boundingBox) g.computeBoundingBox();
  const bb = g.boundingBox, min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  _m.makeRotationFromQuaternion(qInv).multiply(mesh.matrixWorld);
  for (let i = 0; i < 8; i++) {
    _v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyMatrix4(_m);
    for (let a = 0; a < 3; a++) { const c = _v.getComponent(a); if (c < min[a]) min[a] = c; if (c > max[a]) max[a] = c; }
  }
  return { min, max };
}
// 물체의 회전을 90도 단위로 반올림한 것과 그 나머지 회전(같은 나머지를 가진 물체끼리 비교한다)
function frameOf(mesh) {
  mesh.matrixWorld.decompose(_p, _q, _s);
  const e = new THREE.Matrix4().makeRotationFromQuaternion(_q).elements, axes = [[e[0], e[1], e[2]], [e[4], e[5], e[6]], [e[8], e[9], e[10]]];
  let yaw = null;
  for (const a of axes) {
    if (Math.abs(a[1]) > 0.9999) continue;                         // 세로 축
    if (Math.abs(a[1]) > 1e-4) return null;                        // 기울어진 물체(기대 놓은 액자, 기운 책)는 보지 않는다
    if (yaw == null) { yaw = Math.atan2(-a[2], a[0]); yaw = ((yaw % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2); if (yaw > Math.PI / 2 - 1e-4) yaw = 0; }
  }
  return Math.round((yaw ?? 0) * 1e4) / 1e4;
}

function collect(root) {
  const items = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.visible) return;
    const t = o.geometry?.type; if (t !== 'BoxGeometry' && t !== 'PlaneGeometry') return;
    const yaw = frameOf(o); if (yaw == null) return;
    items.push({ mesh: o, yaw, plane: t === 'PlaneGeometry' });
  });
  const byYaw = new Map(); for (const it of items) { if (!byYaw.has(it.yaw)) byYaw.set(it.yaw, []); byYaw.get(it.yaw).push(it); }
  return byYaw;
}

// 같은 평면에 겹친 같은 방향의 면 쌍을 찾는다. 반환: [{ a, b, axis, side(+1|-1), area }]
export function findCoplanar(root) {
  const out = [];
  for (const [yaw, list] of collect(root)) {
    const qInv = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw);
    for (const it of list) {
      it.box = boxIn(it.mesh, qInv);
      // 평면은 법선 방향의 한 면만 있다
      if (it.plane) { _v.set(0, 0, 1).transformDirection(it.mesh.matrixWorld).applyQuaternion(qInv); const a = [0, 1, 2].reduce((m, k) => Math.abs(_v.getComponent(k)) > Math.abs(_v.getComponent(m)) ? k : m, 0); it.faces = [[a, Math.sign(_v.getComponent(a))]]; }
      else it.faces = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]];
    }
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const A = list[i], B = list[j];
      for (const [ax, sd] of A.faces) {
        if (!B.faces.some(([bx, bs]) => bx === ax && bs === sd)) continue;
        const fa = sd > 0 ? A.box.max[ax] : A.box.min[ax], fb = sd > 0 ? B.box.max[ax] : B.box.min[ax];
        if (Math.abs(fa - fb) > EPS) continue;
        let area = 1;
        for (let k = 0; k < 3; k++) { if (k === ax) continue; const lo = Math.max(A.box.min[k], B.box.min[k]), hi = Math.min(A.box.max[k], B.box.max[k]); area *= Math.max(0, hi - lo - 2e-4); }
        if (area > 1e-7) out.push({ a: A, b: B, axis: ax, side: sd, area, yaw });
      }
    }
  }
  return out;
}

const faceArea = (it, ax) => { let s = 1; for (let k = 0; k < 3; k++) if (k !== ax) s *= it.box.max[k] - it.box.min[k]; return s; };

// 면 하나를 바깥(법선 방향)으로 PUSH 만큼 내민다. 상자는 그 면의 꼭짓점을 옮기고, 평면은 통째로 옮긴다.
function push(it, ax, sd, yaw, shared, dist = PUSH) {
  const mesh = it.mesh, dir = new THREE.Vector3().setComponent(ax, sd * dist).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);   // 월드에서 내밀 방향과 거리
  if (it.plane) { const inv = new THREE.Matrix4().copy(mesh.parent.matrixWorld).invert(); const p = mesh.getWorldPosition(new THREE.Vector3()).add(dir).applyMatrix4(inv); mesh.position.copy(p); mesh.updateMatrixWorld(true); return; }
  if (shared.has(mesh.geometry)) mesh.geometry = mesh.geometry.clone(); shared.add(mesh.geometry);
  const g = mesh.geometry, pos = g.attributes.position, bb = g.boundingBox;
  // 월드 방향을 물체의 지역 좌표로 바꾸어, 그 방향에 있는 면(지역 상자의 최소 또는 최대)의 꼭짓점을 옮긴다
  const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
  const ld = dir.clone().applyMatrix4(new THREE.Matrix4().copy(inv).setPosition(0, 0, 0));   // 크기까지 반영한 지역 이동량
  const la = [0, 1, 2].reduce((m, k) => Math.abs(ld.getComponent(k)) > Math.abs(ld.getComponent(m)) ? k : m, 0), ls = Math.sign(ld.getComponent(la)), edge = ls > 0 ? bb.max.getComponent(la) : bb.min.getComponent(la);
  for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getComponent(i, la) - edge) < 1e-6) pos.setComponent(i, la, pos.getComponent(i, la) + ld.getComponent(la));
  pos.needsUpdate = true; g.computeBoundingBox(); g.computeBoundingSphere();
}

// 찾은 쌍마다 작은 면을 가진 쪽을 내민다. 여러 번 돌아 새로 생긴 겹침도 없앤다. 반환: 고친 면 수
export function resolveCoplanar(root, { passes = 8 } = {}) {
  let fixed = 0; const shared = new Set();
  for (let p = 0; p < passes; p++) {
    const pairs = findCoplanar(root); if (!pairs.length) break;
    const done = new Set();
    for (const { a, b, axis, side, yaw } of pairs) {
      const key = (m) => m.mesh.uuid + axis + side; if (done.has(key(a)) || done.has(key(b))) continue;
      const small = a.plane ? a : b.plane ? b : faceArea(a, axis) <= faceArea(b, axis) ? a : b;
      // 다시 돌 때는 조금씩 다르게 내밀어 이미 내민 면과 또 겹치지 않게 한다
      push(small, axis, side, yaw, shared, PUSH * (1 + 0.37 * p)); done.add(key(small)); fixed++;
    }
    root.updateMatrixWorld(true);
  }
  return fixed;
}
