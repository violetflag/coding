// d3-celestial(BSD-3, Olaf Frohn)의 별·별자리·은하수 자료를 public/sky/ 의 작은 파일로 바꾼다.
//   mkdir /tmp/d3c && cd /tmp/d3c && npm pack d3-celestial && tar xzf d3-celestial-*.tgz
//   node tools/sky-data.mjs /tmp/d3c/package
// 만드는 파일:
//   stars.bin     Int16 LE × 4 (적경 0..360°를 0..65535로, 적위 ×32767/90, 등급 ×100, B-V ×1000), 밝은 별부터
//   sky.json      별자리 [약자, 한글 이름, 적경, 적위, 황도 12궁 여부], 별자리 선(적경·적위 꺾은선)
//   milkyway.png  은하수 밝기(적경·적위 등장방형 2048×1024, 회색조, 값 = √밝기)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';

const src = process.argv[2] || '/tmp/d3c/package', D = join(src, 'data'), OUT = 'public/sky';
const J = (f) => JSON.parse(readFileSync(join(D, f), 'utf8'));
mkdirSync(OUT, { recursive: true });

// 한국천문학회 공식 별자리 이름 (88개)
const KO = {
  And: '안드로메다자리', Ant: '공기펌프자리', Aps: '극락조자리', Aqr: '물병자리', Aql: '독수리자리', Ara: '제단자리', Ari: '양자리', Aur: '마차부자리',
  Boo: '목동자리', Cae: '조각칼자리', Cam: '기린자리', Cnc: '게자리', CVn: '사냥개자리', CMa: '큰개자리', CMi: '작은개자리', Cap: '염소자리',
  Car: '용골자리', Cas: '카시오페이아자리', Cen: '센타우루스자리', Cep: '케페우스자리', Cet: '고래자리', Cha: '카멜레온자리', Cir: '컴퍼스자리', Col: '비둘기자리',
  Com: '머리털자리', CrA: '남쪽왕관자리', CrB: '북쪽왕관자리', Crv: '까마귀자리', Crt: '컵자리', Cru: '남십자자리', Cyg: '백조자리', Del: '돌고래자리',
  Dor: '황새치자리', Dra: '용자리', Equ: '조랑말자리', Eri: '에리다누스자리', For: '화로자리', Gem: '쌍둥이자리', Gru: '두루미자리', Her: '헤르쿨레스자리',
  Hor: '시계자리', Hya: '바다뱀자리', Hyi: '물뱀자리', Ind: '인디언자리', Lac: '도마뱀자리', Leo: '사자자리', LMi: '작은사자자리', Lep: '토끼자리',
  Lib: '천칭자리', Lup: '이리자리', Lyn: '살쾡이자리', Lyr: '거문고자리', Men: '테이블산자리', Mic: '현미경자리', Mon: '외뿔소자리', Mus: '파리자리',
  Nor: '직각자자리', Oct: '팔분의자리', Oph: '뱀주인자리', Ori: '오리온자리', Pav: '공작자리', Peg: '페가수스자리', Per: '페르세우스자리', Phe: '봉황새자리',
  Pic: '화가자리', Psc: '물고기자리', PsA: '남쪽물고기자리', Pup: '고물자리', Pyx: '나침반자리', Ret: '그물자리', Sge: '화살자리', Sgr: '궁수자리',
  Sco: '전갈자리', Scl: '조각가자리', Sct: '방패자리', Ser: '뱀자리', Sex: '육분의자리', Tau: '황소자리', Tel: '망원경자리', Tri: '삼각형자리',
  TrA: '남쪽삼각형자리', Tuc: '큰부리새자리', UMa: '큰곰자리', UMi: '작은곰자리', Vel: '돛자리', Vir: '처녀자리', Vol: '날치자리', Vul: '작은여우자리',
};
const ZODIAC = ['Ari', 'Tau', 'Gem', 'Cnc', 'Leo', 'Vir', 'Lib', 'Sco', 'Sgr', 'Cap', 'Aqr', 'Psc'];
if (Object.keys(KO).length !== 88) throw new Error('별자리 이름이 88개가 아닙니다: ' + Object.keys(KO).length);
const ra360 = (lon) => ((lon % 360) + 360) % 360, r2 = (v) => Math.round(v * 100) / 100;

// ---- 별
const stars = J('stars.6.json').features.map((f) => ({ ra: ra360(f.geometry.coordinates[0]), dec: f.geometry.coordinates[1], mag: +f.properties.mag, bv: f.properties.bv === '' || f.properties.bv == null ? 0.6 : +f.properties.bv }))
  .filter((s) => Number.isFinite(s.mag)).sort((a, b) => a.mag - b.mag);
const sb = new Int16Array(stars.length * 4);
stars.forEach((s, i) => { sb[i * 4] = (Math.round(s.ra / 360 * 65536) & 0xffff) << 16 >> 16; sb[i * 4 + 1] = Math.round(s.dec / 90 * 32767); sb[i * 4 + 2] = Math.round(s.mag * 100); sb[i * 4 + 3] = Math.round(Math.max(-0.5, Math.min(2.5, s.bv)) * 1000); });
writeFileSync(join(OUT, 'stars.bin'), Buffer.from(sb.buffer));

// ---- 별자리 이름·중심과 선
const cons = [], diff = [];
for (const f of J('constellations.json').features) {
  const id = f.id; if (!KO[id]) throw new Error('모르는 별자리 ' + id);
  if (f.properties.ko && f.properties.ko !== KO[id]) diff.push(`${id}: ${f.properties.ko} → ${KO[id]}`);
  cons.push([id, KO[id], r2(ra360(f.geometry.coordinates[0])), r2(f.geometry.coordinates[1]), ZODIAC.includes(id) ? 1 : 0]);
}
const ci = (id) => cons.findIndex((c) => c[0] === id);
const lines = [];
for (const f of J('constellations.lines.json').features) for (const pl of f.geometry.coordinates) lines.push([ci(f.id), ...pl.flatMap(([l, b]) => [r2(ra360(l)), r2(b)])]);
writeFileSync(join(OUT, 'sky.json'), JSON.stringify({ cons, lines }));

// ---- 은하수: mw.json의 다섯 단계 윤곽(ol1 바깥 … ol5 가장 밝은 곳)을 칠하고 흐리게 한다
const W = 2048, H = 1024, SS = 2, WS = W * SS, HS = H * SS, acc = new Float32Array(W * H);
const WEIGHT = { ol1: 0.22, ol2: 0.2, ol3: 0.2, ol4: 0.2, ol5: 0.18 };
for (const f of J('mw.json').features) {
  const mask = new Uint8Array(WS * HS);
  for (const poly of f.geometry.coordinates) for (const ring0 of poly) {
    // 적경을 이어지게 펼친다(±180°를 넘을 때 끊기지 않게). 한 바퀴 도는 고리(띠의 가장자리)는 북극으로 닫는다.
    const ring = []; let off = 0;
    for (let i = 0; i < ring0.length; i++) { let x = ring0[i][0]; if (i) { const p = ring0[i - 1][0]; if (x - p > 180) off -= 360; else if (x - p < -180) off += 360; } ring.push([x + off, ring0[i][1]]); }
    const wind = ring[ring.length - 1][0] - ring[0][0];
    if (Math.abs(wind) > 180) { const a = ring[ring.length - 1], b = ring[0]; ring.push([a[0], 90], [b[0], 90]); }
    // 행마다 교차점을 모아 짝수-홀수 규칙으로 칠한다(고리끼리는 XOR: 구멍과 띠가 저절로 맞는다)
    const rows = Array.from({ length: HS }, () => []);
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length]; if (p[1] === q[1]) continue;
      const y0 = Math.min(p[1], q[1]), y1 = Math.max(p[1], q[1]);
      const r0 = Math.max(0, Math.ceil((90 - y1) / 180 * HS - 0.5)), r1 = Math.min(HS - 1, Math.floor((90 - y0) / 180 * HS - 0.5));
      for (let r = r0; r <= r1; r++) { const y = 90 - (r + 0.5) / HS * 180; if (y < y0 || y >= y1) continue; rows[r].push(p[0] + (y - p[1]) * (q[0] - p[0]) / (q[1] - p[1])); }
    }
    for (let r = 0; r < HS; r++) {
      const xs = rows[r].sort((a, b) => a - b), row = r * WS;
      for (let k = 0; k + 1 < xs.length; k += 2) { const c0 = Math.ceil(xs[k] / 360 * WS - 0.5), c1 = Math.floor(xs[k + 1] / 360 * WS - 0.5); for (let c = c0; c <= c1; c++) mask[row + (((c % WS) + WS) % WS)] ^= 1; }
    }
  }
  const w = WEIGHT[f.id] / (SS * SS);
  for (let y = 0; y < HS; y++) for (let x = 0; x < WS; x++) if (mask[y * WS + x]) acc[((y / SS) | 0) * W + ((x / SS) | 0)] += w;
}
// 구면에서 고르게 흐리게: 가로는 1/cos(적위)만큼 넓게. 좁은 흐림(결)과 넓은 흐림(번짐)을 섞는다.
const blur = (src, sig) => {
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const dec = 90 - (y + 0.5) / H * 180, sx = Math.min(sig / Math.max(0.05, Math.cos(dec * Math.PI / 180)), 200), R = Math.ceil(sx * 2.5), k = [];
    let s = 0; for (let i = -R; i <= R; i++) { const v = Math.exp(-i * i / (2 * sx * sx)); k.push(v); s += v; }
    for (let x = 0; x < W; x++) { let a = 0; for (let i = -R; i <= R; i++) a += src[y * W + (((x + i) % W) + W) % W] * k[i + R]; tmp[y * W + x] = a / s; }
  }
  const R = Math.ceil(sig * 2.5), k = []; let s = 0; for (let i = -R; i <= R; i++) { const v = Math.exp(-i * i / (2 * sig * sig)); k.push(v); s += v; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let a = 0; for (let i = -R; i <= R; i++) { const yy = Math.max(0, Math.min(H - 1, y + i)); a += tmp[yy * W + x] * k[i + R]; } out[y * W + x] = a / s; }
  return out;
};
const fine = blur(acc, 3), wide = blur(acc, 18);
let mx = 0; const mwv = new Float32Array(W * H); for (let i = 0; i < W * H; i++) { mwv[i] = 0.55 * fine[i] + 0.45 * wide[i]; mx = Math.max(mx, mwv[i]); }
const px = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) px[i] = Math.round(Math.sqrt(mwv[i] / mx) * 255);
writeFileSync(join(OUT, 'milkyway.png'), png(px, W, H));

console.log(`별 ${stars.length}개 (가장 어두운 ${stars[stars.length - 1].mag}등급) · 별자리 ${cons.length}(이름 88) · 선 ${lines.length}줄 · 은하수 ${W}×${H}`);
if (diff.length) console.log('d3-celestial의 한글 이름과 다르게 쓴 것(공식 이름으로 고침):\n  ' + diff.join('\n  '));

// 회색조 8비트 PNG (행마다 None/Sub/Up 중 작은 쪽 필터)
function png(data, w, h) {
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = data.subarray(y * w, y * w + w), prev = y ? data.subarray((y - 1) * w, y * w) : null, cands = [];
    for (const ft of [0, 1, 2]) { const b = Buffer.alloc(w); let s = 0; for (let x = 0; x < w; x++) { const v = ft === 0 ? row[x] : ft === 1 ? row[x] - (x ? row[x - 1] : 0) : row[x] - (prev ? prev[x] : 0); b[x] = v & 255; s += Math.min(b[x], 256 - b[x]); } cands.push([s, ft, b]); }
    cands.sort((a, b) => a[0] - b[0]); raw[y * (w + 1)] = cands[0][1]; cands[0][2].copy(raw, y * (w + 1) + 1);
  }
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (buf) => { let c = -1; for (const b of buf) c = crcT[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, body) => { const len = Buffer.alloc(4); len.writeUInt32BE(body.length); const tb = Buffer.concat([Buffer.from(type), body]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(tb)); return Buffer.concat([len, tb, cr]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
