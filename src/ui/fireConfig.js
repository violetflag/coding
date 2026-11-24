// 불 그래픽 설정: 프리셋, 항목별 허용 범위, 저장과 불러오기.
// 값은 브라우저(localStorage)에 저장하고, 주소 옵션(?q= ?grid= ?fq= ?rp=)이 있으면 그것이 우선한다.
const KEY = 'nanro.fire';

// 선명화 묶음(불꽃 가장자리를 매끄럽고 또렷하게)
const SHARP = { cubic: 1, flameSharp: 1, detailAmt: 0.3, sootEdge: 0.12 };

// 항목 정의: [키, 이름, 최소, 최대, 간격, 설명, 바로 적용 여부(live)]
export const FIRE_FIELDS = [
  { key: 'grid', label: '시뮬레이션 격자 (가로 칸 수)', min: 48, max: 240, step: 8, hint: '불꽃의 갈래와 세부. 비용이 세제곱으로 늘어납니다. 세로와 깊이는 8:10:5 비율로 따라갑니다.' },
  { key: 'simhz', label: '시뮬레이션 속도 (초당 걸음)', min: 60, max: 120, step: 10, hint: '90 미만으로 내리면 불꽃이 가늘고 알갱이처럼 보일 수 있습니다.' },
  { key: 'maxSteps', label: '프레임당 최대 걸음', min: 1, max: 3, step: 1, hint: '프레임이 느릴 때 따라잡는 한도.' },
  { key: 'vcycles', label: '압력 계산 반복 (V사이클)', min: 1, max: 3, step: 1, hint: '1로도 불 모양은 유지됩니다.' },
  { key: 'pre', label: '압력 계산 앞 다듬기', min: 1, max: 3, step: 1, hint: '' },
  { key: 'post', label: '압력 계산 뒤 다듬기', min: 1, max: 3, step: 1, hint: '' },
  { key: 'scale', label: '불 화면 픽셀 밀도 (배)', min: 0.5, max: 2, step: 0.05, hint: '화면 픽셀 대비 불을 그리는 밀도. 장작과 숯의 선명도.' },
  { key: 'maxPixels', label: '불 화면 픽셀 상한 (백만)', min: 0.3, max: 4, step: 0.1, hint: '벽난로에 바짝 다가갔을 때의 상한.' },
  { key: 'volScale', label: '불꽃 그리기 배율', min: 0.3, max: 1, step: 0.05, hint: '불꽃과 연기를 그리는 해상도 비율.' },
  { key: 'surfScale', label: '표면 그리기 배율', min: 0.3, max: 1, step: 0.05, hint: '장작, 숯, 벽돌을 그리는 해상도 비율.' },
  { key: 'stepMul', label: '광선 걸음 크기', min: 0.4, max: 1.5, step: 0.05, hint: '작을수록 촘촘하고 무겁습니다.', live: true },
  { key: 'sparks', label: '불티 개수', min: 1024, max: 32768, step: 1024, hint: '' },
  { key: 'cubic', label: '매끄러운 보간 (선명화)', min: 0, max: 1, step: 1, hint: '불꽃 가장자리를 매끄럽게. 비용 대비 효과가 큽니다.', live: true, render: true, toggle: true },
  { key: 'flameSharp', label: '불꽃 날카롭게', min: 0, max: 2, step: 0.1, hint: '매끄러운 보간이 켜져 있을 때만 적용됩니다.', live: true, render: true },
  { key: 'detailAmt', label: '잔무늬 양', min: 0, max: 1, step: 0.05, hint: '', live: true, render: true },
  { key: 'sootEdge', label: '불꽃 면 경계', min: 0, max: 0.3, step: 0.01, hint: '', live: true, render: true },
];

const base = (o) => ({ simhz: 90, maxSteps: 2, vcycles: 2, pre: 2, post: 2, scale: 1, maxPixels: 1.0, volScale: 0.6, surfScale: 0.75, stepMul: 0.7, sparks: 8192, ...SHARP, ...o });
// 프리셋. 가벼움과 균형은 Arc B390 실측(60fps, GPU 약 50%)에서 고른 값.
export const FIRE_PRESETS = {
  light: { name: '가벼움', v: base({ grid: 80, vcycles: 1, pre: 1, post: 1, surfScale: 0.6 }) },
  balanced: { name: '균형 (기본)', v: base({ grid: 96, vcycles: 1, pre: 1, post: 1, surfScale: 0.6 }) },
  low: { name: '낮음', v: base({ grid: 96 }) },
  medium: { name: '중간', v: base({ grid: 112, maxPixels: 1.4, volScale: 0.75, surfScale: 0.85, stepMul: 0.65, sparks: 12288 }) },
  high: { name: '높음', v: base({ grid: 128, simhz: 120, scale: 1.25, maxPixels: 2.0, volScale: 1, surfScale: 1, stepMul: 0.6, sparks: 16384 }) },
  ultra: { name: '최고', v: base({ grid: 160, simhz: 120, vcycles: 3, scale: 1.5, maxPixels: 3.0, volScale: 1, surfScale: 1, stepMul: 0.5, sparks: 24576 }) },
  // 서버의 소프트웨어 렌더러로 스크린샷을 찍을 때만 쓴다(설정창에는 내놓지 않는다)
  test: { name: '시험용', hidden: true, v: base({ grid: 48, simhz: 45, vcycles: 1, scale: 0.5, volScale: 0.5, surfScale: 0.5, stepMul: 1, sparks: 2048, cubic: 0, flameSharp: 0, detailAmt: 0.6, sootEdge: 0 }) },
};
export const FIRE_PRESET_DEFAULT = 'balanced';

export const clampField = (f, x) => {
  x = Number(x); if (!Number.isFinite(x)) return null;
  x = Math.min(f.max, Math.max(f.min, x));
  return Math.round(x / f.step) * f.step;
};
const clean = (v) => { const o = {}; for (const f of FIRE_FIELDS) if (v && v[f.key] != null) { const x = clampField(f, v[f.key]); if (x != null) o[f.key] = +x.toFixed(4); } return o; };

export function loadFireConfig() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* 저장소 사용 불가 */ }
  const preset = s && FIRE_PRESETS[s.preset] && !FIRE_PRESETS[s.preset].hidden ? s.preset : FIRE_PRESET_DEFAULT;
  return { preset, custom: !!(s && s.custom), values: { ...FIRE_PRESETS[preset].v, ...(s && s.custom ? clean(s.values) : {}) } };
}
export function saveFireConfig(cfg) {
  try { localStorage.setItem(KEY, JSON.stringify({ preset: cfg.preset, custom: cfg.custom, values: clean(cfg.values) })); } catch { /* 무시 */ }
}

// 주소 옵션을 덮어쓴다: ?q=프리셋  ?grid=N  ?density=배율  ?fq=키:값,…  ?rp=키:값,…
export function applyUrl(cfg, Q) {
  const parse = (str) => { const o = {}; for (const kv of (str || '').split(',')) { const [k, v] = kv.split(':'); if (k && v != null) o[k] = Number(v); } return o; };
  let values = cfg.values, preset = cfg.preset, fromUrl = false;
  const q = Q.get('q') === 'med' ? 'medium' : Q.get('q');
  if (q && FIRE_PRESETS[q]) { preset = q; values = { ...FIRE_PRESETS[q].v }; fromUrl = true; }
  const extra = { ...parse(Q.get('fq')), ...parse(Q.get('rp')) };
  if (Q.get('grid')) extra.grid = Number(Q.get('grid'));
  if (Q.get('density')) extra.scale = Number(Q.get('density'));
  if (Object.keys(extra).length) { values = { ...values, ...extra }; fromUrl = true; } // 주소로 준 값은 범위 제한 없이 그대로(측정용)
  return { ...cfg, preset, values, fromUrl };
}

// 설정값 → FireLayer가 쓰는 품질 객체
export function toQuality(v) {
  const n = Math.max(32, Math.round(v.grid / 8) * 8);
  return {
    res: [n, Math.round(n * 1.25 / 8) * 8, Math.round(n * 0.625 / 4) * 4],
    dt: 1 / v.simhz, maxSteps: v.maxSteps, vcycles: v.vcycles, pre: v.pre, post: v.post,
    scale: v.scale, maxPixels: v.maxPixels * 1e6, volScale: v.volScale, surfScale: v.surfScale, stepMul: v.stepMul, sparks: v.sparks,
    render: { cubic: v.cubic, flameSharp: v.flameSharp, detailAmt: v.detailAmt, sootEdge: v.sootEdge },
  };
}
