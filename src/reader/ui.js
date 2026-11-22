// 리더 화면: 아래 진행 막대, 옆 메뉴(목차 / 북마크·밑줄 / 검색 / 글자·종이 / 서재 / 통계), 선택 팝업, 사전 창.
// 글이 많은 화면만 HTML로 띄우고, 책 자체는 방 안의 3D 물체다.
import * as store from './store.js';
import { POSE_DEFAULTS } from './reader.js';
import { FONTS, TYPE_LIMITS } from './typeset.js';
import { PAPERS, PENS } from './page.js';

const CSS = `
.rd { font-family: "Noto Serif KR", "Nanum Myeongjo", "Malgun Gothic", serif; color: #e9dcc6; }
#rbar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 4; padding: 26px 22px 12px; background: linear-gradient(transparent, rgba(8,5,3,.88) 45%); opacity: 0; transition: opacity .25s; pointer-events: none; display: none; }
#rbar.on { display: block; } #rbar.show { opacity: 1; pointer-events: auto; }
#rbar .track { height: 5px; background: rgba(233,220,198,.18); border-radius: 3px; cursor: pointer; position: relative; margin-bottom: 9px; }
#rbar .fill { position: absolute; left: 0; top: 0; bottom: 0; background: #d98a3a; border-radius: 3px; }
#rbar .tick { position: absolute; top: -2px; width: 2px; height: 9px; background: #e9dcc6; opacity: .55; }
#rbar .row { display: flex; align-items: center; gap: 8px; font-size: 13px; }
#rbar .info { margin-right: auto; opacity: .85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rd button { background: #2a1f15; color: inherit; border: 1px solid #5c4a33; border-radius: 5px; padding: 5px 11px; font: inherit; font-size: 12.5px; cursor: pointer; white-space: nowrap; }
.rd button:hover { filter: brightness(1.25); } .rd button.act { background: #a8621f; border-color: #d98a3a; color: #fff; }
#rpanel { position: fixed; top: 0; right: 0; bottom: 0; width: min(420px, 92vw); z-index: 6; background: rgba(20,14,9,.96); border-left: 1px solid #4a3a28; display: none; flex-direction: column; font-size: 13.5px; }
#rpanel.open { display: flex; }
#rpanel .tabs { display: flex; flex-wrap: wrap; gap: 4px; padding: 12px 12px 8px; border-bottom: 1px solid #3a2c1e; }
#rpanel .tabs button.x { margin-left: auto; }
#rpanel .body { flex: 1; overflow: auto; padding: 12px 16px 20px; }
#rpanel h3 { font-size: 14px; color: #f0c98a; margin: 16px 0 8px; font-weight: 600; } #rpanel h3:first-child { margin-top: 2px; }
#rpanel .item { padding: 8px 6px; border-bottom: 1px solid rgba(90,70,50,.35); cursor: pointer; line-height: 1.55; } #rpanel .item:hover { background: rgba(217,138,58,.12); }
#rpanel .item.cur { color: #f0c98a; } #rpanel .sub { opacity: .6; font-size: 12px; }
#rpanel input[type=text], #rpanel input[type=number], #rpanel select, #rpanel textarea { background: #0e0a07; color: inherit; border: 1px solid #4a3a28; border-radius: 4px; padding: 6px 8px; font: inherit; box-sizing: border-box; width: 100%; }
#rpanel .f { display: grid; grid-template-columns: 110px 1fr 54px; gap: 8px; align-items: center; padding: 5px 0; } #rpanel .f input[type=range] { width: 100%; accent-color: #e0933c; } #rpanel .f .v { text-align: right; opacity: .7; font-size: 12px; }
#rpanel .bk { display: grid; grid-template-columns: 56px 1fr; gap: 10px; padding: 10px 4px; border-bottom: 1px solid rgba(90,70,50,.35); }
#rpanel .bk img, #rpanel .bk .nocover { width: 56px; height: 84px; object-fit: cover; border-radius: 2px; background: #3a2418; display: grid; place-items: center; font-size: 10px; text-align: center; padding: 3px; box-sizing: border-box; }
#rpanel .bk .t { font-weight: 600; } #rpanel .bk .btns { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 6px; }
#rpanel .hl { border-left: 4px solid; padding: 4px 0 4px 9px; margin: 9px 0; } #rpanel .hl .q { cursor: pointer; line-height: 1.6; } #rpanel .hl .n { color: #a9b8d8; font-size: 12.5px; margin-top: 3px; white-space: pre-wrap; }
#rpanel mark { background: rgba(230,140,40,.45); color: inherit; }
#rpop { position: fixed; z-index: 7; display: none; background: #17110c; border: 1px solid #5c4a33; border-radius: 8px; padding: 7px; gap: 5px; flex-wrap: wrap; max-width: 330px; box-shadow: 0 6px 24px rgba(0,0,0,.6); }
#rpop.open { display: flex; } #rpop .pen { width: 26px; height: 26px; border-radius: 50%; border: 2px solid #17110c; outline: 1px solid #5c4a33; cursor: pointer; padding: 0; }
#rdict { position: fixed; z-index: 7; left: 50%; top: 12%; transform: translateX(-50%); width: min(520px, 90vw); max-height: 60vh; overflow: auto; display: none; background: #17110c; border: 1px solid #5c4a33; border-radius: 8px; padding: 16px 18px; font-size: 13.5px; line-height: 1.7; white-space: pre-wrap; box-shadow: 0 6px 24px rgba(0,0,0,.6); }
#rdict.open { display: block; } #rdict h4 { margin: 0 0 8px; font-size: 17px; } #rdict a { color: #f0c98a; }
#rdrop { position: fixed; inset: 0; z-index: 9; display: none; place-items: center; background: rgba(8,5,3,.8); font-size: 22px; border: 3px dashed #d98a3a; pointer-events: none; } #rdrop.on { display: grid; }
`;
const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); for (const k in props) { if (k === 'style') e.style.cssText = props[k]; else if (k.startsWith('on')) e.addEventListener(k.slice(2), props[k]); else if (k === 'html') e.innerHTML = props[k]; else e[k] = props[k]; } for (const c of kids.flat()) if (c != null) e.append(c); return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const download = (blob, name) => { const a = el('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
const TABS = [['toc', '목차'], ['marks', '북마크·밑줄'], ['search', '검색'], ['type', '글자·종이'], ['lib', '서재'], ['stats', '통계']];

export class ReaderUI {
  // host: { reader, toast, pickBook(id), closeBook(), quoteCard(text), reading(), extraTabs?: [[key, label, render(body)]] }
  constructor(host) {
    this.host = host; this.r = host.reader; this.tab = 'lib';
    document.head.append(el('style', { textContent: CSS }));
    this.bar = el('div', { id: 'rbar', className: 'rd' }); this.panel = el('div', { id: 'rpanel', className: 'rd' }); this.pop = el('div', { id: 'rpop', className: 'rd' }); this.dict = el('div', { id: 'rdict', className: 'rd' });
    this.drop = el('div', { id: 'rdrop', className: 'rd', textContent: '여기에 놓으면 서재에 꽂습니다 (EPUB · PDF · TXT)' });
    document.body.append(this.bar, this.panel, this.pop, this.dict, this.drop);
    this.fill = el('div', { className: 'fill' }); this.track = el('div', { className: 'track', onclick: (e) => { const b = this.track.getBoundingClientRect(); this.r.gotoPercent((e.clientX - b.left) / b.width); } }, this.fill);
    this.info = el('span', { className: 'info' });
    const B = (label, fn, title) => el('button', { textContent: label, title: title || '', onclick: (e) => { e.stopPropagation(); fn(); } });
    this.ttsBtn = B('낭독', () => (this.r.tts ? this.r.stopTts() : this.r.startTts()), 'T');
    this.bar.append(this.track, el('div', { className: 'row' }, this.info, B('← 뒤로', () => this.r.back(), '이동하기 전 위치로 (Backspace)'), B('목차', () => this.open('toc'), 'Tab'), B('북마크', () => this.r.toggleBookmark(), 'B'), B('검색', () => this.open('search'), 'F'), B('글자', () => this.open('type')), this.ttsBtn, B('서재', () => this.open('lib'), 'L'), B('책 덮기', () => host.closeBook(), 'X')));
    for (const p of [this.panel, this.pop, this.dict, this.bar]) { p.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.code === 'Escape') this.closeAll(); }); p.addEventListener('mousedown', (e) => e.stopPropagation()); p.addEventListener('wheel', (e) => e.stopPropagation()); }
    addEventListener('mousemove', (e) => { if (this.bar.classList.contains('on')) this.bar.classList.toggle('show', e.clientY > innerHeight * 0.8 || this.panel.classList.contains('open')); });
    // 파일 끌어다 놓기
    let depth = 0;
    addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { depth++; this.drop.classList.add('on'); e.preventDefault(); } });
    addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; this.drop.classList.remove('on'); } });
    addEventListener('dragover', (e) => e.preventDefault());
    addEventListener('drop', (e) => { e.preventDefault(); depth = 0; this.drop.classList.remove('on'); this.addFiles(e.dataTransfer.files); });
  }
  get isOpen() { return this.panel.classList.contains('open'); }
  setReading(on) { this.bar.classList.toggle('on', on); if (!on) { this.bar.classList.remove('show'); this.hidePop(); } this.update(); }
  open(tab) { if (tab) this.tab = tab; this.panel.classList.add('open'); this.hidePop(); this.host.onPanel?.(true); this.renderPanel(); }
  close() { if (!this.isOpen) return; this.panel.classList.remove('open'); this.host.onPanel?.(false); }
  toggle(tab) { this.isOpen && (!tab || tab === this.tab) ? this.close() : this.open(tab); }
  closeAll() { this.close(); this.hidePop(); this.dict.classList.remove('open'); }
  async addFiles(files) {
    let last = null;
    for (const f of files) { try { this.host.toast(`"${f.name}" 읽는 중…`); last = await this.r.addFile(f); this.host.toast(`"${last.title}"을(를) 서재에 꽂았습니다`); } catch (e) { console.warn(e); this.host.toast(`${f.name}: ${e.message || '열 수 없습니다'}`); } }
    if (last) { this.host.onAdded?.(last); if (this.isOpen) this.renderPanel(); }
  }

  // 아래 막대
  update() {
    const i = this.r.info(); if (!i) { this.info.textContent = ''; return; }
    this.fill.style.width = (i.percent * 100).toFixed(1) + '%';
    this.info.textContent = `${i.page}–${Math.min(i.pages, i.page + 1)} / ${i.pages}쪽 · ${(i.percent * 100).toFixed(0)}%` + (i.minutesLeft != null ? ` · 이 장 ${i.minutesLeft}분 남음 · 책 ${i.bookMinutes >= 60 ? Math.floor(i.bookMinutes / 60) + '시간 ' : ''}${i.bookMinutes % 60}분` : '') + (i.chapter ? ` · ${i.chapter}` : '');
    this.ttsBtn.textContent = this.r.tts ? '낭독 멈춤' : '낭독'; this.ttsBtn.classList.toggle('act', !!this.r.tts);
    this.track.querySelectorAll('.tick').forEach((t) => t.remove());
    const c = this.r.cur; if (c) for (const b of c.marks.bookmarks) this.track.append(el('div', { className: 'tick', style: `left:${(b.g / c.book.length * 100).toFixed(2)}%` }));
  }

  // 옆 메뉴
  renderPanel() {
    const P = this.panel; P.innerHTML = '';
    const tabs = [...TABS, ...(this.host.extraTabs || []).map((t) => [t[0], t[1]])];
    P.append(el('div', { className: 'tabs' }, tabs.map(([k, n]) => el('button', { textContent: n, className: k === this.tab ? 'act' : '', onclick: () => { this.tab = k; this.renderPanel(); } })), el('button', { className: 'x', textContent: '닫기', onclick: () => this.close() })));
    const body = el('div', { className: 'body' }); P.append(body);
    const extra = (this.host.extraTabs || []).find((t) => t[0] === this.tab);
    if (extra) return extra[2](body, this);
    const need = () => { if (this.r.cur) return true; body.append(el('p', { className: 'sub', textContent: '펼친 책이 없습니다. 서재에서 책을 골라 의자에 앉아 펼치세요.' })); return false; };
    ({ toc: () => need() && this._toc(body), marks: () => need() && this._marks(body), search: () => need() && this._search(body), type: () => this._type(body), lib: () => this._lib(body), stats: () => this._stats(body) })[this.tab]();
  }
  _toc(body) {
    const c = this.r.cur, pos = this.r.pos; let curIdx = -1;
    const gOf = (t) => t.g != null ? t.g : (c.book.chapters[t.chapter]?.blocks[t.block] || c.book.chapters[t.chapter]?.blocks[0])?.g0 ?? 0;
    c.book.toc.forEach((t, i) => { if (gOf(t) <= pos + 1) curIdx = i; });
    if (!c.book.toc.length) body.append(el('p', { className: 'sub', textContent: '이 책에는 목차가 없습니다.' }));
    c.book.toc.forEach((t, i) => body.append(el('div', { className: 'item' + (i === curIdx ? ' cur' : ''), style: `padding-left:${6 + t.depth * 16}px`, onclick: () => { this.r.gotoToc(t); this.close(); } }, t.title, el('span', { className: 'sub', textContent: `  ${this.r.pageOf(gOf(t)) + 1}쪽` }))));
    body.append(el('h3', { textContent: '이동' }));
    const pg = el('input', { type: 'number', min: 1, max: this.r.pages.length, placeholder: `쪽 번호 (1–${this.r.pages.length})` }), pc = el('input', { type: 'number', min: 0, max: 100, placeholder: '퍼센트 (0–100)' });
    body.append(el('div', { className: 'f', style: 'grid-template-columns:1fr 1fr 70px' }, pg, pc, el('button', { textContent: '이동', onclick: () => { if (pg.value) this.r.gotoPage(+pg.value); else if (pc.value !== '') this.r.gotoPercent(+pc.value / 100); this.close(); } })),
      el('button', { textContent: '← 이동하기 전 위치로', onclick: () => this.r.back() }));
  }
  _marks(body) {
    const c = this.r.cur, m = c.marks;
    body.append(el('h3', { textContent: `북마크 (${m.bookmarks.length})` }));
    if (!m.bookmarks.length) body.append(el('p', { className: 'sub', textContent: '읽는 중에 B를 누르면 쪽 모서리를 접어 북마크합니다.' }));
    for (const b of m.bookmarks) body.append(el('div', { className: 'item', onclick: () => { this.r.goto(b.g); this.close(); } }, `${this.r.pageOf(b.g) + 1}쪽  `, el('span', { className: 'sub', textContent: b.label }), el('button', { textContent: '삭제', style: 'float:right', onclick: (e) => { e.stopPropagation(); m.bookmarks.splice(m.bookmarks.indexOf(b), 1); store.saveMarks(c.meta.id, m); this.r.render(); this.renderPanel(); this.update(); } })));
    body.append(el('h3', { textContent: `밑줄과 메모 (${m.highlights.length})` }));
    if (c.pdf) body.append(el('p', { className: 'sub', textContent: 'PDF는 밑줄과 메모를 지원하지 않습니다.' }));
    else if (!m.highlights.length) body.append(el('p', { className: 'sub', textContent: '쪽 위에서 글을 끌어 선택하면 연필이나 색연필로 밑줄을 칠 수 있습니다.' }));
    for (const h of m.highlights) {
      body.append(el('div', { className: 'hl', style: `border-color:${PENS[h.color]?.c || '#e3b92e'}` }, el('div', { className: 'q', textContent: h.text, onclick: () => { this.r.goto(h.start); this.close(); } }), h.note ? el('div', { className: 'n', textContent: h.note }) : null,
        el('div', { className: 'sub' }, `${this.r.pageOf(h.start) + 1}쪽 · `, el('a', { textContent: '메모', href: '#', style: 'color:inherit', onclick: (e) => { e.preventDefault(); this.editNote(h); } }), ' · ', el('a', { textContent: '삭제', href: '#', style: 'color:inherit', onclick: (e) => { e.preventDefault(); this.r.removeHighlight(h.id); this.renderPanel(); } }))));
    }
    body.append(el('h3', { textContent: '내보내기' }), el('button', { textContent: '밑줄·메모를 Markdown으로 저장', onclick: () => download(new Blob([this.r.exportMarkdown()], { type: 'text/markdown' }), `${c.meta.title} 밑줄.md`) }));
  }
  editNote(h) {
    const body = this.panel.querySelector('.body'); body.innerHTML = '';
    const ta = el('textarea', { rows: 6, value: h.note || '', placeholder: '메모를 적으세요. 쪽 여백에 손글씨로 보입니다.' });
    body.append(el('h3', { textContent: '메모' }), el('div', { className: 'hl', style: `border-color:${PENS[h.color]?.c}` }, el('div', { className: 'q', textContent: h.text })), ta,
      el('div', { style: 'display:flex;gap:8px;margin-top:10px' }, el('button', { className: 'act', textContent: '저장', onclick: () => { this.r.updateHighlight(h.id, { note: ta.value.trim() }); this.tab = 'marks'; this.renderPanel(); } }), el('button', { textContent: '취소', onclick: () => this.renderPanel() })));
    this.panel.classList.add('open'); this.host.onPanel?.(true); ta.focus();
  }
  _search(body) {
    const inp = el('input', { type: 'text', placeholder: '책 전체에서 찾기', value: this.lastQ || '' }), list = el('div');
    const run = async () => {
      this.lastQ = inp.value; list.innerHTML = ''; const res = await this.r.search(inp.value);
      list.append(el('p', { className: 'sub', textContent: inp.value.trim() ? `${res.length}${res.length >= 200 ? '+' : ''}곳에서 찾았습니다.` : '' }));
      for (const h of res) { const s = h.snippet, a = h.at ?? s.toLowerCase().indexOf(inp.value.toLowerCase()); list.append(el('div', { className: 'item', onclick: () => { this.r.goto(h.g); }, html: `${esc(s.slice(0, a))}<mark>${esc(s.slice(a, a + inp.value.length))}</mark>${esc(s.slice(a + inp.value.length))} <span class="sub">${h.page}쪽</span>` })); }
    };
    inp.addEventListener('keydown', (e) => { if (e.code === 'Enter') run(); });
    body.append(el('div', { className: 'f', style: 'grid-template-columns:1fr 64px 64px' }, inp, el('button', { className: 'act', textContent: '찾기', onclick: run }), el('button', { textContent: '지우기', onclick: () => { inp.value = ''; this.lastQ = ''; list.innerHTML = ''; this.r.clearSearch(); } })), list);
    if (this.lastQ) run(); setTimeout(() => inp.focus(), 30);
  }
  _type(body) {
    const S = this.r.set, T = S.type; let timer = 0;
    const relayout = () => { this.r.saveSettings(); clearTimeout(timer); timer = setTimeout(() => this.r.cur && this.r.relayout().then(() => this.update()), 250); };
    const redraw = () => { this.r.saveSettings(); this.r.render(); };
    const slider = (label, obj, key, [min, max, step], fn, fmt = (v) => v) => { const v = el('span', { className: 'v', textContent: fmt(obj[key]) }), i = el('input', { type: 'range', min, max, step, value: obj[key], oninput: () => { obj[key] = +i.value; v.textContent = fmt(obj[key]); fn(); } }); return el('div', { className: 'f' }, el('label', { textContent: label }), i, v); };
    const select = (label, obj, key, opts, fn) => { const s = el('select', { onchange: () => { obj[key] = s.value; fn(); } }, Object.entries(opts).map(([k, n]) => el('option', { value: k, textContent: n, selected: obj[key] === k }))); return el('div', { className: 'f' }, el('label', { textContent: label }), s, el('span')); };
    const check = (label, obj, key, fn) => { const c = el('input', { type: 'checkbox', checked: !!obj[key], onchange: () => { obj[key] = c.checked; fn(); } }); return el('div', { className: 'f' }, el('label', { textContent: label }), el('span', {}, c), el('span')); };
    body.append(el('h3', { textContent: '글자' }), select('글꼴', T, 'font', Object.fromEntries(Object.entries(FONTS).map(([k, f]) => [k, f.name])), relayout),
      slider('크기', T, 'size', TYPE_LIMITS.size, relayout, (v) => Math.round(v / 34 * 100) + '%'), slider('줄 간격', T, 'line', TYPE_LIMITS.line, relayout, (v) => v.toFixed(2)), slider('문단 간격', T, 'para', TYPE_LIMITS.para, relayout, (v) => v.toFixed(2)), slider('여백', T, 'margin', TYPE_LIMITS.margin, relayout),
      check('양쪽 맞춤', T, 'justify', relayout), check('첫 줄 들여쓰기', T, 'indent', relayout),
      el('h3', { textContent: '종이' }), select('종이색', S, 'paper', Object.fromEntries(Object.entries(PAPERS).map(([k, p]) => [k, p.name])), redraw), slider('종이 질감', S, 'grain', [0, 1, 0.05], redraw, (v) => Math.round(v * 100) + '%'),
      check('고대비 종이 (불빛 영향 줄임)', S, 'contrast', redraw),
      el('h3', { textContent: '보기' }), check('한 쪽 크게 보기', S, 'single', () => { this.r.saveSettings(); this.host.onView?.(); }), slider('확대', S, 'zoom', [0.7, 1.8, 0.05], () => { this.r.saveSettings(); this.host.onView?.(); }, (v) => Math.round(v * 100) + '%'), slider('장 넘김 시간', S, 'flip', [0.15, 1.2, 0.05], () => this.r.saveSettings(), (v) => v.toFixed(2) + '초'),
      el('h3', { textContent: '읽기 자세' }),
      ...(() => { const pv = () => { this.r.saveSettings(); this.host.onView?.(); }, deg = (v) => Math.round(v) + '°', cm = (v) => Math.round(v * 100) + 'cm';
        return [slider('시선 위아래', S, 'vPitch', [-75, 30, 1], pv, deg), slider('시선 좌우', S, 'vYaw', [-70, 70, 1], pv, deg), slider('시야각', S, 'vFov', [24, 75, 1], pv, deg),
          slider('책 높이', S, 'bH', [-0.15, 0.45, 0.01], pv, cm), slider('책 거리', S, 'bDist', [0.25, 0.7, 0.01], pv, cm), slider('책 좌우', S, 'bSide', [-0.3, 0.3, 0.01], pv, cm), slider('책 기울기', S, 'bTilt', [0, 90, 1], pv, deg),
          check('책을 잡은 손 보이기', S, 'hands', pv),
          el('div', { className: 'btns' }, el('button', { textContent: '자세 처음대로', onclick: () => { Object.assign(S, POSE_DEFAULTS); pv(); this.renderPanel(); } })),
          el('p', { className: 'sub', textContent: '읽는 중에 마우스 오른쪽 단추로 끌면 시선이 움직입니다. Shift+휠은 책 기울기, Alt+휠은 책 높이, Ctrl+휠은 확대입니다.' })]; })(),
      el('h3', { textContent: '낭독' }), slider('속도', S, 'ttsRate', [0.6, 1.8, 0.05], () => this.r.saveSettings(), (v) => v.toFixed(2) + '배'),
      select('목소리', S, 'ttsVoice', { '': '자동 (책의 언어)', ...Object.fromEntries(this.r.voices().map((v) => [v.name, `${v.name} (${v.lang})`])) }, () => this.r.saveSettings()),
      el('p', { className: 'sub', textContent: '목소리는 운영체제에 설치된 것을 씁니다. 한국어 음성 품질은 컴퓨터마다 다릅니다.' }));
    if (this.r.cur && !this.r.cur.pdf) body.append(el('h3', { textContent: '이 책' }), select('책의 나이', this.r.cur.meta, 'age', { new: '새 책', old: '헌 책 (누런 종이, 얼룩, 닳은 모서리)' }, () => this.r.setMeta(this.r.cur.meta.id, { age: this.r.cur.meta.age })));
  }
  _lib(body) {
    const file = el('input', { type: 'file', accept: '.epub,.pdf,.txt', multiple: true, style: 'display:none', onchange: () => { this.addFiles(file.files); file.value = ''; } });
    const imp = el('input', { type: 'file', accept: '.json', style: 'display:none', onchange: async () => { try { const n = await store.importBackup(imp.files[0]); await this.r.refreshLibrary(); this.host.toast(`백업에서 책 ${n}권을 가져왔습니다`); this.renderPanel(); } catch (e) { this.host.toast(e.message); } } });
    body.append(el('h3', { textContent: `내 서재 (${this.r.library.length}권)` }), el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, el('button', { className: 'act', textContent: '책 추가 (EPUB · PDF · TXT)', onclick: () => file.click() }), file, imp),
      el('p', { className: 'sub', textContent: '파일을 창에 끌어다 놓아도 됩니다. 책은 이 컴퓨터의 브라우저에만 저장됩니다. DRM이 걸린 책은 열 수 없습니다.' }));
    for (const b of this.r.library) {
      const cur = this.r.cur?.meta.id === b.id, picked = this.host.picked?.() === b.id;
      body.append(el('div', { className: 'bk' }, b.cover ? el('img', { src: b.cover }) : el('div', { className: 'nocover', style: `background:${b.color}`, textContent: b.title.slice(0, 18) }),
        el('div', {}, el('div', { className: 't', textContent: b.title }), el('div', { className: 'sub', textContent: `${b.author || '저자 미상'} · ${b.format.toUpperCase()} · ${Math.round((b.percent || 0) * 100)}%${b.finishedAt ? ' · 완독' : ''}` }),
          el('div', { className: 'btns' }, el('button', { className: cur || picked ? 'act' : '', textContent: cur ? '읽는 중' : picked ? '꺼낸 책' : '꺼내기', onclick: () => { this.host.pickBook(b.id); this.renderPanel(); } }),
            b.format !== 'pdf' ? el('button', { textContent: b.age === 'old' ? '헌 책' : '새 책', title: '새 책 / 헌 책 바꾸기', onclick: async () => { await this.r.setMeta(b.id, { age: b.age === 'old' ? 'new' : 'old' }); this.renderPanel(); } }) : null,
            el('button', { textContent: '삭제', onclick: async () => { if (confirm(`"${b.title}"을(를) 서재에서 뺄까요? 밑줄과 메모도 함께 지워집니다.`)) { await this.r.remove(b.id); this.host.onRemoved?.(b.id); this.renderPanel(); } } })))));
    }
    body.append(el('h3', { textContent: '백업' }), el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, el('button', { textContent: '파일 하나로 내보내기', onclick: async () => download(await store.exportBackup(true), `난로-백업-${store.today()}.json`) }), el('button', { textContent: '백업 가져오기', onclick: () => imp.click() })),
      el('p', { className: 'sub', textContent: '서재, 읽던 위치, 북마크, 밑줄, 메모, 통계, 책 파일이 한 파일에 담깁니다.' }));
  }
  async _stats(body) {
    const st = await store.getStats(), days = Object.keys(st).sort().reverse(), fmt = (s) => s >= 3600 ? `${Math.floor(s / 3600)}시간 ${Math.round(s % 3600 / 60)}분` : `${Math.round(s / 60)}분`;
    const tot = days.reduce((a, d) => ({ s: a.s + (st[d].seconds || 0), p: a.p + (st[d].pages || 0), l: a.l + (st[d].logs || 0) }), { s: 0, p: 0, l: 0 }), td = st[store.today()] || {};
    body.append(el('h3', { textContent: '오늘' }), el('p', { textContent: `장작 ${td.logs || 0}개 · ${fmt(td.seconds || 0)} · ${td.pages || 0}쪽` }),
      el('h3', { textContent: '지금까지' }), el('p', { textContent: `장작 ${tot.l}개 · ${fmt(tot.s)} · ${tot.p}쪽 · 읽기 속도 분당 ${this.r.set.cpm}자` }), el('h3', { textContent: '날짜별' }));
    const max = Math.max(60, ...days.map((d) => st[d].seconds || 0));
    for (const d of days.slice(0, 30)) body.append(el('div', { className: 'f', style: 'grid-template-columns:92px 1fr 150px' }, el('span', { textContent: d }), el('div', { style: `height:8px;border-radius:4px;background:#d98a3a;width:${Math.max(2, (st[d].seconds || 0) / max * 100)}%` }), el('span', { className: 'v', textContent: `${fmt(st[d].seconds || 0)} · ${st[d].pages || 0}쪽 · 장작 ${st[d].logs || 0}` })));
    if (!days.length) body.append(el('p', { className: 'sub', textContent: '아직 기록이 없습니다.' }));
    const done = this.r.library.filter((b) => b.finishedAt);
    body.append(el('h3', { textContent: `다 읽은 책 (${done.length})` })); for (const b of done) body.append(el('div', { className: 'item', textContent: `${b.title} · ${store.today(new Date(b.finishedAt))}` }));
  }

  // 선택 팝업: 새 선택(range) 또는 기존 밑줄(hl)
  showPop(x, y, { range, hl }) {
    const P = this.pop; P.innerHTML = ''; const r = this.r;
    const B = (label, fn) => el('button', { textContent: label, onclick: () => { fn(); } });
    for (const [k, pen] of Object.entries(PENS)) P.append(el('button', { className: 'pen', title: pen.name, style: `background:${pen.c}`, onclick: () => { if (hl) r.updateHighlight(hl.id, { color: k }); else r.addHighlight(range[0], range[1], k); this.hidePop(); } }));
    const text = hl ? hl.text : r.selectedText();
    P.append(B('메모', () => { const h = hl || r.addHighlight(range[0], range[1], 'pencil'); this.hidePop(); if (h) this.editNote(h); }),
      B('사전', () => { this.hidePop(); this.lookup(text); }), B('인용구 카드', () => { this.hidePop(); this.host.quoteCard?.(text); }),
      B('여기부터 낭독', () => { const g = hl ? hl.start : range[0]; this.hidePop(); r.setSelection(null); r.startTts(g); }),
      B('복사', () => { navigator.clipboard?.writeText(text).then(() => this.host.toast('복사했습니다')); this.hidePop(); }));
    if (hl) P.append(B('밑줄 지우기', () => { r.removeHighlight(hl.id); this.hidePop(); }));
    P.classList.add('open'); P.style.left = Math.max(8, Math.min(innerWidth - 340, x - 120)) + 'px'; P.style.top = Math.max(8, y - 96) + 'px';
  }
  hidePop() { if (this.pop.classList.contains('open')) { this.pop.classList.remove('open'); if (this.r.selection) this.r.setSelection(null); } }
  async lookup(word) {
    const D = this.dict; D.classList.add('open'); D.innerHTML = `<h4>${esc(word)}</h4>찾는 중…`;
    const close = el('button', { textContent: '닫기', style: 'float:right', onclick: () => D.classList.remove('open') });
    try { const res = await this.r.lookup(word.split(/\s+/)[0]); D.innerHTML = ''; D.append(close, el('h4', { textContent: res.word }), res.text || '뜻을 찾지 못했습니다.', el('div', { style: 'margin-top:10px' }, el('a', { href: res.url, target: '_blank', rel: 'noopener', textContent: '위키낱말사전에서 보기' }))); }
    catch { D.innerHTML = ''; D.append(close, el('h4', { textContent: word }), '사전에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.'); }
  }
}
