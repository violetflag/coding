// 한 쪽을 캔버스에 그린다: 종이(색·결·얼룩), 글, 밑줄(연필·색연필 질감), 여백 메모, 쪽 번호, 접은 모서리.
import { PAGE, rectsFor, fontOf } from './typeset.js';
import { rng } from '../scene/textures.js';

export const PAPERS = { white: { name: '흰색', c: '#f4f1ea', ink: '#17130f' }, cream: { name: '미색', c: '#ece2cb', ink: '#1c1612' }, old: { name: '오래된 누런 종이', c: '#d9c493', ink: '#2a1e12' } };
export const PENS = {
  pencil: { name: '연필', c: '#3a3a3c', line: true }, yellow: { name: '노랑 색연필', c: '#e3b92e' }, pink: { name: '분홍 색연필', c: '#de6f86' }, blue: { name: '파랑 색연필', c: '#5f97d6' }, green: { name: '초록 색연필', c: '#74a84f' },
};
const HAND = '"Nanum Pen Script", "Gaegu", "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';

// 종이 결: 한 번 만들어 무늬로 쓴다
let grainPat = null;
function grain(c) {
  if (grainPat) return grainPat;
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const x = cv.getContext('2d'), img = x.createImageData(256, 256), r = rng(9);
  for (let i = 0; i < img.data.length; i += 4) { const fib = (i / 4) % 256, v = 128 + (r() - 0.5) * 90 + 14 * Math.sin(fib * 0.9 + r() * 2); img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  x.putImageData(img, 0, 0);
  // 긴 섬유 몇 가닥
  x.strokeStyle = 'rgba(90,80,60,.35)'; x.lineWidth = 0.6; for (let i = 0; i < 40; i++) { const px = r() * 256, py = r() * 256, a = r() * 6.28, l = 6 + r() * 16; x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + Math.cos(a) * l * 0.5 + (r() - 0.5) * 6, py + Math.sin(a) * l * 0.5, px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); }
  return (grainPat = c.createPattern(cv, 'repeat'));
}

// 색연필 칠: 줄 사각형 안에 비스듬한 선을 여러 번 긋는다
function crayon(c, rc, color, seed) {
  const r = rng(seed), y0 = rc.base - rc.size * 0.86, h = rc.size * 1.08;
  c.save(); c.beginPath(); c.rect(rc.x - 3, y0 - 2, rc.w + 6, h + 4); c.clip();
  c.globalCompositeOperation = 'multiply'; c.strokeStyle = color; c.lineCap = 'round';
  c.globalAlpha = 0.28; c.fillStyle = color; c.fillRect(rc.x - 1, y0 + 2, rc.w + 2, h - 4);
  for (let x = rc.x - h; x < rc.x + rc.w + 4; x += 3.2) { c.globalAlpha = 0.16 + r() * 0.26; c.lineWidth = 2 + r() * 2.6; c.beginPath(); c.moveTo(x + r() * 2, y0 + h + r() * 3); c.lineTo(x + h * 0.55 + r() * 3, y0 - r() * 3); c.stroke(); }
  c.restore();
}
function pencilLine(c, rc, color, seed) {
  const r = rng(seed), y = rc.base + rc.size * 0.2;
  c.save(); c.strokeStyle = color; c.lineCap = 'round';
  for (let k = 0; k < 2; k++) { c.globalAlpha = 0.5 + r() * 0.25; c.lineWidth = 1.3 + r() * 0.8; c.beginPath(); c.moveTo(rc.x - 2, y + (r() - 0.5) * 2); for (let x = rc.x; x <= rc.x + rc.w; x += 14) c.lineTo(x + 14, y + (r() - 0.5) * 2.4); c.stroke(); }
  c.restore();
}

// o: { book, page, side: 'L'|'R', T, paper, grainAmt, old, highlights, selection, tts, hits, total, bookmarked, single, pdfImage }
export function drawPage(cv, o) {
  const c = cv.getContext('2d'), W = PAGE.w, H = PAGE.h, P = PAPERS[o.old ? 'old' : o.paper] || PAPERS.cream, page = o.page, idx = page ? page.index : 0;
  c.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  c.fillStyle = P.c; c.fillRect(0, 0, W, H);
  // 종이 결
  c.save(); c.globalCompositeOperation = 'multiply'; c.globalAlpha = 0.22 * (o.grainAmt ?? 0.6) + (o.old ? 0.12 : 0); c.fillStyle = grain(c); c.translate((idx * 37) % 256, (idx * 91) % 256); c.fillRect(-256, -256, W + 512, H + 512); c.restore();
  if (o.old) {
    // 헌 책: 가장자리 변색, 얼룩(foxing), 닳은 모서리
    const r = rng(1000 + idx);
    const eg = c.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.72); eg.addColorStop(0, 'rgba(120,80,30,0)'); eg.addColorStop(1, 'rgba(110,70,25,.34)'); c.fillStyle = eg; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 16; i++) { const x = r() * W, y = r() * H, s = 4 + r() * r() * 26, g = c.createRadialGradient(x, y, 0, x, y, s); g.addColorStop(0, `rgba(130,82,30,${0.1 + r() * 0.18})`); g.addColorStop(1, 'rgba(130,82,30,0)'); c.fillStyle = g; c.fillRect(x - s, y - s, s * 2, s * 2); }
    const outer = o.side === 'L' ? 0 : W; c.fillStyle = 'rgba(70,45,20,.28)';
    for (const y of [0, H]) { const s = 30 + r() * 40; c.beginPath(); c.moveTo(outer, y); c.lineTo(outer + (o.side === 'L' ? s : -s), y); c.quadraticCurveTo(outer + (o.side === 'L' ? s * 0.3 : -s * 0.3), y + (y ? -s * 0.3 : s * 0.3), outer, y + (y ? -s : s)); c.fill(); }
  }
  // 책등 쪽 그늘
  const gx = o.side === 'L' ? W : 0, gg = c.createLinearGradient(gx, 0, gx + (o.side === 'L' ? -110 : 110), 0); gg.addColorStop(0, 'rgba(40,25,10,.3)'); gg.addColorStop(0.35, 'rgba(40,25,10,.09)'); gg.addColorStop(1, 'rgba(40,25,10,0)'); c.fillStyle = gg; c.fillRect(o.side === 'L' ? W - 110 : 0, 0, 110, H);
  if (!page) return;

  if (o.pdfImage) {                                                        // PDF: 쪽 그림을 종이 위에 맞춰 놓는다
    const im = o.pdfImage, k = Math.min((W - 40) / im.width, (H - 60) / im.height), w = im.width * k, h = im.height * k;
    c.save(); c.globalCompositeOperation = 'multiply'; c.drawImage(im, (W - w) / 2, (H - h) / 2, w, h); c.restore();
  } else {
    // 밑줄 (글자 아래에 깐다)
    for (const hl of o.highlights || []) { if (hl.end <= page.g0 || hl.start >= page.g1) continue; const pen = PENS[hl.color] || PENS.yellow; rectsFor(page, hl.start, hl.end).forEach((rc, i) => (pen.line ? pencilLine : crayon)(c, rc, pen.c, hl.start * 7 + i)); }
    const tint = (range, color) => { if (!range) return; c.fillStyle = color; for (const rc of rectsFor(page, range[0], range[1])) c.fillRect(rc.x - 2, rc.base - rc.size * 0.9, rc.w + 4, rc.size * 1.2); };
    for (const h of o.hits || []) tint(h, 'rgba(230,140,40,.38)');
    tint(o.tts, 'rgba(210,150,60,.24)'); tint(o.selection, 'rgba(70,110,190,.3)');
    // 그림
    for (const im of page.imgs) { const b = o.book.images[im.src]; if (b) { c.save(); c.globalCompositeOperation = 'multiply'; c.drawImage(b, im.x, im.y, im.w, im.h); c.restore(); } }
    // 글
    c.fillStyle = P.ink; c.textBaseline = 'alphabetic'; let font = '';
    for (const l of page.lines) {
      if (l.orn) { c.font = fontOf(o.T, o.T.size, false, false); font = ''; c.textAlign = 'center'; c.fillText('⁂', W / 2, l.y); c.textAlign = 'left'; continue; }
      if (l.bullet) { c.font = fontOf(o.T, l.size, false, false); font = ''; c.fillText('•', l.bullet, l.y); }
      if (l.quote) { c.fillStyle = 'rgba(90,70,50,.35)'; c.fillRect(l.quote, l.top + 2, 3, l.h - 4); c.fillStyle = P.ink; }
      for (const a of l.atoms) { if (a.space) continue; if (a.font !== font) { font = a.font; c.font = font; } c.fillText(a.t, a.x, l.y); }
    }
    // 여백 메모 (손글씨체)
    c.font = `26px ${HAND}`; c.fillStyle = '#34435e';
    const mw = o.T.margin - 16, mx = o.side === 'L' ? 8 : W - o.T.margin + 8;
    for (const hl of o.highlights || []) {
      if (!hl.note || hl.start < page.g0 || hl.start >= page.g1) continue;
      const rc = rectsFor(page, hl.start, hl.start + 1)[0]; if (!rc) continue;
      let y = rc.base - 4, line = '', n = 0;
      c.save(); c.strokeStyle = '#34435e'; c.globalAlpha = 0.7; c.lineWidth = 1.5; c.beginPath(); c.moveTo(o.side === 'L' ? mw + 10 : W - mw - 10, rc.top + 4); c.lineTo(o.side === 'L' ? mw + 10 : W - mw - 10, rc.top + rc.h - 4); c.stroke(); c.restore();
      for (const ch of hl.note) { if (c.measureText(line + ch).width > mw) { c.fillText(n === 3 ? line.slice(0, -1) + '…' : line, mx, y); y += 26; line = ''; if (++n > 3) break; } line += ch; }
      if (n <= 3 && line) c.fillText(line, mx, y);
    }
  }
  // 머리글과 쪽 번호
  c.fillStyle = P.ink; c.globalAlpha = 0.5; c.font = `22px ${fontOf(o.T, 22).split('px ')[1]}`; c.textAlign = 'center';
  const head = o.side === 'L' ? o.book.title : (o.book.chapters?.[page.chapter]?.title || '');
  if (head && !(page.lines[0] && page.lines[0].size > o.T.size)) c.fillText(head.length > 30 ? head.slice(0, 29) + '…' : head, W / 2, o.T.margin * 0.55);
  c.fillText(String(idx + 1), W / 2, H - o.T.margin * 0.5); c.globalAlpha = 1; c.textAlign = 'left';
  // 북마크: 바깥 위 모서리를 접는다
  if (o.bookmarked) {
    const s = 92, x0 = o.side === 'L' ? 0 : W, d = o.side === 'L' ? 1 : -1;
    c.fillStyle = '#120c08'; c.beginPath(); c.moveTo(x0, 0); c.lineTo(x0 + d * s, 0); c.lineTo(x0, s); c.fill();           // 접혀서 비는 자리(어두운 배경)
    const g = c.createLinearGradient(x0 + d * s, 0, x0 + d * s * 0.5, s * 0.5); g.addColorStop(0, '#b9a67c'); g.addColorStop(1, '#e6dbc0'); c.fillStyle = g;
    c.beginPath(); c.moveTo(x0 + d * s, 0); c.lineTo(x0 + d * s, s); c.lineTo(x0, s); c.fill();
    c.strokeStyle = 'rgba(40,25,10,.4)'; c.lineWidth = 2; c.beginPath(); c.moveTo(x0 + d * s, 0); c.lineTo(x0, s); c.stroke();
  }
}

// 표지: EPUB 표지 그림이 있으면 그것을, 없으면 제목으로 만든 천 장정 표지를 그린다
export function drawCover(cv, book, color = '#5b2a22', bitmap = null) {
  const c = cv.getContext('2d'), W = cv.width, H = cv.height;
  c.fillStyle = color; c.fillRect(0, 0, W, H);
  if (bitmap) { const k = Math.max(W / bitmap.width, H / bitmap.height); c.drawImage(bitmap, (W - bitmap.width * k) / 2, (H - bitmap.height * k) / 2, bitmap.width * k, bitmap.height * k); return; }
  c.strokeStyle = '#d8b25a'; c.lineWidth = W * 0.008; c.strokeRect(W * 0.06, H * 0.045, W * 0.88, H * 0.91); c.lineWidth = W * 0.003; c.strokeRect(W * 0.08, H * 0.06, W * 0.84, H * 0.88);
  c.fillStyle = '#e2c074'; c.textAlign = 'center'; c.font = `700 ${W * 0.085}px "Noto Serif KR", "Batang", serif`;
  const words = (book.title || '제목 없음').split(/\s+/); let line = '', y = H * 0.3;
  for (const w of words) { if (c.measureText(line + ' ' + w).width > W * 0.72 && line) { c.fillText(line, W / 2, y); y += W * 0.11; line = w; } else line = line ? line + ' ' + w : w; }
  c.fillText(line, W / 2, y);
  c.font = `${W * 0.05}px "Noto Serif KR", "Batang", serif`; if (book.author) c.fillText(book.author, W / 2, H * 0.82);
}

// 제목에서 책 색을 정한다 (같은 책은 늘 같은 색)
export function colorFor(title) {
  let h = 0; for (const ch of title || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hues = [8, 22, 38, 95, 150, 200, 222, 265, 330]; const hue = hues[h % hues.length], sat = 32 + (h >> 4) % 22, lig = 20 + (h >> 9) % 10;
  return `hsl(${hue} ${sat}% ${lig}%)`;
}
