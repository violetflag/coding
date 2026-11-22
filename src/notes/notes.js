// 메모장: 책을 읽다가 옆에 펴 놓고 마크다운으로 정리하는 창. M 키나 "메모" 단추로 열고 닫는다.
// 메모 파일은 책마다 하나("책 제목.md"), 더 만들면 "책 제목 (2).md". 맨 위 머리말에 책 정보와 읽던 곳이 들어간다.
// 글을 치다 멈추면 1초 뒤, 그리고 창을 닫을 때 저장한다. 창이 열려 있는 동안은 걷기·쪽 넘기기 키가 먹지 않는다.
import { MdEditor, ICONS } from './editor.js';
import { parseNote, stringifyNote, bookMeta, isoLocal } from './frontmatter.js';
import { listNotes, readNoteFile, saveNoteFile, notesFolder, openNotesFolder, safeStem, downloadNote } from './store.js';
import { textRange } from '../reader/typeset.js';
import { DESKTOP } from '../desktop.js';

const CSS = `
#notes { position: fixed; top: 0; right: 0; bottom: 0; width: min(500px, 44vw); min-width: min(360px, 100vw); z-index: 6; display: none; flex-direction: column; box-sizing: border-box;
  background: rgba(20,14,9,.96); border-left: 1px solid #4a3a28; color: #e9dcc6; font: 13.5px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; }
#notes.open { display: flex; animation: ntIn .2s ease-out; } @keyframes ntIn { from { transform: translateX(24px); opacity: 0; } }
#notes button { background: #2a1f15; color: inherit; border: 1px solid #5c4a33; border-radius: 5px; padding: 5px 10px; font: inherit; font-size: 12.5px; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 5px; }
#notes button:hover { filter: brightness(1.25); } #notes button.act { background: #a8621f; border-color: #d98a3a; color: #fff; }
#notes button:disabled { opacity: .4; cursor: default; filter: none; }
#notes .hd { padding: 12px 14px 8px; border-bottom: 1px solid #3a2c1e; display: grid; grid-template-columns: 1fr auto auto; gap: 4px 10px; align-items: start; }
#notes .bt { font: 600 15px "Noto Serif KR", "Nanum Myeongjo", serif; color: #f0c98a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#notes .bi { grid-column: 1 / -1; font-size: 12px; opacity: .65; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#notes .st { font-size: 12px; opacity: .7; align-self: center; white-space: nowrap; } #notes .st.warn { color: #ff9a7a; opacity: 1; }
#notes .x { padding: 3px 9px; }
#notes .files { display: flex; gap: 6px; padding: 8px 14px; align-items: center; flex-wrap: wrap; border-bottom: 1px solid #3a2c1e; }
#notes select, #notes input[type=text] { background: #0e0a07; color: inherit; border: 1px solid #4a3a28; border-radius: 4px; padding: 5px 7px; font: inherit; font-size: 12.5px; min-width: 0; }
#notes .files select { flex: 1 1 150px; }
#notes .tags { display: flex; gap: 8px; align-items: center; padding: 6px 14px 0; font-size: 12px; } #notes .tags input { flex: 1; }
#notes .md { flex: 1; display: flex; flex-direction: column; min-height: 0; padding: 8px 14px 4px; gap: 8px; }
#notes .mdbar { display: flex; flex-wrap: wrap; gap: 6px 8px; }
#notes .grp { display: flex; gap: 2px; margin-right: 8px; }
#notes .grp.wide { flex-basis: 100%; margin-right: 0; gap: 6px; flex-wrap: wrap; }
#notes .tb { padding: 4px 6px; min-width: 28px; height: 28px; justify-content: center; border-color: #3f3122; background: #231a12; }
#notes .tb.txt { padding: 4px 9px; } #notes .tb .gl { font-size: 14px; line-height: 1; }
#notes .tb.on { background: #5a3a1c; border-color: #b9783a; }
#notes .md.previewing .grp:not(.wide) .tb:not([data-k=undo]):not([data-k=redo]) { opacity: .45; }
#notes .mdtext { flex: 1; min-height: 120px; resize: none; background: #0e0a07; color: #efe4d0; border: 1px solid #4a3a28; border-radius: 6px; padding: 12px 14px; box-sizing: border-box;
  font: 14.5px/1.75 "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; outline: none; tab-size: 4; }
#notes .mdtext:focus { border-color: #8a6a44; }
#notes .mdview { flex: 1; min-height: 120px; overflow: auto; background: #f3ead8; color: #2b2118; border-radius: 6px; padding: 14px 18px; box-sizing: border-box; font: 14.5px/1.75 "Noto Serif KR", "Nanum Myeongjo", serif; }
#notes .mdview h1, #notes .mdview h2, #notes .mdview h3 { font-family: inherit; color: #5a2f10; margin: .9em 0 .4em; line-height: 1.35; } #notes .mdview h1 { font-size: 1.5em; } #notes .mdview h2 { font-size: 1.25em; } #notes .mdview h3 { font-size: 1.08em; }
#notes .mdview > :first-child { margin-top: 0; } #notes .mdview p { margin: .5em 0; }
#notes .mdview blockquote { margin: .6em 0; padding: .2em .9em; border-left: 3px solid #c08a4a; color: #5b4a38; background: rgba(192,138,74,.1); }
#notes .mdview code { background: rgba(60,40,20,.1); padding: 0 .3em; border-radius: 3px; font: .92em Consolas, monospace; } #notes .mdview pre { background: #2a2018; color: #f0e4cc; padding: 10px 12px; border-radius: 5px; overflow: auto; } #notes .mdview pre code { background: none; color: inherit; }
#notes .mdview table { border-collapse: collapse; margin: .6em 0; } #notes .mdview th, #notes .mdview td { border: 1px solid #c9b494; padding: 4px 9px; } #notes .mdview th { background: rgba(192,138,74,.15); }
#notes .mdview hr { border: 0; border-top: 1px solid #c9b494; margin: 1.1em 0; } #notes .mdview a { color: #8a3f10; }
#notes .mdview ul, #notes .mdview ol { padding-left: 1.5em; } #notes .mdview li:has(> input[type=checkbox]) { list-style: none; margin-left: -1.3em; } #notes .mdview input[type=checkbox] { margin-right: .45em; accent-color: #a8621f; cursor: pointer; }
#notes .mdview .sub { opacity: .55; }
#notes .ft { padding: 6px 14px 10px; font-size: 11.5px; opacity: .55; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#noteBtn { position: fixed; right: 14px; top: 12px; z-index: 5; padding: 6px 13px; border-radius: 16px; font: 13px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; display: none; align-items: center; gap: 6px;
  background: rgba(20,14,9,.72); color: #e9dcc6; border: 1px solid rgba(233,220,198,.28); cursor: pointer; opacity: .8; }
#noteBtn.on { display: inline-flex; } #noteBtn:hover { opacity: 1; background: rgba(120,60,20,.85); }
`;
const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); for (const k in props) { if (k === 'style') e.style.cssText = props[k]; else if (k.startsWith('on')) e.addEventListener(k.slice(2), props[k]); else if (k === 'html') e.innerHTML = props[k]; else e[k] = props[k]; } for (const c of kids.flat()) if (c != null) e.append(c); return e; };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hm = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
// 그림 설명 기능(src/ai/diagram.js)이 있으면 함께 묶인다. 없으면 빈 목록이 되어 오류 없이 넘어간다.
const AI = import.meta.glob('../ai/diagram.js');

// d: { reading, player, toast, onUiMode(open, width) }
export function setupNotes({ reading, player, toast, onUiMode }) {
  const reader = reading.reader, ui = reading.ui;
  document.head.append(el('style', { textContent: CSS }));
  const api = { isOpen: false, saveNoteFile, readNoteFile };
  // 지금 메모: { book, file, meta, extra }. files: 이 책의 메모 파일들
  let cur = null, files = [], dirty = false, timer = 0, line = Promise.resolve(), posTimer = 0;

  // ---- 화면
  const P = el('div', { id: 'notes', role: 'dialog', ariaLabel: '메모장' });
  const title = el('div', { className: 'bt' }), info = el('div', { className: 'bi' }), state = el('span', { className: 'st' });
  const closeBtn = el('button', { className: 'x', textContent: '✕', title: '닫기 (Esc)', onclick: () => api.close() });
  const pick = el('select', { title: '이 책의 메모 고르기', onchange: () => switchTo(pick.value) });
  const newBtn = el('button', { title: '이 책의 메모를 하나 더 만듭니다', html: ICONS.plus + '<span>새 메모</span>', onclick: () => newNote() });
  const fileBtn = DESKTOP
    ? el('button', { title: '메모 폴더를 탐색기로 엽니다', html: ICONS.folder + '<span>폴더 열기</span>', onclick: () => openNotesFolder() })
    : el('button', { title: '이 메모를 .md 파일로 내려받습니다', html: ICONS.down + '<span>내려받기 (.md)</span>', onclick: () => download() });
  const tags = el('input', { type: 'text', placeholder: '쉼표로 나눠 적기 (예: 겨울, 다시 읽기)', oninput: () => touch() });
  const foot = el('div', { className: 'ft' });
  const editor = (api.editor = new MdEditor({
    onChange: () => touch(), onSave: () => flush(),
    onPreview: (on) => { previewBtn.classList.toggle('act', on); previewBtn.querySelector('span').textContent = on ? '편집으로' : '미리 보기'; },
    extra: [
      { key: 'here', label: '지금 읽는 곳 넣기', icon: ICONS.here, title: '읽고 있는 장·쪽·퍼센트와 그 쪽의 글(고른 글이 있으면 그 글)을 인용으로 넣습니다', run: () => insertHere() },
      { key: 'preview', label: '미리 보기', icon: ICONS.eye, title: '꾸민 모양으로 보기 / 다시 고치기', run: () => editor.setPreview(!editor.previewing) },
      { key: 'ai', label: 'AI 그림 설명', icon: ICONS.draw, title: '이 메모를 그림(엑스칼리드로우)으로 풀어 설명합니다', run: () => openAi() },
    ],
  }));
  const previewBtn = editor.buttons.preview;
  P.append(el('div', { className: 'hd' }, title, state, closeBtn, info),
    el('div', { className: 'files' }, pick, newBtn, fileBtn),
    el('div', { className: 'tags' }, el('span', { textContent: '태그' }), tags),
    editor.el, foot);
  document.body.append(P);
  // 창 안에서 친 키는 방(걷기, 쪽 넘기기, 앉기)으로 가지 않는다
  for (const t of ['keydown', 'keyup', 'keypress']) P.addEventListener(t, (e) => { e.stopPropagation(); if (t === 'keydown' && e.code === 'Escape' && !e.isComposing) { e.preventDefault(); api.close(); } });
  for (const t of ['mousedown', 'wheel', 'click', 'dblclick', 'contextmenu']) P.addEventListener(t, (e) => e.stopPropagation());

  // 읽는 동안 늘 보이는 "메모" 단추 (오른쪽 위), 아래 진행 막대에도 하나
  const corner = el('button', { id: 'noteBtn', type: 'button', title: '메모장 열기 (M)', html: ICONS.pen + '<span>메모</span>', onclick: (e) => { e.stopPropagation(); api.toggle(); } });
  corner.addEventListener('mousedown', (e) => e.stopPropagation());
  document.body.append(corner);
  const row = ui.bar.querySelector('.row');
  if (row) row.insertBefore(el('button', { textContent: '메모', title: '메모장 (M)', onclick: (e) => { e.stopPropagation(); api.toggle(); } }), row.lastElementChild);
  const syncCorner = () => corner.classList.toggle('on', player.state === 'reading' && !api.isOpen && !ui.isOpen);
  setInterval(syncCorner, 400);

  // ---- 책과 읽던 곳
  // 메모의 대상 책: 펼친 책, 없으면 꺼낸 책, 없으면 서재의 첫 책. 서재가 비어 있으면 책 없는 메모.
  const bookNow = () => {
    const c = reader.cur, lib = reader.library;
    if (c) return { ...c.meta, language: c.book.language || '', publisher: c.book.publisher || '', date: c.book.date || '' };
    return lib.find((b) => b.id === reading.picked()) || lib[0] || null;
  };
  const sameBook = () => !!cur?.book && reader.cur?.meta.id === cur.book.id;
  const position = () => {
    const i = reader.info(); if (!i) return null;
    return { chapter: i.chapter || '', page: i.page, pages: i.pages, percent: Math.round(i.percent * 1000) / 10 };
  };
  const showInfo = () => {
    if (!cur) return;
    const b = cur.book, pos = sameBook() ? position() : cur.meta.position;
    title.textContent = cur.meta.title || b?.title || '메모'; title.title = title.textContent;
    const bits = [cur.meta.author || b?.author || '저자 미상'];
    if (pos?.page) bits.push(`${pos.page}쪽 / ${pos.pages}쪽 · ${Math.round(pos.percent)}%` + (pos.chapter ? ` · ${pos.chapter}` : ''));
    info.textContent = bits.join(' · ');
  };
  const setState = (t, warn = false) => { state.textContent = t; state.classList.toggle('warn', warn); };

  // ---- 파일
  const baseOf = (book) => safeStem(book?.title || '메모');
  const numOf = (name, base) => { const m = name.match(new RegExp(`^${esc(base)}(?: \\((\\d+)\\))?\\.md$`)); return m ? +(m[1] || 1) : 0; };
  async function refreshFiles() {
    const base = baseOf(cur?.book);
    let all = []; try { all = await listNotes(); } catch (e) { console.warn('메모 목록을 읽지 못했습니다', e); }
    files = all.filter((f) => numOf(f.name, base)).sort((a, b) => numOf(a.name, base) - numOf(b.name, base));
    if (cur && !files.some((f) => f.name === cur.file)) files.push({ name: cur.file, modified: 0, unsaved: true });
    pick.innerHTML = '';
    for (const f of files) pick.add(new Option(`${f.name}${f.modified ? '  · ' + hm(f.modified) : '  · 새 메모'}`, f.name, false, f.name === cur?.file));
    pick.value = cur?.file || '';
    foot.textContent = DESKTOP ? `저장 위치: ${(await notesFolder().catch(() => '')) || '메모 폴더'}\\${cur?.file || ''}` : '메모는 이 브라우저에 저장됩니다. 파일로 갖고 싶으면 "내려받기"를 누르세요.';
  }
  async function load(book, name) {
    const text = await readNoteFile(name).catch((e) => { console.warn(e); toast('메모를 읽지 못했습니다'); return null; });
    const fresh = bookMeta(book);
    if (text == null) cur = { book, file: name, meta: fresh, extra: [], isNew: true };
    else {
      const p = parseNote(text);
      // 머리말이 없거나 빠진 항목은 책에서 채운다(사용자가 고친 값은 그대로 둔다)
      for (const k of ['title', 'author', 'language', 'publisher', 'date', 'source_file', 'book_id', 'format', 'created']) if (p.meta[k] == null || p.meta[k] === '') p.meta[k] = fresh[k];
      if (!Array.isArray(p.meta.tags)) p.meta.tags = [];
      cur = { book, file: name, meta: p.meta, extra: p.extra, body: p.body };
    }
    editor.setValue(cur.body || ''); tags.value = (cur.meta.tags || []).join(', ');
    dirty = false; setState(text == null ? '새 메모' : '저장됨'); showInfo(); await refreshFiles();
  }
  // 책의 메모를 연다: 가장 최근에 고친 것, 없으면 "책 제목.md"
  async function openBook(book) {
    await flush();
    const base = baseOf(book); cur = { book, file: base + '.md', meta: bookMeta(book), extra: [] };
    await refreshFiles();
    const last = files.filter((f) => !f.unsaved).sort((a, b) => b.modified - a.modified)[0];
    await load(book, last?.name || base + '.md');
  }
  async function switchTo(name) { if (!cur || name === cur.file) return; await flush(); await load(cur.book, name); editor.focus(); }
  async function newNote() {
    if (!cur) return; await flush();
    const base = baseOf(cur.book), n = Math.max(1, ...files.map((f) => numOf(f.name, base))) + 1, name = `${base} (${n}).md`;
    await load(cur.book, name); dirty = true; await flush(); editor.focus(); toast(`새 메모를 만들었습니다: ${name}`);
  }

  // ---- 저장: 치다가 멈추면 1초 뒤. 저장 중에 또 고치면 끝난 뒤 다시 저장한다.
  function touch() { if (!cur) return; dirty = true; setState('저장 안 됨'); clearTimeout(timer); timer = setTimeout(() => flush(), 1000); }
  const fullText = () => {
    const m = cur.meta; m.updated = isoLocal(); if (!m.created) m.created = m.updated;
    if (sameBook()) { const pos = position(); if (pos) m.position = pos; }
    m.tags = tags.value.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
    return stringifyNote(m, editor.value, cur.extra);
  };
  function flush() {
    clearTimeout(timer);
    return (line = line.then(async () => {
      if (!cur || !dirty) return;
      dirty = false; setState('저장 중…');
      const file = cur.file, text = fullText();
      try {
        await saveNoteFile(file, text); api.lastSaved = { file, text };
        if (cur.isNew) { cur.isNew = false; refreshFiles(); }
        if (!dirty) setState('저장됨 ' + hm(Date.now()).split(' ').pop());
      } catch (e) { console.warn(e); dirty = true; setState('저장하지 못했습니다', true); toast('메모를 저장하지 못했습니다: ' + (e?.message || e)); }
    }));
  }
  async function download() {
    if (!cur) return; await flush();
    const text = cur.isNew ? fullText() : (await readNoteFile(cur.file)) ?? fullText();
    downloadNote(cur.file, text).then((p) => p && toast('저장했습니다: ' + p), (e) => toast('내려받지 못했습니다: ' + (e?.message || e)));
  }

  // ---- 지금 읽는 곳: "> **장** · 3–4쪽 / 40쪽 · 12%" 와 고른 글(없으면 그 쪽의 첫 문장)
  function insertHere() {
    const c = reader.cur, i = reader.info();
    if (!c || !i) { toast('펼친 책이 없습니다. 책을 펼친 뒤에 넣을 수 있습니다'); return; }
    if (!sameBook()) toast('지금 펼친 책과 다른 책의 메모입니다');
    const where = `> **${i.chapter || c.meta.title}** · ${i.page}–${Math.min(i.pages, i.page + 1)}쪽 / ${i.pages}쪽 · ${Math.round(i.percent * 100)}%`;
    let text = '';
    if (!c.pdf) {
      text = reader.selection ? reader.selectedText() : '';
      if (!text) text = firstSentence(c, reader.pages[c.spread]);
      if (text.length > 400) text = text.slice(0, 400) + '…';
    }
    if (editor.previewing) editor.setPreview(false);
    editor.insertBlock(where + (text ? '\n> ' + text.replace(/\n+/g, ' ') : ''));
  }

  // 쪽의 첫 문장. 쪽이 문장 중간에서 시작하면 그 문장은 건너뛴다.
  function firstSentence(c, pg) {
    if (!pg) return '';
    let raw = textRange(c.book, pg.g0, Math.min(c.book.length, pg.g0 + 320)).replace(/\s+/g, ' ').trim();
    const END = /[.!?。…]+["'”’」』)]*(\s|$)/g;
    if (pg.g0 > 0 && textRange(c.book, pg.g0 - 1, pg.g0) !== '\n') { const m = END.exec(raw); if (m && m.index < 200) raw = raw.slice(m.index + m[0].length); }
    END.lastIndex = 0; const m = END.exec(raw);
    if (m && m.index > 4 && m.index < 180) return raw.slice(0, m.index + m[0].length).trim();
    return raw.slice(0, 100).trim() + (raw.length > 100 ? '…' : '');
  }

  // ---- 그림 설명(다른 기능): 메모 본문, 머리말, 파일 이름과 저장 함수를 넘긴다
  async function openAi() {
    if (!cur) return;
    await flush();
    const meta = { ...cur.meta, tags: tags.value.split(/[,，]/).map((t) => t.trim()).filter(Boolean) };
    try {
      const load = AI['../ai/diagram.js']; if (!load) throw new Error('그림 기능이 없습니다');
      const m = await load(); await m.openDiagram({ markdown: editor.value, meta, noteFile: cur.file, saveNoteFile, readNoteFile });
    } catch (e) { console.warn(e); toast('AI 그림 기능을 불러오지 못했습니다'); }
  }

  // ---- 열고 닫기
  api.open = async () => {
    if (api.isOpen) { editor.focus(); return; }
    if (ui.isOpen) ui.close();
    api.isOpen = true; P.classList.add('open'); player.keys?.clear(); syncCorner();
    onUiMode?.(true, P.getBoundingClientRect().width);
    const book = bookNow();
    if (!cur || (book?.id || '') !== (cur.book?.id || '')) { setState('여는 중…'); await openBook(book); }
    else { showInfo(); refreshFiles(); }
    clearInterval(posTimer); posTimer = setInterval(showInfo, 1000);
    if (api.isOpen) editor.focus();
  };
  api.close = (quiet = false) => {
    if (!api.isOpen) return;
    api.isOpen = false; P.classList.remove('open'); clearInterval(posTimer); flush(); syncCorner();
    if (P.contains(document.activeElement)) document.activeElement.blur();
    if (!quiet) onUiMode?.(false);
  };
  api.toggle = () => (api.isOpen ? api.close() : api.open());
  api.flush = flush;
  // 메모 폴더를 바꾼 뒤: 새 폴더에서 다시 읽는다
  api.reload = async () => { await flush(); cur = null; if (api.isOpen) await openBook(bookNow()); };
  api.current = () => cur && { file: cur.file, meta: cur.meta, body: editor.value };

  // M: 열기/닫기 (글을 치는 중이 아닐 때). Esc: 창 밖에 초점이 있어도 메모장부터 닫는다(책을 덮지 않게).
  const typing = (e) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement || e.target?.isContentEditable;
  addEventListener('keydown', (e) => {
    if (!api.isOpen || e.code !== 'Escape' || ui.isOpen || document.querySelector('#settings.open, #help.on')) return;
    e.preventDefault(); e.stopImmediatePropagation(); api.close();
  }, true);
  // 걷는 중에 메모장을 열어 두었으면 걷기 키를 막는다(읽는 중에는 책을 눌러 둔 뒤 ← → 로 넘길 수 있게 둔다)
  addEventListener('keydown', (e) => {
    if (api.isOpen && player.state !== 'reading' && !typing(e) && /^(Key[WASDE]|Space|Arrow|Shift|Control)/.test(e.code)) e.stopImmediatePropagation();
  }, true);
  addEventListener('keydown', (e) => { if (e.code === 'KeyM' && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey && !typing(e)) { e.preventDefault(); api.toggle(); } });
  // 방을 눌러 다시 둘러보기 시작하면(마우스가 잡히면) 메모장을 닫는다
  document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement && api.isOpen) api.close(); });
  // 다른 책을 펼치면 그 책의 메모로 바꾼다
  const prevOpen = reading.onOpen; reading.onOpen = (meta) => { prevOpen?.(meta); if (api.isOpen && cur?.book?.id !== meta.id) openBook(bookNow()); };
  // 옆 메뉴(Tab)를 열면 메모장은 닫는다(같은 자리를 쓴다)
  const uiOpen = ui.open.bind(ui); ui.open = (tab) => { if (api.isOpen) api.close(true); uiOpen(tab); };
  addEventListener('beforeunload', () => { if (dirty) flush(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && dirty) flush(); });
  return api;
}
