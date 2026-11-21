// PDF 읽기 (pdf.js). PDF는 조판을 다시 하지 않고 원래 쪽 모양 그대로 종이 위에 올린다.
// 위치 g는 쪽 번호(0부터)다. 밑줄·메모는 지원하지 않고, 북마크·검색·이동·진행률은 지원한다.
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PAGE } from './typeset.js';
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function parsePdf(buf, name = '') {
  const head = new Uint8Array(buf.slice(0, 65536)), h = new Uint8Array(await crypto.subtle.digest('SHA-1', head));
  const id = [...h.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('') + '-' + buf.byteLength.toString(36);
  let doc;
  try { doc = await pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise; } catch (e) { throw new Error(e?.name === 'PasswordException' ? '암호가 걸린 PDF는 열 수 없습니다' : 'PDF를 열 수 없습니다'); }
  const info = (await doc.getMetadata().catch(() => null))?.info || {}, n = doc.numPages;
  const toc = [];
  try {
    const walk = async (items, depth) => { for (const it of items || []) { let dest = it.dest; if (typeof dest === 'string') dest = await doc.getDestination(dest); if (dest?.[0]) { const p = await doc.getPageIndex(dest[0]).catch(() => -1); if (p >= 0) toc.push({ title: it.title, g: p, depth }); } await walk(it.items, depth + 1); } };
    await walk(await doc.getOutline(), 0);
  } catch { /* 목차 없음 */ }
  const cache = new Map(), texts = new Map();
  const book = {
    id, format: 'pdf', title: info.Title || name.replace(/\.pdf$/i, ''), author: info.Author || '', cover: null, chapters: [{ title: '', blocks: [], g0: 0, g1: n }], toc, images: {}, length: n, numPages: n,
    // 쪽 그림 (최근 8쪽만 기억)
    async pageImage(i) {
      if (cache.has(i)) return cache.get(i);
      const page = await doc.getPage(i + 1), vp0 = page.getViewport({ scale: 1 }), scale = Math.min((PAGE.w - 40) / vp0.width, (PAGE.h - 60) / vp0.height) * 1.5, vp = page.getViewport({ scale });
      const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
      await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      cache.set(i, cv); if (cache.size > 8) cache.delete(cache.keys().next().value);
      return cv;
    },
    async pageText(i) {
      if (texts.has(i)) return texts.get(i);
      const t = (await (await doc.getPage(i + 1)).getTextContent()).items.map((x) => x.str + (x.hasEOL ? '\n' : '')).join(' ').replace(/[ \t]+/g, ' ');
      texts.set(i, t); return t;
    },
  };
  // 표지: 첫 쪽
  try { const c = await book.pageImage(0); book.cover = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8)); } catch { /* 표지 없음 */ }
  return book;
}
