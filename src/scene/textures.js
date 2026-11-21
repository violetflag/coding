// 절차적 재질: 모든 텍스처를 시작할 때 Canvas2D로 만든다 (외부 파일 없음).
// 각 생성기는 높이(height)와 색을 함께 만들고, 높이에서 노멀 맵을 뽑는다. 모두 이음매 없이 반복된다.
import * as THREE from 'three/webgpu';

// ---- 난수와 반복되는 잡음
export const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const hash2 = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const sm = (t) => t * t * (3 - 2 * t);
// 주기 px, py로 반복되는 값 잡음 (x, y는 격자 단위)
function vnoise(x, y, px, py, s) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = sm(x - x0), fy = sm(y - y0);
  const w = (i, p) => ((i % p) + p) % p;
  const a = hash2(w(x0, px), w(y0, py), s), b = hash2(w(x0 + 1, px), w(y0, py), s), c = hash2(w(x0, px), w(y0 + 1, py), s), d = hash2(w(x0 + 1, px), w(y0 + 1, py), s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
// u, v ∈ [0,1): 주기적인 프랙탈 잡음. fx, fy = 기본 주파수
function fbm(u, v, fx, fy, oct, s) {
  let a = 0, amp = 0.5, n = 0;
  for (let o = 0; o < oct; o++) { a += amp * vnoise(u * fx, v * fy, fx, fy, s + o * 17); n += amp; amp *= 0.5; fx *= 2; fy *= 2; }
  return a / n;
}

// ---- 공통: 픽셀 함수 → 색/노멀/거칠기 텍스처
// fn(u, v) → { h: 높이 0…1, c: [r,g,b] 0…1, r: 거칠기 0…1 }
function bake(size, fn, { bump = 2.0, aniso = 8 } = {}) {
  const [w, h] = Array.isArray(size) ? size : [size, size];
  const H = new Float32Array(w * h), col = new Uint8ClampedArray(w * h * 4), rgh = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = fn((x + 0.5) / w, (y + 0.5) / h), i = y * w + x;
    H[i] = p.h; col[i * 4] = p.c[0] * 255; col[i * 4 + 1] = p.c[1] * 255; col[i * 4 + 2] = p.c[2] * 255; col[i * 4 + 3] = 255;
    const r = (p.r ?? 0.8) * 255; rgh[i * 4] = 255; rgh[i * 4 + 1] = r; rgh[i * 4 + 2] = 0; rgh[i * 4 + 3] = 255;
  }
  const nrm = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const xl = (x + w - 1) % w, xr = (x + 1) % w, yu = (y + h - 1) % h, yd = (y + 1) % h;
    const dx = (H[y * w + xr] - H[y * w + xl]) * bump * w / 512, dy = (H[yd * w + x] - H[yu * w + x]) * bump * h / 512;
    const l = 1 / Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    nrm[i] = (-dx * l * 0.5 + 0.5) * 255; nrm[i + 1] = (dy * l * 0.5 + 0.5) * 255; nrm[i + 2] = (l * 0.5 + 0.5) * 255; nrm[i + 3] = 255;
  }
  const tex = (data, srgb) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    cv.getContext('2d').putImageData(new ImageData(data, w, h), 0, 0);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: tex(col, true), normalMap: tex(nrm, false), roughnessMap: tex(rgh, false) };
}
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// ---- 널빤지 (바닥, 벽, 천장). 판은 u 방향으로 길다. rows = 타일 안의 판 수, round = 통나무처럼 둥근 정도
function planks({ size = 512, rows = 8, seed = 1, base = [0.3, 0.18, 0.1], dark = [0.12, 0.07, 0.04], round = 0, gap = 0.035, gloss = 0.5, lenFreq = 3, bump = 2, aspect = 1.7 }) {
  const r = rng(seed), offs = [], tones = [], joints = [];
  for (let i = 0; i < rows; i++) { offs.push(r()); tones.push(0.75 + r() * 0.5); joints.push(1 + Math.floor(r() * 2)); }
  return bake(size, (u, v) => {
    const row = Math.min(rows - 1, Math.floor(v * rows)), fv = v * rows - row;
    const j = joints[row], uu = (u + offs[row]) % 1, seg = Math.floor(uu * j), fu = uu * j - seg;
    const tone = tones[row] * (0.9 + 0.2 * hash2(row, seg, seed));
    // 나뭇결: 길이 방향으로 길게 늘인 잡음 + 옹이 주변의 휘어짐
    const warp = fbm(u, v, lenFreq, rows * 2, 3, seed + 5) * 0.6;
    const g1 = fbm(u + offs[row], v + warp * 0.04, lenFreq * 2, rows * 22, 4, seed + row * 3);
    const g2 = fbm(u, v, lenFreq * 6, rows * 60, 2, seed + 99);
    const grain = g1 * 0.75 + g2 * 0.25;
    const edgeV = Math.min(fv, 1 - fv), edgeU = Math.min(fu, 1 - fu) / j * rows * aspect;
    const e = Math.min(edgeV, edgeU), gapM = 1 - clamp01(e / gap);
    const prof = round > 0 ? Math.sqrt(clamp01(1 - Math.pow(Math.abs(fv - 0.5) * 2, 2))) * round : 0;
    const c = mul(mix(dark, base, clamp01(0.25 + grain * 0.95)), tone * (1 - 0.75 * gapM * gapM));
    return { h: clamp01(0.5 + (grain - 0.5) * 0.18 + prof * 0.5 - gapM * gapM * 0.5), c, r: clamp01(gloss + (1 - grain) * 0.25 + gapM * 0.4) };
  }, { bump });
}

// ---- 자연석 쌓기 (보로노이 칸마다 돌 하나, 칸 사이는 줄눈)
function stones({ size = 512, cells = 5, seed = 7, tint = [0.42, 0.39, 0.35], mortar = [0.2, 0.19, 0.17], squash = 0.62, bump = 3.2 }) {
  const cx = cells, cy = Math.round(cells / squash);
  const pt = (i, j) => { const wi = ((i % cx) + cx) % cx, wj = ((j % cy) + cy) % cy; return [i + 0.15 + 0.7 * hash2(wi, wj, seed), j + 0.15 + 0.7 * hash2(wi, wj, seed + 1), hash2(wi, wj, seed + 2), hash2(wi, wj, seed + 3)]; };
  return bake(size, (u, v) => {
    const x = u * cx, y = v * cy, ix = Math.floor(x), iy = Math.floor(y);
    let d1 = 9, d2 = 9, t1 = 0, t2 = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const p = pt(ix + i, iy + j), d = Math.hypot(x - p[0], y - p[1]);
      if (d < d1) { d2 = d1; d1 = d; t1 = p[2]; t2 = p[3]; } else if (d < d2) d2 = d;
    }
    const edge = d2 - d1, m = clamp01(edge / 0.09), body = sm(m);
    const n = fbm(u, v, cx * 4, cy * 4, 4, seed + 9), fine = fbm(u, v, cx * 16, cy * 16, 2, seed + 20);
    const hue = mix([0.9, 0.86, 0.8], [1.12, 1.0, 0.86], t2);       // 돌마다 살짝 다른 색조(회색 ~ 누런 갈색)
    const tone = 0.62 + t1 * 0.55;
    let c = [tint[0] * hue[0] * tone, tint[1] * hue[1] * tone, tint[2] * hue[2] * tone];
    c = mul(c, 0.78 + n * 0.4 + (fine - 0.5) * 0.15);
    c = mix(mul(mortar, 0.8 + fine * 0.4), c, body);
    const dome = Math.sqrt(clamp01(edge * 2.2));
    return { h: clamp01(body * (0.45 + dome * 0.4 + (n - 0.5) * 0.25) + (fine - 0.5) * 0.06), c, r: 0.82 + (1 - body) * 0.15 };
  }, { bump });
}

// ---- 가죽: 잔주름 + 닳은 얼룩
function leather({ size = 512, seed = 11, base = [0.26, 0.12, 0.06] }) {
  return bake(size, (u, v) => {
    const pores = fbm(u, v, 48, 48, 3, seed), wr = fbm(u, v, 9, 9, 4, seed + 4), worn = fbm(u, v, 3, 3, 3, seed + 8);
    const crease = Math.abs(wr - 0.5) * 2;
    const c = mul(mix(base, [0.42, 0.22, 0.11], clamp01((worn - 0.45) * 2.2)), 0.8 + pores * 0.3);
    return { h: clamp01(0.5 + (pores - 0.5) * 0.5 - (1 - crease) * 0.12), c, r: clamp01(0.42 + pores * 0.2 - (worn - 0.5) * 0.25) };
  }, { bump: 1.6 });
}

// ---- 천(쿠션, 담요, 커튼): 씨실·날실
function fabric({ size = 256, seed = 21, base = [0.62, 0.52, 0.38], threads = 64 }) {
  return bake(size, (u, v) => {
    const a = Math.sin(u * threads * Math.PI * 2), b = Math.sin(v * threads * Math.PI * 2), n = fbm(u, v, 24, 24, 3, seed);
    const weave = (a * b) * 0.5 + 0.5;
    return { h: clamp01(0.5 + (weave - 0.5) * 0.6 + (n - 0.5) * 0.2), c: mul(base, 0.78 + weave * 0.18 + n * 0.14), r: 0.95 };
  }, { bump: 1.2 });
}

// ---- 러그: 테두리와 마름모 무늬를 그린 뒤 직조 잡음을 얹는다 (반복하지 않고 한 장으로 쓴다)
function rug({ w = 768, h = 512, seed = 31 }) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d');
  const P = { field: '#5a1a17', dark: '#2a0f10', cream: '#c9b48a', navy: '#1c2740', gold: '#a8782e' };
  c.fillStyle = P.dark; c.fillRect(0, 0, w, h);
  c.fillStyle = P.cream; c.fillRect(14, 14, w - 28, h - 28);
  c.fillStyle = P.navy; c.fillRect(20, 20, w - 40, h - 40);
  // 테두리 무늬
  c.fillStyle = P.gold;
  for (let x = 34; x < w - 34; x += 26) { for (const y of [38, h - 38]) { c.beginPath(); c.moveTo(x, y - 9); c.lineTo(x + 9, y); c.lineTo(x, y + 9); c.lineTo(x - 9, y); c.fill(); } }
  for (let y = 60; y < h - 50; y += 26) { for (const x of [38, w - 38]) { c.beginPath(); c.moveTo(x, y - 9); c.lineTo(x + 9, y); c.lineTo(x, y + 9); c.lineTo(x - 9, y); c.fill(); } }
  c.fillStyle = P.cream; c.fillRect(56, 56, w - 112, h - 112);
  c.fillStyle = P.field; c.fillRect(61, 61, w - 122, h - 122);
  // 바탕의 작은 마름모 격자
  c.strokeStyle = 'rgba(201,180,138,.28)'; c.lineWidth = 1.5;
  for (let k = -h; k < w + h; k += 44) { c.beginPath(); c.moveTo(k, 61); c.lineTo(k + h, h - 61); c.stroke(); c.beginPath(); c.moveTo(k, h - 61); c.lineTo(k + h, 61); c.stroke(); }
  c.fillStyle = P.field; c.strokeStyle = P.cream;
  // 가운데 큰 무늬
  const med = (cx, cy, rx, ry, cols) => cols.forEach((col, i) => { const k = 1 - i / cols.length; c.fillStyle = col; c.beginPath(); c.moveTo(cx, cy - ry * k); c.lineTo(cx + rx * k, cy); c.lineTo(cx, cy + ry * k); c.lineTo(cx - rx * k, cy); c.fill(); });
  med(w / 2, h / 2, w * 0.3, h * 0.36, [P.cream, P.navy, P.gold, P.field, P.cream, P.navy]);
  for (const [x, y] of [[0.2, 0.26], [0.8, 0.26], [0.2, 0.74], [0.8, 0.74]]) med(w * x, h * y, w * 0.07, h * 0.1, [P.cream, P.navy, P.gold]);
  // 직조 잡음과 바랜 얼룩
  const img = c.getImageData(0, 0, w, h), d = img.data, r = rng(seed);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, k = 0.72 + 0.2 * r() + 0.1 * ((x + y) % 2) + 0.16 * fbm(x / w, y / h, 4, 3, 3, seed);
    d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
  }
  c.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return { map: t };
}

// 재질 묶음을 만든다. tile = 텍스처 한 장이 덮는 길이(m): boxUV()가 만든 미터 단위 UV와 맞춘다.
export function makeMaterials() {
  const M = {};
  const std = (maps, tile, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, ...maps, ...extra });
    for (const k of ['map', 'normalMap', 'roughnessMap']) if (m[k] && tile) m[k].repeat.set(1 / tile[0], 1 / tile[1]);
    return m;
  };
  M.floor = std(planks({ rows: 10, seed: 3, base: [0.36, 0.2, 0.1], dark: [0.13, 0.065, 0.03], gloss: 0.38, gap: 0.05 }), [2.4, 1.4], { normalScale: new THREE.Vector2(0.8, 0.8) });
  M.wall = std(planks({ rows: 6, seed: 8, base: [0.3, 0.17, 0.09], dark: [0.1, 0.055, 0.03], round: 0.55, gloss: 0.62, gap: 0.07, bump: 3, aspect: 2 }), [2.6, 1.32]);
  M.ceiling = std(planks({ rows: 8, seed: 14, base: [0.2, 0.115, 0.06], dark: [0.07, 0.04, 0.02], gloss: 0.7 }), [2.4, 1.6]);
  M.wood = std(planks({ size: 256, rows: 1, seed: 19, base: [0.24, 0.13, 0.065], dark: [0.09, 0.045, 0.022], gloss: 0.42, gap: 0.0001, lenFreq: 2 }), [0.8, 0.25]);
  M.woodDark = std(planks({ size: 256, rows: 1, seed: 23, base: [0.13, 0.072, 0.038], dark: [0.045, 0.024, 0.012], gloss: 0.45, gap: 0.0001, lenFreq: 2 }), [0.8, 0.25]);
  M.stone = std(stones({ cells: 5, seed: 7 }), [1.5, 1.5]);
  M.hearth = std(stones({ cells: 3, seed: 41, tint: [0.25, 0.235, 0.22], squash: 1, bump: 1.6 }), [1.3, 1.3]);
  M.leather = std(leather({}), [0.5, 0.5]);
  M.leatherGreen = std(leather({ seed: 13, base: [0.1, 0.15, 0.09] }), [0.5, 0.5]);
  M.cloth = std(fabric({}), [0.25, 0.25]);
  M.blanket = std(fabric({ seed: 5, base: [0.45, 0.14, 0.12], threads: 40 }), [0.3, 0.3]);
  M.curtain = std(fabric({ seed: 6, base: [0.33, 0.1, 0.09], threads: 80 }), [0.3, 0.3]);
  M.rug = new THREE.MeshStandardMaterial({ roughness: 1, ...rug({}) });
  M.iron = new THREE.MeshStandardMaterial({ color: 0x17171b, roughness: 0.55, metalness: 0.8 });
  M.brass = new THREE.MeshStandardMaterial({ color: 0x9a7436, roughness: 0.35, metalness: 0.9 });
  M.copper = new THREE.MeshStandardMaterial({ color: 0x9c5a35, roughness: 0.4, metalness: 0.85 });
  M.ceramic = new THREE.MeshStandardMaterial({ color: 0xe6dccb, roughness: 0.35 });
  M.wax = new THREE.MeshStandardMaterial({ color: 0xe9e0cc, roughness: 0.6, emissive: 0x552a10, emissiveIntensity: 0 });
  M.paper = new THREE.MeshStandardMaterial({ color: 0xd9ccb0, roughness: 0.9 });
  M.wicker = std(fabric({ seed: 9, base: [0.42, 0.29, 0.15], threads: 18 }), [0.2, 0.2]);
  M.bark = std(planks({ size: 256, rows: 3, seed: 33, base: [0.2, 0.14, 0.09], dark: [0.06, 0.04, 0.03], gloss: 0.9, gap: 0.12, lenFreq: 5, bump: 4 }), [0.4, 0.3]);
  M.endGrain = new THREE.MeshStandardMaterial({ color: 0xb08a58, roughness: 0.85 });
  return M;
}

// BoxGeometry의 UV(면마다 0…1)를 미터 단위로 바꾼다: 면 크기와 상관없이 무늬의 실제 크기가 같아진다.
export function boxUV(geo, w, h, d) {
  const uv = geo.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]); }
  uv.needsUpdate = true; return geo;
}

// ---- ambientCG(CC0) 사진 텍스처 ----
// public/textures/manifest.json 에 적힌 재질을 읽어, 위에서 코드로 그린 임시 텍스처를 바꿔 끼운다.
// 파일이 없거나 읽지 못한 재질은 코드로 그린 텍스처가 그대로 남는다.
// tint: 사진 색에 곱하는 색(같은 사진을 색만 바꿔 여러 재질에 쓴다). from: 다른 열쇠의 사진을 빌려 쓴다.
const PHOTO = {
  floor: { tint: 0xb39279 }, wall: {}, ceiling: {}, wood: { tint: 0xbfa58e }, woodDark: {},
  stone: {}, hearth: {}, firebrick: {},
  leather: {}, leatherGreen: { from: 'leather', tint: 0x7a9a64 },
  cloth: {}, blanket: { tint: 0xc8483e }, curtain: { tint: 0x9c4444 },
  rug: { keepMap: true }, wicker: {}, bark: { tint: 0x8a6448, normalScale: 2.5 }, endGrain: {},
  iron: {}, brass: {}, copper: {}, paper: { tint: 0xd9ccb0 },
};
// 둥근 형상(원기둥, 회전체, 공, 고리)의 UV는 0~1이라 작은 소품에서는 사진이 통째로 눌려 무늬가 사라진다.
// 형상 크기를 재서 UV를 미터 단위로 바꾼다. 원기둥의 양 끝면은 0~1로 둔다(나이테 사진을 한 장씩 붙이는 용도).
function meterUVs(root, mats) {
  const seen = new Set();
  root.traverse((o) => {
    const g = o.geometry; if (!o.isMesh || !g || seen.has(g) || o.isInstancedMesh) return;
    const used = (Array.isArray(o.material) ? o.material : [o.material]).some((m) => mats.has(m)); if (!used) return;
    const P = g.parameters || {}, uv = g.attributes.uv; if (!uv) return;
    let su = 0, sv = 0, n = uv.count;
    if (g.type === 'CylinderGeometry') { su = Math.PI * (P.radiusTop + P.radiusBottom); sv = P.height; n = (P.radialSegments + 1) * (P.heightSegments + 1); }
    else if (g.type === 'SphereGeometry') { su = 2 * Math.PI * P.radius; sv = Math.PI * P.radius; }
    else if (g.type === 'TorusGeometry') { su = 2 * Math.PI * P.radius; sv = 2 * Math.PI * P.tube; }
    else if (g.type === 'LatheGeometry') { let r = 0, len = 0; P.points.forEach((p, i) => { r = Math.max(r, p.x); if (i) len += p.distanceTo(P.points[i - 1]); }); su = 2 * Math.PI * r; sv = len; }
    else return;
    seen.add(g); for (let i = 0; i < n; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); uv.needsUpdate = true;
  });
}
export async function applyPhotoTextures(M, { scene, onGround, anisotropy = 8 } = {}) {
  let man; try { const r = await fetch('textures/manifest.json'); if (!r.ok) return 0; man = await r.json(); } catch { return 0; }
  const loader = new THREE.TextureLoader(), cache = new Map();
  const tex = (key, name, size, srgb) => {
    const id = key + '/' + name; if (cache.has(id)) return cache.get(id);
    const p = loader.loadAsync(`textures/${key}/${name}.jpg`).then((t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / size, 1 / size); t.anisotropy = anisotropy; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t; }, () => null);
    cache.set(id, p); return p;
  };
  const load = async (key) => { const e = man[key]; if (!e) return null; const size = e.tileable === false ? 1 : e.sizeM || 1, has = (n) => !e.maps || e.maps.includes(n);
    const [map, normalMap, roughnessMap, aoMap, metalnessMap] = await Promise.all([has('color') && tex(key, 'color', size, true), has('normal') && tex(key, 'normal', size), has('roughness') && tex(key, 'roughness', size), has('ao') && tex(key, 'ao', size), has('metalness') && tex(key, 'metalness', size)]);
    return { map, normalMap, roughnessMap, aoMap, metalnessMap }; };
  let n = 0;
  await Promise.all(Object.entries(PHOTO).map(async ([key, P]) => {
    const m = M[key], t = await load(P.from || key); if (!m || !t || !(t.map || t.normalMap)) return;
    if (t.map && !P.keepMap) { m.map = t.map; m.color.set(P.tint ?? 0xffffff); }
    if (t.normalMap) { m.normalMap = t.normalMap; m.normalScale.setScalar(P.normalScale || 1); }
    if (t.roughnessMap) { m.roughnessMap = t.roughnessMap; m.roughness = 1; }
    if (t.aoMap) { m.aoMap = t.aoMap; m.aoMapIntensity = 0.8; }
    if (t.metalnessMap) { m.metalnessMap = t.metalnessMap; m.metalness = 1; }
    m.needsUpdate = true; n++;
    for (const c of m.userData.clones || []) { for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap']) c[k] = m[k]; c.color.copy(m.color); c.normalScale.copy(m.normalScale); c.roughness = m.roughness; c.needsUpdate = true; }
  }));
  if (scene && n) { const mats = new Set(); for (const k of Object.keys(PHOTO)) { if (M[k]) { mats.add(M[k]); for (const c of M[k].userData.clones || []) mats.add(c); } } meterUVs(scene, mats); }
  // 책장의 책과 탁자 위 책: 표지에 가죽 결을 입힌다
  const lt = await load('leather');
  const bookMats = new Set(); scene?.traverse((o) => { if (o.material?.userData?.bookCover) bookMats.add(o.material); });
  if (lt?.normalMap) for (const m of bookMats) { m.normalMap = lt.normalMap; m.normalScale.set(0.6, 0.6); if (lt.roughnessMap) { m.roughnessMap = lt.roughnessMap; m.roughness = 1; } m.needsUpdate = true; }
  // 창밖 땅: 풀밭과 눈
  const [grass, snow] = await Promise.all([load('grass'), load('snow')]);
  if (grass?.map || snow?.map) onGround?.({ grass, snow });
  return n;
}
