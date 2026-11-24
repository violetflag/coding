// 시험용 날씨 응답(Open-Meteo 모양)을 만든다: public/weather-mock/<이름>.json
//   node tools/weather-fixtures.mjs
// 주소 옵션 ?weathermock=<이름> 으로 쓴다. 지난 7일 + 오늘의 시간별 기록과 지금(오늘 14시) 값이 들어 있다.
import { mkdirSync, writeFileSync } from 'node:fs';

const DAYS = 8, NOW = 7 * 24 + 14, T0 = Date.UTC(2026, 0, 8);
const iso = (i) => new Date(T0 + i * 3600e3).toISOString().slice(0, 16);
const diurnal = (i, lo, hi) => { const h = i % 24; return lo + (hi - lo) * (0.5 - 0.5 * Math.cos(((h - 3) / 24) * 2 * Math.PI)); };
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// f(i, age) → { t, code, cloud, low, mid, high, vis, pr(mm), sf(cm), wind, dir }  (age = 지금부터 몇 시간 전)
const S = {
  clear: (i) => ({ t: diurnal(i, 1, 10), code: 0, cloud: 4, low: 0, mid: 0, high: 6, vis: 32000, wind: 2.2, dir: 300 }),
  partly: (i) => ({ t: diurnal(i, 4, 13), code: 2, cloud: 45, low: 30, mid: 15, high: 35, vis: 28000, wind: 3.8, dir: 270 }),
  overcast: (i) => ({ t: diurnal(i, 3, 7), code: 3, cloud: 100, low: 96, mid: 70, high: 30, vis: 15000, wind: 4.5, dir: 240 }),
  fog: (i, a) => ({ t: diurnal(i, 2, 5), code: a < 10 ? 45 : 3, cloud: 100, low: 100, mid: 10, high: 0, vis: a < 10 ? 160 : 8000, wind: 0.6, dir: 180 }),
  drizzle: (i, a) => ({ t: diurnal(i, 7, 11), code: a < 5 ? 53 : 3, cloud: 100, low: 100, mid: 80, high: 20, vis: 6000, pr: a < 5 ? 0.4 : 0, wind: 3, dir: 200 }),
  rain: (i, a) => ({ t: diurnal(i, 8, 12), code: a < 8 ? 63 : 3, cloud: 100, low: 100, mid: 95, high: 50, vis: 5000, pr: a < 8 ? 3.5 : 0, wind: 6.5, dir: 230 }),
  thunder: (i, a) => ({ t: diurnal(i, 16, 24), code: a < 3 ? 95 : a < 6 ? 63 : 2, cloud: a < 6 ? 100 : 50, low: 90, mid: 90, high: 80, vis: 7000, pr: a < 3 ? 7 : a < 6 ? 2 : 0, wind: 9, dir: 250 }),
  snowlight: (i, a) => ({ t: diurnal(i, -4, -1), code: a < 4 ? 71 : 3, cloud: a < 4 ? 98 : 85, low: 90, mid: 60, high: 20, vis: 4000, sf: a < 4 ? 0.35 : 0, wind: 2.5, dir: 320 }),
  // 이틀 가까이 내린 많은 눈(모형의 snow_depth도 있다)
  heavy: (i, a) => ({ t: diurnal(i, -8, -4), code: a < 6 ? 75 : a < 34 ? 73 : 3, cloud: a < 34 ? 100 : 80, low: 100, mid: 90, high: 40, vis: a < 6 ? 450 : 2500, sf: a < 6 ? 3 : a < 34 ? 0.6 : 0, wind: a < 6 ? 10 : 5, dir: 330, api: true }),
  // 닷새 전에 24cm 내리고 그 뒤로 포근해 녹는 중
  melting: (i, a) => ({ t: a > 120 ? -3 : diurnal(i, -3, 4.6), code: a > 120 && a < 132 ? 73 : 1, cloud: a > 120 && a < 132 ? 100 : 15, low: 10, mid: 5, high: 15, vis: 25000, sf: a > 120 && a < 132 ? 2.2 : 0, wind: 2, dir: 280 }),
  // 이틀 전에 15cm 내리고 추워서 그대로. 지금은 맑음(밤하늘 + 깊은 눈)
  snowclear: (i, a) => ({ t: diurnal(i, -9, -3), code: a > 48 && a < 60 ? 73 : 0, cloud: a > 48 && a < 60 ? 100 : 3, low: 0, mid: 0, high: 5, vis: 30000, sf: a > 48 && a < 60 ? 1.25 : 0, wind: 1.5, dir: 300 }),
};

mkdirSync('public/weather-mock', { recursive: true });
for (const [name, f] of Object.entries(S)) {
  seed = 7; const H = { time: [], temperature_2m: [], snowfall: [], snow_depth: [], precipitation: [], rain: [], showers: [], weather_code: [], cloud_cover: [], visibility: [] };
  let depth = 0;
  for (let i = 0; i < DAYS * 24; i++) {
    const a = NOW - i, w = f(i, a), sf = +(w.sf || 0).toFixed(2), pr = +((w.pr || 0) + sf / 0.7).toFixed(2);   // 강수 = 비 + 눈의 물 양(눈 cm ÷ 0.7)
    depth = Math.max(0, depth + sf - depth * 0.003 - (w.t > 0 ? 0.06 * w.t : 0));
    H.time.push(iso(i)); H.temperature_2m.push(+(w.t + (rnd() - 0.5) * 0.6).toFixed(1)); H.snowfall.push(sf); H.precipitation.push(pr); H.rain.push(w.code >= 80 ? 0 : +(w.pr || 0).toFixed(2)); H.showers.push(w.code >= 80 ? +(w.pr || 0).toFixed(2) : 0);
    H.snow_depth.push(w.api ? +(depth / 100).toFixed(3) : null); H.weather_code.push(w.code); H.cloud_cover.push(w.cloud); H.visibility.push(w.vis);
  }
  const w = f(NOW, 0), sf = (w.sf || 0) / 4, pr = (w.pr || 0) / 4;
  const out = {
    latitude: 37.56, longitude: 126.98, timezone: 'Asia/Seoul', utc_offset_seconds: 32400, mock: name,
    current_units: { temperature_2m: '°C', snowfall: 'cm', precipitation: 'mm', visibility: 'm', wind_speed_10m: 'm/s' },
    current: { time: iso(NOW), interval: 900, temperature_2m: H.temperature_2m[NOW], precipitation: +(pr + sf / 0.7).toFixed(2), rain: w.code >= 95 ? 0 : +pr.toFixed(2), showers: w.code >= 95 ? +pr.toFixed(2) : 0, snowfall: +sf.toFixed(2),
      weather_code: w.code, cloud_cover: w.cloud, cloud_cover_low: w.low, cloud_cover_mid: w.mid, cloud_cover_high: w.high, visibility: w.vis, wind_speed_10m: w.wind, wind_direction_10m: w.dir, is_day: 1 },
    hourly_units: { snowfall: 'cm', snow_depth: 'm', precipitation: 'mm', visibility: 'm' },
    hourly: H,
  };
  writeFileSync(`public/weather-mock/${name}.json`, JSON.stringify(out));
  console.log(name, 'depth(model) ≈', depth.toFixed(1), 'cm');
}
