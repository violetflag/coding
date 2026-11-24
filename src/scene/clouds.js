// 구름: 하늘 구 안쪽에 반구 하나를 두고, 미리 만든 이어지는 잡음 그림 한 장으로 낮은 구름(뭉게·층구름), 중간 구름, 높은 새털구름을 그린다.
// 보는 방향을 구름 높이의 평면에 비춰(지평선 쪽은 저절로 촘촘해진다) 잡음을 읽고, 구름 양에 맞는 문턱(잡음 분포의 분위수)으로 덮는 비율을 맞춘다.
// 바람 방향으로 천천히 흘러간다. 그리기 호출 1, 텍스처 읽기 3. 색과 문턱은 몇 초에 한 번 environment.recompute()가 정한다.
import * as THREE from 'three/webgpu';
import { Fn, uniform, texture, positionWorld, cameraPosition, normalize, vec2, vec3, float, max, smoothstep, mix, dot, pow, clamp } from 'three/tsl';

const N = 256;
let NOISE = null;
// 이어지는(타일) 값 잡음. R = 뭉게구름(6옥타브), G = 새털구름(가로로 늘인 결), B = 잔무늬(땅의 눈 얼룩에도 쓴다)
export function noiseTexture() {
  if (NOISE) return NOISE;
  const hash = (i, j, s) => { let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const vnoise = (x, y, px, py, s) => {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash(((i % px) + px) % px, ((j % py) + py) % py, s), b = hash((((i + 1) % px) + px) % px, ((j % py) + py) % py, s);
    const c = hash(((i % px) + px) % px, (((j + 1) % py) + py) % py, s), d = hash((((i + 1) % px) + px) % px, (((j + 1) % py) + py) % py, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, y, px, py, oct, s, gain = 0.5) => { let f = 0, a = 1, t = 0; for (let o = 0; o < oct; o++) { f += a * vnoise(x * (1 << o), y * (1 << o), px * (1 << o), py * (1 << o), s + o); t += a; a *= gain; } return f / t; };
  const data = new Uint8Array(N * N * 4), R = new Float32Array(N * N), B = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, k = y * N + x;
    const r = fbm(u * 4, v * 4, 4, 4, 6, 1, 0.52);
    const wq = fbm(u * 3, v * 3, 3, 3, 3, 40) - 0.5;                       // 새털구름: 결을 조금 휘게
    const g = fbm(u * 2 + wq * 0.8, v * 12 + wq * 3, 2, 12, 4, 70, 0.55);
    const b = fbm(u * 8, v * 8, 8, 8, 4, 90);
    R[k] = r; B[k] = b; data[k * 4] = r * 255; data[k * 4 + 1] = g * 255; data[k * 4 + 2] = b * 255; data[k * 4 + 3] = 255;
  }
  // 분위수 표: q[i] = 아래에서 i/64 만큼의 값. 구름 양 c → 문턱 q(1 - c)
  const quant = (arr) => { const s = Float32Array.from(arr).sort(), q = new Float32Array(65); for (let i = 0; i <= 64; i++) q[i] = s[Math.min(s.length - 1, Math.floor(i / 64 * s.length))] / 1; return q; };
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.anisotropy = 4; tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true;
  NOISE = { tex, qR: quant(R), qB: quant(B), qG: quant(Array.from({ length: N * N }, (_, k) => data[k * 4 + 1] / 255)) };
  return NOISE;
}
// 덮는 비율 c(0..1) → 잡음 문턱. c가 1에 가까우면 문턱을 최솟값 밑으로 내려 하늘을 다 덮는다.
export function threshold(q, c) { if (c >= 0.985) return q[0] - 0.2; if (c <= 0.01) return 2; const x = (1 - c) * 64, i = Math.floor(x), t = x - i; return q[i] + (q[Math.min(64, i + 1)] - q[i]) * t; }

export class Clouds {
  constructor(parent, center) {
    const nz = noiseTexture(); this.nz = nz;
    this.u = {
      thL: uniform(2), thM: uniform(2), thH: uniform(2), offL: uniform(new THREE.Vector2()), offM: uniform(new THREE.Vector2()), offH: uniform(new THREE.Vector2()),
      top: uniform(new THREE.Color(1, 1, 1)), base: uniform(new THREE.Color(0.5, 0.5, 0.5)), hor: uniform(new THREE.Color()), sunDir: uniform(new THREE.Vector3(0, 1, 0)), sunCol: uniform(new THREE.Color()),
      flat: uniform(0), flatCol: uniform(new THREE.Color()), flash: uniform(0), fogK: uniform(0),
    };
    const U = this.u, T = nz.tex;
    const dir = normalize(positionWorld.sub(cameraPosition)), h = dir.y;
    const pl = dir.xz.div(max(h, 0).add(0.06));                                  // 구름 높이의 평면 좌표
    const layer = (scale, off, ch, th, soft) => { const n = texture(T, pl.mul(scale).add(off))[ch]; return { n, a: smoothstep(th, th.add(soft), n) }; };
    const L = layer(0.32, U.offL, 'r', U.thL, 0.07), M = layer(0.8, U.offM, 'r', U.thM, 0.05), Hh = layer(0.16, U.offH, 'g', U.thH, 0.12);
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.BackSide });
    const thick = clamp(L.n.sub(U.thL).div(0.22), 0, 1);
    const sunF = pow(max(dot(dir, U.sunDir), 0), 6);
    const aL = L.a, aM = M.a.mul(0.85), aH = Hh.a.mul(0.5);
    const a = float(1).sub(float(1).sub(aL).mul(float(1).sub(aM)).mul(float(1).sub(aH)));
    mat.colorNode = Fn(() => {
      const low = mix(vec3(U.top), vec3(U.base), thick.mul(0.75)).add(vec3(U.sunCol).mul(sunF).mul(float(1).sub(thick)).mul(0.6));
      const hi = mix(vec3(U.top), vec3(U.sunCol), sunF.mul(0.5));
      let c = mix(hi, low, clamp(aL.add(aM).div(a.add(1e-3)), 0, 1));
      c = mix(c, vec3(U.flatCol), U.flat);                                       // 흐린 날: 회색으로 고르게
      c = mix(c, vec3(U.hor), float(1).sub(smoothstep(0.0, 0.32, h)).mul(0.75).max(U.fogK));   // 지평선 쪽과 안개는 지평선 색에 묻힌다
      return c.add(U.flash);
    })();
    mat.opacityNode = a.mul(smoothstep(-0.01, 0.05, h));
    const g = new THREE.SphereGeometry(47.5, 48, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    this.mesh = new THREE.Mesh(g, mat); this.mesh.position.copy(center); this.mesh.renderOrder = -1.9; this.mesh.frustumCulled = false; this.mesh.name = 'clouds'; parent.add(this.mesh);
    this.drift = new THREE.Vector2(); this.cover = 0;
  }
  // w: { cloud, low, mid, high }(0..1), 바람(m/s)과 그 바람이 불어오는 방위(도). 색은 environment가 넣는다.
  set(w) {
    const U = this.u, q = this.nz;
    const low = Math.max(w.low ?? w.cloud, 0), mid = w.mid ?? 0, high = w.high ?? 0, total = w.cloud;
    // 낮은·중간 구름의 합이 전체 구름 양을 넘지 않게, 모자라면 높은 구름으로 채운다
    const lm = Math.min(total, 1 - (1 - low) * (1 - mid * 0.85)), sh = Math.max(0, total - lm);
    U.thL.value = threshold(q.qR, Math.min(1, low * 1.3)); U.thM.value = threshold(q.qR, Math.min(1, mid * 0.8)); U.thH.value = threshold(q.qG, Math.min(1, high + sh));   // 부드러운 가장자리가 덮는 비율을 깎으므로 조금 더 준다
    U.flat.value = Math.max(0, (Math.max(low, total) - 0.82) / 0.18) * 0.85;
    this.cover = total; this.mesh.visible = total > 0.01;
    // 바람이 불어 가는 쪽(장면: 북 = +Z, 동 = -X). 구름 높이의 바람은 땅보다 세다.
    const az = ((w.windDir ?? 270) + 180) * Math.PI / 180, sp = 0.0006 + Math.min(20, w.wind ?? 2) * 0.00025;
    this.drift.set(-Math.sin(az) * sp, Math.cos(az) * sp);
  }
  update(dt) {
    if (!this.mesh.visible) return;
    const d = this.drift, U = this.u;
    for (const [o, k] of [[U.offL.value, 1], [U.offM.value, 1.6], [U.offH.value, 0.7]]) { o.addScaledVector(d, dt * k); o.x -= Math.floor(o.x); o.y -= Math.floor(o.y); }   // 그림은 1마다 이어진다
  }
}
