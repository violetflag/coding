// 설정창의 구역들: 방(시간·날씨·계절·위치), 소리(유튜브 음악, 시계 소리), 난롯가(장작 타이머, 잠들기), 조작·접근성.
import { WEATHERS, SEASONS, SEOUL } from '../scene/environment.js';

const KEY = 'nanro.prefs';
export const PREF_DEFAULTS = { sens: 1, invertY: false, fov: 62, sway: true, flicker: true, startSeated: false, clockTick: true, readSave: true, fireReplay: true, post: true, shadows: true, logMinutes: 25, sleepMinutes: 30 };
export function loadPrefs() { const p = { ...PREF_DEFAULTS }; try { Object.assign(p, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* 기본값 */ } return p; }
export const savePrefs = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* 무시 */ } };

const E = (tag, props = {}, ...kids) => { const e = document.createElement(tag); for (const k in props) { if (k === 'style') e.style.cssText = props[k]; else if (k.startsWith('on')) e.addEventListener(k.slice(2), props[k]); else e[k] = props[k]; } for (const c of kids.flat()) if (c != null) e.append(c); return e; };
const H = (t) => E('h3', { textContent: t }), note = (t) => E('div', { className: 'note', textContent: t });
function slider(label, get, set, min, max, step, fmt = (v) => v, hint) {
  const t = E('span', { className: 'rng', style: 'text-align:left' }), r = E('input', { type: 'range', min, max, step });
  const show = () => { r.value = get(); t.textContent = fmt(+get()); }; r.addEventListener('input', () => { set(+r.value); show(); }); show();
  const row = E('div', { className: 'row' }, E('label', { textContent: label }), r, t, E('span')); if (hint) row.append(E('div', { className: 'hint', textContent: hint })); row.refresh = show; return row;
}
function select(label, get, set, opts, hint) {
  const s = E('select', { onchange: () => set(s.value) }, Object.entries(opts).map(([k, n]) => E('option', { value: k, textContent: n }))); s.value = get();
  const row = E('div', { className: 'row' }, E('label', { textContent: label }), s, E('span'), E('span')); if (hint) row.append(E('div', { className: 'hint', textContent: hint })); row.refresh = () => { s.value = get(); }; return row;
}
function check(label, get, set, hint) {
  const c = E('input', { type: 'checkbox', onchange: () => set(c.checked) }); c.checked = !!get();
  const row = E('div', { className: 'row' }, E('label', { textContent: label }), E('span', {}, c), E('span'), E('span')); if (hint) row.append(E('div', { className: 'hint', textContent: hint })); return row;
}
const hm = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60) % 60).padStart(2, '0')}`;

// d: { env, music, mixer, player, prefs, applyPrefs(), hearth: { state(), startLog(), sleep(min|0) } }
export function buildSections(d) {
  const { env, music, prefs } = d, sp = () => { savePrefs(prefs); d.applyPrefs(); };
  return [
    { key: 'room', label: '방 (시간·날씨)', build(el) {
      const info = note(''), hour = slider('시각', () => env.opts.hour, (v) => env.set({ hour: v, timeMode: 'manual' }), 0, 23.75, 0.25, hm, '직접 고르면 그 시각의 하늘과 빛이 됩니다.');
      const mode = check('컴퓨터 시계를 따름', () => env.opts.timeMode === 'real', (v) => { if (!v) { const n = new Date(); env.set({ timeMode: 'manual', hour: n.getHours() + Math.round(n.getMinutes() / 15) / 4 }); hour.refresh(); } else env.set({ timeMode: 'real' }); });
      const lat = E('input', { type: 'number', step: 0.01, min: -89, max: 89, value: env.opts.lat }), lon = E('input', { type: 'number', step: 0.01, min: -180, max: 180, value: env.opts.lon });
      const setLoc = () => env.set({ lat: Math.max(-89, Math.min(89, +lat.value || 0)), lon: Math.max(-180, Math.min(180, +lon.value || 0)), located: true });
      lat.addEventListener('change', setLoc); lon.addEventListener('change', setLoc);
      el.append(H('시간'), info, mode, hour, H('날씨와 계절'), select('창밖 날씨', () => env.opts.weather, (v) => env.set({ weather: v }), WEATHERS, '자동은 겨울에 눈, 다른 계절에는 맑음입니다.'), select('계절', () => env.opts.season, (v) => env.set({ season: v }), SEASONS, '자동은 오늘 날짜의 계절을 따릅니다(남반구는 반대).'),
        H('위치 (해와 달 계산용)'), E('div', { className: 'row' }, E('label', { textContent: '위도 · 경도' }), E('span', { style: 'display:flex;gap:6px' }, lat, lon), E('button', { textContent: '내 위치', onclick: () => { env.opts.located = false; env.locate(); setTimeout(() => { lat.value = env.opts.lat; lon.value = env.opts.lon; }, 2500); } }), E('button', { textContent: '서울', onclick: () => { env.set({ ...SEOUL, located: true }); lat.value = SEOUL.lat; lon.value = SEOUL.lon; } })),
        note('위치는 이 컴퓨터에만 저장되고 어디로도 보내지 않습니다. 브라우저가 위치를 주지 않으면 서울을 씁니다.'),
        H('가구와 액자'), note('걸어 다니다가 의자, 탁자, 스탠드, 바구니를 보고 G를 누르면 옮길 수 있습니다(휠로 돌리기). 액자를 보고 E를 누르면 내 그림을 넣습니다.'),
        E('div', { className: 'row' }, E('label', { textContent: '되돌리기' }), E('button', { textContent: '가구 배치 처음대로', onclick: () => d.arrange?.reset() }), E('button', { textContent: '액자 그림 처음대로', onclick: () => d.arrange?.clearFrames() })));
      this._info = info; this._tick = () => { const S = env.state; info.textContent = `지금 방의 시각 ${hm(env.now().getHours() + env.now().getMinutes() / 60)} · 해 고도 ${S.sunAlt.toFixed(0)}° · 달 ${(S.moonFrac * 100).toFixed(0)}% · ${SEASONS[S.season]} · ${WEATHERS[S.weather]}`; };
    }, onShow() { this._tick(); this._iv = setInterval(this._tick, 1000); }, onHide() { clearInterval(this._iv); } },
    { key: 'sound', label: '소리', build(el) {
      const url = E('input', { type: 'text', placeholder: '유튜브 링크 (영상 또는 재생목록)', value: music.state.url }), st = note(music.status), slot = E('div', { style: 'width:320px;height:180px;margin:8px 0;background:#0e0a07;border:1px dashed #4a3a28;border-radius:6px' });
      music.onChange = () => { st.textContent = music.status; };
      el.append(H('배경 음악 (유튜브)'), E('div', { className: 'row wide', style: 'grid-template-columns:1fr auto auto' }, url, E('button', { className: 'primary', textContent: '재생', onclick: () => music.play(url.value) }), E('button', { textContent: '멈춤', onclick: () => music.stop() })), st, slot,
        check('한 곡 반복', () => music.state.loop, (v) => { music.state.loop = v; music.save(); }), note('유튜브의 공식 플레이어로 재생합니다. 삽입이 막힌 영상은 나오지 않습니다. 설정창을 닫아도 계속 재생되고, 볼륨은 위의 "음악"으로 조절합니다.'),
        H('환경음'), check('시계 초침 소리', () => prefs.clockTick, (v) => { prefs.clockTick = v; sp(); }));
      this._slot = slot;
    }, onShow() { requestAnimationFrame(() => music.dock(this._slot)); }, onHide() { music.dock(null); } },
    { key: 'hearth', label: '난롯가', build(el) {
      const st = note('');
      el.append(H('장작'), st, slider('장작 하나가 타는 시간', () => prefs.logMinutes, (v) => { prefs.logMinutes = v; sp(); }, 5, 60, 5, (v) => v + '분', '화실의 장작은 타면서 검게 변하고 줄어듭니다. 다 타면 숯불만 남으니 벽난로 옆 더미에서 장작을 넣어 주세요. 더미가 비면 더미를 보고 E를 누르거나 아래의 장작 채우기로 채웁니다.'),
        E('div', { className: 'btns', style: 'justify-content:flex-start;margin-top:6px' }, E('button', { className: 'primary', textContent: '장작 넣기', onclick: () => d.hearth.startLog() }), E('button', { textContent: '장작 채우기', onclick: () => d.hearth.refill() }), E('button', { textContent: '처음 상태로', onclick: () => d.hearth.reset() })),
        H('잠들기 모드'), slider('잠들기까지', () => prefs.sleepMinutes, (v) => { prefs.sleepMinutes = v; sp(); }, 5, 120, 5, (v) => v + '분', '정한 시간 동안 불이 서서히 숯불이 되고 화면과 소리가 천천히 어두워집니다.'),
        E('div', { className: 'btns', style: 'justify-content:flex-start;margin-top:6px' }, E('button', { className: 'primary', textContent: '잠들기 시작', onclick: () => d.hearth.sleep(prefs.sleepMinutes) }), E('button', { textContent: '취소 (불 다시 살리기)', onclick: () => d.hearth.sleep(0) })));
      this._tick = () => { st.textContent = d.hearth.status(); };
    }, onShow() { this._tick(); this._iv = setInterval(this._tick, 1000); }, onHide() { clearInterval(this._iv); } },
    { key: 'access', label: '조작·접근성', build(el) {
      el.append(H('조작'), slider('마우스 감도', () => prefs.sens, (v) => { prefs.sens = v; sp(); }, 0.3, 2.5, 0.05, (v) => Math.round(v * 100) + '%'), check('상하 반전', () => prefs.invertY, (v) => { prefs.invertY = v; sp(); }),
        slider('시야각', () => prefs.fov, (v) => { prefs.fov = v; sp(); }, 45, 85, 1, (v) => v + '°'),
        H('편의'), check('걸음·숨쉬기 흔들림', () => prefs.sway, (v) => { prefs.sway = v; sp(); }), check('불빛 흔들림', () => prefs.flicker, (v) => { prefs.flicker = v; sp(); }, '끄면 방과 책 위의 불빛이 일정하게 유지됩니다.'),
        check('바로 의자에서 시작', () => prefs.startSeated, (v) => { prefs.startSeated = v; sp(); }, '켜 두면 걸어 다니지 않고 읽기 의자에 앉은 채로 시작합니다.'),
        check('실사 효과 (음영과 빛 번짐)', () => prefs.post, (v) => { prefs.post = v; sp(); }, '구석과 물건이 맞닿은 곳의 음영, 밝은 빛의 번짐을 더합니다. 끄면 GPU 부하가 조금 줄어듭니다.'),
        check('그림자', () => prefs.shadows, (v) => { prefs.shadows = v; sp(); }, '불빛과 스탠드의 그림자입니다. 끄면 GPU 부하가 꽤 줄어듭니다.'),
        check('읽는 동안 절전', () => prefs.readSave, (v) => { prefs.readSave = v; sp(); }, '책을 읽는 동안 방을 절반 속도로 그려 발열과 팬 소음을 줄입니다. 불과 책장 넘김은 그대로입니다.'),
        check('읽는 동안 불 기록 재생', () => prefs.fireReplay, (v) => { prefs.fireReplay = v; sp(); }, '책을 읽는 동안 불빛을 1분쯤 기록한 뒤 불 계산을 멈추고 기록한 불빛을 되풀이합니다. 고개를 들거나 책을 덮으면 불이 다시 실제로 탑니다.'),
        note('운영체제의 "동작 줄이기" 설정이 켜져 있으면 화면 전환과 흔들림을 자동으로 줄입니다. 키 바꾸기와 영어 화면은 아직 없습니다.'));
    } },
  ];
}
