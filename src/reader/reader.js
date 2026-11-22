// 리더: 서재(책 추가·삭제), 책 열기와 조판, 쪽 넘김, 북마크·밑줄·메모, 검색, 이동과 뒤로 가기,
// 진행률과 남은 시간, 낭독(TTS), 독서 통계, 내보내기. 화면(HTML)은 ui.js, 3D 모형은 book3d.js가 맡는다.
import * as store from './store.js';
import { parseEpub, parseTxt } from './epub.js';
import { paginate, charAt, textRange, DEFAULT_TYPE, TYPE_LIMITS, PAGE } from './typeset.js';
import { drawPage, drawCover, colorFor, PENS } from './page.js';
import { Book3D } from './book3d.js';
import { pagesOf } from '../scene/books.js';

const KEY = 'nanro.reader';
const DEFAULTS = { type: { ...DEFAULT_TYPE }, paper: 'cream', grain: 0.6, single: false, contrast: false, cpm: 650, ttsRate: 1, ttsVoice: '', flip: 0.55, zoom: 1,
  // 읽기 자세: 시선(위아래·좌우, 도), 시야각, 책의 높이·거리·좌우(m)와 기울기(도), 손 보이기
  vPitch: -46, vYaw: 0, vFov: 36, bH: 0, bDist: 0.36, bSide: 0, bTilt: 36, bOpen: 16, hands: false, bright: 1 };

export const POSE_DEFAULTS = { vPitch: DEFAULTS.vPitch, vYaw: 0, vFov: DEFAULTS.vFov, bH: 0, bDist: DEFAULTS.bDist, bSide: 0, bTilt: DEFAULTS.bTilt, bOpen: DEFAULTS.bOpen };
export class Reader {
  constructor({ toast, onChange, onTts, onPageTurn }) {
    this.toast = toast || (() => {}); this.onChange = onChange || (() => {}); this.onTts = onTts || (() => {}); this.onPageTurn = onPageTurn || (() => {});
    this.set = structuredClone(DEFAULTS);
    try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); Object.assign(this.set, s, { type: { ...DEFAULT_TYPE, ...(s.type || {}) } }); } catch { /* 기본값 */ }
    this.book3d = new Book3D(); this.library = []; this.cur = null; this.busy = false; this.history = [];
    this.selection = null; this.hits = []; this.tts = null; this.readAcc = 0; this.pageAcc = 0; this.spreadAt = performance.now();
    this.ready = this.refreshLibrary();
  }
  saveSettings() { try { localStorage.setItem(KEY, JSON.stringify(this.set)); } catch { /* 무시 */ } }
  async refreshLibrary() { try { this.library = await store.listBooks(); } catch (e) { console.warn('서재를 읽지 못했습니다', e); this.library = []; } this.onChange('library'); return this.library; }

  // ---- 서재
  async parse(buf, name) {
    const ext = name.toLowerCase().split('.').pop();
    if (ext === 'pdf') return (await import('./pdf.js')).parsePdf(buf, name);
    if (ext === 'txt') return parseTxt(buf, name);
    return parseEpub(buf, name);
  }
  async addFile(file) {
    const buf = await file.arrayBuffer(), book = await this.parse(buf, file.name);
    let cover = null;
    if (book.cover) { try { const bm = await createImageBitmap(book.cover), c = document.createElement('canvas'); c.width = 200; c.height = 300; drawCover(c, book, '#222', bm); cover = c.toDataURL('image/jpeg', 0.8); } catch { /* 표지 없음 */ } }
    const old = this.library.find((b) => b.id === book.id);
    const meta = { id: book.id, title: book.title, author: book.author, format: book.format, addedAt: Date.now(), color: colorFor(book.title), age: 'new', pos: 0, percent: 0, ...old, cover, name: file.name, size: buf.byteLength, pages: pagesOf(book) };
    await store.saveBook(meta, new Blob([buf])); await this.refreshLibrary();
    this.parsed = { id: book.id, book };                                   // 방금 읽은 것은 다시 풀지 않는다
    return meta;
  }
  async remove(id) { if (this.cur?.meta.id === id) this.close(); await store.removeBook(id); await this.refreshLibrary(); }
  async setMeta(id, patch) { const m = this.library.find((b) => b.id === id); if (!m) return; Object.assign(m, patch); await store.saveBook(m); if (this.cur?.meta.id === id) { Object.assign(this.cur.meta, patch); this.book3d.setCover(m.color); this.render(); } this.onChange('library'); }

  // ---- 책 열기
  async open(id, onProgress) {
    if (this.cur?.meta.id === id) return this.cur;
    this.stopTts(); this.flush();
    const meta = this.library.find((b) => b.id === id); if (!meta) throw new Error('서재에 없는 책입니다');
    let book = this.parsed?.id === id ? this.parsed.book : null;
    if (!book) { const blob = await store.bookFile(id); if (!blob) throw new Error('책 파일이 없습니다. 다시 추가해 주세요'); book = await this.parse(await blob.arrayBuffer(), meta.name || meta.title + '.' + meta.format); }
    this.parsed = null;
    const marks = await store.getMarks(id);
    this.cur = { meta, book, marks, layout: null, spread: 0, pdf: book.format === 'pdf' };
    this.history = []; this.hits = []; this.selection = null;
    await this.relayout(onProgress, meta.pos || 0);
    meta.lastOpened = Date.now(); if (!(meta.pages > 0)) meta.pages = pagesOf(book);   // 예전에 넣은 책: 쪽수를 이제 채운다(책장 두께)
    store.saveBook(meta);
    this.book3d.setBulk(meta.pages); this.book3d.setCover(meta.color); this.onChange('book');
    return this.cur;
  }
  close() { this.stopTts(); this.flush(); this.cur = null; this.onChange('book'); }
  // 글자 설정이 바뀌면 다시 조판하고 같은 글자 위치로 돌아온다
  async relayout(onProgress, pos = this.pos) {
    const c = this.cur; if (!c) return;
    if (c.pdf) { const n = c.book.numPages; c.layout = { pages: Array.from({ length: n }, (_, i) => ({ index: i, g0: i, g1: i + 1, chapter: 0, lines: [], imgs: [] })), pageOf: (g) => Math.max(0, Math.min(n - 1, Math.floor(g))) }; }
    else c.layout = await paginate(c.book, this.set.type, onProgress);
    c.spread = this._spreadOf(c.layout.pageOf(pos)); await this.render();
  }
  _spreadOf(p) { return p - (p % 2); }
  get pages() { return this.cur?.layout?.pages || []; }
  get pos() { const p = this.pages[this.cur?.spread ?? 0]; return p ? p.g0 : 0; }
  get percent() { const c = this.cur; if (!c) return 0; const last = this.pages[Math.min(this.pages.length - 1, c.spread + 1)]; return Math.min(1, (last ? last.g1 : 0) / c.book.length); }
  pageOf(g) { return this.cur.layout.pageOf(g); }

  // ---- 그리기
  _opts(i, side) {
    const c = this.cur, page = this.pages[i] || null;
    return { book: c.book, page, side, T: this.set.type, paper: this.set.paper, grainAmt: this.set.grain, old: c.meta.age === 'old', highlights: c.marks.highlights, selection: this.selection, tts: this.tts?.range, hits: this.hits,
      bookmarked: !!page && c.marks.bookmarks.some((b) => b.g >= page.g0 && b.g < Math.max(page.g1, page.g0 + 1)) };
  }
  async _draw(key, i, side) {
    const o = this._opts(i, side);
    if (this.cur.pdf && o.page) { try { o.pdfImage = await this.cur.book.pageImage(i); } catch { /* 빈 쪽 */ } }
    drawPage(this.book3d.cv[key], o); this.book3d.refresh(key);
  }
  async render() {
    const c = this.cur; if (!c?.layout) return;
    await Promise.all([this._draw('L', c.spread, 'L'), this._draw('R', c.spread + 1, 'R')]);
    this.book3d.setThickness(this.percent); this.book3d.setGlow(this.set.contrast ? 0.55 : 0.02);
  }
  _copy(to, from) { const d = this.book3d.cv[to].getContext('2d'); d.setTransform(1, 0, 0, 1, 0, 0); d.globalAlpha = 1; d.globalCompositeOperation = 'source-over'; d.drawImage(this.book3d.cv[from], 0, 0); this.book3d.refresh(to); }

  // ---- 쪽 넘김
  async turn(dir, fast = false) {
    const c = this.cur; if (!c || this.busy || this.book3d.flipping) return false;
    const target = c.spread + dir * 2; if (target < 0 || target >= this.pages.length) return false;
    this.busy = true; this._measureSpeed(); this.selection = null;
    try {
      if (dir > 0) { this._copy('F', 'R'); await Promise.all([this._draw('B', target, 'L'), this._draw('R', target + 1, 'R')]); }
      else { this._copy('B', 'L'); await Promise.all([this._draw('F', target + 1, 'R'), this._draw('L', target, 'L')]); }
      c.spread = target; this.onPageTurn(dir);
      await new Promise((res) => this.book3d.startFlip(dir, fast ? 0.22 : this.set.flip, res));
      this._copy(dir > 0 ? 'L' : 'R', dir > 0 ? 'B' : 'F');
      this.book3d.setThickness(this.percent); this.pageAcc += 2; this._savePos(); this.onChange('page');
    } finally { this.busy = false; }
    return true;
  }
  next() { return this.turn(1); } prev() { return this.turn(-1); }
  // 먼 곳으로 이동: 넘김 한 번으로 표현하고 바로 그린다
  async goto(g, { push = true } = {}) {
    const c = this.cur; if (!c) return; const target = this._spreadOf(this.pageOf(Math.max(0, Math.min(c.book.length - 1, g))));
    if (target === c.spread) { await this.render(); return; }
    if (push) { this.history.push(this.pos); if (this.history.length > 50) this.history.shift(); }
    if (this.busy || this.book3d.flipping) return;
    const dir = target > c.spread ? 1 : -1; this.busy = true; this.selection = null;
    try {
      if (dir > 0) { this._copy('F', 'R'); await Promise.all([this._draw('B', target, 'L'), this._draw('R', target + 1, 'R')]); }
      else { this._copy('B', 'L'); await Promise.all([this._draw('F', target + 1, 'R'), this._draw('L', target, 'L')]); }
      c.spread = target; this.onPageTurn(dir);
      await new Promise((res) => this.book3d.startFlip(dir, 0.4, res));
      this._copy(dir > 0 ? 'L' : 'R', dir > 0 ? 'B' : 'F'); this.book3d.setThickness(this.percent); this._savePos(); this.onChange('page');
    } finally { this.busy = false; }
  }
  gotoPage(n) { const p = this.pages[Math.max(0, Math.min(this.pages.length - 1, n - 1))]; return p && this.goto(p.g0); }
  gotoPercent(p) { return this.goto(Math.floor(Math.max(0, Math.min(0.9999, p)) * this.cur.book.length)); }
  back() { if (this.history.length) return this.goto(this.history.pop(), { push: false }); }
  gotoToc(t) { const c = this.cur; if (t.g != null) return this.goto(t.g); const b = c.book.chapters[t.chapter]?.blocks[t.block] || c.book.chapters[t.chapter]?.blocks[0]; return this.goto(b ? b.g0 : c.book.chapters[t.chapter].g0); }
  _savePos() { const m = this.cur.meta; m.pos = this.pos; m.percent = this.percent; if (m.percent >= 0.995 && !m.finishedAt) m.finishedAt = Date.now(); clearTimeout(this._sp); this._sp = setTimeout(() => store.saveBook(m).catch(() => {}), 400); }
  // 읽기 속도(분당 글자 수)를 펼침면에 머문 시간으로 잰다
  _measureSpeed() {
    const c = this.cur, dt = (performance.now() - this.spreadAt) / 1000; this.spreadAt = performance.now();
    if (!c || c.pdf) return; const a = this.pages[c.spread], b = this.pages[c.spread + 1] || a, chars = b.g1 - a.g0;
    if (dt > 4 && dt < 600 && chars > 200) { const cpm = chars / dt * 60; if (cpm > 150 && cpm < 3000) { this.set.cpm = Math.round(this.set.cpm * 0.8 + cpm * 0.2); this.saveSettings(); } }
  }
  // 진행 정보: 쪽, 퍼센트, 이 장 남은 시간(분)
  info() {
    const c = this.cur; if (!c) return null; const p = this.pages[c.spread], ch = c.book.chapters[p?.chapter ?? 0];
    const end = this.pages[Math.min(this.pages.length - 1, c.spread + 1)].g1, left = c.pdf ? 0 : Math.max(0, ch.g1 - end);
    return { page: c.spread + 1, pages: this.pages.length, percent: this.percent, chapter: ch?.title || '', minutesLeft: c.pdf ? null : Math.ceil(left / this.set.cpm), bookMinutes: c.pdf ? null : Math.ceil((c.book.length - end) / this.set.cpm) };
  }
  // 읽은 시간 기록 (읽는 중일 때 매 프레임 호출)
  tick(dt, reading) {
    this.book3d.update(dt);
    if (!reading || !this.cur || document.hidden) return;
    this.readAcc += dt; if (this.readAcc > 30) this.flush();
  }
  flush() { const s = Math.round(this.readAcc), p = this.pageAcc; this.readAcc -= s; this.pageAcc = 0; if (s > 0 || p > 0) store.addStat({ seconds: s, pages: p }).catch(() => {}); }

  // ---- 북마크
  toggleBookmark() {
    const c = this.cur; if (!c) return; const a = this.pages[c.spread], b = this.pages[c.spread + 1] || a, bm = c.marks.bookmarks;
    const i = bm.findIndex((x) => x.g >= a.g0 && x.g < Math.max(b.g1, a.g0 + 1));
    if (i >= 0) { bm.splice(i, 1); this.toast('북마크를 지웠습니다'); }
    else { bm.push({ g: (b !== a ? b : a).g0, at: Date.now(), label: c.pdf ? `${a.index + 1}쪽` : textRange(c.book, a.g0, a.g0 + 40).replace(/\s+/g, ' ').trim() }); bm.sort((x, y) => x.g - y.g); this.toast('북마크했습니다 (모서리를 접음)'); }
    store.saveMarks(c.meta.id, c.marks); this.render(); this.onChange('marks');
  }
  // ---- 밑줄과 메모
  addHighlight(start, end, color = 'yellow', note = '') {
    const c = this.cur; if (!c || c.pdf || end <= start) return null;
    const h = { id: Date.now().toString(36), start, end, color, note, text: textRange(c.book, start, end).replace(/\s+/g, ' ').trim(), at: Date.now() };
    c.marks.highlights.push(h); c.marks.highlights.sort((a, b) => a.start - b.start); store.saveMarks(c.meta.id, c.marks); this.selection = null; this.render(); this.onChange('marks'); return h;
  }
  updateHighlight(id, patch) { const c = this.cur, h = c?.marks.highlights.find((x) => x.id === id); if (!h) return; Object.assign(h, patch); store.saveMarks(c.meta.id, c.marks); this.render(); this.onChange('marks'); }
  removeHighlight(id) { const c = this.cur; if (!c) return; c.marks.highlights = c.marks.highlights.filter((x) => x.id !== id); store.saveMarks(c.meta.id, c.marks); this.render(); this.onChange('marks'); }
  highlightAt(g) { return this.cur?.marks.highlights.find((h) => g >= h.start && g < h.end) || null; }
  exportMarkdown() {
    const c = this.cur; if (!c) return ''; const m = c.marks; let out = `# ${c.meta.title}\n${c.meta.author ? '\n' + c.meta.author + '\n' : ''}\n## 밑줄과 메모\n\n`;
    for (const h of m.highlights) out += `> ${h.text}\n\n${h.note ? h.note + '\n\n' : ''}— ${this.pageOf(h.start) + 1}쪽 · ${PENS[h.color]?.name || ''}\n\n`;
    out += `## 북마크\n\n`; for (const b of m.bookmarks) out += `- ${this.pageOf(b.g) + 1}쪽: ${b.label}\n`;
    return out;
  }

  // ---- 쪽 위의 점 → 글자
  charAtPick(pick, snap = true) { const c = this.cur; if (!c || c.pdf || !pick) return -1; const page = this.pages[c.spread + (pick.side === 'R' ? 1 : 0)]; return page ? charAt(page, pick.x, pick.y, snap) : -1; }
  setSelection(a, b) { this.selection = a == null ? null : [Math.min(a, b), Math.max(a, b) + 1]; this.render(); }
  selectedText() { return this.selection ? textRange(this.cur.book, this.selection[0], this.selection[1]).replace(/\s+/g, ' ').trim() : ''; }
  // g가 속한 낱말의 범위
  wordAt(g) {
    const t = textRange(this.cur.book, Math.max(0, g - 30), g + 30), o = Math.min(30, g); let a = o, b = o; const W = /[\p{L}\p{N}'’-]/u;
    if (!W.test(t[o] || '')) return null; while (a > 0 && W.test(t[a - 1])) a--; while (b < t.length - 1 && W.test(t[b + 1])) b++;
    return [g - (o - a), g + (b - o)];
  }

  // ---- 검색
  async search(q, max = 200) {
    const c = this.cur, out = []; q = q.trim(); if (!c || !q) { this.hits = []; this.render(); return out; }
    const ql = q.toLowerCase();
    if (c.pdf) { for (let i = 0; i < c.book.numPages && out.length < max; i++) { const t = await c.book.pageText(i), k = t.toLowerCase().indexOf(ql); if (k >= 0) out.push({ g: i, page: i + 1, snippet: t.slice(Math.max(0, k - 30), k + q.length + 40) }); } return out; }
    for (const ch of c.book.chapters) for (const b of ch.blocks) { const tl = b.text.toLowerCase(); let k = -1; while ((k = tl.indexOf(ql, k + 1)) >= 0 && out.length < max) out.push({ g: b.g0 + k, len: q.length, page: this.pageOf(b.g0 + k) + 1, chapter: ch.title, snippet: b.text.slice(Math.max(0, k - 30), k + q.length + 40), at: Math.min(30, k) }); }
    this.hits = out.map((h) => [h.g, h.g + h.len]); this.render(); return out;
  }
  clearSearch() { this.hits = []; this.render(); }

  // ---- 낭독 (브라우저 음성 합성). 읽는 문장을 쪽 위에 표시하고, 쪽이 끝나면 자동으로 넘긴다.
  voices() { return (window.speechSynthesis?.getVoices() || []); }
  startTts(fromG = this.pos) {
    const c = this.cur; if (!c || c.pdf || !window.speechSynthesis) { this.toast(c?.pdf ? 'PDF는 낭독을 지원하지 않습니다' : '이 브라우저는 음성 합성을 지원하지 않습니다'); return; }
    this.stopTts(); this.tts = { g: fromG, range: null, playing: true }; this.onTts(true); this._speakNext(); this.onChange('tts');
  }
  _speakNext() {
    const c = this.cur, T = this.tts; if (!c || !T || !T.playing) return;
    if (T.g >= c.book.length - 1) return this.stopTts();
    // 다음 문장 찾기
    const chunk = textRange(c.book, T.g, T.g + 600); let m = chunk.match(/^[\s\S]*?[.!?。…]+["'”’」』)]*(?=\s|$)|^[^\n]+\n?/), s = m ? m[0] : chunk; if (!s.length) s = chunk.slice(0, 200) || ' ';
    const lead = s.length - s.replace(/^\s+/, '').length, start = T.g + lead, end = T.g + s.length; T.g = end;
    if (!s.trim()) return this._speakNext();
    T.range = [start, Math.max(start + 1, end)];
    const page = this.pageOf(start), go = this._spreadOf(page) !== c.spread ? this.goto(start, { push: false }) : this.render();
    Promise.resolve(go).then(() => {
      if (this.tts !== T || !T.playing) return;
      const u = new SpeechSynthesisUtterance(s.trim()); u.rate = this.set.ttsRate; const lang = /[가-힣]/.test(s) ? 'ko' : (c.book.language || 'en').slice(0, 2);
      const v = this.voices().find((x) => x.name === this.set.ttsVoice) || this.voices().find((x) => x.lang.toLowerCase().startsWith(lang)); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = lang === 'ko' ? 'ko-KR' : lang;
      u.onend = () => { if (this.tts === T) this._speakNext(); }; u.onerror = (e) => { if (e.error !== 'interrupted' && e.error !== 'canceled' && this.tts === T) this.stopTts(); };
      speechSynthesis.speak(u);
    });
  }
  stopTts() { if (!this.tts) return; this.tts = null; try { speechSynthesis.cancel(); } catch { /* 무시 */ } this.onTts(false); if (this.cur) this.render(); this.onChange('tts'); }

  // ---- 사전: 위키낱말사전(한국어판/영어판)에 낱말을 물어본다. 인터넷이 필요하다.
  async lookup(word) {
    word = word.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''); if (!word) return null;
    const ko = /[가-힣]/.test(word), host = ko ? 'ko' : 'en';
    const tryOne = async (w) => { const r = await fetch(`https://${host}.wiktionary.org/w/api.php?action=query&format=json&origin=*&prop=extracts&explaintext=1&redirects=1&titles=${encodeURIComponent(w)}`); const p = Object.values((await r.json()).query?.pages || {})[0]; return p && !p.missing && p.extract ? p.extract : null; };
    let text = await tryOne(word).catch(() => null);
    // 한국어는 조사가 붙어 있을 수 있어 끝 글자를 줄여 가며 다시 찾는다
    for (let w = word; !text && ko && w.length > 1;) { w = w.slice(0, -1); text = await tryOne(w).catch(() => null); if (text) word = w; }
    if (!text && !ko) text = await tryOne(word.toLowerCase()).catch(() => null);
    return { word, text: text ? text.replace(/\n{3,}/g, '\n\n').slice(0, 1500) : null, url: `https://${host}.wiktionary.org/wiki/${encodeURIComponent(word)}` };
  }
}
export { TYPE_LIMITS, PAGE };
