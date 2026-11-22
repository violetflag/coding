// 비와 눈: 입자의 움직임을 모두 GPU에서 계산한다(매 프레임 CPU가 하는 일은 시간과 몇 개의 값뿐).
// 입자는 상자 하나 안을 떨어지며 상자 밖으로 나가면 반대편으로 돌아온다. 방 안에서는 창 앞의 상자, 밖에서는 내 둘레의 상자.
// 집(지붕 처마까지) 안에 든 입자는 그리지 않는다: 비와 눈은 바깥에만 온다.
// 비 = 바람에 기운 가는 줄기, 눈 = 흔들리며 내려오는 부드러운 점. 그리기 호출은 둘을 합쳐 2.
import * as THREE from 'three/webgpu';
import { Fn, attribute, uniform, vec2, vec3, vec4, float, varying, cameraProjectionMatrix, cameraViewMatrix, cameraPosition, time, mod, sin, cos, length, smoothstep, max, dot, exp, select, abs } from 'three/tsl';
import { rng } from './textures.js';

// 상자 안 위치(0..1)와 위상, 네 귀퉁이를 가진 사각형 n개
function particles(n, seed) {
  const r = rng(seed), s = new Float32Array(n * 16), c = new Float32Array(n * 8), idx = new Uint32Array(n * 6), C = [-1, 0, 1, 0, 1, 1, -1, 1];
  for (let i = 0; i < n; i++) { const a = [r(), r(), r(), r()]; for (let k = 0; k < 4; k++) { s.set(a, i * 16 + k * 4); c[i * 8 + k * 2] = C[k * 2]; c[i * 8 + k * 2 + 1] = C[k * 2 + 1]; } idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6); }
  const g = new THREE.BufferGeometry(); g.setAttribute('aSeed', new THREE.BufferAttribute(s, 4)); g.setAttribute('aCorner', new THREE.BufferAttribute(c, 2));
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 12), 3)); g.setIndex(new THREE.BufferAttribute(idx, 1)); g.setDrawRange(0, 0); return g;
}

export class Precip {
  // house: { x0, x1, z0, z1, y1 } 비와 눈이 들어가지 않는 집(처마 포함)
  constructor(parent, house) {
    this.u = {
      center: uniform(new THREE.Vector3()), size: uniform(new THREE.Vector3(22, 9, 16)), wind: uniform(new THREE.Vector3()),
      rainFall: uniform(7), rainCol: uniform(new THREE.Color(0.6, 0.65, 0.7)), rainA: uniform(0.3), snowFall: uniform(1), snowCol: uniform(new THREE.Color(1, 1, 1)), snowA: uniform(0.9), gust: uniform(0),
    };
    const U = this.u, seed = attribute('aSeed', 'vec4'), corner = attribute('aCorner', 'vec2');
    const H = house;
    // 상자 안에서 돌고 도는 위치
    const wrap = (p) => U.center.add(mod(p.sub(U.center), U.size).sub(U.size.mul(0.5)));
    const inHouse = (p) => p.x.greaterThan(H.x0).and(p.x.lessThan(H.x1)).and(p.z.greaterThan(H.z0)).and(p.z.lessThan(H.z1)).and(p.y.lessThan(H.y1));
    const toClip = (v) => cameraProjectionMatrix.mul(vec4(v, 1));
    const fadeD = (p) => { const d = length(p.sub(cameraPosition)); return smoothstep(0.8, 2.6, d).mul(float(1).sub(smoothstep(U.size.x.mul(0.4), U.size.x.mul(0.62), d))); };

    // ---- 비: 떨어지는 방향으로 늘인 줄기. 머리와 꼬리를 보기 좌표로 옮겨 화면을 향한 띠를 만든다.
    {
      const v = vec3(U.wind.x, U.rainFall.negate(), U.wind.z).mul(seed.w.mul(0.25).add(0.88));
      const p = wrap(U.center.sub(U.size.mul(0.5)).add(seed.xyz.mul(U.size)).add(v.mul(time)));
      const hide = select(inHouse(p), float(0), float(1));
      const vA = varying(fadeD(p).mul(hide)), vC = varying(corner.mul(vec2(1, 1)));
      const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
      mat.vertexNode = Fn(() => {
        const h = cameraViewMatrix.mul(vec4(p, 1)).xyz, a = cameraViewMatrix.mul(vec4(v.mul(-0.045), 0)).xyz;   // 머리와 꼬리 방향(보기 좌표)
        const w = max(h.z.negate().mul(0.0022), 0.005);   // 폭: 화면 가로로(줄기는 거의 세로라 충분하다). 멀어도 1픽셀 가까이
        return toClip(h.add(a.mul(corner.y)).add(vec3(corner.x.mul(w), 0, 0)));   // 집 안의 줄기는 투명도(vA)로 숨긴다
      })();
      mat.colorNode = vec3(U.rainCol);
      mat.opacityNode = U.rainA.mul(vA).mul(float(1).sub(abs(vC.x).mul(0.5))).mul(smoothstep(0, 0.25, vC.y)).mul(float(1).sub(smoothstep(0.6, 1, vC.y)));
      this.rainMax = 9000; this.rain = new THREE.Mesh(particles(this.rainMax, 77), mat);
    }
    // ---- 눈: 흔들리며 내려오는 점. 크기는 1.4~3.4cm
    {
      const ph = seed.w.mul(40), t = time;
      const sway = vec3(sin(t.mul(0.9).add(ph)).mul(0.22).add(sin(t.mul(2.1).add(ph.mul(1.7))).mul(0.05)), 0, cos(t.mul(0.7).add(ph.mul(1.3))).mul(0.18));
      const v = vec3(U.wind.x.mul(0.8), U.snowFall.mul(seed.w.mul(0.45).add(0.75)).negate(), U.wind.z.mul(0.8));
      const p = wrap(U.center.sub(U.size.mul(0.5)).add(seed.xyz.mul(U.size)).add(v.mul(t)).add(sway.mul(float(1).add(U.gust))));
      const hide = select(inHouse(p), float(0), float(1));
      const vA = varying(fadeD(p).mul(hide)), vC = varying(corner.mul(vec2(1, 2)).sub(vec2(0, 1)));
      const s = seed.w.mul(0.02).add(0.014).mul(hide);
      const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
      mat.vertexNode = Fn(() => { const c = cameraViewMatrix.mul(vec4(p, 1)).xyz; return toClip(c.add(vec3(corner.x, corner.y.mul(2).sub(1), 0).mul(s))); })();
      mat.colorNode = vec3(U.snowCol);
      mat.opacityNode = U.snowA.mul(vA).mul(exp(dot(vC, vC).mul(-3.2)));
      this.snowMax = 7000; this.snow = new THREE.Mesh(particles(this.snowMax, 91), mat);
    }
    for (const m of [this.rain, this.snow]) { m.frustumCulled = false; m.visible = false; m.renderOrder = 1; parent.add(m); }
  }
  // o: { rain(mm/h), snow(cm/h), wind(m/s), windDir(도, 불어오는 쪽), day(0..1), light(색 밝기) }
  set(o) {
    const U = this.u, rn = Math.max(0, o.rain || 0), sn = Math.max(0, o.snow || 0);
    // 세기 → 보이는 입자 수 (가랑비 1천 줄기, 큰비 9천 줄기 / 약한 눈 1천5백 송이, 거센 눈 7천 송이)
    const nr = rn > 0.02 ? Math.round(Math.min(this.rainMax, 900 + 1500 * Math.sqrt(rn) * (rn > 4 ? 1.2 : 1))) : 0;
    const ns = sn > 0.01 ? Math.round(Math.min(this.snowMax, 1300 + 2600 * Math.sqrt(sn))) : 0;
    this.rain.geometry.setDrawRange(0, nr * 6); this.rain.visible = nr > 0; this.snow.geometry.setDrawRange(0, ns * 6); this.snow.visible = ns > 0;
    const az = ((o.windDir ?? 270) + 180) * Math.PI / 180, w = Math.min(14, o.wind || 0);   // 바람이 불어 가는 쪽(장면: 북 = +Z, 동 = -X)
    U.wind.value.set(-Math.sin(az) * w, 0, Math.cos(az) * w);
    U.rainFall.value = rn < 0.6 ? 4 : 7.5;                                       // 이슬비는 천천히
    U.snowFall.value = sn > 2 ? 1.3 : 0.9; U.gust.value = Math.min(1.5, w / 6);
    U.rainA.value = 0.32 + 0.18 * Math.min(1, rn / 6);
  }
  // 방 안: 창 앞의 상자, 밖: 나를 둘러싼 상자. groundY = 땅 높이
  place(outdoor, cam, wx, groundY) {
    const U = this.u;
    if (outdoor) { U.size.value.set(24, 9, 24); U.center.value.set(cam.x, groundY + 4.5, cam.z); }
    else { U.size.value.set(22, 9, 16); U.center.value.set(wx, groundY + 4.5, -8.6); }
  }
}
