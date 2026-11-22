// 책 모양: 천을 씌운 표지 판 두 장(종이 더미보다 위·아래·앞으로 2.5mm 나온다), 그 사이에 들어앉은 종이 더미, 둥글게 나온 책등.
// 책마다 치수대로 정점을 바로 써서 한 덩어리 모양에 모은다. 책이 몇 권이든 재질 수(천·종이·책등 글씨)만큼만 그린다.
// 책 좌표: 책등 꼭대기가 +x(둥근 정도만큼), 배(앞마구리)가 -x, 바닥이 y=0, 두께가 z(가운데 0). 단위 m.
import * as THREE from 'three/webgpu';

export const BOARD = 0.002, SQ = 0.0025;      // 표지 판 두께, 판이 종이보다 나온 너비
const SEG = 8;                                 // 책등 둥근 면 조각 수

// 'hsl(8 32% 20%)'(쉼표 없는 꼴)도 읽는다. three의 Color는 쉼표 있는 꼴만 읽는다.
export function parseColor(c, out = new THREE.Color()) {
  if (typeof c === 'string') { const m = c.match(/^hsla?\(\s*([-\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/i); if (m) return out.setHSL((((+m[1] % 360) + 360) % 360) / 360, m[2] / 100, m[3] / 100, THREE.SRGBColorSpace); }
  return out.set(c ?? 0x5b2a22);
}
// 책 천 색: 서재 색(meta.color)을 조금 눌러 천·가죽 같은 차분한 색으로
const _hsl = {};
export function bookColor(c, out = new THREE.Color()) { parseColor(c, out).getHSL(_hsl, THREE.SRGBColorSpace); return out.setHSL(_hsl.h, Math.min(0.4, _hsl.s * 0.8), Math.min(0.5, Math.max(0.12, _hsl.l)), THREE.SRGBColorSpace); }
export const hashStr = (s) => { let h = 2166136261; for (const ch of s || '') h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

// 쪽수 어림: PDF는 쪽수, 글은 글자 수(한글 책 쪽당 약 700자, 영문 약 1800자)와 그림 수. 책을 넣을 때 meta.pages로 저장한다.
export function pagesOf(book) {
  if (book.format === 'pdf') return book.numPages || 0;
  let han = 0, n = 0;
  out: for (const ch of book.chapters || []) for (const bl of ch.blocks || []) {
    for (const c of bl.text || '') if (c > ' ') { n++; if ((c >= '가' && c <= '힣') || (c >= '一' && c <= '鿿') || (c >= '぀' && c <= 'ヿ')) han++; }
    if (n > 20000) break out;
  }
  const imgs = Object.keys(book.images || {}).length;
  return Math.max(1, Math.round((book.length || 0) / (n && han / n > 0.3 ? 700 : 1800) + imgs * 0.5));
}
// 쪽수를 모르는 예전 책: 파일 크기로 어림한다
export const estimatePages = (b) => (b.pages > 0 ? b.pages : (b.size || 4e5) / (b.format === 'pdf' ? 60000 : b.format === 'txt' ? 2000 : 2600));

// 책 치수: 두께는 쪽당 0.05mm + 표지 2mm 두 장(8~70mm), 키는 제목에서 정해지는 19~26cm, 폭은 키의 약 0.68배
export function bookDims(b) {
  const h = hashStr(b.title || b.id), r = (k) => ((h >>> k) & 255) / 255;
  const T = Math.min(0.07, Math.max(0.008, estimatePages(b) * 0.00005 + 2 * BOARD));
  const H = 0.19 + r(0) * 0.07, Dp = Math.min(0.19, H * (0.64 + r(8) * 0.08));
  return { T, H, Dp, bulge: Math.min(0.005, Math.max(0.0012, T * 0.17)) };
}

// ---- 정점 버퍼
export const newBuf = () => ({ p: [], n: [], uv: [], c: [] , i: [] });
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
function vert(B, M, x, y, z, nx, ny, nz, u, v, col) {
  _v.set(x, y, z).applyMatrix4(M); _n.set(nx, ny, nz).transformDirection(M);
  B.p.push(_v.x, _v.y, _v.z); B.n.push(_n.x, _n.y, _n.z); B.uv.push(u, v); B.c.push(col.r, col.g, col.b);
}
// 삼각형을 법선 쪽에서 반시계로 감기게 넣는다 (책 좌표에서 판단)
function tri(B, k0, k1, k2, P, N) {
  _a.subVectors(P[1], P[0]); _b.subVectors(P[2], P[0]);
  if (_a.cross(_b).dot(N) >= 0) B.i.push(k0, k1, k2); else B.i.push(k0, k2, k1);
}
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
function quad(B, M, pts, n, uvs, col) {
  const k = B.p.length / 3, N = V3(...n), P = pts.map((p) => V3(...p));
  pts.forEach((p, j) => vert(B, M, p[0], p[1], p[2], n[0], n[1], n[2], uvs[j][0], uvs[j][1], col));
  tri(B, k, k + 1, k + 2, P, N); tri(B, k, k + 2, k + 3, [P[0], P[2], P[3]], N);
}

// 책 한 권을 쓴다. B = { cloth, paper, spine, cover }: 각 부분이 들어갈 버퍼(spine이 없으면 천에, cover가 없으면 천에).
// spineUV = [u0, v0, u1, v1]: 책등 글씨 지도에서 이 책의 자리. cover 버퍼의 앞표지(z = -T/2 판의 바깥면)는 0~1 UV.
export function writeBook(B, d, M, col, { spineUV = null } = {}) {
  const { T, H, Dp, bulge } = d, cloth = B.cloth, dark = col.clone().multiplyScalar(0.55);
  const cu = (x) => -x / 0.035, cv = (y) => y / 0.25;          // 천 결의 UV(책등 3.5×25cm가 1)
  // 표지 판 두 장: 바깥면, 안쪽 면(나온 테두리에서 보인다), 윗·아랫면, 앞 모서리
  for (const s of [1, -1]) {
    const zo = (s * T) / 2, zi = s * (T / 2 - BOARD), x0 = -Dp;
    const front = s < 0 && B.cover;
    quad(front || cloth, M, [[x0, 0, zo], [0, 0, zo], [0, H, zo], [x0, H, zo]], [0, 0, s], front ? [[1, 0], [0, 0], [0, 1], [1, 1]] : [[cu(x0), 0], [0, 0], [0, cv(H)], [cu(x0), cv(H)]], col);
    quad(cloth, M, [[x0, 0, zi], [0, 0, zi], [0, H, zi], [x0, H, zi]], [0, 0, -s], [[cu(x0), 0], [0, 0], [0, cv(H)], [cu(x0), cv(H)]], dark);
    for (const [y, ny] of [[H, 1], [0, -1]]) quad(cloth, M, [[x0, y, zi], [0, y, zi], [0, y, zo], [x0, y, zo]], [0, ny, 0], [[cu(x0), 0], [0, 0], [0, 0.01], [cu(x0), 0.01]], col);
    quad(cloth, M, [[x0, 0, zi], [x0, 0, zo], [x0, H, zo], [x0, H, zi]], [-1, 0, 0], [[0, 0], [0.06, 0], [0.06, cv(H)], [0, cv(H)]], col);
  }
  // 종이 더미: 윗면·아랫면·배. UV u = 두께 방향(책장 결), 20mm가 1
  const zb = T / 2 - BOARD, xb = -(Dp - SQ), pu = (z) => (z + zb) / 0.02, white = WHITE;
  for (const [y, ny] of [[H - SQ, 1], [SQ, -1]]) quad(B.paper, M, [[xb, y, -zb], [0, y, -zb], [0, y, zb], [xb, y, zb]], [0, ny, 0], [[pu(-zb), -xb / 0.05], [pu(-zb), 0], [pu(zb), 0], [pu(zb), -xb / 0.05]], white);
  quad(B.paper, M, [[xb, SQ, -zb], [xb, SQ, zb], [xb, H - SQ, zb], [xb, H - SQ, -zb]], [-1, 0, 0], [[pu(-zb), 0], [pu(zb), 0], [pu(zb), H / 0.05], [pu(-zb), H / 0.05]], white);
  // 둥근 책등: z = +T/2 → -T/2 (책등을 마주 보면 왼쪽 → 오른쪽), UV u는 호의 길이 비율
  const SB = spineUV ? B.spine : cloth, ring = [], len = [0];
  for (let i = 0; i <= SEG; i++) { const th = Math.PI / 2 - (Math.PI * i) / SEG; ring.push([bulge * Math.cos(th), (T / 2) * Math.sin(th), th]); if (i) len.push(len[i - 1] + Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1])); }
  const arc = len[SEG], k0 = SB.p.length / 3;
  for (let i = 0; i <= SEG; i++) {
    const [x, z, th] = ring[i], nn = _a.set(Math.cos(th) / bulge, 0, Math.sin(th) / (T / 2)).normalize().clone(), f = len[i] / arc;
    const u = spineUV ? spineUV[0] + f * (spineUV[2] - spineUV[0]) : len[i] / 0.035;
    for (const y of [0, H]) vert(SB, M, x, y, z, nn.x, 0, nn.z, u, spineUV ? (y ? spineUV[3] : spineUV[1]) : cv(y), spineUV ? white : col);
  }
  for (let i = 0; i < SEG; i++) { const a = k0 + 2 * i; SB.i.push(a, a + 2, a + 3, a, a + 3, a + 1); }   // 바깥(+x)에서 반시계
  // 책등 머리·꼬리의 막음(초승달 꼴)과 머리띠(종이 더미 위 판 사이로 보이는 책등 안쪽)
  for (const [y, ny] of [[H, 1], [0, -1]]) {
    const k = cloth.p.length / 3, N = V3(0, ny, 0); vert(cloth, M, 0, y, 0, 0, ny, 0, 0, 0, dark);
    for (const [x, z] of ring) vert(cloth, M, x, y, z, 0, ny, 0, 0, 0, dark);
    for (let i = 0; i < SEG; i++) tri(cloth, k, k + 1 + i, k + 2 + i, [V3(0, y, 0), V3(ring[i][0], y, ring[i][1]), V3(ring[i + 1][0], y, ring[i + 1][1])], N);
  }
  for (const [y0, y1] of [[H - SQ, H], [0, SQ]]) quad(cloth, M, [[0, y0, -zb], [0, y0, zb], [0, y1, zb], [0, y1, -zb]], [-1, 0, 0], [[0, 0], [0.1, 0], [0.1, 0.01], [0, 0.01]], dark);
  return arc;
}
const WHITE = new THREE.Color(1, 1, 1);

// 버퍼들을 묶어 그룹이 있는 모양 하나로 (그룹 순서 = 재질 순서)
export function toGeometry(bufs, geo = new THREE.BufferGeometry()) {
  const nv = bufs.reduce((s, B) => s + B.p.length / 3, 0), ni = bufs.reduce((s, B) => s + B.i.length, 0);
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), U = new Float32Array(nv * 2), C = new Float32Array(nv * 3), I = new Uint32Array(ni);
  let v = 0, k = 0;
  bufs.forEach((B, g) => {
    P.set(B.p, v * 3); N.set(B.n, v * 3); U.set(B.uv, v * 2); C.set(B.c, v * 3);
    for (let j = 0; j < B.i.length; j++) I[k + j] = B.i[j] + v;
    geo.addGroup(k, B.i.length, g); k += B.i.length; v += B.p.length / 3;
  });
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(U, 2)); geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
  geo.setIndex(new THREE.BufferAttribute(I, 1)); geo.computeBoundingSphere(); geo.computeBoundingBox();
  return geo;
}

// ---- 함께 쓰는 재질: 천(책마다 정점 색, 사진 천 결은 applyPhotoTextures가 bookCover 표시를 보고 입힌다)과 종이 단면
let MATS = null;
export function bookMaterials() {
  if (MATS) return MATS;
  const cloth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 }); cloth.userData.bookCover = true;
  // 종이 단면: 한 장씩 쌓인 가는 결. 그늘진 책장 안에서 튀지 않게 누런 회색으로 낮춘다
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 4; const c = cv.getContext('2d');
  { let sd = 9; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    for (let x = 0; x < 512; ) { const w = 1 + Math.floor(r() * 3), v = 200 + r() * 45 - (r() < 0.08 ? 50 : 0); c.fillStyle = `rgb(${v},${v - 6},${v - 22})`; c.fillRect(x, 0, w, 4); x += w; } }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  const paper = new THREE.MeshStandardMaterial({ map: t, color: 0x8a7f69, roughness: 1, envMapIntensity: 0.2 });
  return (MATS = { cloth, paper });
}

// 눕혀 쌓은 장식용 책 몇 권 (글씨 없음): 모양 하나, 재질 둘
export function bookStackMesh(colors, n, r) {
  const B = { cloth: newBuf(), paper: newBuf() }, M = new THREE.Matrix4(), R = new THREE.Matrix4(), col = new THREE.Color(); let y = 0;
  for (let i = 0; i < n; i++) {
    const T = 0.022 + r() * 0.018, Dp = 0.13 + r() * 0.03, H = 0.19 + r() * 0.03, yaw = (r() - 0.5) * 0.5;
    const d = { T, H, Dp, bulge: Math.min(0.005, T * 0.17) };
    // 눕힌 책: 두께(z)가 위로, 키(y)가 -z로. 가운데를 원점에 맞춘 뒤 돌린다
    M.makeTranslation(0, y + T / 2, 0).multiply(R.makeRotationY(yaw)).multiply(R.makeRotationX(-Math.PI / 2)).multiply(R.makeTranslation((Dp - d.bulge) / 2, -H / 2, 0));
    writeBook(B, d, M, col.set(colors[Math.floor(r() * colors.length)]));
    y += T;
  }
  const m = bookMaterials(), mesh = new THREE.Mesh(toGeometry([B.cloth, B.paper]), [m.cloth, m.paper]);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.top = y;
  return mesh;
}
