// 밤하늘 계산(three 없이): 항성시, 세차, 적도좌표 → 장면 방향 회전, 행성 위치와 밝기.
// 장면 방향은 environment.js 와 같다: 북 = +Z, 동 = -X, 위 = +Y.
const RAD = Math.PI / 180, { sin, cos, atan2, sqrt, log10, acos, abs } = Math;
export const OBLIQUITY = 23.43928 * RAD;                         // J2000 황도 경사

// J2000.0 부터 지난 날 수 (UT. 이 정도 정밀도에서는 TT와 같다고 본다)
export const daysJ2000 = (date) => date.valueOf() / 864e5 + 2440587.5 - 2451545;
// 지방 항성시(라디안). Meeus 12.4의 그리니치 평균 항성시 + 경도
export function localSidereal(date, lonDeg) {
  const d = daysJ2000(date), T = d / 36525;
  const g = 280.46061837 + 360.98564736629 * d + 0.000387933 * T * T;
  return (((g + lonDeg) % 360) + 360) % 360 * RAD;
}
// 적경·적위(도) → 적도 단위벡터 (x: 춘분점, z: 천구 북극)
export const equVec = (raDeg, decDeg, out = [0, 0, 0]) => { const a = raDeg * RAD, d = decDeg * RAD; out[0] = cos(d) * cos(a); out[1] = cos(d) * sin(a); out[2] = sin(d); return out; };

// 3×3 행렬(행 우선 배열 9개)
const mul = (A, B) => { const C = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return C; };
export const apply = (M, v, out = [0, 0, 0]) => { const x = v[0], y = v[1], z = v[2]; out[0] = M[0] * x + M[1] * y + M[2] * z; out[1] = M[3] * x + M[4] * y + M[5] * z; out[2] = M[6] * x + M[7] * y + M[8] * z; return out; };
// 축 둘레 회전(오른손 법칙)
const axisRot = (ax, a) => { const [x, y, z] = ax, c = cos(a), s = sin(a), t = 1 - c; return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c]; };

// J2000 적도좌표 → 장면 방향 회전 행렬. 세차(황도 북극 둘레로 해마다 50.29″), 항성시, 위도를 합친다.
export function skyMatrix(date, latDeg, lonDeg) {
  const T = daysJ2000(date) / 36525;
  const P = axisRot([0, -sin(OBLIQUITY), cos(OBLIQUITY)], 1.396971 * T * RAD);
  const L = localSidereal(date, lonDeg), cl = cos(L), sl = sin(L);
  const Rz = [cl, sl, 0, -sl, cl, 0, 0, 0, 1];                    // 시간각 좌표: x' = 자오선, y' = 동, z' = 북극
  const f = latDeg * RAD, cf = cos(f), sf = sin(f);
  const A = [0, -1, 0, cf, 0, sf, -sf, 0, cf];                    // 장면: x = -동, y = 위, z = 북
  return mul(A, mul(Rz, P));
}
// 장면 방향 → 고도·방위(도, 방위는 북 0 동 90)
export const altAz = (s) => ({ alt: Math.asin(Math.max(-1, Math.min(1, s[1]))) / RAD, az: ((atan2(-s[0], s[2]) / RAD) + 360) % 360 });

// ---- 행성 (Standish, "Keplerian Elements for Approximate Positions of the Major Planets", 1800–2050년용 표 1)
// a, e, I, L, 근일점 경도, 승교점 경도와 세기당 변화량. 황도 J2000.
const EL = {
  earth: [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0]],
  venus: [[0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255], [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]],
  mars: [[1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
  jupiter: [[5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
  saturn: [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
};
function helio(name, T) {
  const [e0, r] = EL[name], [a, e, I, L, wb, O] = e0.map((v, i) => v + r[i] * T);
  const w = (wb - O) * RAD, M0 = ((L - wb) % 360 + 540) % 360 - 180, M = M0 * RAD;
  let E = M + e * sin(M); for (let k = 0; k < 6; k++) E -= (E - e * sin(E) - M) / (1 - e * cos(E));
  const xp = a * (cos(E) - e), yp = a * sqrt(1 - e * e) * sin(E), o = O * RAD, i = I * RAD;
  const cw = cos(w), sw = sin(w), co = cos(o), so = sin(o), ci = cos(i), si = sin(i);
  return [(cw * co - sw * so * ci) * xp + (-sw * co - cw * so * ci) * yp, (cw * so + sw * co * ci) * xp + (-sw * so + cw * co * ci) * yp, sw * si * xp + cw * si * yp];
}
const eclToEqu = (v) => { const c = cos(OBLIQUITY), s = sin(OBLIQUITY); return [v[0], c * v[1] - s * v[2], s * v[1] + c * v[2]]; };
// 지구에서 본 J2000 적도 방향(단위벡터)과 겉보기 등급
const MAG = { venus: [-4.40, (i) => 0.0009 * i + 2.39e-4 * i * i - 6.5e-7 * i * i * i], mars: [-1.52, (i) => 0.016 * i], jupiter: [-9.40, (i) => 0.005 * i], saturn: [-8.88, (i) => 0.044 * i] };
export const PLANETS = ['venus', 'mars', 'jupiter', 'saturn'];
export function planetPositions(date) {
  const T = daysJ2000(date) / 36525, E = helio('earth', T), R = Math.hypot(...E);
  return PLANETS.map((n) => {
    const p = helio(n, T), g = [p[0] - E[0], p[1] - E[1], p[2] - E[2]], D = Math.hypot(...g), r = Math.hypot(...p);
    const ph = acos(Math.max(-1, Math.min(1, (r * r + D * D - R * R) / (2 * r * D)))) / RAD;
    const q = eclToEqu(g); return { name: n, dir: [q[0] / D, q[1] / D, q[2] / D], mag: MAG[n][0] + 5 * log10(r * D) + MAG[n][1](ph) };
  });
}
// 지구 궤도로 구한 해의 J2000 적도 방향 (자체 점검용)
export function sunEqu(date) { const E = helio('earth', daysJ2000(date) / 36525), q = eclToEqu([-E[0], -E[1], -E[2]]), n = Math.hypot(...q); return [q[0] / n, q[1] / n, q[2] / n]; }

// B-V 색지수 → 눈에 보이는 별빛 색(옅게). Ballesteros 식으로 온도, 흑체 근사로 RGB.
export function bvColor(bv) {
  const t = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62)) / 100;
  const r = t <= 66 ? 1 : Math.min(1, 1.2929 * Math.pow(t - 60, -0.1332));
  const g = Math.min(1, t <= 66 ? 0.39 * Math.log(t) - 0.6318 : 1.1298 * Math.pow(t - 60, -0.0755));
  const b = t >= 66 ? 1 : t <= 19 ? 0 : Math.min(1, 0.5432 * Math.log(t - 10) - 1.1962);
  const m = Math.max(r, g, b), k = 0.55;                          // 눈은 별 색을 옅게 본다: 흰색 쪽으로 절반쯤
  return [(1 - k) + k * r / m, (1 - k) + k * g / m, (1 - k) + k * b / m].map((v) => Math.max(0, v));
}
