// 가구와 소품: 안락의자, 탁자, 스탠드, 촛불, 머그잔, 주전자, 시계, 그림, 장작, 커튼.
// 모두 코드로 만든 형상이다. 각 함수는 THREE.Group을 돌려주고, 움직이는 부분은 group.userData에 넣는다.
import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rng } from './textures.js';

const shadow = (m, cast = true) => { m.castShadow = cast; m.receiveShadow = true; return m; };
const rbox = (w, h, d, r, m) => shadow(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)), m));
const cyl = (r0, r1, h, m, seg = 16) => shadow(new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m));
const at = (mesh, x, y, z, rx = 0, ry = 0, rz = 0) => { mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); return mesh; };

// ---- 가죽 안락의자 (클럽 체어). -Z를 바라본다. wing = 귀가 달린 높은 등받이.
// 둥글게 말린 팔걸이, 두툼한 좌판 쿠션, 단추로 누빈 등, 앞면을 따라 박은 황동 징.
export function armchair(M, { wing = false, leather = M.leather, pillow = null, throwMat = null } = {}) {
  const g = new THREE.Group();
  for (const [x, z] of [[-0.36, -0.34], [0.36, -0.34], [-0.36, 0.36], [0.36, 0.36]]) g.add(at(cyl(0.035, 0.026, 0.09, M.woodDark, 10), x, 0.045, z));
  g.add(at(rbox(0.9, 0.22, 0.86, 0.06, leather), 0, 0.2, 0.01));                      // 몸통 아래
  g.add(at(rbox(0.6, 0.17, 0.66, 0.075, leather), 0, 0.4, -0.08));                    // 좌판 쿠션
  const bh = wing ? 0.9 : 0.66, tilt = 0.17;
  g.add(at(rbox(0.88, bh, 0.2, 0.09, leather), 0, 0.3 + bh / 2, 0.36, tilt));         // 등받이
  g.add(at(rbox(0.6, bh - 0.2, 0.13, 0.06, leather), 0, 0.44 + (bh - 0.2) / 2, 0.245, tilt)); // 등 쿠션
  const studs = [], stud = (x, y, z) => studs.push([x, y, z]);
  for (const s of [-1, 1]) {
    g.add(at(rbox(0.17, 0.34, 0.8, 0.06, leather), s * 0.39, 0.44, 0.0));              // 팔걸이 몸통
    g.add(at(cyl(0.105, 0.105, 0.78, leather, 18), s * 0.4, 0.6, 0.0, Math.PI / 2));   // 말린 윗부분
    const cap = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.105, 18, 12), leather)); cap.scale.z = 0.3; g.add(at(cap, s * 0.4, 0.6, -0.39));
    for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; stud(s * 0.4 + Math.cos(a) * 0.088, 0.6 + Math.sin(a) * 0.088, -0.417); }   // 팔걸이 앞 소용돌이의 징
    for (let k = 0; k < 6; k++) stud(s * (0.325 + 0.0), 0.3 + k * 0.035, -0.405);
    if (wing) { g.add(at(rbox(0.1, 0.52, 0.3, 0.045, leather), s * 0.4, 0.98, 0.2, tilt, 0, s * -0.05)); for (let k = 0; k < 9; k++) stud(s * 0.4, 0.76 + k * 0.05, 0.045 + (0.76 + k * 0.05 - 0.98) * tilt - 0.0); }
  }
  for (let k = 0; k < 19; k++) stud(-0.405 + k * 0.045, 0.12, -0.425);                 // 앞치마를 따라 박은 징
  const sg = new THREE.SphereGeometry(0.0085, 8, 6), si = new THREE.InstancedMesh(sg, M.brass, studs.length), m4 = new THREE.Matrix4();
  studs.forEach((p, i) => si.setMatrixAt(i, m4.makeTranslation(p[0], p[1], p[2]))); g.add(si);
  // 등받이 단추(터프팅)
  const btn = new THREE.SphereGeometry(0.013, 8, 6);
  for (let j = 0; j < (wing ? 4 : 2); j++) for (let i = -1; i <= (j % 2 ? 0 : 1); i++) {
    const y = 0.6 + j * 0.17, b = new THREE.Mesh(btn, leather); b.position.set(i * 0.17 + (j % 2 ? 0.085 : 0), y, 0.185 + (y - 0.44) * tilt); g.add(b);
  }
  if (pillow) g.add(at(rbox(0.4, 0.34, 0.12, 0.055, pillow), 0.03, 0.66, 0.14, 0.32, 0, 0.07));
  if (throwMat) { g.add(at(rbox(0.5, 0.05, 0.34, 0.022, throwMat), -0.22, 0.3 + bh + 0.0, 0.4, tilt, 0, 0.03)); g.add(at(rbox(0.5, 0.42, 0.045, 0.02, throwMat), -0.22, 0.3 + bh - 0.2, 0.49, tilt)); }
  g.userData.seatH = 0.49;
  return g;
}

// ---- 격자 철제 장작 선반 (창 아래). 쪼갠 장작을 눕혀 쌓는다
export function logRack(M, w = 0.9, h = 0.62, d = 0.34) {
  const g = new THREE.Group(), r = rng(91), bar = (len, x, y, z, rx = 0, rz = 0) => g.add(at(cyl(0.007, 0.007, len, M.iron, 6), x, y, z, rx, 0, rz));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bar(h, sx * w / 2, h / 2, sz * d / 2);
  for (const y of [0.06, h]) { for (const sz of [-1, 1]) bar(w, 0, y, sz * d / 2, 0, Math.PI / 2); for (const sx of [-1, 1]) bar(d, sx * w / 2, y, 0, Math.PI / 2); }
  for (const sx of [-1, 1]) for (let k = 1; k < 4; k++) { const z = -d / 2 + (d * k) / 4; bar(Math.hypot(h, d / 4), sx * w / 2, h / 2, z, 0.14 * (k % 2 ? 1 : -1)); }   // 옆면 격자
  for (let k = 0; k < 7; k++) bar(h * 1.02, -w / 2 + (w * (k + 0.5)) / 7, h / 2 + 0.03, d / 2, 0, (k % 2 ? 1 : -1) * 0.2);                                   // 앞면 격자
  const logs = [];
  for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) {
    const rad = 0.05 + r() * 0.014, log = cyl(rad, rad * 0.95, d * 0.92, [M.bark, M.endGrain, M.endGrain], 10);
    g.add(at(log, -w / 2 + 0.085 + i * 0.146 + (row % 2) * 0.04 + (r() - 0.5) * 0.02, 0.12 + row * 0.105, (r() - 0.5) * 0.02, Math.PI / 2, 0, (r() - 0.5) * 0.1)); logs.push(log);
  }
  g.userData.max = logs.length; g.userData.setCount = (n) => logs.forEach((l, i) => { l.visible = i < n; });   // 위에서부터 줄어든다
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
