// 해와 달의 위치·달의 위상 (저정밀 천문 공식. SunCalc(BSD-2, Vladimir Agafonkin)가 쓰는 것과 같은 표준 식).
// 방위각 az는 북쪽 0, 동쪽 90°(라디안)로 돌려준다.
const { sin, cos, tan, asin, atan2, acos, PI } = Math;
const rad = PI / 180, dayMs = 864e5, J1970 = 2440588, J2000 = 2451545, e = rad * 23.4397;
const toDays = (date) => date.valueOf() / dayMs - 0.5 + J1970 - J2000;
const ra = (l, b) => atan2(sin(l) * cos(e) - tan(b) * sin(e), cos(l));
const dec = (l, b) => asin(sin(b) * cos(e) + cos(b) * sin(e) * sin(l));
const azimuth = (H, phi, d) => atan2(sin(H), cos(H) * sin(phi) - tan(d) * cos(phi)) + PI;
const altitude = (H, phi, d) => asin(sin(phi) * sin(d) + cos(phi) * cos(d) * cos(H));
const sidereal = (d, lw) => rad * (280.46061837 + 360.98564736629 * d) - lw;   // 그리니치 평균 항성시(Meeus 12.4). 별자리 하늘(skycalc.js)과 같은 식

function sunCoords(d) {
  const M = rad * (357.5291 + 0.98560028 * d), C = rad * (1.9148 * sin(M) + 0.02 * sin(2 * M) + 0.0003 * sin(3 * M)), L = M + C + rad * (102.9372 + 3.8246e-5 * d) + PI;   // 근일점 경도에 세차(하루 0.0000382°)를 더해 그날의 황경으로
  return { dec: dec(L, 0), ra: ra(L, 0) };
}
function moonCoords(d) {
  const L = rad * (218.316 + 13.176396 * d), M = rad * (134.963 + 13.064993 * d), F = rad * (93.272 + 13.22935 * d);
  const l = L + rad * 6.289 * sin(M), b = rad * 5.128 * sin(F);
  return { ra: ra(l, b), dec: dec(l, b), dist: 385001 - 20905 * cos(M) };
}

export function sunPosition(date, lat, lon) {
  const lw = rad * -lon, phi = rad * lat, d = toDays(date), c = sunCoords(d), H = sidereal(d, lw) - c.ra;
  return { az: azimuth(H, phi, c.dec), alt: altitude(H, phi, c.dec) };
}
export function moonPosition(date, lat, lon) {
  const lw = rad * -lon, phi = rad * lat, d = toDays(date), c = moonCoords(d), H = sidereal(d, lw) - c.ra;
  return { az: azimuth(H, phi, c.dec), alt: altitude(H, phi, c.dec) };
}
// fraction = 밝은 부분의 비율(0 삭 … 1 보름), phase = 0…1 (0 삭, 0.5 보름), waxing = 차오르는 중
export function moonPhase(date) {
  const d = toDays(date), s = sunCoords(d), m = moonCoords(d), sdist = 149598000;
  const phi = acos(sin(s.dec) * sin(m.dec) + cos(s.dec) * cos(m.dec) * cos(s.ra - m.ra));
  const inc = atan2(sdist * sin(phi), m.dist - sdist * cos(phi));
  const angle = atan2(cos(s.dec) * sin(s.ra - m.ra), sin(s.dec) * cos(m.dec) - cos(s.dec) * sin(m.dec) * cos(s.ra - m.ra));
  return { fraction: (1 + cos(inc)) / 2, phase: 0.5 + 0.5 * inc * (angle < 0 ? -1 : 1) / PI, waxing: angle < 0 };
}
// 날짜와 위도로 계절을 정한다 (남반구는 반대)
export function seasonOf(date, lat) {
  const m = date.getMonth(), n = m <= 1 || m === 11 ? 0 : m <= 4 ? 1 : m <= 7 ? 2 : 3;
  return ['winter', 'spring', 'summer', 'autumn'][lat < 0 ? (n + 2) % 4 : n];
}
