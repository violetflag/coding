// 가구와 소품: 안락의자, 탁자, 스탠드, 촛불, 머그잔, 주전자, 시계, 그림, 장작, 커튼.
// 모두 코드로 만든 형상이다. 각 함수는 THREE.Group을 돌려주고, 움직이는 부분은 group.userData에 넣는다.
import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rng } from './textures.js';
import { bookStackMesh } from './books.js';

const shadow = (m, cast = true) => { m.castShadow = cast; m.receiveShadow = true; return m; };
const rbox = (w, h, d, r, m) => shadow(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)), m));
const cyl = (r0, r1, h, m, seg = 16) => shadow(new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m));
const at = (mesh, x, y, z, rx = 0, ry = 0, rz = 0) => { mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); return mesh; };

// ---- 푹신한 쿠션 조각: 모서리가 둥근 상자를 한쪽으로 부풀린다. puff = [축('x'|'y'|'z'), 부호, 부푸는 높이], 여러 개를 줄 수 있다.
// 상자 면이 만나는 곳의 법선을 합쳐 이음매가 보이지 않게 한다.
function cushion(w, h, d, r, m, ...puffs) {
  // 고르게 나눈 상자의 모서리를 둥글린다(면 한가운데에도 정점이 있어야 부풀릴 수 있다)
  r = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  const seg = (len) => Math.max(4, Math.round(len / Math.min(0.045, r / 2.5)));
  const geo = new THREE.BoxGeometry(w, h, d, seg(w), seg(h), seg(d)), pos = geo.attributes.position, half = { x: w / 2, y: h / 2, z: d / 2 };
  // UV는 미터 단위로 편다(사진 텍스처가 쿠션 크기와 상관없이 같은 크기로 입혀진다)
  { const uv = geo.attributes.uv, n0 = geo.attributes.normal; for (let i = 0; i < pos.count; i++) { const ax = Math.abs(n0.getX(i)) > 0.5 ? 0 : Math.abs(n0.getY(i)) > 0.5 ? 1 : 2, x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); uv.setXY(i, ax === 0 ? z : x, ax === 1 ? z : y); } }
  { const q = new THREE.Vector3(), p = new THREE.Vector3(); for (let i = 0; i < pos.count; i++) { p.fromBufferAttribute(pos, i); q.set(Math.max(-(w / 2 - r), Math.min(w / 2 - r, p.x)), Math.max(-(h / 2 - r), Math.min(h / 2 - r, p.y)), Math.max(-(d / 2 - r), Math.min(d / 2 - r, p.z))); p.sub(q).setLength(r).add(q); pos.setXYZ(i, p.x, p.y, p.z); } }
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    for (const [ax, sign, amt] of puffs) {
      const [a, b] = ax === 'x' ? ['y', 'z'] : ax === 'y' ? ['x', 'z'] : ['x', 'y'];
      const side = Math.max(0, (v[ax] * sign) / half[ax]);                                        // 부푸는 면에 가까울수록 1
      const fa = 1 - (v[a] / half[a]) ** 2, fb = 1 - (v[b] / half[b]) ** 2;
      v[ax] += sign * amt * side * Math.sqrt(Math.max(0, fa * fb));
    }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const nor = geo.attributes.normal, acc = new Map(), key = (i) => `${Math.round(pos.getX(i) * 2e3)},${Math.round(pos.getY(i) * 2e3)},${Math.round(pos.getZ(i) * 2e3)}`;
  for (let i = 0; i < pos.count; i++) { const k = key(i), n = acc.get(k) || acc.set(k, new THREE.Vector3()).get(k); n.x += nor.getX(i); n.y += nor.getY(i); n.z += nor.getZ(i); }
  for (let i = 0; i < pos.count; i++) { const n = acc.get(key(i)); v.copy(n).normalize(); nor.setXYZ(i, v.x, v.y, v.z); }
  return shadow(new THREE.Mesh(geo, m));
}

// ---- 푹신한 안락의자. -Z를 바라본다. wing = 등받이가 높은 쪽(머리까지 기대는 의자).
// 장식 없이 두툼한 쿠션만으로 이루어진다: 낮은 몸통, 불룩한 좌판 쿠션, 몸을 감싸는 둥근 팔걸이, 기대면 꺼질 듯한 등 쿠션.
export function armchair(M, { wing = false, leather = M.leather, pillow = null, throwMat = null } = {}) {
  const g = new THREE.Group();
  for (const [x, z] of [[-0.37, -0.33], [0.37, -0.33], [-0.37, 0.37], [0.37, 0.37]]) g.add(at(cyl(0.04, 0.03, 0.07, M.woodDark, 12), x, 0.035, z));
  g.add(at(cushion(0.96, 0.25, 0.9, 0.1, leather, ['z', -1, 0.025]), 0, 0.19, 0.02));                         // 몸통 아래
  g.add(at(cushion(0.62, 0.2, 0.68, 0.095, leather, ['y', 1, 0.035], ['z', -1, 0.035]), 0, 0.39, -0.085));       // 좌판 쿠션
  const bh = wing ? 0.92 : 0.7, tilt = 0.2;
  g.add(at(cushion(0.94, bh, 0.24, 0.115, leather, ['z', 1, 0.03], ['y', 1, 0.03]), 0, 0.28 + bh / 2, 0.4, tilt));   // 등받이 틀
  // 등 쿠션: 아래는 허리를 받치고, 높은 의자는 위에 머리 쿠션이 하나 더 있다
  const lh = wing ? 0.46 : bh - 0.2;
  g.add(at(cushion(0.62, lh, 0.2, 0.095, leather, ['z', -1, 0.06], ['y', 1, 0.02]), 0, 0.47 + lh / 2, 0.275 + (lh / 2) * tilt, tilt));
  if (wing) g.add(at(cushion(0.6, 0.36, 0.17, 0.085, leather, ['z', -1, 0.055], ['y', -1, 0.015]), 0, 1.07, 0.275 + 0.6 * tilt, tilt));
  for (const s of [-1, 1]) {
    // 팔걸이: 바깥과 위와 앞으로 불룩한 두꺼운 쿠션. 등받이 쪽으로 가며 조금 높아진다
    g.add(at(cushion(0.23, 0.46, 0.84, 0.112, leather, ['y', 1, 0.035], ['x', s, 0.03], ['z', -1, 0.03]), s * 0.385, 0.43, -0.005, -0.045));
  }
  if (pillow) g.add(at(cushion(0.4, 0.36, 0.13, 0.06, pillow, ['z', -1, 0.045], ['z', 1, 0.03]), 0.04, 0.68, 0.15, 0.3, 0.1, 0.09));
  if (throwMat) { g.add(at(cushion(0.5, 0.07, 0.36, 0.03, throwMat, ['y', 1, 0.012]), -0.2, 0.3 + bh, 0.47, tilt, 0, 0.03)); g.add(at(cushion(0.5, 0.42, 0.05, 0.022, throwMat, ['z', 1, 0.012]), -0.2, 0.3 + bh - 0.2, 0.585, tilt)); }
  g.userData.seatH = 0.5;
  return g;
}

// ---- 황동 촛대 (선반 위)
export function candlestick(M, h = 0.2) {
  const g = new THREE.Group();
  g.add(at(cyl(0.04, 0.05, 0.015, M.brass, 16), 0, 0.0075, 0)); g.add(at(cyl(0.008, 0.012, h, M.brass, 10), 0, h / 2, 0)); g.add(at(cyl(0.022, 0.012, 0.02, M.brass, 12), 0, h, 0));
  g.userData.top = h + 0.01;
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
  // 갓: 전구 높이가 가장 밝고 위아래로 어두워지는 천
  const sc = document.createElement('canvas'); sc.width = 64; sc.height = 128; { const c = sc.getContext('2d'), gr = c.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#5a3a1c'); gr.addColorStop(0.25, '#b98a4e'); gr.addColorStop(0.62, '#ffe2ae'); gr.addColorStop(0.85, '#d8a868'); gr.addColorStop(1, '#6a4420'); c.fillStyle = gr; c.fillRect(0, 0, 64, 128); c.globalAlpha = 0.07; for (let x = 0; x < 64; x += 2) { c.fillStyle = '#000'; c.fillRect(x, 0, 1, 128); } for (let y = 0; y < 128; y += 3) c.fillRect(0, y, 64, 1); }
  const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace; st.wrapS = THREE.RepeatWrapping; st.repeat.x = 6;
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0xd8b888, roughness: 1, emissive: 0xffb872, emissiveMap: st, emissiveIntensity: 1.6, side: THREE.DoubleSide });
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.21, 0.28, 24, 1, true), shadeMat); shade.position.y = h + 0.08; g.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4.2, 2.2) })); bulb.position.y = h + 0.04; g.add(bulb);
  g.userData = { shade, bulb };
  return g;
}

// ---- 촛불. set(남은 비율 0…1, 켜짐)으로 길이와 불꽃을 바꾼다 (7단계: 실제 시간에 따라 짧아진다)
export function candle(M, { h = 0.17, r = 0.015, bare = false } = {}) {
  const g = new THREE.Group();
  if (!bare) { g.add(at(cyl(0.045, 0.05, 0.012, M.brass, 18), 0, 0.006, 0)); g.add(at(cyl(0.02, 0.024, 0.02, M.brass, 12), 0, 0.02, 0)); }
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
  const hh = hand(0.04, 0.006), mh = hand(0.06, 0.004), sh = hand(0.064, 0.0015); sh.position.z = 0.0505; sh.children[0].material = M.brass;
  // 시침·분침·초침이 주어진 시각(기본: 컴퓨터 시계)을 가리킨다. 초침은 1초에 한 칸씩 똑딱 움직인다
  g.userData.tick = (date = new Date()) => { const sec = date.getSeconds(), m = date.getMinutes() + sec / 60, h = (date.getHours() % 12) + m / 60; sh.rotation.z = -sec / 60 * Math.PI * 2; mh.rotation.z = -m / 60 * Math.PI * 2; hh.rotation.z = -h / 12 * Math.PI * 2; };
  g.userData.tick();
  return g;
}

// ---- 액자. 기본 그림은 코드로 그린 겨울 풍경이고, setImage(이미지)로 내 그림을 넣는다 (null이면 기본 그림).
export function painting(M, w = 0.9, h = 0.6, { seed = 77, frame = M.brass, f = 0.05 } = {}) {
  const g = new THREE.Group();
  const cv = document.createElement('canvas'); cv.width = 768; cv.height = Math.round(768 * h / w); const c = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  // 기본 그림: 유화풍 겨울 풍경 (흐린 하늘과 구름, 안개 낀 능선, 눈밭, 전나무, 불 켜진 오두막). 넣은 그림이 없을 때 쓴다.
  const drawDefault = () => {
    const r = rng(seed), sx = W / 384, sy = H / 256; c.save(); c.scale(sx, sy);
    const dusk = seed % 3;
    const sky = c.createLinearGradient(0, 0, 0, 170); sky.addColorStop(0, ['#27344e', '#38483f', '#43364a'][dusk]); sky.addColorStop(0.55, ['#8d7f86', '#8f9478', '#a07e7c'][dusk]); sky.addColorStop(1, ['#e0b27c', '#d9c592', '#e6ad84'][dusk]); c.fillStyle = sky; c.fillRect(0, 0, 384, 256);
    c.filter = 'blur(7px)'; for (let i = 0; i < 16; i++) { c.fillStyle = `rgba(${200 + r() * 55},${170 + r() * 50},${150 + r() * 50},${0.1 + r() * 0.18})`; c.beginPath(); c.ellipse(r() * 384, 15 + r() * 100, 30 + r() * 60, 5 + r() * 10, 0, 0, 7); c.fill(); }
    c.filter = 'blur(1.2px)';
    const ridge = (y, top, bot, amp, ph) => { const gr = c.createLinearGradient(0, y - amp, 0, y + 60); gr.addColorStop(0, top); gr.addColorStop(1, bot); c.fillStyle = gr; c.beginPath(); c.moveTo(0, 256); for (let x = 0; x <= 384; x += 4) c.lineTo(x, y + Math.sin(x * 0.021 + ph) * amp + Math.sin(x * 0.057 + ph * 2) * amp * 0.45 + Math.sin(x * 0.19 + ph) * amp * 0.12); c.lineTo(384, 256); c.fill(); };
    ridge(112, '#39435e', '#8b8fa2', 24, seed); ridge(140, '#4a5570', '#a7abb8', 15, seed * 1.7); ridge(168, '#5d6a72', '#c2c6cc', 9, seed * 0.6);
    const snow = c.createLinearGradient(0, 178, 0, 256); snow.addColorStop(0, '#cfd3da'); snow.addColorStop(1, '#f0efe9'); c.fillStyle = snow; c.beginPath(); c.moveTo(0, 256); for (let x = 0; x <= 384; x += 6) c.lineTo(x, 186 + Math.sin(x * 0.018 + seed) * 6); c.lineTo(384, 256); c.fill();
    c.filter = 'blur(2px)'; for (let i = 0; i < 9; i++) { c.fillStyle = 'rgba(96,110,140,.22)'; c.beginPath(); c.ellipse(r() * 384, 200 + r() * 50, 30 + r() * 50, 2 + r() * 4, -0.1, 0, 7); c.fill(); }
    c.filter = 'blur(0.6px)';
    const fir = (x, y, s) => { for (let k = 0; k < 5; k++) { const t = k / 5, wy = y - s * 2.3 * (1 - t), hw = s * (0.16 + 0.5 * t); c.fillStyle = `rgb(${18 + r() * 16},${34 + r() * 18},${32 + r() * 12})`; c.beginPath(); c.moveTo(x, wy - s * 0.55); c.lineTo(x + hw, wy + s * 0.12); c.lineTo(x + hw * 0.4, wy); c.lineTo(x - hw * 0.4, wy + s * 0.04); c.lineTo(x - hw, wy + s * 0.12); c.fill(); c.fillStyle = 'rgba(235,238,242,.55)'; c.beginPath(); c.moveTo(x, wy - s * 0.55); c.lineTo(x - hw * 0.75, wy + s * 0.02); c.lineTo(x - hw * 0.2, wy - s * 0.12); c.fill(); } c.fillStyle = 'rgba(70,84,112,.25)'; c.beginPath(); c.ellipse(x + s * 0.7, y + 2, s * 0.9, s * 0.12, 0, 0, 7); c.fill(); };
    const trees = []; for (let i = 0; i < 22; i++) trees.push([r() * 384, 172 + r() * 62]); trees.sort((a, b2) => a[1] - b2[1]);
    const hx = 120 + r() * 170, hy = 196; let cabin = false;
    for (const [x, y] of trees) {
      if (!cabin && y > hy) { cabin = true; c.fillStyle = '#35221a'; c.fillRect(hx, hy - 20, 36, 20); c.fillStyle = '#ecebe6'; c.beginPath(); c.moveTo(hx - 6, hy - 18); c.lineTo(hx + 18, hy - 36); c.lineTo(hx + 42, hy - 18); c.fill(); c.fillStyle = '#4a2d20'; c.fillRect(hx + 27, hy - 38, 5, 10);
        const gl = c.createRadialGradient(hx + 16, hy - 9, 0, hx + 16, hy - 9, 26); gl.addColorStop(0, 'rgba(255,190,90,.75)'); gl.addColorStop(1, 'rgba(255,170,70,0)'); c.fillStyle = gl; c.fillRect(hx - 12, hy - 36, 58, 54); c.fillStyle = '#ffd27a'; c.fillRect(hx + 12, hy - 14, 8, 9); }
      if (Math.abs(x - hx - 18) > 30 || y < hy - 6) fir(x, y, 8 + (y - 165) * 0.3);
    }
    c.filter = 'none'; c.restore();
    // 붓 자국, 캔버스 결, 오래된 바니시
    const r2 = rng(seed + 9); c.globalAlpha = 0.07; for (let i = 0; i < 2600; i++) { const x = r2() * W, y = r2() * H, a = (r2() - 0.5) * 0.9; c.strokeStyle = r2() > 0.5 ? '#fff' : '#000'; c.lineWidth = 1 + r2() * 2.5; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * (6 + r2() * 14), y + Math.sin(a) * (6 + r2() * 14)); c.stroke(); } c.globalAlpha = 1;
    const img = c.getImageData(0, 0, W, H), d = img.data; for (let i = 0; i < d.length; i += 4) { const px = (i / 4) % W, py = (i / 4 / W) | 0, k = 0.86 + r2() * 0.12 + ((px % 3 === 0) + (py % 3 === 0)) * 0.03; d[i] *= k; d[i + 1] *= k * 0.97; d[i + 2] *= k * 0.9; } c.putImageData(img, 0, 0);
    const vg = c.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.75); vg.addColorStop(0, 'rgba(40,24,8,0)'); vg.addColorStop(1, 'rgba(40,24,8,.42)'); c.fillStyle = vg; c.fillRect(0, 0, W, H);
  };
  drawDefault();
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  g.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 })));
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.004, h + 0.004), new THREE.MeshStandardMaterial({ color: 0x15100c, roughness: 1 })); mat.position.z = -0.004; g.add(mat);
  for (const [fw, fh, x, y] of [[w + f * 2, f, 0, h / 2 + f / 2], [w + f * 2, f, 0, -h / 2 - f / 2], [f, h, -w / 2 - f / 2, 0], [f, h, w / 2 + f / 2, 0]]) g.add(at(rbox(fw, fh, 0.035, 0.008, frame), x, y, 0.01));
  // 넣은 그림은 액자 비율에 맞춰 가운데를 잘라 채운다
  g.userData.setImage = (img) => {
    if (!img) drawDefault();
    else { const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, k = Math.max(W / iw, H / ih), dw = iw * k, dh = ih * k; c.fillStyle = '#000'; c.fillRect(0, 0, W, H); c.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh); }
    tex.needsUpdate = true;
  };
  g.userData.size = [w, h];
  return g;
}

// ---- 장작 더미 (받침대에 쌓은 통나무)
export function logStack(M) {
  const g = new THREE.Group(), r = rng(5), logs = [];
  let n = 0;
  for (let row = 0; row < 4; row++) for (let i = 0; i < 4 - (row > 2 ? 1 : 0); i++) {
    const rad = 0.045 + r() * 0.012, len = 0.36 + r() * 0.06;
    const log = cyl(rad, rad * (0.92 + r() * 0.1), len, [M.bark, M.endGrain, M.endGrain], 10);
    at(log, (r() - 0.5) * 0.03, 0.05 + row * 0.092, -0.15 + i * 0.1 + (row % 2) * 0.05, 0, 0, Math.PI / 2 + (r() - 0.5) * 0.08); g.add(log); n++; logs.push(log);
  }
  g.userData.max = logs.length; g.userData.setCount = (k) => logs.forEach((l, i) => { l.visible = i < k; });
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
  g.add(at(cushion(0.36, 0.14, 0.32, 0.065, M.cloth, ['y', 1, 0.04]), 0, 0.27, 0, 0.05, 0.4));     // 개어 넣은 담요
  return g;
}

// ---- 눕혀 쌓은 책 몇 권 (책장 책과 같은 모양: 표지 판, 종이 더미, 둥근 책등)
export function bookStack(colors, n = 3, seed = 1) { return bookStackMesh(colors, n, rng(seed)); }
