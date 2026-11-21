// 책 파일 읽기: EPUB(2/3)과 TXT를 "장 → 문단 블록" 구조로 바꾼다. DRM이 걸린 파일은 열 수 없다.
// 결과: { title, author, cover(Blob|null), chapters: [{ title, blocks: [{ type, runs: [{ text, b, i }], align, text, g0 }], g0 }], toc: [{ title, chapter, block, depth }], length }
// 위치는 책 전체에서의 글자 순번(g) 하나로 나타낸다: 글자 크기를 바꿔 쪽이 달라져도 북마크·밑줄이 유지된다.
import { unzipSync, strFromU8 } from 'fflate';

const BLOCK = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'li', 'pre', 'section', 'article', 'body', 'ul', 'ol', 'dl', 'dt', 'dd', 'figure', 'figcaption', 'table', 'tr', 'td', 'th', 'tbody', 'thead', 'header', 'footer', 'aside', 'center', 'main', 'address']);
const SKIP = new Set(['script', 'style', 'head', 'title', 'meta', 'link', 'audio', 'video', 'iframe', 'object', 'math']);
const resolve = (base, rel) => {
  rel = decodeURIComponent(rel.split('#')[0]); if (rel.startsWith('/')) return rel.slice(1);
  const out = base.split('/').slice(0, -1);
  for (const p of rel.split('/')) { if (p === '..') out.pop(); else if (p !== '.' && p !== '') out.push(p); }
  return out.join('/');
};
const xml = (s, type = 'application/xhtml+xml') => { let d = new DOMParser().parseFromString(s, type); if (d.querySelector('parsererror')) d = new DOMParser().parseFromString(s, 'text/html'); return d; };
const first = (root, name) => [...root.getElementsByTagName('*')].find((e) => e.localName === name);
const allOf = (root, name) => [...root.getElementsByTagName('*')].filter((e) => e.localName === name);

// 스타일시트에서 클래스별 기울임·굵게·정렬만 뽑는다 (그 밖의 CSS는 쓰지 않는다)
function parseCss(text, map) {
  for (const m of text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const st = {}, body = m[2];
    if (/font-style\s*:\s*(italic|oblique)/i.test(body)) st.i = true;
    if (/font-weight\s*:\s*(bold|[6-9]00)/i.test(body)) st.b = true;
    const al = body.match(/text-align\s*:\s*(center|right|left|justify)/i); if (al) st.align = al[1].toLowerCase();
    if (/text-indent\s*:\s*0/i.test(body)) st.noIndent = true;
    if (/display\s*:\s*none/i.test(body)) st.hidden = true;
    if (!Object.keys(st).length) continue;
    for (const sel of m[1].split(',')) { const c = sel.trim().match(/^(?:[a-z0-9]+)?\.([\w-]+)$/i); if (c) map[c[1]] = { ...map[c[1]], ...st }; }
  }
}

function chapterBlocks(doc, css, path, files, images) {
  const blocks = [], ids = {}; let cur = null, pendingIds = [];
  const start = (type, align, noIndent) => { cur = { type, runs: [], align, noIndent }; };
  const flush = () => {
    if (cur) {
      let t = cur.runs.map((r) => r.text).join('');
      if (t.trim()) {
        // 앞뒤 공백 정리
        cur.runs[0].text = cur.runs[0].text.replace(/^[\s ]+/, ''); const l = cur.runs[cur.runs.length - 1]; l.text = l.text.replace(/\s+$/, '');
        cur.runs = cur.runs.filter((r) => r.text); cur.text = cur.runs.map((r) => r.text).join('');
        for (const id of pendingIds) ids[id] = blocks.length; pendingIds = []; blocks.push(cur);
      }
    }
    cur = null;
  };
  const add = (text, st) => {
    if (!cur) start('p', st.align, st.noIndent);
    const last = cur.runs[cur.runs.length - 1];
    if ((!last || /\s$/.test(last.text)) && /^\s/.test(text)) text = text.replace(/^\s+/, '');
    if (!text) return;
    if (last && !!last.b === !!st.b && !!last.i === !!st.i) last.text += text; else cur.runs.push({ text, b: st.b, i: st.i });
  };
  const walk = (node, st) => {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { add(st.pre ? n.nodeValue : n.nodeValue.replace(/\s+/g, ' '), st); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.localName.toLowerCase(); if (SKIP.has(tag)) continue;
      let s = st;
      for (const c of (n.getAttribute('class') || '').split(/\s+/)) if (css[c]) s = { ...s, ...css[c] };
      const inl = n.getAttribute('style') || '';
      if (/italic/.test(inl)) s = { ...s, i: true }; if (/bold/.test(inl)) s = { ...s, b: true };
      const al = inl.match(/text-align\s*:\s*(center|right|left|justify)/); if (al) s = { ...s, align: al[1] };
      if (s.hidden) continue;
      const id = n.getAttribute('id'); if (id) pendingIds.push(id);
      if (tag === 'img' || tag === 'image') {
        const src = n.getAttribute('src') || n.getAttribute('xlink:href') || n.getAttribute('href');
        const key = src && resolve(path, src);
        if (key && files[key]) { if (cur && cur.runs.length) flush(); else cur = null; for (const i of pendingIds) ids[i] = blocks.length; pendingIds = []; blocks.push({ type: 'img', src: key, runs: [], text: '' }); images.add(key); }
        continue;
      }
      if (tag === 'br') { if (cur) add('\n', { ...s, pre: true }); continue; }
      if (tag === 'hr') { flush(); blocks.push({ type: 'hr', runs: [], text: '' }); continue; }
      if (tag === 'b' || tag === 'strong') s = { ...s, b: true };
      if (tag === 'i' || tag === 'em' || tag === 'cite') s = { ...s, i: true };
      if (tag === 'sup' || tag === 'sub') s = { ...s, small: true };
      if (BLOCK.has(tag)) {
        flush();
        const type = /^h[1-6]$/.test(tag) ? 'h' + Math.min(3, +tag[1]) : tag === 'blockquote' ? 'quote' : tag === 'li' ? 'li' : st.block === 'quote' ? 'quote' : 'p';
        const bs = { ...s, block: type === 'p' ? st.block : type, pre: tag === 'pre' || s.pre };
        if (type !== 'p' || tag === 'p' || tag === 'li' || tag === 'pre' || tag === 'td' || tag === 'th' || tag === 'dt' || tag === 'dd' || tag === 'figcaption') start(type === 'p' && st.block ? st.block : type, s.align, s.noIndent);
        walk(n, bs); flush();
      } else walk(n, s);
    }
  };
  walk(doc.body || doc.documentElement, {});
  flush();
  return { blocks, ids };
}

async function bookId(buf, name) {
  const head = new Uint8Array(buf.slice(0, 65536)), h = new Uint8Array(await crypto.subtle.digest('SHA-1', head));
  return [...h.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('') + '-' + buf.byteLength.toString(36);
}

function finish(book) {
  let g = 0;
  for (const ch of book.chapters) { ch.g0 = g; for (const b of ch.blocks) { b.g0 = g; g += b.text.length + 1; } ch.g1 = g; }
  book.length = Math.max(1, g);
  return book;
}

export async function parseEpub(buf, name = '') {
  let files;
  try { files = unzipSync(new Uint8Array(buf)); } catch { throw new Error('EPUB 파일을 풀 수 없습니다 (손상되었거나 EPUB이 아님)'); }
  if (files['META-INF/encryption.xml'] && /EncryptedData/.test(strFromU8(files['META-INF/encryption.xml'])) && !/font/i.test(strFromU8(files['META-INF/encryption.xml']))) throw new Error('DRM으로 잠긴 책은 열 수 없습니다');
  const text = (k) => { if (!files[k]) return null; let s = new TextDecoder('utf-8').decode(files[k]); if (s.charCodeAt(0) === 0xfeff) s = s.slice(1); return s; };
  const cont = text('META-INF/container.xml'); if (!cont) throw new Error('EPUB 구조를 찾을 수 없습니다');
  const opfPath = first(xml(cont, 'application/xml'), 'rootfile').getAttribute('full-path'), opf = xml(text(opfPath), 'application/xml');
  const meta = (n) => first(opf, n)?.textContent.trim() || '';
  const manifest = {}; for (const it of allOf(opf, 'item')) manifest[it.getAttribute('id')] = { href: resolve(opfPath, it.getAttribute('href')), type: it.getAttribute('media-type') || '', props: it.getAttribute('properties') || '' };
  const css = {}; for (const it of Object.values(manifest)) if (/css/.test(it.type) && files[it.href]) parseCss(text(it.href), css);
  const spine = allOf(opf, 'itemref').filter((i) => i.getAttribute('linear') !== 'no').map((i) => manifest[i.getAttribute('idref')]).filter(Boolean);
  const images = new Set(), chapters = [], byPath = {};
  for (const it of spine) {
    const src = text(it.href); if (!src) continue;
    const doc = xml(src), { blocks, ids } = chapterBlocks(doc, css, it.href, files, images);
    if (!blocks.length) continue;
    byPath[it.href] = { index: chapters.length, ids };
    const h = blocks.find((b) => b.type[0] === 'h');
    chapters.push({ title: h?.text.slice(0, 80) || '', href: it.href, blocks });
  }
  if (!chapters.length) throw new Error('읽을 수 있는 본문이 없습니다');
  // 목차: EPUB3 nav 문서 → 없으면 NCX
  const toc = [], addToc = (title, href, depth) => {
    const [p, frag] = href.split('#'), c = byPath[p]; if (!c || !title) return;
    toc.push({ title: title.replace(/\s+/g, ' ').trim(), chapter: c.index, block: (frag && c.ids[frag]) || 0, depth });
  };
  const navItem = Object.values(manifest).find((i) => /\bnav\b/.test(i.props));
  if (navItem && text(navItem.href)) {
    const nav = xml(text(navItem.href)), root = allOf(nav, 'nav').find((n) => /toc/.test(n.getAttribute('epub:type') || n.getAttribute('type') || 'toc')) || nav;
    const rec = (ol, depth) => { for (const li of ol.children) { if (li.localName !== 'li') continue; const a = [...li.children].find((c) => c.localName === 'a'); if (a?.getAttribute('href')) addToc(a.textContent, resolve(navItem.href, a.getAttribute('href')) + (a.getAttribute('href').includes('#') ? '#' + a.getAttribute('href').split('#')[1] : ''), depth); const sub = [...li.children].find((c) => c.localName === 'ol'); if (sub) rec(sub, depth + 1); } };
    const ol = first(root, 'ol'); if (ol) rec(ol, 0);
  }
  if (!toc.length) {
    const ncx = Object.values(manifest).find((i) => /ncx/.test(i.type));
    if (ncx && text(ncx.href)) {
      const rec = (parent, depth) => { for (const np of parent.children) { if (np.localName !== 'navPoint') continue; const src = first(np, 'content')?.getAttribute('src'), label = first(np, 'text')?.textContent; if (src) addToc(label, resolve(ncx.href, src) + (src.includes('#') ? '#' + src.split('#')[1] : ''), depth); rec(np, depth + 1); } };
      const map = first(xml(text(ncx.href), 'application/xml'), 'navMap'); if (map) rec(map, 0);
    }
  }
  if (!toc.length) chapters.forEach((c, i) => c.title && toc.push({ title: c.title, chapter: i, block: 0, depth: 0 }));
  for (const t of toc) if (!chapters[t.chapter].title) chapters[t.chapter].title = t.title;
  // 표지
  const coverId = allOf(opf, 'meta').find((m) => m.getAttribute('name') === 'cover')?.getAttribute('content');
  const coverItem = Object.values(manifest).find((i) => /cover-image/.test(i.props)) || manifest[coverId] || Object.values(manifest).find((i) => /^image\//.test(i.type) && /cover/i.test(i.href));
  const blob = (k, type) => new Blob([files[k]], { type: type || (/\.png$/i.test(k) ? 'image/png' : /\.gif$/i.test(k) ? 'image/gif' : /\.svg$/i.test(k) ? 'image/svg+xml' : 'image/jpeg') });
  const imgs = {};
  await Promise.all([...images].map(async (k) => { try { imgs[k] = await createImageBitmap(blob(k)); } catch { /* 지원하지 않는 그림은 건너뛴다 */ } }));
  for (const ch of chapters) ch.blocks = ch.blocks.filter((b) => b.type !== 'img' || imgs[b.src]);
  return finish({ id: await bookId(buf, name), format: 'epub', title: meta('title') || name.replace(/\.epub$/i, ''), author: meta('creator'), language: meta('language'), cover: coverItem && files[coverItem.href] ? blob(coverItem.href, coverItem.type) : null, chapters, toc, images: imgs });
}

export async function parseTxt(buf, name = '') {
  let s = new TextDecoder('utf-8').decode(buf);
  if ((s.match(/�/g) || []).length > s.length / 200) { try { s = new TextDecoder('euc-kr').decode(buf); } catch { /* utf-8 그대로 */ } }
  const paras = s.replace(/\r\n?/g, '\n').split(/\n\s*\n|\n(?=\s{2,}|　)|\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const chapters = []; let cur = null;
  const head = /^(제\s*\d+\s*[장화부편]|chapter\s+[\divxlc]+|프롤로그|에필로그|prologue|epilogue|\d+\.\s)/i;
  for (const p of paras) {
    const isHead = p.length < 40 && head.test(p);
    if (!cur || isHead) { cur = { title: isHead ? p : '', blocks: [] }; chapters.push(cur); }
    cur.blocks.push({ type: isHead ? 'h2' : 'p', runs: [{ text: p }], text: p });
  }
  if (!chapters.length) throw new Error('빈 파일입니다');
  const title = name.replace(/\.txt$/i, '');
  return finish({ id: await bookId(buf, name), format: 'txt', title, author: '', cover: null, chapters, toc: chapters.map((c, i) => c.title && { title: c.title, chapter: i, block: 0, depth: 0 }).filter(Boolean), images: {} });
}
