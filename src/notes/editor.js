// 마크다운 메모 편집기: 글 상자 하나와 워드프로세서 같은 도구 막대.
// 마크다운을 몰라도 단추를 누르면 기호가 들어간다. 이미 들어간 곳에서 다시 누르면 기호를 뺀다.
// 되돌리기는 편집기가 직접 기억한다(단추로 바꾼 것과 손으로 친 것을 같은 줄에 쌓는다).

// 아이콘: 16×16, 선 그림
const svg = (d, extra = '') => `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${d}</svg>`;
export const ICONS = {
  ul: svg('<circle cx="3" cy="4" r=".9" fill="currentColor"/><circle cx="3" cy="8" r=".9" fill="currentColor"/><circle cx="3" cy="12" r=".9" fill="currentColor"/><path d="M6.5 4h7M6.5 8h7M6.5 12h7"/>'),
  ol: svg('<path d="M2.2 2.8l1-.6v3.6M2 9.2c.3-.5 1.9-.7 1.9.4 0 .8-1.9 1.6-1.9 2.6h2M6.5 4h7M6.5 8h7M6.5 12h7"/>'),
  task: svg('<rect x="1.8" y="2.5" width="4.4" height="4.4" rx=".8"/><path d="M2.8 4.7l.9.9 1.5-1.8M8.5 4.7h5.5"/><rect x="1.8" y="9.1" width="4.4" height="4.4" rx=".8"/><path d="M8.5 11.3h5.5"/>'),
  quote: svg('<path d="M3 3v10"/><path d="M6.5 5h7M6.5 8h7M6.5 11h4.5"/>'),
  hr: svg('<path d="M1.5 8h13"/><path d="M4 4.5h8M4 11.5h8" opacity=".35"/>'),
  link: svg('<path d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2.2-2.2a2.6 2.6 0 0 0-3.7-3.7l-.8.8"/><path d="M9.2 6.8a2.6 2.6 0 0 0-3.7 0L3.3 9a2.6 2.6 0 0 0 3.7 3.7l.8-.8"/>'),
  code: svg('<path d="M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5"/>'),
  table: svg('<rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1"/><path d="M1.8 6.3h12.4M1.8 9.7h12.4M6 2.8v10.4M10 2.8v10.4"/>'),
  undo: svg('<path d="M5.5 3L2.5 6l3 3"/><path d="M2.8 6h6.7a4 4 0 0 1 0 8H7"/>'),
  redo: svg('<path d="M10.5 3l3 3-3 3"/><path d="M13.2 6H6.5a4 4 0 0 0 0 8H9"/>'),
  here: svg('<path d="M4 1.8h8v12.4l-4-3-4 3z"/>'),
  eye: svg('<path d="M1.2 8s2.5-4.6 6.8-4.6S14.8 8 14.8 8s-2.5 4.6-6.8 4.6S1.2 8 1.2 8z"/><circle cx="8" cy="8" r="2"/>'),
  pen: svg('<path d="M10.8 2.6l2.6 2.6-7.6 7.6-3.3.7.7-3.3z"/><path d="M9.3 4.1l2.6 2.6"/>'),
  draw: svg('<rect x="1.6" y="2.2" width="5" height="4" rx=".8"/><rect x="9.4" y="9.8" width="5" height="4" rx=".8"/><path d="M4.1 6.2v3.6a2 2 0 0 0 2 2h3.3"/><path d="M11.9 2.2l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z" fill="currentColor" stroke-width="1"/>'),
  plus: svg('<path d="M8 3v10M3 8h10"/>'),
  folder: svg('<path d="M1.8 4.2a1 1 0 0 1 1-1h3.1l1.4 1.5h5.9a1 1 0 0 1 1 1v6.9a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1z"/>'),
  down: svg('<path d="M8 2.5v7.5M4.8 7l3.2 3.2L11.2 7M2.5 13.5h11"/>'),
};
// 글자로 보여 주는 아이콘
const glyph = (t, css) => `<span class="gl" style="${css}">${t}</span>`;

const LIST = /^(\s*)([-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)/;
const kindOf = (line) => { const m = line.match(LIST); if (!m) return null; return /\[[ xX]\]/.test(m[2]) ? 'task' : /\d/.test(m[2]) ? 'ol' : 'ul'; };
// 줄 앞의 꾸밈(목록, 인용, 제목 기호)
const PREFIX = /^(\s*(?:>\s?)*(?:#{1,6}\s+)?(?:[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)?)/;

export class MdEditor {
  // opts: { onChange(), onSave(), extra: 도구 막대 끝에 붙일 단추들 [{ key, label, icon, title, run }] }
  constructor(opts = {}) {
    this.opts = opts;
    const el = (this.el = document.createElement('div')); el.className = 'md';
    this.bar = document.createElement('div'); this.bar.className = 'mdbar'; this.bar.setAttribute('role', 'toolbar'); this.bar.setAttribute('aria-label', '꾸미기');
    const ta = (this.ta = document.createElement('textarea'));
    ta.className = 'mdtext'; ta.spellcheck = false; ta.placeholder = '여기에 메모를 적으세요.\n위의 단추로 굵게, 제목, 목록 같은 꾸밈을 넣을 수 있습니다.';
    this.view = document.createElement('div'); this.view.className = 'mdview'; this.view.hidden = true;
    el.append(this.bar, ta, this.view);
    this.buttons = {};
    const groups = [
      [['bold', '굵게', glyph('B', 'font-weight:800'), '굵게 (Ctrl+B)', () => this.wrap('**', '굵은 글씨')],
        ['italic', '기울임', glyph('I', 'font-style:italic;font-family:Georgia,serif'), '기울임 (Ctrl+I)', () => this.wrap('*', '기울인 글씨')],
        ['strike', '취소선', glyph('S', 'text-decoration:line-through'), '취소선', () => this.wrap('~~', '지운 글씨')]],
      [['h1', '제목 1', glyph('제목1', 'font-size:11px;font-weight:700'), '제목 1 (가장 큰 제목)', () => this.heading(1)],
        ['h2', '제목 2', glyph('제목2', 'font-size:11px;font-weight:600'), '제목 2', () => this.heading(2)],
        ['h3', '제목 3', glyph('제목3', 'font-size:11px'), '제목 3', () => this.heading(3)]],
      [['ul', '글머리 목록', ICONS.ul, '글머리 기호 목록', () => this.list('ul')],
        ['ol', '번호 목록', ICONS.ol, '번호 매기기 목록', () => this.list('ol')],
        ['task', '할 일 목록', ICONS.task, '할 일 목록 (체크 상자)', () => this.list('task')],
        ['quote', '인용', ICONS.quote, '인용', () => this.list('quote')]],
      [['hr', '구분선', ICONS.hr, '구분선 넣기', () => this.hr()],
        ['link', '링크', ICONS.link, '링크 (Ctrl+K)', () => this.link()],
        ['code', '코드', ICONS.code, '코드 (여러 줄을 고르면 코드 블록)', () => this.code()],
        ['table', '표 넣기', ICONS.table, '표 넣기', () => this.table()]],
      [['undo', '실행 취소', ICONS.undo, '실행 취소 (Ctrl+Z)', () => this.undo()],
        ['redo', '다시 실행', ICONS.redo, '다시 실행 (Ctrl+Y)', () => this.redo()]],
    ];
    for (const g of groups) {
      const grp = document.createElement('div'); grp.className = 'grp';
      for (const [key, label, icon, title, run] of g) grp.append(this._btn(key, label, icon, title, run, false));
      this.bar.append(grp);
    }
    if (opts.extra?.length) {
      const grp = document.createElement('div'); grp.className = 'grp wide';
      for (const b of opts.extra) grp.append(this._btn(b.key, b.label, b.icon, b.title, b.run, true));
      this.bar.append(grp);
    }
    this.hist = [{ v: '', s: 0, e: 0 }]; this.hi = 0; this.grouping = false; this.lastAt = 0;
    ta.addEventListener('input', (e) => { if (e.inputType === 'insertLineBreak' && this._continueList()) return; this._record(/^(insertText|insertCompositionText|deleteContent|deleteComposition)/.test(e.inputType || '')); this.opts.onChange?.(); });
    ta.addEventListener('beforeinput', (e) => { if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') { e.preventDefault(); e.inputType === 'historyUndo' ? this.undo() : this.redo(); } });
    ta.addEventListener('keydown', (e) => this._key(e));
    // 미리 보기의 할 일 상자를 누르면 원문의 [ ] 와 [x] 를 바꾼다. 링크는 난로 창을 떠나지 않게 새 창(웹) 으로만 연다.
    this.view.addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (a) { e.preventDefault(); const href = a.getAttribute('href') || ''; if (/^https?:\/\//i.test(href)) window.open(href, '_blank', 'noopener'); return; }
      if (e.target.matches('input[type=checkbox]')) { const boxes = [...this.view.querySelectorAll('input[type=checkbox]')]; this.toggleTask(boxes.indexOf(e.target)); }
    });
  }
  _btn(key, label, icon, title, run, text) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tb' + (text ? ' txt' : ''); b.title = title; b.setAttribute('aria-label', label); b.dataset.k = key;
    b.innerHTML = icon + (text ? `<span>${label}</span>` : '');
    b.addEventListener('mousedown', (e) => e.preventDefault());              // 누르는 동안 글 상자의 선택을 잃지 않게
    b.addEventListener('click', (e) => { e.stopPropagation(); if (this.previewing && !text && key !== 'undo' && key !== 'redo') this.setPreview(false); run(); });
    this.buttons[key] = b; return b;
  }

  get value() { return this.ta.value; }
  // 새 글을 넣는다(파일을 바꿀 때). 되돌리기 기록도 새로 시작한다.
  setValue(v) { this.ta.value = v; this.ta.setSelectionRange(v.length, v.length); this.hist = [{ v, s: v.length, e: v.length }]; this.hi = 0; this.grouping = false; if (this.previewing) this.render(); }
  focus() { if (!this.previewing) this.ta.focus({ preventScroll: true }); }

  // ---- 되돌리기 기록
  _record(group) {
    const st = { v: this.ta.value, s: this.ta.selectionStart, e: this.ta.selectionEnd }, now = performance.now();
    if (group && this.grouping && this.hi === this.hist.length - 1 && this.hi > 0 && now - this.lastAt < 1200) this.hist[this.hi] = st;
    else { this.hist.splice(this.hi + 1); this.hist.push(st); if (this.hist.length > 400) this.hist.shift(); this.hi = this.hist.length - 1; }
    this.grouping = group; this.lastAt = now;
  }
  _apply(st) { this.ta.value = st.v; this.ta.setSelectionRange(st.s, st.e); this.grouping = false; this.opts.onChange?.(); if (this.previewing) this.render(); }
  undo() { if (this.hi <= 0) return false; this._apply(this.hist[--this.hi]); this.focus(); return true; }
  redo() { if (this.hi >= this.hist.length - 1) return false; this._apply(this.hist[++this.hi]); this.focus(); return true; }

  // 글 상자의 [a, b) 를 text 로 바꾸고 [s, e] 를 고른다
  _edit(a, b, text, s, e) {
    const ta = this.ta; this.focus();
    ta.setRangeText(text, a, b); ta.setSelectionRange(s, e);
    this._record(false); this.opts.onChange?.();
  }
  _sel() { return { s: this.ta.selectionStart, e: this.ta.selectionEnd, v: this.ta.value }; }
  // 고른 곳이 걸친 줄들 [ls, le)
  _lines() {
    const { s, e, v } = this._sel(), end = e > s && v[e - 1] === '\n' ? e - 1 : e;
    const ls = v.lastIndexOf('\n', s - 1) + 1; let le = v.indexOf('\n', end); if (le < 0) le = v.length;
    return { ls, le, lines: v.slice(ls, le).split('\n'), s, e, v };
  }

  // ---- 글자 꾸밈: **굵게**, *기울임*, ~~취소선~~, `코드`
  wrap(mark, ph) {
    const { s, e, v } = this._sel(), n = mark.length, c = mark[0];
    const runL = (i) => { let k = 0; while (i - k - 1 >= 0 && v[i - k - 1] === c) k++; return k; };
    const runR = (i) => { let k = 0; while (i + k < v.length && v[i + k] === c) k++; return k; };
    const on = (k, j) => (c === '*' ? (n === 2 ? Math.min(k, j) >= 2 : Math.min(k, j) === 1 || Math.min(k, j) >= 3) : Math.min(k, j) >= n);
    const t = v.slice(s, e);
    if (t.includes('\n')) return this._wrapLines(mark);
    // 앞뒤 공백은 꾸밈 밖에 둔다 (마크다운은 "** 글 **" 을 꾸밈으로 보지 않는다)
    const a = s + (t.length - t.trimStart().length), b = e - (t.length - t.trimEnd().length);
    if (a < b) {
      const inner = v.slice(a, b);
      if (inner.length >= 2 * n + 1 && inner.startsWith(mark) && inner.endsWith(mark) && on(runR(a), runL(b))) return this._edit(a, b, inner.slice(n, -n), a, b - 2 * n);
      if (on(runL(a), runR(b))) return this._edit(a - n, b + n, inner, a - n, b - n);
      return this._edit(a, b, mark + inner + mark, a + n, b + n);
    }
    // 고른 것이 없으면: 빈 꾸밈 안이면 빼고, 아니면 자리 글자를 넣어 골라 둔다(바로 쳐서 바꾼다)
    if (v.slice(s - n, s) === mark && v.slice(s, s + n) === mark) return this._edit(s - n, s + n, '', s - n, s - n);
    const w = this._wordAt(s);
    if (w) { const inner = v.slice(w[0], w[1]); if (on(runL(w[0]), runR(w[1]))) return this._edit(w[0] - n, w[1] + n, inner, s - n, s - n); return this._edit(w[0], w[1], mark + inner + mark, s + n, s + n); }
    return this._edit(s, e, mark + ph + mark, s + n, s + n + ph.length);
  }
  // 커서가 낱말 한가운데 있으면 그 낱말 [a, b)
  _wordAt(i) {
    const v = this.ta.value, W = /[\p{L}\p{N}_]/u; if (!(i > 0 && W.test(v[i - 1]) && i < v.length && W.test(v[i]))) return null;
    let a = i, b = i; while (a > 0 && W.test(v[a - 1])) a--; while (b < v.length && W.test(v[b])) b++; return [a, b];
  }
  _wrapLines(mark) {
    const { ls, lines } = this._lines(), n = mark.length;
    const parts = lines.map((l) => { const p = l.match(PREFIX)[0], body = l.slice(p.length).trimEnd(); return { p, body, tail: l.slice(p.length + body.length) }; });
    const used = parts.filter((x) => x.body);
    const all = used.length && used.every((x) => x.body.length > 2 * n && x.body.startsWith(mark) && x.body.endsWith(mark));
    const out = parts.map((x) => x.p + (!x.body ? '' : all ? x.body.slice(n, -n) : mark + x.body + mark) + x.tail).join('\n');
    this._edit(ls, ls + lines.join('\n').length, out, ls, ls + out.length);
  }

  // ---- 줄 꾸밈: 제목, 목록, 인용
  heading(level) {
    const { ls, le, lines, s, e } = this._lines(), mark = '#'.repeat(level) + ' ';
    const all = lines.filter((l) => l.trim()).every((l) => (l.match(/^(#{1,6})\s/) || [])[1]?.length === level);
    const out = lines.map((l) => { const body = l.replace(/^#{1,6}\s+/, ''); return all || (!l.trim() && lines.length > 1) ? body : mark + body; });
    this._replaceLines(ls, le, lines, out, s, e);
  }
  list(kind) {
    const { ls, le, lines, s, e } = this._lines(), used = lines.filter((l) => l.trim());
    let out;
    if (kind === 'quote') {
      const all = used.length && used.every((l) => /^\s*>/.test(l));
      out = lines.map((l) => (all ? l.replace(/^(\s*)>\s?/, '$1') : '> ' + l).replace(/^> $/, '>'));
      if (!used.length) out = ['> ' + lines[0]];
    } else {
      const all = used.length && used.every((l) => kindOf(l) === kind);
      let no = 0;
      out = lines.map((l) => {
        if (!l.trim() && lines.length > 1) return l;
        const m = l.match(LIST), ind = m ? m[1] : l.match(/^\s*/)[0], body = m ? l.slice(m[0].length) : l.slice(ind.length);
        if (all) return ind + body;
        return ind + (kind === 'ul' ? '- ' : kind === 'task' ? '- [ ] ' : `${++no}. `) + body;
      });
    }
    this._replaceLines(ls, le, lines, out, s, e);
  }
  // 줄들을 바꾼다. 커서만 있었으면 줄 앞이 늘거나 준 만큼 커서를 옮기고, 골랐으면 바뀐 줄 전체를 고른다.
  _replaceLines(ls, le, lines, out, s, e) {
    const text = out.join('\n');
    if (s === e && lines.length === 1) { const d = text.length - lines[0].length, c = Math.max(ls, Math.min(ls + text.length, s + d)); return this._edit(ls, le, text, c, c); }
    this._edit(ls, le, text, ls, ls + text.length);
  }

  // ---- 덩어리 넣기: 앞뒤에 빈 줄을 두고 커서 자리 줄 다음에 넣는다 (--- 바로 위에 글이 있으면 제목이 되기 때문)
  // selFrom, selTo: 넣은 덩어리 안에서 고를 곳. 없으면 덩어리 아래 빈 줄에 커서를 둔다(바로 이어 쓴다).
  insertBlock(block, selFrom, selTo = selFrom) {
    const { le, v, ls } = this._lines(), lineEmpty = !v.slice(ls, le).trim(), at = lineEmpty ? ls : le, cut = lineEmpty ? le : at;
    const before = v.slice(0, at), after = v.slice(cut);
    const pre = !before ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const gap = (t) => (!t ? '' : t.startsWith('\n\n') ? '' : t.startsWith('\n') ? '\n' : '\n\n');
    const start = at + pre.length;
    if (selFrom == null) { const mid = pre + block + '\n\n', c = at + mid.length; return this._edit(at, cut, mid + gap(after), c, c); }
    this._edit(at, cut, pre + block + (gap(after) || '\n'), start + selFrom, start + selTo);
  }
  hr() { this.insertBlock('---'); }
  table() { const t = '| 제목 | 내용 |\n| --- | --- |\n|  |  |'; this.insertBlock(t, 2, 4); }
  link() {
    const { s, e, v } = this._sel(), t = v.slice(s, e), m = t.match(/^\[([^\]]*)\]\(([^)]*)\)$/);
    if (m) return this._edit(s, e, m[1], s, s + m[1].length);
    if (/^https?:\/\/\S+$/i.test(t)) { const lab = '링크 글자'; return this._edit(s, e, `[${lab}](${t})`, s + 1, s + 1 + lab.length); }
    const lab = t || '링크 글자', url = 'https://';
    this._edit(s, e, `[${lab}](${url})`, t ? s + lab.length + 3 : s + 1, t ? s + lab.length + 3 + url.length : s + 1 + lab.length);
  }
  code() {
    const { s, e, v } = this._sel(), t = v.slice(s, e);
    if (/^```[^\n]*\n[\s\S]*\n```$/.test(t)) { const inner = t.replace(/^```[^\n]*\n/, '').replace(/\n```$/, ''); return this._edit(s, e, inner, s, s + inner.length); }
    if (t.includes('\n')) { const { ls, lines } = this._lines(), body = lines.join('\n'); return this._edit(ls, ls + body.length, '```\n' + body + '\n```', ls, ls + body.length + 8); }
    this.wrap('`', '코드');
  }
  // 할 일 n번째의 [ ] ↔ [x]
  toggleTask(n) {
    const v = this.ta.value, re = /^(\s*[-*+]\s+\[)([ xX])(\])/gm; let m, i = 0;
    while ((m = re.exec(v))) { if (i++ === n) { const at = m.index + m[1].length; this._edit(at, at + 1, m[2] === ' ' ? 'x' : ' ', at + 1, at + 1); if (this.previewing) this.render(); return; } }
  }

  // ---- 키
  _key(e) {
    const k = e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() : '', mod = e.ctrlKey || e.metaKey;   // 한글 자판에서도 같은 자리의 키로 본다
    if (mod && !e.altKey) {
      const act = { b: () => this.wrap('**', '굵은 글씨'), i: () => this.wrap('*', '기울인 글씨'), k: () => this.link(), z: () => (e.shiftKey ? this.redo() : this.undo()), y: () => this.redo(), s: () => this.opts.onSave?.() }[k];
      if (act) { e.preventDefault(); act(); return; }
    }
  }
  // 줄을 바꾼 뒤: 바로 윗줄이 목록이나 인용이면 새 줄도 같은 목록으로. 빈 항목에서 줄을 바꾸면 목록을 끝낸다.
  // (keydown 이 아니라 input 에서 본다: 한글 조합 중에 Enter 를 눌러도 똑같이 된다)
  _continueList() {
    const ta = this.ta, s = ta.selectionStart, v = ta.value; if (s !== ta.selectionEnd || v[s - 1] !== '\n') return false;
    const ps = v.lastIndexOf('\n', s - 2) + 1, prev = v.slice(ps, s - 1);
    const m = prev.match(/^(\s*)(>\s?)?([-*+]\s+\[[ xX]\]\s+|[-*+]\s+|(\d+)([.)])\s+)/) || prev.match(/^(\s*)(>\s?)()/);
    if (!m || (!m[3] && !m[2])) return false;
    if (!prev.slice(m[0].length).trim()) { ta.setRangeText('', ps, s); ta.setSelectionRange(ps, ps); }
    else { const next = m[4] ? `${+m[4] + 1}${m[5]} ` : /\[/.test(m[3] || '') ? m[3].replace(/\[[xX]\]/, '[ ]') : m[3] || ''; const ins = m[1] + (m[2] || '') + next; ta.setRangeText(ins, s, s); ta.setSelectionRange(s + ins.length, s + ins.length); }
    this._record(false); this.opts.onChange?.(); return true;
  }

  // ---- 미리 보기: marked 로 바꾸고 DOMPurify 로 걸러서 보인다(처음 쓸 때 불러온다)
  async setPreview(on) {
    this.previewing = on; this.ta.hidden = on; this.view.hidden = !on; this.el.classList.toggle('previewing', on);
    if (on) await this.render(); else this.focus();
    this.opts.onPreview?.(on);
  }
  async render() {
    if (!MdEditor.lib) MdEditor.lib = Promise.all([import('marked'), import('dompurify')]).then(([m, d]) => ({ marked: m.marked, purify: d.default }));
    const { marked, purify } = await MdEditor.lib;
    const html = marked.parse(this.ta.value || '', { gfm: true, breaks: true, async: false });
    this.view.innerHTML = purify.sanitize(html, { USE_PROFILES: { html: true } }) || '<p class="sub">아직 적은 것이 없습니다.</p>';
    for (const b of this.view.querySelectorAll('input[type=checkbox]')) b.disabled = false;
  }
}
