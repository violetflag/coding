// 창밖 숲: 붓으로 그리듯 캔버스에 그린 나무 그림을 십자로 세운 판에 입힌다.
// 창에서 3m 넘게 떨어져 보는 나무라, 각진 원뿔을 쌓는 것보다 가지와 잎을 그린 그림이 훨씬 나무답다.
// 빛 계산은 하지 않는다: 그림에 위쪽이 밝은 음영을 넣어 두고, 낮밤과 날씨에 따른 밝기와 색은 재질의 색 하나로 준다.
import * as THREE from 'three/webgpu';
import { rng } from './textures.js';
import { Fn, uniform, positionLocal, time, sin, instanceIndex, float, vec3 } from 'three/tsl';

const CW = 256, CH = 512;      // 그림 한 칸의 크기

// 전나무 한 그루: 줄기, 어두운 속, 아래로 처진 가지 층과 바늘잎. snow = 가지 위에 얹힌 눈
function paintSpruce(c, x0, seed, snow) {
  const r = rng(seed), W = CW, H = CH, cx = x0 + W / 2, lean = (r() - 0.5) * 0.05 * W, top = H * 0.03, base = H * 0.95;
  c.fillStyle = '#261b14'; c.fillRect(cx - W * 0.022, base - H * 0.07, W * 0.044, H * 0.07);
  c.fillStyle = '#0b1711'; c.beginPath(); c.moveTo(cx + lean, top + H * 0.05); c.lineTo(cx + W * 0.27, base - H * 0.07); c.lineTo(cx - W * 0.27, base - H * 0.07); c.fill();
  const N = 30; c.lineCap = 'round';
  for (let k = 0; k < N; k++) {
    const t = k / (N - 1), y = base - H * 0.06 - (base - top - H * 0.08) * t, hw = W * 0.47 * Math.pow(1 - t, 0.9) + W * 0.02, xc = cx + lean * t, nb = 5 + Math.round(7 * (1 - t));
    for (let b = 0; b < nb; b++) {
      const side = b % 2 ? 1 : -1, reach = hw * (0.2 + 0.8 * r()), droop = reach * (0.26 + 0.32 * r()), ex = xc + side * reach, ey = y + droop, mx = xc + side * reach * 0.55, my = y + droop * 0.12;
      const steps = Math.max(3, Math.round(reach / (W * 0.011)));
      for (let s = 0; s <= steps; s++) {
        const u = s / steps, px = (1 - u) * (1 - u) * xc + 2 * (1 - u) * u * mx + u * u * ex, py = (1 - u) * (1 - u) * y + 2 * (1 - u) * u * my + u * u * ey;
        const L = 0.25 + 0.3 * t + 0.25 * u + 0.35 * r();                                   // 위쪽과 가지 끝이 밝다
        c.strokeStyle = `rgb(${Math.round(10 + 34 * L)},${Math.round(24 + 62 * L)},${Math.round(14 + 22 * L)})`; c.lineWidth = W * (0.006 + r() * 0.005);
        for (let n = 0; n < 3; n++) { const a = Math.PI / 2 + (r() - 0.5) * 1.6 + side * 0.35, len = W * 0.024 * (0.5 + r()); c.beginPath(); c.moveTo(px, py); c.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); c.stroke(); }
      }
      if (snow && r() < 0.9) {
        c.strokeStyle = 'rgba(150,170,205,.7)'; c.lineWidth = W * 0.02 * (0.6 + r() * 0.7); c.beginPath(); c.moveTo(xc + side * reach * 0.18, y + W * 0.004); c.quadraticCurveTo(mx, my + W * 0.004, ex - side * reach * 0.06, ey - W * 0.004); c.stroke();
        c.strokeStyle = '#f1f5fa'; c.lineWidth *= 0.72; c.beginPath(); c.moveTo(xc + side * reach * 0.18, y - W * 0.004); c.quadraticCurveTo(mx, my - W * 0.008, ex - side * reach * 0.08, ey - W * 0.012); c.stroke();
      }
    }
  }
}

// 가지: 굵은 줄기에서 갈라져 나가는 선. tips에 가지 끝 위치를 모은다(잎 뭉치를 다는 자리)
function branches(c, r, x, y, ang, len, wid, depth, tips, col) {
  const x2 = Math.max(c.__x0 + CW * 0.1, Math.min(c.__x0 + CW * 0.9, x + Math.cos(ang) * len)), y2 = Math.max(CH * 0.1, y + Math.sin(ang) * len), bend = (r() - 0.5) * len * 0.25;
  c.strokeStyle = col; c.lineWidth = wid; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo((x + x2) / 2 + bend, (y + y2) / 2, x2, y2); c.stroke();
  if (depth <= 0 || wid < 0.7) { tips.push([x2, y2]); return; }
  const n = depth > 3 ? 2 : 2 + (r() < 0.5 ? 1 : 0);
  for (let i = 0; i < n; i++) branches(c, r, x2, y2, ang + (i - (n - 1) / 2) * (0.55 + r() * 0.3) + (r() - 0.5) * 0.3, len * (0.62 + r() * 0.12), wid * 0.66, depth - 1, tips, col);
  if (depth > 2 && r() < 0.6) tips.push([x2, y2]);
}
// 넓은잎나무. leafy = 잎 뭉치(회색조로 그려 계절 색을 곱한다), 아니면 잎 진 가지(겨울). snow = 가지 위의 눈
function paintBroadleaf(c, x0, seed, leafy, snow) {
  const r = rng(seed), W = CW, H = CH, cx = x0 + W / 2, tips = []; c.__x0 = x0;
  branches(c, r, cx, H * 0.97, -Math.PI / 2 + (r() - 0.5) * 0.1, H * 0.2, W * 0.05, 6, tips, leafy ? '#4a4038' : '#2c231c');
  // 가지가 칸 밖으로 나가지 않게 끝을 칸 안쪽으로 모은다
  for (const t of tips) { t[0] = cx + Math.max(-W * 0.36, Math.min(W * 0.36, (t[0] - cx) * 0.8)); t[1] = Math.max(H * 0.12, t[1]); }
  if (!leafy) {
    if (snow) { c.strokeStyle = 'rgba(238,243,249,.9)'; c.lineWidth = W * 0.008; for (const [x, y] of tips) if (r() < 0.6) { c.beginPath(); c.moveTo(x - W * 0.02, y - 1); c.lineTo(x + W * 0.02, y - 2); c.stroke(); } }
    return;
  }
  // 잎: 가지 끝마다 뭉치를 달고, 먼저 어두운 잎으로 덩어리를 채운 뒤 위쪽에 밝은 잎을 얹는다
  for (const pass of [0, 1, 2]) for (const [tx, ty] of tips) {
    const R = W * (0.07 + 0.05 * r()), n = pass === 0 ? 70 : 46;
    for (let i = 0; i < n; i++) {
      const a = r() * 6.283, d = Math.sqrt(r()) * R, lx = tx + Math.cos(a) * d * 1.15, ly = ty + Math.sin(a) * d * 0.85 - (pass ? R * 0.25 * pass : 0);
      const up = 0.5 - (ly - ty) / (2 * R), L = pass === 0 ? 70 + 50 * r() : pass === 1 ? 120 + 60 * up + 40 * r() : 185 + 55 * r();
      if (pass === 2 && r() < 0.55) continue;
      c.fillStyle = `rgb(${L | 0},${L | 0},${(L * 0.94) | 0})`; c.beginPath(); c.ellipse(lx, ly, W * (0.011 + r() * 0.008), W * (0.007 + r() * 0.005), r() * 3.14, 0, 6.3); c.fill();
    }
  }
}

function atlas(n, paint) {
  const cv = document.createElement('canvas'); cv.width = CW * n; cv.height = CH; const c = cv.getContext('2d');
  for (let i = 0; i < n; i++) { c.save(); c.beginPath(); c.rect(i * CW, 0, CW, CH); c.clip(); paint(c, i * CW, i); c.restore(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
// 십자로 세운 두 장의 판. 밑동이 원점, 높이 1, 너비 aspect. 그림의 i번째 칸을 쓴다.
function crossCard(aspect, i, n) {
  const w = aspect / 2, u0 = i / n, u1 = (i + 1) / n, P = [], U = [];
  for (const [ax, az] of [[1, 0], [0, 1]]) { P.push(-w * ax, 0, -w * az, w * ax, 0, w * az, w * ax, 1, w * az, -w * ax, 0, -w * az, w * ax, 1, w * az, -w * ax, 1, -w * az); U.push(u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.computeVertexNormals(); return g;
}

// spot(): 나무 자리 [x, z]를 하나 돌려준다. 돌려주는 값: { group, set({ snowy, leafy, crownColors, light }) }
export function buildForest({ seed = 404, spot, groundY = -0.45, conifers = 230, broadleaf = 70 }) {
  const r = rng(seed), group = new THREE.Group(), NS = 4, NB = 3;
  const tex = {
    spruce: atlas(NS, (c, x, i) => paintSpruce(c, x, 11 + i * 7, false)), spruceSnow: atlas(NS, (c, x, i) => paintSpruce(c, x, 11 + i * 7, true)),
    leaf: atlas(NB, (c, x, i) => paintBroadleaf(c, x, 31 + i * 5, true, false)), bare: atlas(NB, (c, x, i) => paintBroadleaf(c, x, 31 + i * 5, false, false)), bareSnow: atlas(NB, (c, x, i) => paintBroadleaf(c, x, 31 + i * 5, false, true)),
  };
  // 바람에 흔들림: 인스턴스 변환 뒤(세계 좌표)의 꼭짓점을 높이의 제곱만큼 바람 쪽으로 민다. 나무마다 위상이 다르다.
  const sway = uniform(0), swayDir = uniform(new THREE.Vector3(1, 0, 0));
  const swayNode = Fn(() => { const ph = float(instanceIndex).mul(1.37), k = positionLocal.y.sub(groundY).div(8).max(0); const s = sin(time.mul(1.1).add(ph)).mul(0.7).add(sin(time.mul(2.7).add(ph.mul(2.3))).mul(0.3)).add(0.3); return positionLocal.add(vec3(swayDir).mul(k.mul(k).mul(sway).mul(s))); })();
  const mat = (map) => Object.assign(new THREE.MeshBasicNodeMaterial({ map, alphaTest: 0.32, side: THREE.DoubleSide }), { positionNode: swayNode });
  const spruceMat = mat(tex.spruce), leafMat = mat(tex.leaf), bareMat = mat(tex.bare);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  const place = (count, n, material, hMin, hMax, tint) => {
    const per = Math.ceil(count / n), meshes = [], picks = [];
    for (let v = 0; v < n; v++) {
      const im = new THREE.InstancedMesh(crossCard(CW / CH, v, n), material, per);
      for (let i = 0; i < per; i++) { const [x, z] = spot(), h = hMin + r() * (hMax - hMin); q.setFromAxisAngle(up, r() * 7); m4.compose(new THREE.Vector3(x, groundY - 0.05, z), q, new THREE.Vector3(h * (0.85 + r() * 0.3), h, h * (0.85 + r() * 0.3))); im.setMatrixAt(i, m4); im.setColorAt(i, col.setScalar(1)); picks.push([im, i, r(), tint ? 0.78 + r() * 0.4 : 0.8 + r() * 0.35]); }
      im.instanceColor.needsUpdate = true; meshes.push(im); group.add(im);
    }
    return { meshes, picks };
  };
  const S = place(conifers, NS, spruceMat, 4.2, 8.6, false), L = place(broadleaf, NB, leafMat, 4.5, 8, true);
  const B = L.meshes.map((im) => { const b = new THREE.InstancedMesh(im.geometry, bareMat, im.count); b.instanceMatrix = im.instanceMatrix; group.add(b); return b; });
  for (const [im, i, , tone] of S.picks) im.setColorAt(i, col.setRGB(tone, tone, tone * 0.97));
  for (const im of S.meshes) im.instanceColor.needsUpdate = true;
  return {
    group,
    // light: 재질에 곱할 색(낮밤과 날씨), crownColors: 계절의 잎 색 목록(없으면 잎이 진 철), wind: 바람(m/s), windTo: 바람이 불어 가는 쪽(장면 방향)
    set({ snowy, crownColors, light, wind = 0, windTo }) {
      sway.value = wind > 0.5 ? Math.min(0.45, 0.02 + wind * 0.03) : 0; if (windTo) swayDir.value.copy(windTo);
      const sm = snowy ? tex.spruceSnow : tex.spruce; if (spruceMat.map !== sm) { spruceMat.map = sm; spruceMat.needsUpdate = true; }
      const bm = snowy ? tex.bareSnow : tex.bare; if (bareMat.map !== bm) { bareMat.map = bm; bareMat.needsUpdate = true; }
      spruceMat.color.copy(light); leafMat.color.copy(light); bareMat.color.copy(light);
      const leafy = !!crownColors; for (const im of L.meshes) im.visible = leafy; for (const b of B) b.visible = !leafy;
      if (leafy) { for (const [im, i, k, tone] of L.picks) im.setColorAt(i, col.set(crownColors[Math.floor(k * crownColors.length)]).multiplyScalar(tone * 1.5)); for (const im of L.meshes) im.instanceColor.needsUpdate = true; }
    },
  };
}
