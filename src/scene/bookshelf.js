// 내 서재 책장: 처음엔 비어 있고, 서재에 넣은 책이 넣은 순서대로 꽂힌다(서재 칸부터, 칸이 차면 다음 단).
// 책 두께는 분량(쪽수)을 따르고, 책등에 제목(한글은 세로로 한 글자씩, 영문은 책등을 따라 눕혀서)과 지은이가 찍힌다.
// 앞표지에는 그 책의 표지 그림이 붙고(표지 그림 지도 한 장), 표지가 있는 책은 책등 바탕색·글씨 색·글씨꼴을 표지에서 읽어 맞춘다.
// 책 전부가 모양 하나·재질 넷(천, 종이, 책등 글씨 지도, 표지 그림 지도)이라 몇 권이든 그리기 호출은 넷이다.
import * as THREE from 'three/webgpu';
import { bookDims, bookMaterials, newBuf, writeBook, toGeometry, bookColor, hashStr } from './books.js';
import { drawCover } from '../reader/page.js';

const AW = 4096, SLOT_H = 512, PAD = 3, MAX_ROWS = 8;     // 글씨 지도: 가로 4096, 한 줄 높이 512(책 키 전체), 필요한 만큼만 줄을 늘린다(4096×4096까지)
const SERIF = '"Noto Serif KR", "Nanum Myeongjo", "Batang", "AppleMyungjo", serif', LATIN = 'Georgia, "Times New Roman", ' + SERIF;
const SANS = '"Malgun Gothic", "Noto Sans KR", "Noto Sans CJK KR", "Apple SD Gothic Neo", sans-serif', LATIN_SANS = '"Segoe UI", Helvetica, Arial, ' + SANS;
const FONTS = { serif: { cjk: SERIF, latin: LATIN }, sans: { cjk: SANS, latin: LATIN_SANS } };
const CW = 2048, CELL_W = 128, CELL_H = 192, CCOLS = CW / CELL_W, CROWS = CW / CELL_H | 0;   // 표지 그림 지도: 한 칸 128×192, 16×10 = 160권
const CJK = /[ᄀ-ᇿ㄰-㆏가-힣぀-ヿ一-鿿]/;

export class LibraryShelf {
  constructor(ctx, scene) {
    this.ctx = ctx; this.rows = ctx.libraryRows; this.placed = []; this.picked = null;
    const m = bookMaterials();
    this.spineMat = new THREE.MeshStandardMaterial({ roughness: 0.68, metalness: 0.05 });
    this.coverCv = document.createElement('canvas'); this.coverCv.width = this.coverCv.height = CW;
    this.coverTex = new THREE.CanvasTexture(this.coverCv); this.coverTex.colorSpace = THREE.SRGBColorSpace; this.coverTex.anisotropy = 8;
    this.coverMat = new THREE.MeshStandardMaterial({ map: this.coverTex, roughness: 0.62, metalness: 0.02 });
    this.covers = new Map();     // 책 id → { src, img, look }: 표지 그림과 거기서 읽은 책등 모양(바탕색, 글씨 색, 글씨꼴)
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), [m.cloth, m.paper, this.spineMat, this.coverMat]);
    this.mesh.name = '내 서재 책'; this.mesh.receiveShadow = true; this.mesh.castShadow = false; this.mesh.visible = false;
    scene.add(this.mesh);
    this.canvas = null; this.tex = null;
    // 책등 천 결: 사진(Fabric066)을 회색으로 바꿔 책 색에 곱한다. 사진이 오기 전에는 고른 잡티로 대신한다
    this.grain = document.createElement('canvas'); this.grain.width = this.grain.height = 1024;
    { const g = this.grain.getContext('2d'), im = g.createImageData(1024, 1024); let sd = 7; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < im.data.length; i += 4) { const v = 205 + r() * 30; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; } g.putImageData(im, 0, 0); }
    const img = new Image();
    img.onload = () => {
      const g = this.grain.getContext('2d'); g.drawImage(img, 0, 0, 1024, 1024);
      const id = g.getImageData(0, 0, 1024, 1024), a = id.data; let mean = 0;
      for (let i = 0; i < a.length; i += 4) mean += 0.3 * a[i] + 0.59 * a[i + 1] + 0.11 * a[i + 2]; mean /= a.length / 4;
      for (let i = 0; i < a.length; i += 4) { const l = 0.3 * a[i] + 0.59 * a[i + 1] + 0.11 * a[i + 2], v = 255 * Math.max(0.55, Math.min(1, 0.86 + ((l - mean) / (mean || 1)) * 0.5)); a[i] = a[i + 1] = a[i + 2] = v; }
      g.putImageData(id, 0, 0); if (this.placed.length) { this._drawAtlas(); }
    };
    img.src = 'textures/cloth/color.jpg';
  }

  // 서재 목록이 바뀔 때: 자리 잡기 → 글씨 지도 → 모양 → 상호작용 대상
  rebuild(library) {
    this.library = library; this._loadCovers(library);
    const books = [...library].sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0) || String(a.id).localeCompare(String(b.id)));
    this.placed = [];
    // 책장 앞에 서서 보면 왼쪽에서 오른쪽으로 꽂힌다(왼쪽 벽 책장은 z가 줄어드는 쪽이 오른쪽)
    let ri = 0, u = 0;
    for (const b of books) {
      const d = bookDims(b);
      while (ri < this.rows.length && u + d.T > this.rows[ri].a1 - this.rows[ri].a0 - 0.008) { ri++; u = 0; }
      if (ri >= this.rows.length) break;                                    // 책장이 다 찼다: 나머지는 꽂지 않는다
      const row = this.rows[ri], c = u + 0.004 + d.T / 2; d.H = Math.min(d.H, row.h - 0.012);
      const cv = this.covers.get(b.id), look = cv?.src === b.cover && cv.look ? cv.look : null;
      this.placed.push({ b, d, row, a: row.along === 'z' ? row.a1 - c : row.a0 + c, look, font: b.spineFont === 'serif' || b.spineFont === 'sans' ? b.spineFont : look?.font || 'serif', col: look ? look.bg.clone() : bookColor(b.color) }); u += d.T + 0.0006;
    }
    if (this.placed.length) { this._pack(); this._drawAtlas(); this._drawCovers(); }
    this._build(); this._interact();
  }
  setPicked(id) { if (id === this.picked) return; this.picked = id; if (this.placed.length) { this._build(); this._interact(); } }

  // 책등 자리를 글씨 지도에 나눠 준다: 가로는 호 길이 1mm당 2.6px(넘치면 줄인다), 세로는 책 키 전체가 512px
  _pack() {
    let pxmm = 2.6, rows;
    for (;;) {
      rows = 1; let x = 0, cut = -1;
      this.placed.forEach((p, i) => { const w = Math.max(14, Math.ceil(arcOf(p.d) * 1000 * pxmm)) + 2 * PAD; if (x + w > AW) { rows++; x = 0; } if (rows > MAX_ROWS && cut < 0) cut = i; p.slot = { x: x + PAD, w: w - 2 * PAD, row: rows - 1 }; x += w; });
      if (rows <= MAX_ROWS) break;
      if (pxmm > 1.1) { pxmm *= 0.9; continue; }
      this.placed.length = cut; rows = MAX_ROWS; break;                        // 글씨 지도가 다 찼다: 나머지 책은 꽂지 않는다
    }
    const H = Math.min(MAX_ROWS, rows) * SLOT_H;
    if (!this.canvas || this.canvas.height < H) {
      this.tex?.dispose();
      this.canvas = document.createElement('canvas'); this.canvas.width = AW; this.canvas.height = H;
      this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8;
      this.spineMat.map = this.tex; this.spineMat.needsUpdate = true;
    }
    const CH = this.canvas.height;
    for (const p of this.placed) { const s = p.slot; p.uv = [s.x / AW, 1 - (s.row * SLOT_H + SLOT_H) / CH, (s.x + s.w) / AW, 1 - (s.row * SLOT_H) / CH]; }
  }

  _drawAtlas() {
    if (!this.canvas || !this.placed.length) return;
    const c = this.canvas.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const p of this.placed) drawSpine(c, p, this.grain);
    c.setTransform(1, 0, 0, 1, 0, 0);
    this.tex.needsUpdate = true;
  }

  // 표지 그림을 받아 두고 책등 모양을 읽는다. 새로 읽은 표지가 있으면 책장을 한 번 다시 짓는다
  _loadCovers(library) {
    const todo = library.filter((b) => b.cover && this.covers.get(b.id)?.src !== b.cover);
    if (!todo.length) return;
    Promise.all(todo.map((b) => new Promise((res) => {
      const img = new Image(), e = { src: b.cover, img: null, look: null }; this.covers.set(b.id, e);
      img.onload = () => { e.img = img; try { e.look = readCover(img); } catch { /* 읽지 못하면 책 색을 쓴다 */ } res(); };
      img.onerror = () => res(); img.src = b.cover;
    }))).then(() => { if (this.library === library) this.rebuild(library); });
  }

  // 앞표지 그림 지도: 책마다 한 칸. 표지 그림이 없는 책은 책 색 천에 금박 제목을 찍은 표지를 그린다
  _drawCovers() {
    const c = this.coverCv.getContext('2d'), tmp = this._tmpCv || (this._tmpCv = Object.assign(document.createElement('canvas'), { width: CELL_W, height: CELL_H }));
    this.placed.forEach((p, i) => {
      if (i >= CCOLS * CROWS) { p.cuv = false; return; }
      const x = (i % CCOLS) * CELL_W, y = ((i / CCOLS) | 0) * CELL_H, img = this.covers.get(p.b.id)?.img;
      if (img) c.drawImage(img, x, y, CELL_W, CELL_H);
      else { drawCover(tmp, p.b, '#' + p.col.getHexString()); c.drawImage(tmp, x, y); }
      const i2 = 0.5;      // 칸 가장자리 반 픽셀 안쪽만 써서 옆 칸 그림이 번지지 않게 한다
      p.cuv = [(x + i2) / CW, 1 - (y + CELL_H - i2) / CW, (x + CELL_W - i2) / CW, 1 - (y + i2) / CW];
    });
    this.coverTex.needsUpdate = true;
  }

  _build() {
    this.mesh.visible = this.placed.length > 0; if (!this.placed.length) return;
    const B = { cloth: newBuf(), paper: newBuf(), spine: newBuf(), cover: newBuf() }, M = new THREE.Matrix4(), R = new THREE.Matrix4();
    for (const p of this.placed) {
      const { row, d } = p, out = 0;
      // 왼쪽 벽 책장: 책등이 +x(방 쪽), 두께가 z. 창문 벽 책장: 책등이 +z, 두께가 -x
      if (row.along === 'z') M.makeTranslation(row.front - d.bulge + out, row.y + 0.0005, p.a);
      else M.makeTranslation(p.a, row.y + 0.0005, row.front - d.bulge + out).multiply(R.makeRotationY(-Math.PI / 2));
      p.M = M.clone();
      if (p.b.id !== this.picked) writeBook(B, d, M, p.col, { spineUV: p.uv, coverUV: p.cuv });   // 꺼내 든 책은 책장에서 빠지고 그 자리가 빈다
    }
    const old = this.mesh.geometry; this.mesh.geometry = toGeometry([B.cloth, B.paper, B.spine, B.cover]); old.dispose();   // 새 모양으로 갈아 끼운다(책이 바뀔 때만)
  }

  // 책마다 상호작용 대상: 책 상자(box)로 고른다(얇은 책도 정확히 골라진다)
  _interact() {
    const ctx = this.ctx, v = new THREE.Vector3();
    ctx.interact = ctx.interact.filter((i) => !i.libBook && !i.libReturn);
    for (const p of this.placed) {
      const { d, b } = p, min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let k = 0; k < 8; k++) { v.set(k & 1 ? d.bulge : -d.Dp, k & 2 ? d.H : 0, k & 4 ? d.T / 2 : -d.T / 2).applyMatrix4(p.M); for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], v.getComponent(a)); max[a] = Math.max(max[a], v.getComponent(a)); } }
      v.set(d.bulge, d.H / 2, 0).applyMatrix4(p.M);
      const t = b.title || '제목 없음', short = t.length > 22 ? t.slice(0, 21) + '…' : t;
      // 꺼낸 책의 빈자리를 보면 다시 꽂는다
      if (b.id === this.picked) ctx.interact.push({ id: 'libreturn:' + b.id, label: `다시 꽂기: ${short}`, pos: v.toArray(), radius: Math.max(0.04, d.T * 0.9), box: { min, max }, libReturn: b.id });
      else ctx.interact.push({ id: 'libbook:' + b.id, label: `꺼내기: ${short}`, pos: v.toArray(), radius: Math.max(0.03, d.T * 0.9), box: { min, max }, libBook: b.id });
    }
  }
}

// 책등 둥근 면의 호 길이(m): writeBook과 같은 꼴(반타원)
function arcOf(d) { let s = 0, px = 0, pz = d.T / 2; for (let i = 1; i <= 8; i++) { const th = Math.PI / 2 - (Math.PI * i) / 8, x = d.bulge * Math.cos(th), z = (d.T / 2) * Math.sin(th); s += Math.hypot(x - px, z - pz); px = x; pz = z; } return s; }

// ---- 책등 한 칸 그리기. 그리는 좌표는 mm(가로 = 책등 호 길이, 세로 = 책 키)라서 글자가 책등 위에서 제 비율로 보인다.
function drawSpine(c, p, grain) {
  const { slot: s, d, b, col, look } = p, fam = FONTS[p.font], W = arcOf(d) * 1000, H = d.H * 1000, y0 = s.row * SLOT_H, hex = '#' + col.getHexString();
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0); c.beginPath(); c.rect(s.x - PAD, y0, s.w + 2 * PAD, SLOT_H); c.clip();
  c.fillStyle = hex; c.fillRect(s.x - PAD, y0, s.w + 2 * PAD, SLOT_H);
  // 천 결: 사진 1024px ≈ 40cm. 책마다 다른 곳을 잘라 쓴다
  const hs = hashStr(b.id), gx = (hs % 1000) / 1000 * Math.max(0, 1024 - W * 2.56), gy = ((hs >>> 10) % 1000) / 1000 * Math.max(0, 1024 - H * 2.56);
  c.globalCompositeOperation = 'multiply'; c.globalAlpha = look ? 0.55 : 1; c.drawImage(grain, gx, gy, Math.max(4, W * 2.56), Math.min(1024, H * 2.56), s.x - PAD, y0, s.w + 2 * PAD, SLOT_H); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  c.setTransform(s.w / W, 0, 0, SLOT_H / H, s.x, y0);
  // 머리·꼬리 쪽이 조금 닳아 어둡다
  const eg = c.createLinearGradient(0, 0, 0, H); eg.addColorStop(0, 'rgba(0,0,0,.35)'); eg.addColorStop(4 / H, 'rgba(0,0,0,0)'); eg.addColorStop(1 - 4 / H, 'rgba(0,0,0,0)'); eg.addColorStop(1, 'rgba(0,0,0,.4)'); c.fillStyle = eg; c.fillRect(0, 0, W, H);
  // 표지에서 읽은 글씨 색이 있으면 그 색, 없으면 밝은 천에 짙은 글씨, 어두운 천에 금박
  const lum = 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b, ink = look ? look.ink : lum > 0.2 ? '#2b2118' : '#d6b66c', inkShadow = lum > 0.2 ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.45)';
  c.fillStyle = ink;
  if (p.font === 'serif') for (const y of [9, 11.2, H - 11.7, H - 9.5]) c.fillRect(0, y, W, y === 9 || y === H - 9.5 ? 0.55 : 0.3);    // 위아래 금박 줄(명조 책만)
  const Tm = d.T * 1000, top = 17, bottom = H - 17, cx = W / 2;
  // 지은이: 아래쪽에 작게 (들어갈 때만)
  let tBottom = bottom;
  const au = cleanAuthor(b.author);
  if (au) {
    const z = drawText(c, au, cx, bottom - Math.min(42, H * 0.2), bottom, Tm, { small: true, ink, inkShadow, fam, dry: true });
    if (z) { drawText(c, au, cx, bottom - z, bottom, Tm, { small: true, ink, inkShadow, fam }); tBottom = bottom - z - 7; }
  }
  // 제목: 다 안 들어가면 부제를 떼어 보고, 그래도 길면 줄여 말줄임표
  let title = (b.title || '').trim() || '제목 없음';
  const main = title.split(/\s*[:：]\s*|\s+[-–—]\s+|\s*[(（[]/)[0].trim();
  if (main && main !== title && drawText(c, title, cx, top, tBottom, Tm, { ink, inkShadow, fam, dry: true, noCut: true }) === 0) title = main;
  drawText(c, title, cx, top, tBottom, Tm, { ink, inkShadow, fam });
  c.restore();
}
// ---- 표지 그림에서 책등 모양을 읽는다: 바탕색 = 가장 넓게 칠해진 색(가장자리 쪽에 무게), 글씨 색 = 넉넉히 쓰인 색 가운데 바탕과 가장 잘 갈리는 색.
// 글씨꼴은 그림에서 정확히 알아낼 수 없어 분위기로 고른다: 밝거나 선명한 현대풍 표지는 고딕, 어둡고 차분한 표지는 명조.
function readCover(img) {
  const w = 40, h = 60, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, w, h);
  const a = g.getImageData(0, 0, w, h).data, bins = new Map();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, r = a[i], gg = a[i + 1], bb = a[i + 2], k = (r >> 4) << 8 | (gg >> 4) << 4 | (bb >> 4);
    const edge = x < 4 || x >= w - 4 || y < 4 || y >= h - 4 ? 1.6 : 1, e = bins.get(k) || { n: 0, wt: 0, r: 0, g: 0, b: 0 };
    e.n++; e.wt += edge; e.r += r; e.g += gg; e.b += bb; bins.set(k, e);
  }
  // 이웃한 칸끼리는 한 색으로 친다(같은 바탕이 경계에서 두 칸으로 갈리는 것)
  const list = [...bins.values()].map((e) => ({ ...e, q: [e.r / e.n / 255, e.g / e.n / 255, e.b / e.n / 255], c: new THREE.Color().setRGB(e.r / e.n / 255, e.g / e.n / 255, e.b / e.n / 255, THREE.SRGBColorSpace) }));
  const hsl = {}, info = (c) => { c.getHSL(hsl, THREE.SRGBColorSpace); return { L: 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b, s: hsl.s, l: hsl.l }; };
  const near = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) < 0.16;
  for (const e of list) e.score = list.reduce((s, f) => s + (near(e.q, f.q) ? f.wt : 0), 0);
  const bgE = list.reduce((m, e) => (e.score > m.score ? e : m)), bg = bgE.c, B = info(bg);
  const contrast = (L1, L2) => (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05), total = w * h;
  let ink = null, best = 0;
  for (const e of list) {
    if (e.n < total * 0.006) continue;
    const I = info(e.c), cr = contrast(I.L, B.L), sc = cr * (1 + 0.6 * I.s) * Math.min(1, e.n / (total * 0.02));
    if (cr > 2.4 && sc > best) { best = sc; ink = e.c; }
  }
  if (!ink) ink = B.L > 0.25 ? new THREE.Color(0x1f1a17) : new THREE.Color(0xeee6d6);
  // 표지 전체가 얼마나 화사한지: 밝은 바탕이거나 선명한 색이 넓으면 현대풍
  let vivid = 0; for (const e of list) { const I = info(e.c); if (I.s > 0.45 && I.l > 0.25 && I.l < 0.8) vivid += e.n; }
  const font = B.l > 0.62 || vivid / total > 0.3 || (B.s > 0.55 && B.l > 0.35) ? 'sans' : 'serif';
  return { bg: bg.clone(), ink: '#' + ink.getHexString(), font };
}
function cleanAuthor(a) { if (!a) return ''; const s = String(a).split(/[,;·/]|\s(?:지음|저|글|옮김|역|편)(?:\s|$)|\(/)[0].trim(); return s.length > 24 ? '' : s; }

// 글자를 [ya, yb] 사이에 가운데 맞춰 쓴다. 한글·한자가 있으면 세로로 한 글자씩, 아니면 책등을 따라 눕혀서(위에서 아래로 읽는다).
// dry: 그리지 않고 차지하는 길이만 돌려준다(못 쓰면 0). noCut: 말줄임표로 줄여야 하면 0.
function drawText(c, text, cx, ya, yb, Tm, { small = false, ink, inkShadow, fam = FONTS.serif, dry = false, noCut = false }) {
  const L = yb - ya; if (L < 6) return 0;
  const shadow = (fn) => { c.fillStyle = inkShadow; c.save(); c.translate(0.18, 0.22); fn(); c.restore(); c.fillStyle = ink; fn(); };
  if (CJK.test(text)) {
    const fmax = small ? Math.min(Tm * 0.42, 4.4) : Math.min(Tm * 0.6, 9.5), fmin = small ? 2.6 : 3.4;
    let chars = [...text.replace(/\s+/g, ' ')];
    const adv = (ch, f) => (ch === ' ' ? f * 0.45 : f * 1.06), total = (cs, f) => cs.reduce((s, ch) => s + adv(ch, f), 0);
    let f = Math.min(fmax, L / Math.max(1, total(chars, 1)));
    if (f < fmin) {
      if (small || noCut) return 0;
      f = fmin; while (chars.length > 1 && total(chars, f) + f * 1.06 > L) chars.pop(); while (chars.length && chars[chars.length - 1] === ' ') chars.pop(); chars.push('⋮');
    }
    if (f < 2) return 0;
    const len = total(chars, f); if (dry) return len;
    c.font = `${small ? 500 : 700} ${f}px ${fam.cjk}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    let y = ya + (L - len) / 2;
    for (const ch of chars) {
      const a = adv(ch, f), cy = y + a / 2;
      if (ch === '⋮') shadow(() => { for (const k of [-1, 0, 1]) { c.beginPath(); c.arc(cx, cy + k * f * 0.3, f * 0.08, 0, 7); c.fill(); } });
      else if (ch !== ' ') shadow(() => c.fillText(ch, cx, cy + f * 0.04));
      y += a;
    }
    return len;
  }
  // 영문: 글자 높이는 책 두께의 절반쯤
  const fmax = small ? Math.min(Tm * 0.36, 4.2) : Math.min(Tm * 0.52, 8.5), fmin = small ? 2.4 : 3.2;
  c.font = `${small ? 'italic 400' : 600} ${fmax}px ${fam.latin}`;
  let t = text, w = c.measureText(t).width, f = fmax;
  if (w > L) { f = (fmax * L) / w; if (f < fmin) { if (small || noCut) return 0; f = fmin; c.font = `600 ${f}px ${fam.latin}`; while (t.length > 1 && c.measureText(t + '…').width > L) t = t.slice(0, -1); t = t.trimEnd() + '…'; } }
  c.font = `${small ? 'italic 400' : 600} ${f}px ${fam.latin}`; w = Math.min(L, c.measureText(t).width);
  if (dry) return w;
  c.save(); c.translate(cx, ya + (L - w) / 2); c.rotate(Math.PI / 2); c.textAlign = 'left'; c.textBaseline = 'middle';
  shadow(() => c.fillText(t, 0, f * 0.04)); c.restore();
  return w;
}

// ---- 개발용 가짜 서재(주소 옵션 shelfdemo): 분량이 서로 다른 한글·영문 책. 저장소에는 넣지 않는다
const DEMO_BOOKS = [
  ['어린 왕자', '앙투안 드 생텍쥐페리', 120], ['데미안', '헤르만 헤세', 230], ['노인과 바다', '어니스트 헤밍웨이', 140], ['죄와 벌', '표도르 도스토옙스키', 820],
  ['Pride and Prejudice', 'Jane Austen', 430], ['Moby-Dick; or, The Whale', 'Herman Melville', 720], ['The Great Gatsby', 'F. Scott Fitzgerald', 210], ['Walden', 'Henry David Thoreau', 350],
  ['변신', '프란츠 카프카', 96], ['이방인', '알베르 카뮈', 180], ['안나 카레니나', '레프 톨스토이', 1300], ['Frankenstein', 'Mary Shelley', 280],
  ['진달래꽃', '김소월', 64], ['무정', '이광수', 420], ['The Adventures of Sherlock Holmes', 'Arthur Conan Doyle', 390], ['월든: 숲속의 생활', '헨리 데이비드 소로', 400],
  ['War and Peace', 'Leo Tolstoy', 1400], ['폭풍의 언덕', '에밀리 브론테', 520], ['A Tale of Two Cities', 'Charles Dickens', 480], ['오만과 편견', '제인 오스틴', 510],
  ['Les Misérables, Volume One: Fantine', 'Victor Hugo', 610], ['논어', '', 300], ['The Count of Monte Cristo', 'Alexandre Dumas', 1250], ['하늘과 바람과 별과 시', '윤동주', 150],
  ['Little Women', 'Louisa May Alcott', 560], ['메밀꽃 필 무렵 외 단편선', '이효석', 260], ['Dracula', 'Bram Stoker', 420], ['국가', '플라톤', 640],
];
export function demoLibrary(n) {
  const out = [], hues = [8, 22, 38, 95, 150, 200, 222, 265, 330];
  for (let i = 0; i < n; i++) {
    const [t, a, pg] = DEMO_BOOKS[i % DEMO_BOOKS.length], vol = Math.floor(i / DEMO_BOOKS.length), title = vol ? `${t} ${vol + 1}` : t, h = hashStr(title);
    out.push({ id: 'demo:' + i, title, author: a, format: 'epub', pages: Math.round(pg * (0.8 + ((h >>> 3) % 40) / 100)), addedAt: 1 + i, color: `hsl(${hues[h % hues.length]} ${32 + ((h >> 4) % 22)}% ${20 + ((h >> 9) % 10)}%)`, cover: i % 3 === 0 ? demoCover(title, a, h) : null });
  }
  return out;
}
// 가짜 표지 그림: 밝은 현대풍(고딕 글씨)과 짙은 고전풍(금색 글씨)을 섞는다
function demoCover(title, author, h) {
  const cv = document.createElement('canvas'); cv.width = 200; cv.height = 300; const c = cv.getContext('2d');
  const modern = h % 2 === 0, pal = modern ? [['#f2e9d8', '#c2412d'], ['#e8c547', '#1d2b4f'], ['#9fd3c7', '#22313f'], ['#f7f4ee', '#2a6f97']][h % 4] : [['#1f2a3a', '#d9b45a'], ['#3b1d1a', '#e7d3a1'], ['#14382f', '#e9e2c8']][h % 3];
  c.fillStyle = pal[0]; c.fillRect(0, 0, 200, 300);
  c.fillStyle = pal[1]; c.globalAlpha = 0.85; if (modern) { c.beginPath(); c.arc(100, 175, 52, 0, 7); c.fill(); } else { c.lineWidth = 3; c.strokeStyle = pal[1]; c.strokeRect(14, 14, 172, 272); } c.globalAlpha = 1;
  c.textAlign = 'center'; c.font = `${modern ? 800 : 700} 22px ${modern ? SANS : SERIF}`; c.fillText(title.slice(0, 12), 100, 70); c.font = `15px ${modern ? SANS : SERIF}`; c.fillText(author || '', 100, 270);
  return cv.toDataURL('image/jpeg', 0.85);
}
