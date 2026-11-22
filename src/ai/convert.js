// AI가 준 그림 자료를 Excalidraw 뼈대(skeleton)로 바꾼다. 자리 잡기는 늘 같은 결과가 나오는 단순한 방식:
//   맨 위에 제목, 그 아래 중심 생각, 화살표로 이어진 거리만큼 한 줄씩 아래로. 마지막에 요약 상자.
// Excalidraw 를 직접 불러오지 않는 순수한 함수들이라 테스트에서 따로 돌릴 수 있다.

export const KINDS = {
  main: { name: '중심 생각', bg: '#ffec99', stroke: '#e8590c' },
  concept: { name: '개념', bg: '#a5d8ff', stroke: '#1971c2' },
  example: { name: '예시', bg: '#b2f2bb', stroke: '#2f9e44' },
  question: { name: '질문', bg: '#ffc9c9', stroke: '#e03131' },
  insight: { name: '깨달음', bg: '#d0bfff', stroke: '#6741d9' },
};
const MAX_NODES = 24;

// 형식 맞춘 출력(structured outputs)에 쓰는 JSON 스키마
export const DIAGRAM_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: '그림 제목' },
    summary: { type: 'string', description: '메모 전체를 2~3문장으로 쉽게 요약' },
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          label: { type: 'string', description: '상자 안의 짧은 글' },
          kind: { type: 'string', enum: Object.keys(KINDS) },
          group: { type: 'string', description: '같은 주제끼리 같은 이름, 없으면 빈 문자열' },
        },
        required: ['id', 'label', 'kind', 'group'],
        additionalProperties: false,
      },
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        properties: { from: { type: 'string' }, to: { type: 'string' }, label: { type: 'string', description: '관계를 2~6자로, 없으면 빈 문자열' } },
        required: ['from', 'to', 'label'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'summary', 'nodes', 'edges'],
  additionalProperties: false,
};

const str = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// 받은 자료를 믿지 않고 다듬는다: 빈 상자와 겹친 id 를 버리고, 없는 상자를 가리키는 화살표를 버린다
export function normalizeDiagram(d) {
  const nodes = [], seen = new Set();
  for (const n of Array.isArray(d?.nodes) ? d.nodes : []) {
    const id = str(n?.id, 40), label = str(n?.label, 80);
    if (!id || !label || seen.has(id)) continue;
    seen.add(id); nodes.push({ id, label, kind: KINDS[n.kind] ? n.kind : 'concept', group: str(n.group, 30) });
    if (nodes.length >= MAX_NODES) break;
  }
  const edges = [], pair = new Set();
  for (const e of Array.isArray(d?.edges) ? d.edges : []) {
    const from = str(e?.from, 40), to = str(e?.to, 40), k = from + '>' + to;
    if (!seen.has(from) || !seen.has(to) || from === to || pair.has(k)) continue;
    pair.add(k); edges.push({ from, to, label: str(e.label, 16) });
  }
  return { title: str(d?.title, 60) || '메모 그림', summary: str(d?.summary, 600), nodes, edges };
}

// 글자 폭(글자 크기 1 기준): 한글·한자는 1, 나머지는 0.56 쯤
const unit = (ch) => (/[ᄀ-ᇿ　-鿿가-힯＀-￯]/.test(ch) ? 1 : 0.56);
const width = (s) => { let w = 0; for (const ch of s) w += unit(ch); return w; };
// 한 줄에 max 폭이 넘지 않게 낱말 단위로 줄을 나눈다(긴 낱말은 글자 단위로)
export function wrap(text, max) {
  const lines = []; let cur = '';
  for (const word of text.split(' ')) {
    const t = cur ? cur + ' ' + word : word;
    if (width(t) <= max) { cur = t; continue; }
    if (cur) lines.push(cur);
    cur = '';
    for (const ch of word) { if (width(cur + ch) > max) { lines.push(cur); cur = ch; } else cur += ch; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// 화살표로 이어진 거리로 층을 나눈다. 중심 생각(없으면 가장 많이 이어진 상자)이 0층.
function layers(nodes, edges) {
  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) { adj.get(e.from).push(e.to); adj.get(e.to).push(e.from); }
  const deg = (id) => adj.get(id).length, layer = new Map(), out = [];
  const byDeg = [...nodes].sort((a, b) => (b.kind === 'main') - (a.kind === 'main') || deg(b.id) - deg(a.id));
  const lone = byDeg.filter((n) => !deg(n.id) && n.kind !== 'main');   // 아무 데도 이어지지 않은 상자는 맨 아래 한 줄에 모은다
  for (const start of byDeg) {
    if (layer.has(start.id) || lone.includes(start)) continue;
    const base = out.length; layer.set(start.id, base); const q = [start.id];
    while (q.length) {
      const id = q.shift(), l = layer.get(id); (out[l] ||= []).push(id);
      for (const nb of adj.get(id)) if (!layer.has(nb)) { layer.set(nb, l + 1); q.push(nb); }
    }
  }
  if (lone.length) { const l = out.length; out.push(lone.map((n) => n.id)); for (const n of lone) layer.set(n.id, l); }
  return { out, adj, layer };
}

const FONT = 5; // Excalifont (한글은 Excalidraw 가 함께 주는 손글씨 글꼴로 나온다)
const GAP_X = 56, GAP_Y = 104, PER_ROW = 6;

// 자료 → Excalidraw 뼈대 배열. convertToExcalidrawElements 에 그대로 넘긴다.
export function toSkeleton(diagram, meta = {}) {
  const d = normalizeDiagram(diagram), byId = new Map(d.nodes.map((n) => [n.id, n]));
  const { out, adj, layer } = layers(d.nodes, d.edges);
  // 층 안의 순서: 이어진 위·아래 층 상자들의 평균 자리로 몇 번 오가며 맞춘다(화살표 엉킴을 줄인다). 같으면 같은 묶음끼리.
  const pos = new Map(), set = () => out.forEach((ids) => ids.forEach((id, i) => pos.set(id, i - (ids.length - 1) / 2)));
  const sortBy = (ids, l) => {
    const key = new Map(ids.map((id) => { const ps = adj.get(id).filter((x) => layer.get(x) === l).map((x) => pos.get(x)); return [id, ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : pos.get(id)]; }));
    ids.sort((a, b) => key.get(a) - key.get(b) || byId.get(a).group.localeCompare(byId.get(b).group)); set();
  };
  set();
  for (let it = 0; it < 3; it++) {
    for (let l = 1; l < out.length; l++) sortBy(out[l], l - 1);
    for (let l = out.length - 2; l >= 0; l--) sortBy(out[l], l + 1);
  }
  for (let l = 1; l < out.length; l++) sortBy(out[l], l - 1);
  const rows = [];
  for (const ids of out) for (let i = 0; i < ids.length; i += PER_ROW) rows.push(ids.slice(i, i + PER_ROW));

  // 상자 크기
  const box = new Map();
  for (const n of d.nodes) {
    const fs = n.kind === 'main' ? 24 : 20, lines = wrap(n.label, n.kind === 'main' ? 10 : 11);
    const w = Math.max(130, Math.min(320, Math.max(...lines.map(width)) * fs + 44));
    const h = Math.max(64, lines.length * fs * 1.3 + 36);
    box.set(n.id, { w, h, fs, text: lines.join('\n') });
  }
  // 줄마다 가운데 맞춤
  const el = [], at = new Map(); let y = 0, maxW = 0;
  for (const ids of rows) {
    const rowW = ids.reduce((s, id) => s + box.get(id).w, 0) + GAP_X * (ids.length - 1), rowH = Math.max(...ids.map((id) => box.get(id).h));
    let x = -rowW / 2; maxW = Math.max(maxW, rowW);
    for (const id of ids) {
      const b = box.get(id), n = byId.get(id), k = KINDS[n.kind], bx = Math.round(x), by = Math.round(y + (rowH - b.h) / 2);
      at.set(id, { x: bx, y: by, w: b.w, h: b.h });
      el.push({ type: 'rectangle', id: 'n_' + id, x: bx, y: by, width: Math.round(b.w), height: Math.round(b.h), backgroundColor: k.bg, strokeColor: k.stroke, fillStyle: 'solid', strokeWidth: 2, roughness: 1, roundness: { type: 3 },
        label: { text: b.text, fontSize: b.fs, fontFamily: FONT, strokeColor: '#1e1e1e', textAlign: 'center', verticalAlign: 'middle' } });
      x += b.w + GAP_X;
    }
    y += rowH + GAP_Y;
  }
  // 화살표: 아래층이면 밑변 가운데에서 윗변 가운데로, 같은 높이면 옆으로
  for (const e of d.edges) {
    const a = at.get(e.from), b = at.get(e.to); if (!a || !b) continue;
    let sx, sy, ex, ey;
    if (b.y >= a.y + a.h) { sx = a.x + a.w / 2; sy = a.y + a.h; ex = b.x + b.w / 2; ey = b.y; }
    else if (a.y >= b.y + b.h) { sx = a.x + a.w / 2; sy = a.y; ex = b.x + b.w / 2; ey = b.y + b.h; }
    else if (b.x > a.x) { sx = a.x + a.w; sy = a.y + a.h / 2; ex = b.x; ey = b.y + b.h / 2; }
    else { sx = a.x; sy = a.y + a.h / 2; ex = b.x + b.w; ey = b.y + b.h / 2; }
    el.push({ type: 'arrow', x: Math.round(sx), y: Math.round(sy), width: Math.round(ex - sx), height: Math.round(ey - sy), points: [[0, 0], [Math.round(ex - sx), Math.round(ey - sy)]],
      strokeColor: '#495057', strokeWidth: 2, roughness: 1, endArrowhead: 'arrow', start: { id: 'n_' + e.from }, end: { id: 'n_' + e.to },
      ...(e.label ? { label: { text: e.label, fontSize: 16, fontFamily: FONT, strokeColor: '#495057' } } : {}) });
  }
  // 제목, 책 정보, 색 안내
  const top = -150, tW = width(d.title) * 34;
  el.push({ type: 'text', id: 't_title', x: Math.round(-tW / 2), y: top, text: d.title, fontSize: 34, fontFamily: FONT, strokeColor: '#1e1e1e' });
  const sub = [meta.title && `《${meta.title}》`, meta.author].filter(Boolean).join(' · ');
  if (sub) el.push({ type: 'text', id: 't_meta', x: Math.round(-width(sub) * 18 / 2), y: top + 50, text: sub, fontSize: 18, fontFamily: FONT, strokeColor: '#868e96' });
  const used = Object.keys(KINDS).filter((k) => d.nodes.some((n) => n.kind === k));
  const legW = used.reduce((s, k) => s + 26 + width(KINDS[k].name) * 16 + 22, 0); let lx = -legW / 2;
  for (const k of used) {
    el.push({ type: 'rectangle', id: 'lg_' + k, x: Math.round(lx), y: top + 88, width: 18, height: 18, backgroundColor: KINDS[k].bg, strokeColor: KINDS[k].stroke, fillStyle: 'solid', strokeWidth: 1, roughness: 0, roundness: { type: 3 } });
    el.push({ type: 'text', id: 'lt_' + k, x: Math.round(lx + 26), y: top + 87, text: KINDS[k].name, fontSize: 16, fontFamily: FONT, strokeColor: '#495057' });
    lx += 26 + width(KINDS[k].name) * 16 + 22;
  }
  // 요약 상자: 글을 상자에 붙이지 않고 안쪽 여백을 두어 따로 놓는다(왼쪽 맞춤 글이 테두리에 붙지 않게)
  if (d.summary) {
    const fs = 19, lines = wrap(d.summary, Math.floor((Math.max(480, Math.min(760, maxW)) - 64) / fs));
    const w = Math.round(Math.max(360, Math.max(...lines.map(width)) * fs + 64)), h = Math.round(lines.length * fs * 1.25 + 30 + 52);
    const sx = Math.round(-w / 2), sy = Math.round(y - GAP_Y / 2);
    el.push({ type: 'rectangle', id: 's_box', x: sx, y: sy, width: w, height: h, backgroundColor: '#f8f9fa', strokeColor: '#adb5bd', fillStyle: 'solid', strokeWidth: 1, roughness: 1, roundness: { type: 3 } });
    el.push({ type: 'text', id: 's_head', x: sx + 32, y: sy + 20, text: '요약', fontSize: 16, fontFamily: FONT, strokeColor: '#868e96' });
    el.push({ type: 'text', id: 's_text', x: sx + 32, y: sy + 48, text: lines.join('\n'), fontSize: fs, fontFamily: FONT, strokeColor: '#343a40', lineHeight: 1.25 });
  }
  return el;
}
