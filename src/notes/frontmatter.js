// 메모 파일 맨 위의 머리말(YAML front matter): 책 정보, 읽던 곳, 만든 때와 고친 때, 태그.
// 난로가 쓰는 항목만 다시 적고, 사용자가 손으로 넣은 다른 항목은 적힌 그대로 둔다.

// 난로가 쓰는 항목과 적는 순서
const KNOWN = ['title', 'author', 'language', 'publisher', 'date', 'source_file', 'book_id', 'format', 'position', 'created', 'updated', 'tags'];
const POS = ['chapter', 'page', 'pages', 'percent'];

// 이 컴퓨터의 시간대를 붙인 ISO 시각. 예: 2026-11-22T21:05:03+09:00
export function isoLocal(d = new Date()) {
  const p = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0'), o = -d.getTimezoneOffset();
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${o >= 0 ? '+' : '-'}${p(o / 60)}:${p(o % 60)}`;
}

// ---- 읽기: 한 단계 안쪽(position:)과 목록(tags:)까지만 푼다
function scalar(raw) {
  const s = raw.trim();
  if (!s || s === '~' || s === 'null') return s ? null : '';
  if (s[0] === '"') { try { return JSON.parse(s); } catch { return s.slice(1, -1); } }
  if (s[0] === "'") return s.slice(1, s.endsWith("'") ? -1 : undefined).replace(/''/g, "'");
  if (s[0] === '[' && s.endsWith(']')) return flow(s.slice(1, -1));
  if (s === 'true' || s === 'false') return s === 'true';
  if (/^-?\d+(\.\d+)?$/.test(s)) return +s;
  return s.replace(/\s+#.*$/, '');
}
// [a, "b, c", 'd'] 의 안쪽
function flow(s) {
  const out = []; let cur = '', q = '';
  for (const c of s) {
    if (q) { cur += c; if (c === q) q = ''; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === ',') { if (cur.trim()) out.push(scalar(cur)); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(scalar(cur));
  return out;
}

// text → { meta, body, extra }. extra: 난로가 모르는 항목의 원래 줄들(다시 쓸 때 그대로 둔다)
export function parseNote(text) {
  const src = String(text ?? '').replace(/^\ufeff/, '');
  const m = src.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/);
  if (!m) return { meta: {}, body: src, extra: [] };
  const meta = {}, extra = [], lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i], km = line.match(/^([A-Za-z_][\w-]*)\s*:(.*)$/);
    if (!km) continue;
    const block = [line]; while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || /^-\s/.test(lines[i + 1]) || !lines[i + 1].trim())) block.push(lines[++i]);
    while (block.length > 1 && !block[block.length - 1].trim()) block.pop();
    const key = km[1], rest = km[2].trim();
    if (!KNOWN.includes(key)) { extra.push(block.join('\n')); continue; }
    if (rest && !rest.startsWith('#')) { meta[key] = scalar(rest); continue; }
    const sub = block.slice(1).filter((l) => l.trim());
    if (sub.every((l) => /^\s*-\s?/.test(l))) meta[key] = sub.map((l) => scalar(l.replace(/^\s*-\s?/, '')));
    else { const o = {}; for (const l of sub) { const sm = l.match(/^\s+([A-Za-z_][\w-]*)\s*:(.*)$/); if (sm) o[sm[1]] = scalar(sm[2]); } meta[key] = o; }
  }
  if (meta.tags != null && !Array.isArray(meta.tags)) meta.tags = String(meta.tags).split(/[,\s]+/).filter(Boolean);
  return { meta, body: src.slice(m[0].length).replace(/^\r?\n/, ''), extra };
}

// ---- 쓰기
const q = (v) => (typeof v === 'number' || typeof v === 'boolean' ? String(v) : JSON.stringify(String(v ?? '')));
// 시각은 따옴표 없이(YAML 의 날짜·시각), 나머지 글은 큰따옴표로 적는다
const val = (k, v) => ((k === 'created' || k === 'updated') && /^\d{4}-\d\d-\d\dT[\d:]+([+-]\d\d:\d\d|Z)$/.test(String(v)) ? String(v) : q(v));

export function stringifyNote(meta, body, extra = []) {
  const out = ['---'];
  for (const k of KNOWN) {
    const v = meta[k];
    if (k === 'tags') { out.push(`tags: [${(Array.isArray(v) ? v : []).map(q).join(', ')}]`); continue; }
    if (v == null || v === '') { if (k === 'title' || k === 'author') out.push(`${k}: ""`); continue; }
    if (k === 'position') {
      if (typeof v !== 'object') continue;
      out.push('position:'); for (const pk of POS) if (v[pk] != null && v[pk] !== '') out.push(`  ${pk}: ${q(v[pk])}`);
      continue;
    }
    out.push(`${k}: ${val(k, v)}`);
  }
  out.push(...extra, '---', '', '');                                    // 머리말 다음에 빈 줄 하나
  return out.join('\n') + String(body ?? '').replace(/^\r?\n+/, '');
}

// 책(서재 목록의 항목 + 펼친 책의 정보)으로 새 머리말을 만든다
export function bookMeta(book, now = isoLocal()) {
  return {
    title: book?.title || '메모', author: book?.author || '', language: book?.language || '', publisher: book?.publisher || '', date: book?.date || '',
    source_file: book?.name || '', book_id: book?.id || '', format: book?.format || '', created: now, updated: now, tags: [],
  };
}
