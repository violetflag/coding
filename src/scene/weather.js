// 실제 날씨: Open-Meteo(무료, 열쇠 없음)에서 지금 날씨와 지난 7일의 시간별 기록을 받아 장면이 쓰는 값으로 바꾼다.
// 보내는 것은 약 1km로 반올림한 위도·경도뿐이다. 받은 것은 이 컴퓨터(localStorage)에 시각과 함께 저장하고 20분쯤마다 새로 받는다.
// 받지 못하면(인터넷 없음, 시험 모드) 조용히 계절에 맞춘 예전 날씨를 쓴다. 시작을 막지 않는다.
// 시험용: ?weathermock=이름 → public/weather-mock/이름.json (tools/weather-fixtures.mjs 가 만든다)

const KEY = 'nanro.weather', REFRESH = 20 * 60e3, MAX_AGE = 6 * 3600e3;
export const WEATHER_MODES = { real: '실제 날씨', clear: '맑음', partly: '구름 조금', overcast: '흐림', rain: '비', snow: '눈', heavy: '거센 눈', fog: '안개' };
// 장면이 쓰는 날씨 종류(설정창의 "지금 방" 줄에 보인다)
export const KIND_NAMES = { clear: '맑음', partly: '구름 조금', cloudy: '구름 많음', overcast: '흐림', fog: '안개', drizzle: '이슬비', rain: '비', thunder: '뇌우', snow: '눈', heavy: '거센 눈' };
// WMO 날씨 코드 → 이름, 종류, 비(mm/h)·눈(cm/h) 세기(시간별 값이 없을 때)
const CODES = {
  0: ['맑음', 'clear'], 1: ['대체로 맑음', 'clear'], 2: ['구름 조금', 'partly'], 3: ['흐림', 'overcast'],
  45: ['안개', 'fog'], 48: ['서리 안개', 'fog'],
  51: ['약한 이슬비', 'drizzle', 0.2], 53: ['이슬비', 'drizzle', 0.5], 55: ['짙은 이슬비', 'drizzle', 1], 56: ['어는 이슬비', 'drizzle', 0.3], 57: ['어는 이슬비', 'drizzle', 0.8],
  61: ['약한 비', 'rain', 1], 63: ['비', 'rain', 3], 65: ['강한 비', 'rain', 8], 66: ['어는 비', 'rain', 1], 67: ['강한 어는 비', 'rain', 4],
  71: ['약한 눈', 'snow', 0, 0.3], 73: ['눈', 'snow', 0, 1], 75: ['많은 눈', 'heavy', 0, 2.5], 77: ['싸락눈', 'snow', 0, 0.2],
  80: ['약한 소나기', 'rain', 1.5], 81: ['소나기', 'rain', 4], 82: ['강한 소나기', 'rain', 10], 85: ['눈 소나기', 'snow', 0, 0.6], 86: ['강한 눈 소나기', 'heavy', 0, 2],
  95: ['뇌우', 'thunder', 5], 96: ['우박 뇌우', 'thunder', 6], 99: ['강한 우박 뇌우', 'thunder', 8],
};
// 직접 고르는 날씨: 실제 날씨와 같은 모양의 값. depth = 쌓인 눈(cm)
const PRESETS = {
  clear: { code: 0, cloud: 0.03, low: 0, mid: 0, high: 0.05, vis: 30000, wind: 2, windDir: 300, temp: 5 },
  partly: { code: 2, cloud: 0.42, low: 0.3, mid: 0.12, high: 0.3, vis: 25000, wind: 3.5, windDir: 280, temp: 8 },
  overcast: { code: 3, cloud: 1, low: 0.95, mid: 0.6, high: 0.3, vis: 14000, wind: 4, windDir: 250, temp: 6 },
  rain: { code: 63, cloud: 1, low: 1, mid: 0.8, high: 0.4, vis: 6000, wind: 5, windDir: 220, temp: 9, rain: 3, wet: 1 },
  snow: { code: 73, cloud: 0.96, low: 0.9, mid: 0.7, high: 0.3, vis: 2500, wind: 2.5, windDir: 320, temp: -2, snow: 1, depth: 12, treeSnow: true },
  heavy: { code: 75, cloud: 1, low: 1, mid: 0.9, high: 0.4, vis: 500, wind: 9, windDir: 330, temp: -6, snow: 3, depth: 25, treeSnow: true },
  fog: { code: 45, cloud: 0.9, low: 0.9, mid: 0.2, high: 0, vis: 220, wind: 0.8, windDir: 200, temp: 4 },
};
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
const round2 = (x) => Math.round(x * 100) / 100;

// 직접 고른 날씨(또는 계절 날씨) → 장면 값
export function presetWeather(name, season) {
  const p = PRESETS[name] || PRESETS.clear, c = CODES[p.code];
  const winter = season === 'winter', depth = p.depth ?? (winter ? 8 : 0);
  return { source: 'manual', kind: c[1], code: p.code, label: c[0], temp: winter ? Math.min(p.temp, -1) : p.temp, cloud: p.cloud, low: p.low, mid: p.mid, high: p.high, vis: p.vis,
    rain: p.rain || 0, snow: p.snow || 0, wind: p.wind, windDir: p.windDir, depth, wet: p.wet || 0, treeSnow: p.treeSnow || (winter && depth > 0), thunder: false, at: 0 };
}

// Open-Meteo 응답 → 장면 값. 빠진 칸은 그럴듯한 값으로 채운다.
export function interpret(data) {
  const cur = data?.current || {}, H = data?.hourly || {}, times = H.time || [];
  // 지금 시각에 해당하는 시간별 칸 (응답의 current.time 기준: 받은 지 오래된 캐시라도 그 시점의 기록으로 계산한다)
  const nowT = cur.time || times[times.length - 1] || '';
  let i0 = -1; for (let i = 0; i < times.length; i++) if (times[i] <= nowT) i0 = i;
  const at = (k, i, d = null) => (H[k] && typeof H[k][i] === 'number' ? H[k][i] : d);
  const code = num(cur.weather_code, num(at('weather_code', i0), 0)), c = CODES[code] || CODES[Math.floor(code / 10) * 10] || ['', 'partly'];
  const cloud = clamp01(num(cur.cloud_cover, num(at('cloud_cover', i0), code >= 3 ? 100 : code * 30)) / 100);
  const low = clamp01(num(cur.cloud_cover_low, cloud * 100) / 100), mid = clamp01(num(cur.cloud_cover_mid, cloud * 60) / 100), high = clamp01(num(cur.cloud_cover_high, cloud * 40) / 100);
  let vis = num(cur.visibility, num(at('visibility', i0), 24000)); if (c[1] === 'fog') vis = Math.min(vis, 400);
  const temp = num(cur.temperature_2m, num(at('temperature_2m', i0), 5));
  // 비와 눈의 세기: 지금 값 → 시간별 값 → 날씨 코드
  // 비(mm) = rain + showers. 그 칸이 없으면 전체 강수에서 눈의 물 양(눈 cm ÷ 0.7 = mm, 7cm 눈 ≈ 10mm 물)을 뺀다
  const rainOf = (rn, sh, pr, sf) => (typeof rn === 'number' || typeof sh === 'number' ? num(rn) + num(sh) : Math.max(0, num(pr) - num(sf) / 0.7));
  const hasCur = typeof cur.snowfall === 'number' || typeof cur.precipitation === 'number';
  const per = 3600 / Math.max(300, num(cur.interval, 900));                         // current 값은 앞선 interval(보통 15분) 동안의 합이다
  const snowH = hasCur ? num(cur.snowfall) * per : num(at('snowfall', i0));
  const snow = snowH > 0.01 ? snowH : (c[3] || 0);
  const rainH = hasCur ? rainOf(cur.rain, cur.showers, cur.precipitation, cur.snowfall) * per : rainOf(at('rain', i0), at('showers', i0), at('precipitation', i0), at('snowfall', i0));
  const rain = rainH > 0.05 ? rainH : (c[2] || 0);
  // 쌓인 눈: API의 snow_depth(m)가 있으면 그것, 없으면 지난 기록으로 쌓고 다지고 녹여서 계산한다
  let model = 0, lastSnow = -1, wetAcc = 0;
  for (let i = 0; i <= i0; i++) {
    const T = num(at('temperature_2m', i), temp), sf = num(at('snowfall', i)), rn = rainOf(at('rain', i), at('showers', i), at('precipitation', i), sf);
    model += sf; if (sf > 0.05) lastSnow = i;
    model -= model * 0.003;                                                           // 다져진다(하루에 7%쯤)
    if (T > 0) model -= 0.06 * T + 0.08 * rn;                                         // 영상이면 녹는다(비가 오면 더)
    if (T > 0) { const hr = +(times[i] || '').slice(11, 13); if (hr >= 10 && hr <= 15) model -= 0.03 * T; }   // 한낮 햇볕
    model = Math.max(0, model);
    const age = i0 - i; if (age < 12 && T > -1) wetAcc += rn * Math.exp(-age / 4);
  }
  const api = at('snow_depth', i0);
  const depth = api != null ? Math.max(0, api * 100) : model;
  const snowAge = lastSnow >= 0 ? i0 - lastSnow : 999;
  const wind = num(cur.wind_speed_10m, 2), windDir = num(cur.wind_direction_10m, 270);
  return { source: 'real', kind: snow > 0.01 && (c[1] !== 'snow' && c[1] !== 'heavy') && rain < 0.1 ? (snow > 2 ? 'heavy' : 'snow') : c[1], code, label: c[0] || '날씨', temp, cloud, low, mid, high, vis,
    rain, snow, wind, windDir, depth, wet: clamp01(wetAcc / 1.5 + (rain > 0.1 ? 1 : 0)), treeSnow: depth > 2 && temp < 3 && (snowAge < 72 || snow > 0.05), thunder: c[1] === 'thunder', at: 0 };
}

export class Weather {
  // getLoc(): { lat, lon }, active(): 실제 날씨 모드인가, onData(): 새 날씨를 받았을 때
  constructor({ url, getLoc, active, onData }) {
    this.getLoc = getLoc; this.active = active; this.onData = onData;
    this.mock = url?.get('weathermock') || null;
    this.offline = !this.mock && !!url && (url.has('fixed') || url.has('headless') || url.has('weather'));   // 시험 중에는 인터넷에 묻지 않는다
    this.data = null; this.at = 0; this.status = '아직 받지 않았습니다'; this.busy = false; this.next = 0;
    if (this.mock) { this.load(true); return; }
    if (this.offline) { this.status = '시험 모드라 받지 않습니다'; return; }
    try { const c = JSON.parse(localStorage.getItem(KEY) || 'null'); if (c?.data && Date.now() - c.at < MAX_AGE) { this.data = c.data; this.at = c.at; this.loc = c.loc; this.status = ''; } } catch { /* 저장소 없음 */ }
    this.next = Date.now() + 2500;                                                    // 시작이 끝난 뒤에 받는다
    this._iv = setInterval(() => this.tick(), 30e3); setTimeout(() => this.tick(), 3000);
  }
  // 지금 쓸 수 있는 날씨(장면 값). 없거나 위치가 바뀌었으면 null
  get() {
    if (!this.data) return null;
    const L = this.getLoc(); if (!this.mock && this.loc && (Math.abs(this.loc.lat - round2(L.lat)) > 0.06 || Math.abs(this.loc.lon - round2(L.lon)) > 0.06)) return null;
    if (!this._w || this._wData !== this.data) { this._w = interpret(this.data); this._w.at = this.at; this._wData = this.data; }
    return this._w;
  }
  tick() {
    if (this.offline || this.busy || !this.active() || Date.now() < this.next) return;
    const L = this.getLoc(), moved = this.loc && (this.loc.lat !== round2(L.lat) || this.loc.lon !== round2(L.lon));
    if (moved || !this.data || Date.now() - this.at > REFRESH) this.load();
  }
  // 지금 새로 받기 (설정창 단추)
  refresh() { if (this.offline && !this.mock) return Promise.resolve(false); return this.load(true); }
  async load(force) {
    if (this.busy || (!force && !this.mock && !this.active())) return false;
    this.next = 0;
    this.busy = true; this.status = '받는 중…'; this.onData?.();
    try {
      let data, loc;
      if (this.mock) data = await (await fetch(`weather-mock/${encodeURIComponent(this.mock)}.json`)).json();
      else {
        const L = this.getLoc(); loc = { lat: round2(L.lat), lon: round2(L.lon) };
        const q = `latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,precipitation,rain,showers,snowfall,weather_code,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,wind_speed_10m,wind_direction_10m,is_day`
          + '&hourly=temperature_2m,snowfall,snow_depth,precipitation,rain,showers,weather_code,cloud_cover,visibility&past_days=7&forecast_days=1&wind_speed_unit=ms&timezone=auto';
        const ac = new AbortController(), to = setTimeout(() => ac.abort(), 15000);
        try { const r = await fetch('https://api.open-meteo.com/v1/forecast?' + q, { signal: ac.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); data = await r.json(); } finally { clearTimeout(to); }
        if (!data?.current) throw new Error('응답에 지금 날씨가 없음');
      }
      this.data = data; this.at = Date.now(); this.loc = loc; this.status = '';
      if (!this.mock) try { localStorage.setItem(KEY, JSON.stringify({ at: this.at, loc, data })); } catch { /* 저장소 가득 참 */ }
      return true;
    } catch (e) {
      console.warn('날씨를 받지 못했습니다', e?.message || e);
      this.status = '받지 못했습니다 (인터넷 연결을 확인하세요)'; this.next = Date.now() + 5 * 60e3;   // 5분 뒤에 다시
      return false;
    } finally { this.busy = false; this.onData?.(); }
  }
  // 설정창에 보일 한 줄
  summary(w) {
    if (!w || w.source !== 'real') return this.status || '아직 받지 않았습니다';
    const p = [w.label, `${Math.round(w.temp)}°C`, `구름 ${Math.round(w.cloud * 100)}%`];
    if (w.vis < 5000) p.push(`보이는 거리 ${w.vis < 1000 ? Math.round(w.vis / 10) * 10 + 'm' : (w.vis / 1000).toFixed(1) + 'km'}`);
    if (w.depth >= 0.5) p.push(`쌓인 눈 ${Math.round(w.depth)}cm`);
    const t = new Date(this.at); p.push(`${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}에 받음`);
    return p.join(' · ') + (this.status ? ` (${this.status})` : '');
  }
}
