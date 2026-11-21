// 1단계 프로토타입용 "회색 상자" 방. 형태와 배치만 잡는다: 3단계에서 절차적 모델과 재질로 교체.
// 규칙은 room-at-dawn의 part 방식을 따른다: ctx.colliders에 충돌 상자, ctx.interact에 상호작용 대상을 등록.
import * as THREE from 'three/webgpu';
import { vec4 } from 'three/tsl';
import { ROOM, WINDOW, FIREPLACE as FP, CHAIRS, RUG, LAMP } from './layout.js';

const mat = (color, rough = 0.85, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });

export function buildRoom(ctx) {
  const g = new THREE.Group();
  const M = {
    wood: mat(0x3a2414, 0.7), woodDark: mat(0x24160c, 0.75), floor: mat(0x2b1a0f, 0.55),
    stone: mat(0x6b6259, 0.95), stoneDark: mat(0x3c3632, 0.95), leather: mat(0x3b1f12, 0.5),
    rug: mat(0x5a1f1c, 1.0), cloth: mat(0xb8a078, 1.0), iron: mat(0x15151a, 0.6, { metalness: 0.7 }),
    books: [0x5b2a22, 0x2f3b2a, 0x1f2c44, 0x6a5330, 0x3d2630, 0x49392a].map(c => mat(c, 0.8)),
    shade: mat(0xe8c890, 1.0, { emissive: 0xffb060, emissiveIntensity: 1.6 }), wax: mat(0xe9e0cc, 0.6),
  };
  const box = (w, h, d, x, y, z, m, { collide = false, cast = true, name } = {}) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z); mesh.castShadow = cast; mesh.receiveShadow = true; if (name) mesh.name = name;
    g.add(mesh);
    if (collide) ctx.colliders.push({ min: [x - w / 2, y - h / 2, z - d / 2], max: [x + w / 2, y + h / 2, z + d / 2] });
    return mesh;
  };
  const { W, D, H } = ROOM;

  // ---- 바닥, 천장, 벽
  box(W, 0.1, D, W / 2, -0.05, D / 2, M.floor, { cast: false });
  box(W, 0.1, D, W / 2, H + 0.05, D / 2, M.woodDark, { cast: false });
  box(0.1, H, D, -0.05, H / 2, D / 2, M.wood);                                   // 왼쪽 벽
  box(0.1, H, D, W + 0.05, H / 2, D / 2, M.wood);                                // 오른쪽 벽
  box(W, H, 0.1, W / 2, H / 2, D + 0.05, M.wood);                                // 뒷벽
  // 창문 벽: 창 구멍을 뺀 네 조각
  const wn = WINDOW;
  box(wn.x0, H, 0.1, wn.x0 / 2, H / 2, -0.05, M.wood);
  box(W - wn.x1, H, 0.1, (W + wn.x1) / 2, H / 2, -0.05, M.wood);
  box(wn.x1 - wn.x0, wn.y0, 0.1, (wn.x0 + wn.x1) / 2, wn.y0 / 2, -0.05, M.wood);
  box(wn.x1 - wn.x0, H - wn.y1, 0.1, (wn.x0 + wn.x1) / 2, (H + wn.y1) / 2, -0.05, M.wood);
  // 창틀 격자와 창턱
  const ww = wn.x1 - wn.x0, wh = wn.y1 - wn.y0;
  for (let i = 0; i <= wn.cols; i++) box(i % wn.cols === 0 ? 0.07 : 0.03, wh, 0.06, wn.x0 + ww * i / wn.cols, (wn.y0 + wn.y1) / 2, -0.04, M.woodDark);
  for (let j = 0; j <= wn.rows; j++) box(ww, j % 2 === 0 ? 0.07 : 0.03, 0.06, (wn.x0 + wn.x1) / 2, wn.y0 + wh * j / wn.rows, -0.04, M.woodDark);
  box(ww + 0.2, 0.05, wn.sill, (wn.x0 + wn.x1) / 2, wn.y0 - 0.025, wn.sill / 2 - 0.02, M.woodDark);
  // 창밖 (임시): 밤하늘 색의 발광 판. 4단계에서 하늘·숲으로 교체.
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(30, 16), new THREE.MeshBasicMaterial({ color: 0x0b1626 }));
  sky.position.set(W / 2, 3, -8); sky.name = 'skyPlaceholder'; g.add(sky);
  ctx.sky = sky;

  // ---- 벽난로 (굴뚝 벽, 화로대, 선반). 화구 입구는 뚫어 두고 "구멍" 재질로 덮는다.
  const fx = (FP.faceX + W) / 2, oz0 = FP.zc - FP.openW / 2, oz1 = FP.zc + FP.openW / 2, oyTop = FP.hearthH + FP.openH;
  box(FP.depth, H, oz0 - FP.z0, fx, H / 2, (FP.z0 + oz0) / 2, M.stone, { collide: true });
  box(FP.depth, H, FP.z1 - oz1, fx, H / 2, (oz1 + FP.z1) / 2, M.stone, { collide: true });
  box(FP.depth, H - oyTop, FP.openW, fx, (H + oyTop) / 2, FP.zc, M.stone);
  box(FP.depth + FP.hearthOut, FP.hearthH, FP.z1 - FP.z0 + 0.3, W - (FP.depth + FP.hearthOut) / 2, FP.hearthH / 2, FP.zc, M.stoneDark, { collide: true });
  box(0.28, 0.09, FP.z1 - FP.z0 + 0.2, FP.faceX - 0.1, FP.mantelY, FP.zc, M.woodDark);
  ctx.colliders.push({ min: [FP.faceX, 0, oz0], max: [W, H, oz1] });               // 화구 안으로 못 들어가게
  // 화구 "구멍": 색과 알파를 0으로 써서, 아래에 깔린 불 캔버스가 비쳐 보이게 한다 (깊이는 정상적으로 쓴다).
  const holeMat = new THREE.MeshBasicNodeMaterial({ transparent: true, blending: THREE.NoBlending });
  holeMat.outputNode = vec4(0, 0, 0, 0);
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(FP.openW, FP.openH), holeMat);
  hole.position.set(FP.faceX + 0.002, FP.hearthH + FP.openH / 2, FP.zc); hole.rotation.y = -Math.PI / 2; hole.name = 'fireHole';
  g.add(hole); ctx.fireHole = hole;
  // 불이 꺼진 상태·대체용: 구멍 뒤의 어두운 화구 상자 (불 캔버스가 없을 때만 보인다)
  const fb = new THREE.Group(); fb.name = 'fireboxFallback'; fb.visible = false;
  const fbm = mat(0x1a1210, 1);
  const fbBox = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), fbm); m.position.set(x, y, z); fb.add(m); };
  fbBox(0.02, FP.openH, FP.openW, W - 0.02, FP.hearthH + FP.openH / 2, FP.zc);
  fbBox(FP.depth, FP.openH, 0.02, fx, FP.hearthH + FP.openH / 2, oz0 + 0.01);
  fbBox(FP.depth, FP.openH, 0.02, fx, FP.hearthH + FP.openH / 2, oz1 - 0.01);
  for (let i = 0; i < 3; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.55, 10), mat(0x1c120c, 1, { emissive: 0xff5a14, emissiveIntensity: 0.25 }));
    log.rotation.x = Math.PI / 2; log.position.set(FP.fire.x + (i - 1) * 0.1, FP.hearthH + (i === 1 ? 0.2 : 0.1), FP.zc); fb.add(log);
  }
  g.add(fb); ctx.fireboxFallback = fb;
  // 장작 더미와 부지깽이 자리
  box(0.4, 0.45, 0.5, FP.faceX - 0.25, FP.hearthH + 0.225, FP.z1 - 0.1, M.wood, { name: 'woodpile' });
  ctx.interact.push({ id: 'woodpile', label: '장작 넣기', pos: [FP.faceX - 0.25, FP.hearthH + 0.3, FP.z1 - 0.1], radius: 0.4 });
  box(0.05, 0.75, 0.2, FP.faceX - 0.08, FP.hearthH + 0.375, FP.z0 + 0.25, M.iron, { name: 'pokerSet' });
  ctx.interact.push({ id: 'poker', label: '불 뒤적이기', pos: [FP.faceX - 0.08, FP.hearthH + 0.5, FP.z0 + 0.25], radius: 0.3 });

  // ---- 책장: 왼쪽 벽 전체 + 창문 벽 왼쪽
  const shelf = (x, z, w, d, alongZ) => {
    const len = alongZ ? d : w;
    box(w, 2.6, d, x, 1.3, z, M.woodDark, { collide: true });
    for (let s = 0; s < 7; s++) {
      const y = 0.18 + s * 0.35;
      let u = -len / 2 + 0.06, k = s * 13;
      while (u < len / 2 - 0.08) {
        const t = 0.025 + ((k * 7919) % 17) / 17 * 0.035, h = 0.2 + ((k * 104729) % 13) / 13 * 0.1; k++;
        const m = M.books[k % M.books.length];
        if (alongZ) box(0.03, h, t, x + w / 2 + 0.005, y + h / 2, z + u + t / 2, m, { cast: false });
        else box(t, h, 0.03, x + u + t / 2, y + h / 2, z + d / 2 + 0.005, m, { cast: false });
        u += t + 0.003;
      }
    }
  };
  shelf(0.16, D / 2, 0.32, D - 0.1, true);
  shelf(0.32 + (1.7 - 0.32) / 2, 0.16, 1.7 - 0.32, 0.32, false);
  ctx.interact.push({ id: 'shelf', label: '책장 (5단계에서 서재가 됩니다)', pos: [0.4, 1.3, D / 2], radius: 1.2 });

  // ---- 러그
  box(RUG.w, 0.012, RUG.d, RUG.x, 0.006, RUG.z, M.rug, { cast: false });

  // ---- 의자 2개 (좌판, 등받이, 팔걸이)
  for (const c of CHAIRS) {
    const ch = new THREE.Group(); ch.position.set(c.pos[0], 0, c.pos[1]); ch.rotation.y = c.yaw; ch.name = 'chair-' + c.id;
    const part = (w, h, d, x, y, z, m = M.leather) => { const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); p.position.set(x, y, z); p.castShadow = p.receiveShadow = true; ch.add(p); };
    part(0.62, 0.22, 0.62, 0, 0.33, 0);            // 좌판
    part(0.78, 0.75, 0.16, 0, 0.72, 0.36);         // 등받이 (의자는 -Z를 본다)
    part(0.14, 0.32, 0.66, -0.38, 0.5, 0.02);      // 팔걸이
    part(0.14, 0.32, 0.66, 0.38, 0.5, 0.02);
    part(0.4, 0.3, 0.12, 0, 0.6, 0.24, M.cloth);   // 쿠션
    g.add(ch);
    ctx.colliders.push({ min: [c.pos[0] - 0.45, 0, c.pos[1] - 0.45], max: [c.pos[0] + 0.45, 1.1, c.pos[1] + 0.45] });
    ctx.interact.push({ id: 'chair:' + c.id, label: '앉기', pos: [c.pos[0], 0.55, c.pos[1]], radius: 0.6, chair: c });
  }

  // ---- 플로어 스탠드
  box(0.04, LAMP.h, 0.04, LAMP.x, LAMP.h / 2, LAMP.z, M.iron);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.22, 0.3, 20, 1, true), M.shade);
  shade.material.side = THREE.DoubleSide; shade.position.set(LAMP.x, LAMP.h + 0.1, LAMP.z); g.add(shade);
  ctx.colliders.push({ min: [LAMP.x - 0.15, 0, LAMP.z - 0.15], max: [LAMP.x + 0.15, 1.8, LAMP.z + 0.15] });
  ctx.interact.push({ id: 'lamp', label: '스탠드 켜기/끄기', pos: [LAMP.x, LAMP.h, LAMP.z], radius: 0.35 });
  ctx.lampShade = shade;

  // ---- 촛불 (선반 위, 창턱 위)
  for (const [x, y, z] of [[FP.faceX - 0.1, FP.mantelY + 0.045, FP.z0 + 0.35], [2.95, wn.y0, 0.12]]) box(0.05, 0.14, 0.05, x, y + 0.07, z, M.wax, { cast: false });

  // 장작 바구니, 책 받침
  box(0.4, 0.4, 0.4, 1.75, 0.2, 1.65, M.wood, { collide: true });
  box(0.5, 0.6, 0.35, 3.9, 0.3, 0.3, M.iron, { collide: true });
  return g;
}
