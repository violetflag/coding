// 서재 방: 구조(바닥·벽·천장 들보·창), 돌 벽난로, 책장, 가구와 소품.
// 규칙은 room-at-dawn의 part 방식을 따른다: ctx.colliders에 충돌 상자, ctx.interact에 상호작용 대상을 등록.
import * as THREE from 'three/webgpu';
import { vec4 } from 'three/tsl';
import { ROOM, WINDOW, FIREPLACE as FP, CHAIRS, RUG, LAMP, SHELF, TABLE } from './layout.js';
import { makeMaterials, boxUV, rng } from './textures.js';
import * as F from './furniture.js';

export const BOOK_COLORS = [0x5b2a22, 0x2f3b2a, 0x1f2c44, 0x6a5330, 0x3d2630, 0x49392a, 0x7a3b1e, 0x243a3a, 0x58481f, 0x30263c, 0x6b6250, 0x3a1818];

export function buildRoom(ctx) {
  const g = new THREE.Group();
  const M = (ctx.materials = makeMaterials());
  // vgrain: 옆면의 나뭇결을 세로로 (기둥·옆판)
  const box = (w, h, d, x, y, z, m, { collide = false, cast = true, name, vgrain = false } = {}) => {
    const geo = boxUV(new THREE.BoxGeometry(w, h, d), w, h, d);
    if (vgrain) { const uv = geo.attributes.uv; for (const f of [0, 1, 4, 5]) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getY(i), uv.getX(i)); } }
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z); mesh.castShadow = cast; mesh.receiveShadow = true; if (name) mesh.name = name;
    g.add(mesh);
    if (collide) ctx.colliders.push({ min: [x - w / 2, y - h / 2, z - d / 2], max: [x + w / 2, y + h / 2, z + d / 2] });
    return mesh;
  };
  const put = (obj, x, y, z, yaw = 0) => { obj.position.set(x, y, z); obj.rotation.y = yaw; g.add(obj); return obj; };
  const { W, D, H } = ROOM;

  // ---- 바닥, 천장, 벽
  box(W, 0.1, D, W / 2, -0.05, D / 2, M.floor, { cast: false });
  box(W + 0.6, 0.1, D + 0.6, W / 2, H + 0.05, D / 2, M.ceiling);
  for (const x of [1.15, 2.55, 3.95]) box(0.16, 0.17, D, x, H - 0.085, D / 2, M.woodDark);     // 천장 들보
  box(W, 0.14, 0.16, W / 2, H - 0.07, D - 0.08, M.woodDark); box(W, 0.14, 0.16, W / 2, H - 0.07, 0.08, M.woodDark);
  box(0.1, H, D, -0.05, H / 2, D / 2, M.wall);                                   // 왼쪽 벽
  box(0.1, H, D, W + 0.05, H / 2, D / 2, M.wall);                                // 오른쪽 벽
  box(W, H, 0.1, W / 2, H / 2, D + 0.05, M.wall);                                // 뒷벽
  // 창문 벽: 창 구멍을 뺀 네 조각 (바깥으로 두께 0.3)
  const wn = WINDOW, T = ROOM.wall;
  box(wn.x0, H, T, wn.x0 / 2, H / 2, -T / 2, M.wall);
  box(W - wn.x1, H, T, (W + wn.x1) / 2, H / 2, -T / 2, M.wall);
  box(wn.x1 - wn.x0, wn.y0, T, (wn.x0 + wn.x1) / 2, wn.y0 / 2, -T / 2, M.wall);
  box(wn.x1 - wn.x0, H - wn.y1, T, (wn.x0 + wn.x1) / 2, (H + wn.y1) / 2, -T / 2, M.wall);
  for (const [bx, bz, bw, bd] of [[W / 2, D - 0.012, W, 0.024], [0.012, D / 2, 0.024, D], [W - 0.012, D / 2, 0.024, D]]) box(bw, 0.11, bd, bx, 0.055, bz, M.woodDark, { cast: false }); // 걸레받이
  // 창틀, 창살, 유리, 창턱
  const ww = wn.x1 - wn.x0, wh = wn.y1 - wn.y0, wx = (wn.x0 + wn.x1) / 2, wy = (wn.y0 + wn.y1) / 2, gz = -0.12;
  box(0.08, wh + 0.16, 0.14, wn.x0 - 0.04, wy, -0.06, M.woodDark, { vgrain: true }); box(0.08, wh + 0.16, 0.14, wn.x1 + 0.04, wy, -0.06, M.woodDark, { vgrain: true });
  box(ww + 0.16, 0.08, 0.14, wx, wn.y1 + 0.04, -0.06, M.woodDark); box(ww + 0.16, 0.06, 0.14, wx, wn.y0 - 0.03, -0.06, M.woodDark);
  for (let i = 1; i < wn.cols; i++) box(i === wn.cols / 2 ? 0.05 : 0.025, wh, 0.04, wn.x0 + ww * i / wn.cols, wy, gz, M.woodDark, { vgrain: true });
  for (let j = 1; j < wn.rows; j++) box(ww, j === wn.rows / 2 ? 0.05 : 0.025, 0.04, wx, wn.y0 + wh * j / wn.rows, gz, M.woodDark);
  box(ww + 0.3, 0.045, wn.sill + 0.12, wx, wn.y0 - 0.0225, wn.sill / 2 - 0.06, M.wood);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), new THREE.MeshStandardMaterial({ color: 0x9fb4c8, transparent: true, opacity: 0.07, roughness: 0.05, metalness: 0, depthWrite: false }));
  glass.position.set(wx, wy, gz - 0.005); glass.rotation.y = Math.PI; g.add(glass); ctx.glass = glass;
  // 커튼과 봉
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, ww + 0.9, 8), M.brass); rod.rotation.z = Math.PI / 2; rod.position.set(wx, wn.y1 + 0.17, 0.06); g.add(rod);
  for (const s of [-1, 1]) { const c = F.curtain(M, 0.42, wh + 0.42); c.position.set(wx + s * (ww / 2 + 0.2), wy - 0.06, 0.06); g.add(c); }

  // ---- 벽난로: 자연석 굴뚝 벽, 화로대, 통나무 선반. 화구 입구는 뚫어 두고 "구멍" 재질로 덮는다.
  const fx = (FP.faceX + W) / 2, oz0 = FP.zc - FP.openW / 2, oz1 = FP.zc + FP.openW / 2, oyTop = FP.hearthH + FP.openH;
  box(FP.depth, H, oz0 - FP.z0, fx, H / 2, (FP.z0 + oz0) / 2, M.stone, { collide: true });
  box(FP.depth, H, FP.z1 - oz1, fx, H / 2, (oz1 + FP.z1) / 2, M.stone, { collide: true });
  box(FP.depth, H - oyTop, FP.openW, fx, (H + oyTop) / 2, FP.zc, M.stone);
  box(0.06, 0.13, FP.openW + 0.24, FP.faceX - 0.03, oyTop + 0.065, FP.zc, M.hearth);                 // 화구 위 상인방 돌
  box(FP.depth + FP.hearthOut, FP.hearthH, FP.z1 - FP.z0 + 0.3, W - (FP.depth + FP.hearthOut) / 2, FP.hearthH / 2, FP.zc, M.hearth, { collide: true });
  box(0.3, 0.1, FP.z1 - FP.z0 + 0.24, FP.faceX - 0.11, FP.mantelY, FP.zc, M.wood);                    // 선반(통나무 판)
  for (const z of [FP.z0 + 0.15, FP.z1 - 0.15]) box(0.2, 0.2, 0.12, FP.faceX - 0.08, FP.mantelY - 0.14, z, M.woodDark); // 선반 받침
  ctx.colliders.push({ min: [FP.faceX, 0, oz0], max: [W, H, oz1] });               // 화구 안으로 못 들어가게
  // 화구 "구멍": 색과 알파를 0으로 써서, 아래에 깔린 불 캔버스가 비쳐 보이게 한다 (깊이는 정상적으로 쓴다).
  const holeMat = new THREE.MeshBasicNodeMaterial({ transparent: true, blending: THREE.NoBlending });
  holeMat.outputNode = vec4(0, 0, 0, 0);
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(FP.openW, FP.openH), holeMat);
  hole.position.set(FP.faceX + 0.002, FP.hearthH + FP.openH / 2, FP.zc); hole.rotation.y = -Math.PI / 2; hole.name = 'fireHole';
  g.add(hole); ctx.fireHole = hole;
  // 불이 꺼진 상태·대체용: 구멍 뒤의 어두운 화구 상자 (불 캔버스가 없을 때만 보인다)
  const fb = new THREE.Group(); fb.name = 'fireboxFallback'; fb.visible = false;
  const fbm = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 1 });
  const fbBox = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), fbm); m.position.set(x, y, z); fb.add(m); };
  fbBox(0.02, FP.openH, FP.openW, W - 0.02, FP.hearthH + FP.openH / 2, FP.zc);
  fbBox(FP.depth, FP.openH, 0.02, fx, FP.hearthH + FP.openH / 2, oz0 + 0.01);
  fbBox(FP.depth, FP.openH, 0.02, fx, FP.hearthH + FP.openH / 2, oz1 - 0.01);
  const emberMat = new THREE.MeshStandardMaterial({ color: 0x1c120c, roughness: 1, emissive: 0xff5a14, emissiveIntensity: 0.25 });
  for (let i = 0; i < 3; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.55, 10), emberMat);
    log.rotation.x = Math.PI / 2; log.position.set(FP.fire.x + (i - 1) * 0.1, FP.hearthH + (i === 1 ? 0.2 : 0.1), FP.zc); fb.add(log);
  }
  g.add(fb); ctx.fireboxFallback = fb; ctx.emberMat = emberMat;
  // 장작 더미, 부지깽이, 주전자 (화로대 위)
  put(F.logStack(M), FP.faceX - 0.27, FP.hearthH, FP.z1 - 0.08);
  ctx.interact.push({ id: 'woodpile', label: '장작 넣기', pos: [FP.faceX - 0.27, FP.hearthH + 0.3, FP.z1 - 0.08], radius: 0.4 });
  put(F.fireTools(M), FP.faceX - 0.14, FP.hearthH, FP.z0 + 0.2);
  ctx.interact.push({ id: 'poker', label: '불 뒤적이기', pos: [FP.faceX - 0.14, FP.hearthH + 0.5, FP.z0 + 0.2], radius: 0.3 });
  const kettle = put(F.kettle(M), FP.faceX - 0.3, FP.hearthH, oz0 - 0.02, 2.3); ctx.kettle = kettle;
  ctx.interact.push({ id: 'kettle', label: '주전자', pos: [kettle.position.x, FP.hearthH + 0.12, kettle.position.z], radius: 0.22 });
  // 선반 위: 시계, 촛불, 책, 그림
  const mt = FP.mantelY + 0.05;
  const clock = put(F.mantelClock(M), FP.faceX - 0.12, mt, FP.zc, -Math.PI / 2); ctx.clock = clock;
  put(F.bookStack(BOOK_COLORS, 3, 4), FP.faceX - 0.12, mt, FP.z1 - 0.35, 0.3);
  const pic = put(F.painting(M, 0.95, 0.6), FP.faceX - 0.012, 2.08, FP.zc, -Math.PI / 2);
  ctx.candles = [];
  const addCandle = (x, y, z, name, opts) => { const c = put(F.candle(M, opts), x, y, z); c.name = name; ctx.candles.push(c); ctx.interact.push({ id: 'candle:' + (ctx.candles.length - 1), label: '촛불', pos: [x, y + 0.12, z], radius: 0.16, candle: c }); return c; };
  addCandle(FP.faceX - 0.12, mt, FP.z0 + 0.4, '선반 촛불');

  // ---- 책장: 왼쪽 벽 전체 + 창문 벽 왼쪽. 틀(옆판·선반판·칸막이)을 짜고 책은 인스턴스로 꽂는다.
  const books = [];
  const r = rng(2024);
  const SH = SHELF;
  // along: 'z' = x가 깊이 방향(왼쪽 벽), 'x' = z가 깊이 방향(창문 벽). a0…a1 = 길이 범위, back = 벽 쪽 좌표
  const shelf = (along, a0, a1, bays, reserved) => {
    const len = a1 - a0, mid = (a0 + a1) / 2, dep = SH.depth, dc = dep / 2;
    const P = (a, y, dd, w, h, d, m, o) => (along === 'z' ? box(d, h, w, dd, y, a, m, o) : box(w, h, d, a, y, dd, m, o));
    P(mid, SH.top / 2, 0.012, len, SH.top, 0.024, M.woodDark, { cast: false });                              // 뒤판
    P(mid, SH.top + 0.03, dc + 0.01, len + 0.06, 0.06, dep + 0.04, M.woodDark);                               // 윗몰딩
    P(mid, 0.05, dc, len, 0.1, dep, M.woodDark);                                                             // 받침
    for (let b = 0; b <= bays; b++) P(a0 + len * b / bays, SH.top / 2, dc, 0.035, SH.top, dep, M.woodDark, { vgrain: true });
    for (let s = 1; s < SH.rows; s++) P(mid, SH.y0 + s * SH.pitch - 0.012, dc, len, 0.024, dep - 0.01, M.wood);
    for (let s = 0; s < SH.rows; s++) for (let b = 0; b < bays; b++) {
      if (reserved && reserved.row === s && reserved.bay === b) continue;
      const y = SH.y0 + s * SH.pitch, u1 = a0 + len * (b + 1) / bays - 0.025;
      let u = a0 + len * b / bays + 0.025;
      while (u < u1 - 0.02) {
        const k = r();
        if (k < 0.07) { u += 0.05 + r() * 0.12; continue; }                                                    // 빈 틈
        const t = 0.02 + r() * 0.035, h = Math.min(SH.pitch - 0.05, 0.19 + r() * 0.1), d = 0.13 + r() * 0.06;
        if (u + t > u1) break;
        const lean = k > 0.95 ? (r() - 0.5) * 0.3 : 0;
        books.push({ along, a: u + t / 2, y: y + h / 2, dd: dep - 0.02 - d / 2 - r() * 0.02, t, h, d, lean, color: BOOK_COLORS[Math.floor(r() * BOOK_COLORS.length)], tone: 0.7 + r() * 0.6 });
        u += t + 0.002 + Math.abs(lean) * 0.06;
      }
    }
  };
  shelf('z', 0.03, D - 0.03, 4, SH.library);
  shelf('x', SH.depth, 1.7, 1, null);
  ctx.colliders.push({ min: [0, 0, 0], max: [SH.depth, SH.top, D] }, { min: [0, 0, 0], max: [1.72, SH.top, SH.depth] });
  // 책등 무늬(금박 띠)가 들어간 책 인스턴스
  const bandCv = document.createElement('canvas'); bandCv.width = 8; bandCv.height = 128; const bc = bandCv.getContext('2d');
  bc.fillStyle = '#fff'; bc.fillRect(0, 0, 8, 128); bc.fillStyle = '#e0b860'; for (const y of [14, 20, 96, 104]) bc.fillRect(0, y, 8, 3); bc.fillStyle = '#d9c9a0'; bc.fillRect(0, 34, 8, 22);
  const bandTex = new THREE.CanvasTexture(bandCv); bandTex.colorSpace = THREE.SRGBColorSpace;
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: bandTex, roughness: 0.72 }), books.length);
  inst.material.userData.bookCover = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
  books.forEach((b, i) => {
    const z = b.along === 'z';
    e.set(z ? b.lean : 0, 0, z ? 0 : b.lean); q.setFromEuler(e);
    m4.compose(new THREE.Vector3(z ? b.dd : b.a, b.y, z ? b.a : b.dd), q, new THREE.Vector3(z ? b.d : b.t, b.h, z ? b.t : b.d));
    inst.setMatrixAt(i, m4); inst.setColorAt(i, col.setHex(b.color).multiplyScalar(b.tone));
  });
  inst.castShadow = false; inst.receiveShadow = true; g.add(inst);
  // 내 서재 칸 (7단계에서 불러온 책의 책등이 꽂힌다)
  const lib = SH.library, bayLen = (D - 0.06) / 4;
  ctx.libraryShelf = { x: SH.depth - 0.02, y: SH.y0 + lib.row * SH.pitch, z0: 0.03 + bayLen * lib.bay + 0.03, z1: 0.03 + bayLen * (lib.bay + 1) - 0.03, height: SH.pitch - 0.05 };
  ctx.interact.push({ id: 'shelf', label: '내 서재', pos: [SH.depth, ctx.libraryShelf.y + 0.15, (ctx.libraryShelf.z0 + ctx.libraryShelf.z1) / 2], radius: 0.55 });

  // ---- 러그
  const rugMesh = new THREE.Mesh(new THREE.BoxGeometry(RUG.w, 0.012, RUG.d), M.rug); rugMesh.position.set(RUG.x, 0.006, RUG.z); rugMesh.receiveShadow = true; g.add(rugMesh);

  // ---- 의자 2개
  for (const c of CHAIRS) {
    const ch = F.armchair(M, c.id === 'wing' ? { wing: true, leather: M.leatherGreen } : { pillow: M.cloth });
    put(ch, c.pos[0], 0, c.pos[1], c.yaw); ch.name = 'chair-' + c.id;
    ctx.colliders.push({ min: [c.pos[0] - 0.45, 0, c.pos[1] - 0.45], max: [c.pos[0] + 0.45, 1.1, c.pos[1] + 0.45] });
    ctx.interact.push({ id: 'chair:' + c.id, label: '앉기', pos: [c.pos[0], 0.55, c.pos[1]], radius: 0.6, chair: c });
  }
  // 읽기 의자 옆 탁자: 머그잔, 촛불, 책
  const tb = put(F.sideTable(M), TABLE.x, 0, TABLE.z), top = tb.userData.top;
  ctx.colliders.push({ min: [TABLE.x - 0.24, 0, TABLE.z - 0.24], max: [TABLE.x + 0.24, 0.7, TABLE.z + 0.24] });
  const mug = put(F.mug(M), TABLE.x - 0.09, top, TABLE.z - 0.07, 0.8); ctx.mug = mug;
  ctx.interact.push({ id: 'mug', label: '차', pos: [mug.position.x, top + 0.06, mug.position.z], radius: 0.14 });
  addCandle(TABLE.x + 0.1, top, TABLE.z + 0.08, '탁자 촛불');
  put(F.bookStack(BOOK_COLORS, 2, 9), TABLE.x - 0.02, top, TABLE.z + 0.12, 1.1);
  addCandle(wn.x0 + 0.22, wn.y0, 0.08, '창가 촛불', { h: 0.14 });

  // ---- 플로어 스탠드
  const lamp = put(F.floorLamp(M, LAMP.h), LAMP.x, 0, LAMP.z); ctx.lamp = lamp; ctx.lampShade = lamp.userData.shade;
  ctx.colliders.push({ min: [LAMP.x - 0.15, 0, LAMP.z - 0.15], max: [LAMP.x + 0.15, 1.8, LAMP.z + 0.15] });
  ctx.interact.push({ id: 'lamp', label: '스탠드 켜기/끄기', pos: [LAMP.x, LAMP.h, LAMP.z], radius: 0.35 });

  // 담요 바구니 (창가 오른쪽)
  put(F.basket(M), 3.95, 0, 0.42, 0.5);
  ctx.colliders.push({ min: [3.7, 0, 0.17], max: [4.2, 0.5, 0.67] });
  // 윙체어 팔걸이에 걸친 담요
  return g;
}
