// 가구와 소품: 안락의자, 탁자, 스탠드, 촛불, 머그잔, 주전자, 시계, 그림, 장작, 커튼.
// 모두 코드로 만든 형상이다. 각 함수는 THREE.Group을 돌려주고, 움직이는 부분은 group.userData에 넣는다.
import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rng } from './textures.js';

const shadow = (m, cast = true) => { m.castShadow = cast; m.receiveShadow = true; return m; };
const rbox = (w, h, d, r, m) => shadow(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)), m));
const cyl = (r0, r1, h, m, seg = 16) => shadow(new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m));
const at = (mesh, x, y, z, rx = 0, ry = 0, rz = 0) => { mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); return mesh; };

// ---- 안락의자. -Z를 바라본다. wing = 귀가 달린 높은 등받이
export function armchair(M, { wing = false, leather = M.leather, pillow = null } = {}) {
  const g = new THREE.Group();
  for (const [x, z] of [[-0.3, -0.27], [0.3, -0.27], [-0.3, 0.3], [0.3, 0.3]]) g.add(at(cyl(0.028, 0.02, 0.12, M.woodDark, 8), x, 0.06, z));
  g.add(at(rbox(0.76, 0.2, 0.72, 0.05, leather), 0, 0.22, 0.02));                    // 밑판
  g.add(at(rbox(0.54, 0.15, 0.58, 0.06, leather), 0, 0.385, -0.05));                 // 좌판 쿠션
  const bh = wing ? 0.86 : 0.7;
  const back = at(rbox(0.74, bh, 0.17, 0.07, leather), 0, 0.32 + bh / 2, 0.31, 0.14); g.add(back);
  g.add(at(rbox(0.52, bh - 0.16, 0.1, 0.05, leather), 0, 0.4 + (bh - 0.16) / 2, 0.215, 0.14)); // 등 쿠션
  for (const s of [-1, 1]) {
    g.add(at(rbox(0.13, 0.3, 0.66, 0.05, leather), s * 0.385, 0.46, -0.01));
    const roll = cyl(0.08, 0.08, 0.66, leather, 14); g.add(at(roll, s * 0.385, 0.62, -0.01, Math.PI / 2));
    const cap = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 10), leather)); cap.scale.z = 0.35; g.add(at(cap, s * 0.385, 0.62, -0.34));
    if (wing) g.add(at(rbox(0.09, 0.5, 0.26, 0.04, leather), s * 0.36, 0.98, 0.17, 0.14, 0, s * -0.06));
  }
  // 등받이 단추(터프팅)
  const btn = new THREE.SphereGeometry(0.012, 8, 6);
  for (let j = 0; j < (wing ? 3 : 2); j++) for (let i = -1; i <= 1; i++) {
    const y = 0.58 + j * 0.2, b = new THREE.Mesh(btn, M.woodDark); b.position.set(i * 0.16 + (j % 2 ? 0.08 : 0), y, 0.165 + (y - 0.4) * 0.14); g.add(b);
  }
  if (pillow) g.add(at(rbox(0.38, 0.3, 0.1, 0.05, pillow), 0.02, 0.6, 0.12, 0.3, 0, 0.06));
  return g;
}

// ---- 둥근 보조 탁자
export function sideTable(M) {
  const g = new THREE.Group();
  g.add(at(cyl(0.25, 0.25, 0.028, M.wood, 28), 0, 0.556, 0));
  g.add(at(cyl(0.022, 0.03, 0.52, M.woodDark, 10), 0, 0.28, 0));
  g.add(at(cyl(0.16, 0.18, 0.03, M.woodDark, 20), 0, 0.015, 0));
  g.userData.top = 0.57;
  return g;
}

// ---- 플로어 스탠드. 갓은 안쪽에서 빛나는 천
export function floorLamp(M, h) {
  const g = new THREE.Group();
  g.add(at(cyl(0.14, 0.16, 0.025, M.brass, 24), 0, 0.0125, 0));
  g.add(at(cyl(0.012, 0.014, h, M.brass, 10), 0, h / 2, 0));
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0xe8c890, roughness: 1, emissive: 0xffb060, emissiveIntensity: 1.6, side: THREE.DoubleSide });
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.21, 0.28, 24, 1, true), shadeMat); shade.position.y = h + 0.08; g.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4.2, 2.2) })); bulb.position.y = h + 0.04; g.add(bulb);
  g.userData = { shade, bulb };
  return g;
}

// ---- 촛불. set(남은 비율 0…1, 켜짐)으로 길이와 불꽃을 바꾼다 (7단계: 실제 시간에 따라 짧아진다)
export function candle(M, { h = 0.17, r = 0.015 } = {}) {
  const g = new THREE.Group();
  g.add(at(cyl(0.045, 0.05, 0.012, M.brass, 18), 0, 0.006, 0));
  g.add(at(cyl(0.02, 0.024, 0.02, M.brass, 12), 0, 0.02, 0));
  const wax = M.wax.clone();
  const geo = new THREE.CylinderGeometry(r, r * 1.05, h, 12); geo.translate(0, h / 2, 0);
  const body = shadow(new THREE.Mesh(geo, wax), false); body.position.y = 0.022; g.add(body);
  const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.012, 4), M.iron); g.add(wick);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2.8, 0.9), transparent: true, opacity: 0.95 }));
  g.add(flame);
  const light = new THREE.PointLight(0xffac5a, 0, 2.6, 1.8); g.add(light);
  const st = { frac: 1, lit: false, h, top: 0 };
  const set = (frac, lit) => {
    st.frac = Math.max(0.06, Math.min(1, frac)); st.lit = lit && frac > 0.06;
    body.scale.y = st.frac; st.top = 0.022 + h * st.frac;
    wick.position.y = st.top + 0.005; flame.visible = st.lit; light.intensity = st.lit ? 0.28 : 0;
    flame.position.y = st.top + 0.024; light.position.y = st.top + 0.04; wax.emissiveIntensity = st.lit ? 0.5 : 0;
  };
  // 불꽃 흔들림: t(초), k = 흔들림 세기 (접근성 옵션에서 0)
  const flicker = (t, k = 1) => {
    if (!st.lit) return;
    const f = 1 + k * (0.1 * Math.sin(t * 11.3 + g.id) + 0.06 * Math.sin(t * 23.7 + g.id * 2.1));
    flame.scale.set(0.0055 * (2 - f), 0.016 * f, 0.0055 * (2 - f)); flame.position.x = k * 0.0012 * Math.sin(t * 7.1 + g.id);
    light.intensity = 0.28 * f;
  };
  set(1, false); flame.scale.set(0.0055, 0.016, 0.0055);
  g.userData = { set, flicker, state: st, light };
  return g;
}

// ---- 머그잔 (찻물 표면 포함)
export function mug(M) {
  const g = new THREE.Group();
  const pts = [[0.0, 0], [0.036, 0], [0.04, 0.006], [0.041, 0.09], [0.038, 0.092], [0.036, 0.012], [0, 0.01]].map(([x, y]) => new THREE.Vector2(x, y));
  g.add(shadow(new THREE.Mesh(new THREE.LatheGeometry(pts, 24), M.ceramic)));
  const handle = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.006, 8, 16, Math.PI), M.ceramic)); handle.position.set(0.04, 0.048, 0); handle.rotation.z = -Math.PI / 2; g.add(handle);
  const tea = new THREE.Mesh(new THREE.CircleGeometry(0.0365, 20), new THREE.MeshStandardMaterial({ color: 0x3a1c0a, roughness: 0.15 })); tea.rotation.x = -Math.PI / 2; tea.position.y = 0.078; g.add(tea);
  g.userData = { tea };
  return g;
}

// ---- 구리 주전자
export function kettle(M) {
  const g = new THREE.Group();
  const pts = [[0, 0], [0.085, 0], [0.1, 0.02], [0.105, 0.07], [0.09, 0.13], [0.055, 0.165], [0.04, 0.17], [0, 0.17]].map(([x, y]) => new THREE.Vector2(x, y));
  g.add(shadow(new THREE.Mesh(new THREE.LatheGeometry(pts, 24), M.copper)));
  g.add(at(cyl(0.012, 0.03, 0.03, M.copper, 12), 0, 0.185, 0)); g.add(at(shadow(new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), M.iron)), 0, 0.205, 0));
  g.add(at(cyl(0.012, 0.022, 0.14, M.copper, 10), 0.125, 0.115, 0, 0, 0, -0.9));
  const handle = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.007, 8, 20, Math.PI), M.iron)); handle.position.y = 0.165; g.add(handle);
  g.userData.spout = new THREE.Vector3(0.18, 0.17, 0);
  return g;
}

// ---- 벽난로 선반 시계: 바늘이 컴퓨터 시계를 따른다
export function mantelClock(M) {
  const g = new THREE.Group();
  g.add(at(rbox(0.2, 0.22, 0.09, 0.02, M.woodDark), 0, 0.11, 0));
  g.add(at(rbox(0.24, 0.02, 0.1, 0.008, M.wood), 0, 0.01, 0));
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d');
  c.fillStyle = '#efe6d0'; c.beginPath(); c.arc(128, 128, 126, 0, 7); c.fill();
  c.strokeStyle = '#2a2018'; c.lineWidth = 3; c.beginPath(); c.arc(128, 128, 120, 0, 7); c.stroke();
  c.fillStyle = '#2a2018'; c.font = '26px serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let i = 1; i <= 12; i++) { const a = i * Math.PI / 6; c.fillText(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][i - 1], 128 + Math.sin(a) * 96, 128 - Math.cos(a) * 96); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.075, 32), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 })); face.position.set(0, 0.125, 0.0461); g.add(face);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.077, 0.005, 8, 32), M.brass); ring.position.copy(face.position); g.add(ring);
  const hand = (len, w) => { const p = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.002), M.iron); m.position.y = len / 2 - 0.006; p.add(m); p.position.set(0, 0.125, 0.049); g.add(p); return p; };
  const hh = hand(0.04, 0.006), mh = hand(0.06, 0.004);
  g.userData.tick = (date = new Date()) => { const m = date.getMinutes() + date.getSeconds() / 60, h = (date.getHours() % 12) + m / 60; mh.rotation.z = -m / 60 * Math.PI * 2; hh.rotation.z = -h / 12 * Math.PI * 2; };
  g.userData.tick();
  return g;
}

// ---- 액자 속 겨울 풍경화 (캔버스에 그림)
export function painting(M, w = 0.9, h = 0.6) {
  const g = new THREE.Group();
  const cv = document.createElement('canvas'); cv.width = 384; cv.height = 256; const c = cv.getContext('2d'), r = rng(77);
  const sky = c.createLinearGradient(0, 0, 0, 160); sky.addColorStop(0, '#2b3a55'); sky.addColorStop(1, '#c79a6a'); c.fillStyle = sky; c.fillRect(0, 0, 384, 256);
  const hill = (y, col, amp) => { c.fillStyle = col; c.beginPath(); c.moveTo(0, 256); for (let x = 0; x <= 384; x += 8) c.lineTo(x, y + Math.sin(x * 0.02 + y) * amp + Math.sin(x * 0.05) * amp * 0.4); c.lineTo(384, 256); c.fill(); };
  hill(120, '#3c4660', 22); hill(150, '#56607a', 14); hill(185, '#c8cdd6', 8); hill(215, '#e4e6ea', 5);
  for (let i = 0; i < 26; i++) { const x = r() * 384, y = 150 + r() * 70, s = 10 + (y - 140) * 0.25; c.fillStyle = `rgb(${20 + r() * 20},${32 + r() * 20},${30 + r() * 12})`; c.beginPath(); c.moveTo(x, y - s * 2.2); c.lineTo(x + s * 0.55, y); c.lineTo(x - s * 0.55, y); c.fill(); }
  c.fillStyle = '#3a2416'; c.fillRect(250, 178, 34, 20); c.fillStyle = '#e8e4dc'; c.beginPath(); c.moveTo(244, 180); c.lineTo(267, 162); c.lineTo(290, 180); c.fill(); c.fillStyle = '#ffb648'; c.fillRect(262, 184, 7, 8);
  const img = c.getImageData(0, 0, 384, 256); for (let i = 0; i < img.data.length; i += 4) { const k = 0.8 + r() * 0.25; img.data[i] *= k; img.data[i + 1] *= k; img.data[i + 2] *= k; } c.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  g.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 })));
  const f = 0.05;
  for (const [fw, fh, x, y] of [[w + f * 2, f, 0, h / 2 + f / 2], [w + f * 2, f, 0, -h / 2 - f / 2], [f, h, -w / 2 - f / 2, 0], [f, h, w / 2 + f / 2, 0]]) g.add(at(rbox(fw, fh, 0.035, 0.008, M.brass), x, y, 0.01));
  return g;
}

// ---- 장작 더미 (받침대에 쌓은 통나무)
export function logStack(M) {
  const g = new THREE.Group(), r = rng(5);
  let n = 0;
  for (let row = 0; row < 4; row++) for (let i = 0; i < 4 - (row > 2 ? 1 : 0); i++) {
    const rad = 0.045 + r() * 0.012, len = 0.36 + r() * 0.06;
    const log = cyl(rad, rad * (0.92 + r() * 0.1), len, [M.bark, M.endGrain, M.endGrain], 10);
    at(log, (r() - 0.5) * 0.03, 0.05 + row * 0.092, -0.15 + i * 0.1 + (row % 2) * 0.05, 0, 0, Math.PI / 2 + (r() - 0.5) * 0.08); g.add(log); n++;
  }
  for (const z of [-0.23, 0.23]) { g.add(at(cyl(0.008, 0.008, 0.46, M.iron, 6), -0.15, 0.23, z)); g.add(at(cyl(0.008, 0.008, 0.46, M.iron, 6), 0.15, 0.23, z)); }
  return g;
}

// ---- 부지깽이 세트
export function fireTools(M) {
  const g = new THREE.Group();
  g.add(at(cyl(0.09, 0.1, 0.02, M.iron, 16), 0, 0.01, 0)); g.add(at(cyl(0.008, 0.008, 0.7, M.iron, 6), 0, 0.36, 0));
  g.add(at(cyl(0.05, 0.05, 0.008, M.iron, 12), 0, 0.6, 0));
  for (const [dz, tilt] of [[-0.045, 0.05], [0.045, -0.05]]) { g.add(at(cyl(0.005, 0.005, 0.62, M.iron, 6), 0.01, 0.34, dz, tilt)); g.add(at(cyl(0.012, 0.012, 0.03, M.brass, 8), 0.01, 0.66, dz + tilt * 0.3)); }
  return g;
}

// ---- 주름진 커튼 (한 폭)
export function curtain(M, w, h) {
  const geo = new THREE.PlaneGeometry(w, h, 28, 6), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), k = 0.6 + 0.4 * (0.5 - y / h); p.setZ(i, 0.028 * Math.sin((x / w) * Math.PI * 9) * k + 0.01 * Math.sin((x / w) * Math.PI * 23)); }
  geo.computeVertexNormals();
  const m = M.curtain.clone(); m.side = THREE.DoubleSide; (M.curtain.userData.clones ??= []).push(m);
  return shadow(new THREE.Mesh(geo, m));
}

// ---- 담요를 담은 바구니
export function basket(M) {
  const g = new THREE.Group();
  g.add(at(cyl(0.22, 0.18, 0.3, M.wicker, 18), 0, 0.15, 0));
  g.add(at(rbox(0.3, 0.14, 0.26, 0.06, M.blanket), 0, 0.31, 0, 0.1, 0.4));
  g.add(at(rbox(0.24, 0.1, 0.2, 0.05, M.cloth), 0.03, 0.37, 0.02, -0.1, -0.3));
  return g;
}

// ---- 눕혀 쌓은 책 몇 권
export function bookStack(colors, n = 3, seed = 1) {
  const g = new THREE.Group(), r = rng(seed); let y = 0;
  for (let i = 0; i < n; i++) {
    const t = 0.022 + r() * 0.018, w = 0.13 + r() * 0.03, d = 0.19 + r() * 0.03;
    const cover = new THREE.MeshStandardMaterial({ color: colors[Math.floor(r() * colors.length)], roughness: 0.75 }); cover.userData.bookCover = true;
    const b = shadow(new THREE.Mesh(new THREE.BoxGeometry(w, t, d), cover)); b.position.y = y + t / 2; b.rotation.y = (r() - 0.5) * 0.5; g.add(b);
    const pages = new THREE.Mesh(new THREE.BoxGeometry(w - 0.008, t - 0.006, d - 0.004), new THREE.MeshStandardMaterial({ color: 0xd8cdb4, roughness: 0.95 })); pages.position.set(0.005, y + t / 2, 0); pages.rotation.y = b.rotation.y; g.add(pages);
    y += t;
  }
  g.userData.top = y;
  return g;
}
