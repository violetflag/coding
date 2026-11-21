// 조판: 문단 블록을 쪽으로 나눈다 (Canvas2D로 글자 폭을 재서 줄바꿈·양쪽 맞춤·쪽 나눔을 직접 한다).
// 한글은 글자 단위로 줄을 바꾸되 금칙(줄 처음에 닫는 문장부호, 줄 끝에 여는 문장부호를 두지 않음)을 지킨다.
// 범위: 글 위주의 책. 표·수식·세로쓰기·복잡한 CSS는 다루지 않는다.
export const PAGE = { w: 1024, h: 1536 };           // 한 쪽의 텍스처 크기(px). 실제 크기는 14 × 21 cm
export const FONTS = {
  myeongjo: { name: '명조', css: '"Noto Serif KR", "Nanum Myeongjo", "KoPubWorldBatang", "Batang", "AppleMyungjo", "Source Han Serif K", serif' },
  gothic: { name: '고딕', css: '"Noto Sans KR", "Pretendard", "Malgun Gothic", "Apple SD Gothic Neo", "Nanum Gothic", sans-serif' },
  serif: { name: '영문 세리프', css: 'Georgia, "Iowan Old Style", "Palatino Linotype", "Noto Serif KR", "Batang", serif' },
};
export const DEFAULT_TYPE = { font: 'myeongjo', size: 34, line: 1.75, para: 0.25, margin: 104, justify: true, indent: true };
export const TYPE_LIMITS = { size: [22, 68, 1], line: [1.2, 2.4, 0.05], para: [0, 1.5, 0.05], margin: [48, 200, 4] };

const CJK = /[ᄀ-ᇿ⺀-〿぀-ヿ㄰-㆏㐀-鿿가-힯豈-﫿＀-￯]/;
const NO_START = /^[,.!?:;)\]}'"’”」』〉》、。…·%‥〕】~\-–—]/, NO_END = /[(\[{‘“「『〈《〔【]$/;

const mc = document.createElement('canvas').getContext('2d'), wcache = new Map();
function width(font, text) {
  let m = wcache.get(font); if (!m) { m = new Map(); wcache.set(font, m); }
  let w = m.get(text);
  if (w === undefined) { if (mc.font !== font) mc.font = font; w = mc.measureText(text).width; if (m.size < 60000) m.set(text, w); }
  return w;
}
export const fontOf = (T, size, b, i) => `${i ? 'italic ' : ''}${b ? '700 ' : '400 '}${size}px ${FONTS[T.font]?.css || FONTS.myeongjo.css}`;

// 블록 → 원자(낱말, 한글 한 글자, 공백, 강제 줄바꿈)
function atomize(block, T, size, bold) {
  const out = []; let g = block.g0;
  for (const r of block.runs) {
    const font = fontOf(T, size, bold || r.b, r.i), s = r.text; let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (ch === '\n') { out.push({ br: true, g, n: 1 }); i++; g++; continue; }
      if (ch === ' ' || ch === ' ' || ch === '\t') { out.push({ t: ' ', w: width(font, ' '), font, g, n: 1, space: true }); i++; g++; continue; }
      let j = i + 1;
      if (!CJK.test(ch)) { while (j < s.length && !/\s/.test(s[j]) && !CJK.test(s[j])) j++; }
      else if (ch >= '\ud800' && ch <= '\udbff') j++;
      const t = s.slice(i, j); out.push({ t, w: width(font, t), font, g, n: j - i, cjk: j - i === 1 && CJK.test(ch) });
      g += j - i; i = j;
    }
  }
  return out;
}

// 원자들을 폭 maxW의 줄들로 나눈다. firstIndent = 첫 줄 들여쓰기
function breakLines(atoms, maxW, firstIndent, T, font0) {
  const lines = []; let cur = [], w = 0, indent = firstIndent;
  const push = (last) => { while (cur.length && cur[cur.length - 1].space) w -= cur.pop().w; if (cur.length || last) lines.push({ atoms: cur, w, indent, last }); cur = []; w = 0; indent = 0; };
  for (let k = 0; k < atoms.length; k++) {
    let a = atoms[k];
    if (a.br) { push(true); continue; }
    if (a.space && !cur.length) continue;                                  // 줄 처음의 공백은 버린다
    if (w + a.w > maxW - indent + 0.5 && cur.length && !a.space) {
      // 금칙: 닫는 부호로 줄을 시작하지 않도록 앞 글자를 함께 내린다. 여는 부호로 줄이 끝나지 않게 한다.
      const carry = [];
      if (NO_START.test(a.t)) { let guard = 0; while (cur.length > 1 && guard++ < 3) { const p = cur.pop(); w -= p.w; carry.unshift(p); if (!p.space && !NO_START.test(p.t)) break; } }
      while (cur.length > 1 && NO_END.test(cur[cur.length - 1].t)) { const p = cur.pop(); w -= p.w; carry.unshift(p); }
      push(false);
      for (const c of carry) if (!(c.space && !cur.length)) { cur.push(c); w += c.w; }
    }
    if (a.w > maxW - indent && !a.space) {                                 // 줄보다 긴 낱말은 글자 단위로 자른다
      let g = a.g;
      for (const ch of a.t) { const cw = width(a.font, ch); if (w + cw > maxW - indent && cur.length) push(false); cur.push({ t: ch, w: cw, font: a.font, g, n: ch.length }); w += cw; g += ch.length; }
      continue;
    }
    cur.push(a); w += a.w;
  }
  push(true);
  return lines;
}

// 줄 안의 원자에 x를 매긴다 (정렬·양쪽 맞춤)
function place(line, x0, maxW, align, justify) {
  const free = maxW - line.indent - line.w; let x = x0 + line.indent, gapS = 0, gapC = 0;
  if (align === 'center') x = x0 + (maxW - line.w) / 2;
  else if (align === 'right') x = x0 + maxW - line.w;
  else if (justify && !line.last && free > 0 && free < maxW * 0.35) {
    const spaces = line.atoms.filter((a) => a.space).length, joints = line.atoms.length - 1;
    // 공백에 먼저 나눠 주고, 공백이 없거나 너무 벌어지면 글자 사이에도 나눈다
    const sizeHint = line.atoms[0] ? parseFloat(line.atoms[0].font.match(/([\d.]+)px/)[1]) : 30;
    if (spaces && free / spaces < sizeHint * 0.45) gapS = free / spaces;
    else if (joints > 0) { gapS = spaces ? sizeHint * 0.3 : 0; gapC = (free - gapS * spaces) / joints; gapS += gapC; }
  }
  for (const a of line.atoms) { a.x = x; x += a.w + (a.space ? gapS - gapC : 0) + gapC; }
}

// 책 전체를 쪽으로 나눈다. onProgress(0…1). 반환: { pages, pageOf(g) }
export async function paginate(book, T, onProgress) {
  const pages = [], M = T.margin, cw = PAGE.w - M * 2, top = M * 1.05, bottom = PAGE.h - M * 1.25, lh = T.size * T.line;
  let page = null, y = 0;
  const newPage = (chapter) => { page = { lines: [], imgs: [], chapter, g0: -1, g1: 0, index: pages.length }; pages.push(page); y = top; };
  const mark = (g0, g1) => { if (page.g0 < 0) page.g0 = g0; page.g1 = Math.max(page.g1, g1); };
  let tick = performance.now();
  for (let c = 0; c < book.chapters.length; c++) {
    const ch = book.chapters[c]; newPage(c); let firstBlock = true, prevType = '';
    for (const b of ch.blocks) {
      if (b.type === 'img') {
        const im = book.images[b.src]; if (!im) continue;
        let w = Math.min(cw, im.width * 2), h = w * im.height / im.width; const maxH = (bottom - top) * 0.92;
        if (h > maxH) { h = maxH; w = h * im.width / im.height; }
        if (y + h > bottom && page.lines.length + page.imgs.length) newPage(c);
        page.imgs.push({ src: b.src, x: M + (cw - w) / 2, y, w, h }); mark(b.g0, b.g0 + 1); y += h + lh * 0.6; firstBlock = false; prevType = 'img'; continue;
      }
      if (b.type === 'hr') { if (y + lh * 2 > bottom) newPage(c); page.lines.push({ y: y + lh * 1.2, h: lh, orn: true, atoms: [], g0: b.g0, g1: b.g0 }); mark(b.g0, b.g0 + 1); y += lh * 2.2; prevType = 'hr'; continue; }
      const head = b.type[0] === 'h', scale = b.type === 'h1' ? 1.5 : b.type === 'h2' ? 1.28 : b.type === 'h3' ? 1.1 : 1, size = Math.round(T.size * scale), blh = size * (head ? 1.4 : T.line);
      const inset = b.type === 'quote' ? T.size * 1.6 : b.type === 'li' ? T.size * 1.2 : 0, mw = cw - inset * (b.type === 'quote' ? 2 : 1);
      const align = b.align || (head && b.type !== 'h3' ? 'center' : null);
      const indent = !head && T.indent && !b.noIndent && !align && b.type === 'p' && prevType !== 'h' && prevType !== 'hr' && !firstBlock ? T.size : 0;
      const atoms = atomize(b, T, size, head);
      const lines = breakLines(atoms, mw, indent, T);
      if (head) { if (firstBlock && b.type !== 'h3') y = top + (bottom - top) * 0.14; else y += blh * 0.9; if (y + blh * 3 > bottom) { newPage(c); } }
      else if (!firstBlock && prevType !== 'h') y += T.para * T.size;
      lines.forEach((ln, i) => {
        if (y + blh > bottom + 1) newPage(c);
        place(ln, M + inset, mw, align, T.justify && !head);
        const first = ln.atoms[0], lastA = ln.atoms[ln.atoms.length - 1];
        const L = { y: y + blh * 0.5 + size * 0.36, top: y, h: blh, size, atoms: ln.atoms, g0: first ? first.g : b.g0, g1: lastA ? lastA.g + lastA.n : b.g0, bullet: b.type === 'li' && i === 0 ? M + inset - T.size * 0.9 : 0, quote: b.type === 'quote' ? M + inset * 0.45 : 0 };
        page.lines.push(L); mark(L.g0, L.g1); y += blh;
      });
      if (head) y += blh * 0.7;
      firstBlock = false; prevType = head ? 'h' : b.type;
    }
    if (page.g0 < 0) { page.g0 = ch.g0; page.g1 = ch.g0; }
    if (performance.now() - tick > 24) { onProgress?.((c + 1) / book.chapters.length); await new Promise((r) => setTimeout(r)); tick = performance.now(); }
  }
  // 빈 쪽의 범위를 이웃과 잇는다
  for (let i = 0; i < pages.length; i++) if (pages[i].g1 < pages[i].g0) pages[i].g1 = pages[i].g0;
  const pageOf = (g) => { let lo = 0, hi = pages.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (pages[mid].g0 <= g) lo = mid; else hi = mid - 1; } return lo; };
  return { pages, pageOf };
}

// 쪽 위의 점(x, y) → 글자 순번 g (없으면 -1)
export function charAt(page, x, y, snap = true) {
  let best = null, bd = 1e9;
  for (const l of page.lines) { if (!l.atoms.length) continue; const d = y < l.top ? l.top - y : y > l.top + l.h ? y - l.top - l.h : 0; if (d < bd) { bd = d; best = l; } }
  if (!best || (!snap && bd > 0)) return -1;
  const A = best.atoms; if (x <= A[0].x) return A[0].g;
  for (const a of A) if (x < a.x + a.w) return a.g + Math.min(a.n - 1, Math.floor((x - a.x) / a.w * a.n));
  const l = A[A.length - 1]; return l.g + l.n - 1;
}
// g0…g1(끝 제외) 범위를 덮는 줄별 사각형
export function rectsFor(page, g0, g1) {
  const out = [];
  for (const l of page.lines) {
    if (l.g1 <= g0 || l.g0 >= g1 || !l.atoms.length) continue;
    let x0 = null, x1 = null;
    for (const a of l.atoms) {
      if (a.g + a.n <= g0 || a.g >= g1) continue;
      const s = Math.max(0, g0 - a.g) / a.n, e = Math.min(a.n, g1 - a.g) / a.n;
      if (x0 === null) x0 = a.x + a.w * s; x1 = a.x + a.w * e;
    }
    if (x0 !== null) out.push({ x: x0, y: l.top, w: x1 - x0, h: l.h, base: l.y, size: l.size });
  }
  return out;
}
// 쪽의 글(검색·낭독용)
export const pageText = (book, page) => textRange(book, page.g0, page.g1);
export function textRange(book, g0, g1) {
  let out = '';
  for (const ch of book.chapters) { if (ch.g1 <= g0 || ch.g0 >= g1) continue; for (const b of ch.blocks) { const e = b.g0 + b.text.length + 1; if (e <= g0 || b.g0 >= g1) continue; out += (b.text + '\n').slice(Math.max(0, g0 - b.g0), Math.min(b.text.length + 1, g1 - b.g0)); } }
  return out;
}
