// 밤하늘 계산 자체 점검: node tools/sky-check.mjs
// 항성시(Meeus 예제), 세차(Meeus 예제 21.b), 북극성 고도 = 위도, 시리우스의 고도(독립 계산과 비교, 남중 고도), 해가 황도 위에 있는지, 겨울 저녁의 오리온.
import { readFileSync } from 'node:fs';
import { localSidereal, skyMatrix, apply, equVec, altAz, sunEqu, planetPositions } from '../src/scene/skycalc.js';
import { sunPosition } from '../src/scene/astro.js';

const R = Math.PI / 180, SEOUL = { lat: 37.5665, lon: 126.978 };
let fails = 0;
const ok = (name, got, want, tol, unit = '°') => { const d = Math.abs(got - want), pass = d <= tol; if (!pass) fails++; console.log(`${pass ? '통과' : '실패'}  ${name}: ${got.toFixed(4)}${unit} (기준 ${want.toFixed(4)}${unit}, 차이 ${d.toFixed(4)}, 허용 ${tol})`); };
const dirOf = (M, ra, dec) => apply(M, equVec(ra, dec));
const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) / R;
const sceneDir = (az, alt) => [-Math.sin(az) * Math.cos(alt), Math.sin(alt), Math.cos(az) * Math.cos(alt)];   // environment.js 의 _dir 과 같다

// 1) 그리니치 항성시: Meeus 예제 12.a (1987-04-10 0h UT → 13h10m46.3668s), 12.b (19:21 UT → 8h34m57.0896s)
ok('항성시 12.a', localSidereal(new Date(Date.UTC(1987, 3, 10, 0, 0, 0)), 0) / R, (13 + 10 / 60 + 46.3668 / 3600) * 15, 0.001);
ok('항성시 12.b', localSidereal(new Date(Date.UTC(1987, 3, 10, 19, 21, 0)), 0) / R, (8 + 34 / 60 + 57.0896 / 3600) * 15, 0.001);

// 2) 세차: Meeus 예제 21.b θ Per, J2000 → 2028-11-13 (고유운동을 뺀 값 α 2h46m10.343s, δ +49°20′57.12″).
//    위도 90°, 경도 0°에서 장면 방향을 다시 적경·적위로 되돌려 비교한다.
{
  const date = new Date(Date.UTC(2028, 10, 13, 4, 33, 36)), M = skyMatrix(date, 90, 0), L = localSidereal(date, 0);
  const s = dirOf(M, (2 + 44 / 60 + 11.986 / 3600) * 15, 49 + 13 / 60 + 42.48 / 3600);
  // 북극에서: 고도 = 적위, 방위로 시간각 → 적경
  const { alt, az } = altAz(s), ra = ((L / R + 180 - az) % 360 + 360) % 360;
  ok('세차 θPer 적위', alt, 49 + 20 / 60 + 57.12 / 3600, 0.02);
  ok('세차 θPer 적경', ra, (2 + 46 / 60 + 10.343 / 3600) * 15, 0.03);
}

// 3) 북극성 고도 ≈ 위도 (북극성은 극에서 약 0.66° 떨어져 있다), 하루 동안
{
  let lo = 99, hi = -99; for (let h = 0; h < 24; h++) { const d = new Date(Date.UTC(2026, 0, 15, h)), a = altAz(dirOf(skyMatrix(d, SEOUL.lat, SEOUL.lon), 37.954, 89.264)).alt; lo = Math.min(lo, a); hi = Math.max(hi, a); }
  ok('북극성 하루 평균 고도(서울)', (lo + hi) / 2, SEOUL.lat, 0.05); ok('북극성 고도 흔들림 폭의 절반', (hi - lo) / 2, 0.69, 0.08);
}

// 4) 시리우스: 독립 계산(Meeus 21.2 엄밀 세차 + 구면삼각법)과 비교, 남중 고도 = 90 − 위도 + 적위
{
  const raJ = 101.2872, decJ = -16.7161;
  const independent = (date, lat, lon) => {
    const T = (date.valueOf() / 864e5 + 2440587.5 - 2451545) / 36525, as = (x) => x / 3600 * R;
    const z1 = as(2306.2181 * T + 0.30188 * T * T), z = as(2306.2181 * T + 1.09468 * T * T), th = as(2004.3109 * T - 0.42665 * T * T);
    const a0 = raJ * R, d0 = decJ * R, A = Math.cos(d0) * Math.sin(a0 + z1), B = Math.cos(th) * Math.cos(d0) * Math.cos(a0 + z1) - Math.sin(th) * Math.sin(d0), C = Math.sin(th) * Math.cos(d0) * Math.cos(a0 + z1) + Math.cos(th) * Math.sin(d0);
    const ra = Math.atan2(A, B) + z, dec = Math.asin(C), H = localSidereal(date, lon) - ra, f = lat * R;
    return Math.asin(Math.sin(f) * Math.sin(dec) + Math.cos(f) * Math.cos(dec) * Math.cos(H)) / R;
  };
  for (const iso of ['2026-01-15T12:00:00Z', '2026-02-01T11:30:00Z', '2025-12-24T15:00:00Z']) {
    const d = new Date(iso); ok(`시리우스 고도 ${iso} 서울`, altAz(dirOf(skyMatrix(d, SEOUL.lat, SEOUL.lon), raJ, decJ)).alt, independent(d, SEOUL.lat, SEOUL.lon), 0.05);
  }
  let best = -99, at = null; for (let m = 0; m < 24 * 60; m++) { const d = new Date(Date.UTC(2025, 11, 31, 12) + m * 6e4), a = altAz(dirOf(skyMatrix(d, SEOUL.lat, SEOUL.lon), raJ, decJ)).alt; if (a > best) { best = a; at = d; } }
  ok('시리우스 남중 고도(서울)', best, 90 - SEOUL.lat + decJ - 0.1, 0.15);   // 2026년 적위는 세차로 약 0.1° 남쪽
  console.log(`      시리우스 남중 시각: ${new Date(at.valueOf() + 9 * 36e5).toISOString().slice(0, 16).replace('T', ' ')} 한국시각 (1월 1일 자정 무렵이어야 한다)`);
}

// 5) 해가 황도 위에 있는가: astro.js 의 해 방향(조명과 해 원반이 쓰는 것)과 별 하늘의 황도선 사이 최소 각도
{
  for (const iso of ['2026-03-20T03:00:00Z', '2026-06-21T03:00:00Z', '2026-11-22T04:00:00Z']) {
    const d = new Date(iso), M = skyMatrix(d, SEOUL.lat, SEOUL.lon), sp = sunPosition(d, SEOUL.lat, SEOUL.lon), s = sceneDir(sp.az, sp.alt);
    let min = 180; for (let l = 0; l < 360; l += 0.05) { const e = 23.43928 * R, v = [Math.cos(l * R), Math.sin(l * R) * Math.cos(e), Math.sin(l * R) * Math.sin(e)]; min = Math.min(min, ang(apply(M, v), s)); }
    ok(`해 ↔ 황도 거리 ${iso}`, min, 0, 0.05);
    ok(`astro.js 해 ↔ 궤도요소 해 ${iso}`, ang(apply(M, sunEqu(d)), s), 0, 0.15);   // 두 저정밀 식의 차이(해 원반 반지름 0.27°보다 작으면 된다)
  }
}

// 6) 겨울 저녁 서울에서 오리온(베텔게우스)이 남동쪽 하늘에, 7월 밤 궁수자리(은하 중심)가 남쪽 낮은 하늘에
{
  const d = new Date('2026-01-15T12:00:00Z'), p = altAz(dirOf(skyMatrix(d, SEOUL.lat, SEOUL.lon), 88.793, 7.407));
  console.log(`      베텔게우스 2026-01-15 21:00 KST: 고도 ${p.alt.toFixed(1)}°, 방위 ${p.az.toFixed(0)}°`); ok('베텔게우스가 떠 있다(고도 > 30°)', Math.min(p.alt, 30), 30, 0);
  const g = altAz(dirOf(skyMatrix(new Date('2026-07-15T13:00:00Z'), SEOUL.lat, SEOUL.lon), 266.4, -28.94));
  console.log(`      은하 중심 2026-07-15 22:00 KST: 고도 ${g.alt.toFixed(1)}°, 방위 ${g.az.toFixed(0)}°`); ok('은하 중심이 남쪽 하늘(방위 150–210°)', Math.abs(g.az - 180) <= 30 ? 0 : 1, 0, 0);
}

// 7) 행성 (2026-11-22): 등급이 그럴듯한 범위인지
for (const p of planetPositions(new Date('2026-11-22T12:00:00Z'))) { const lim = { venus: [-4.9, -3.7], mars: [-2.9, 1.9], jupiter: [-2.9, -1.6], saturn: [-0.6, 1.6] }[p.name]; console.log(`      ${p.name} 등급 ${p.mag.toFixed(2)}`); ok(`${p.name} 등급 범위`, p.mag < lim[0] || p.mag > lim[1] ? 1 : 0, 0, 0, ''); }

// 8) 자료 파일
{
  const sb = new Int16Array(readFileSync('public/sky/stars.bin').buffer.slice(0)), j = JSON.parse(readFileSync('public/sky/sky.json', 'utf8'));
  const zod = j.cons.filter((c) => c[4]).map((c) => c[1]);
  console.log(`      별 ${sb.length / 4}개, 별자리 이름 ${new Set(j.cons.map((c) => c[0])).size}개, 황도 12궁: ${zod.join(' ')}`);
  const want = ['양자리', '황소자리', '쌍둥이자리', '게자리', '사자자리', '처녀자리', '천칭자리', '전갈자리', '궁수자리', '염소자리', '물병자리', '물고기자리'];
  ok('황도 12궁 이름', zod.length === 12 && want.every((n) => zod.includes(n)) ? 0 : 1, 0, 0, '');
}
console.log(fails ? `\n실패 ${fails}개` : '\n모두 통과'); process.exit(fails ? 1 : 0);
