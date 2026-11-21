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
  // 창 아래 징두리 판벽 (어두운 나무 판과 윗몰딩)
  { const x0 = 1.97, x1 = W - 0.02, wy0 = 0.11, wy1 = wn.y0 - 0.06, n = Math.round((x1 - x0) / 0.42);
    box(x1 - x0, wy1 - wy0, 0.02, (x0 + x1) / 2, (wy0 + wy1) / 2, 0.01, M.woodDark, { cast: false });
    for (let i = 0; i <= n; i++) box(0.05, wy1 - wy0, 0.016, x0 + ((x1 - x0) * i) / n, (wy0 + wy1) / 2, 0.028, M.wood, { cast: false, vgrain: true });
    box(x1 - x0, 0.05, 0.05, (x0 + x1) / 2, wy1 + 0.025, 0.025, M.wood, { cast: false }); }

  // ---- 벽난로: 자연석 굴뚝 벽, 화로대, 통나무 선반. 화구 입구는 뚫어 두고 "구멍" 재질로 덮는다.
  const fx = (FP.faceX + W) / 2, oz0 = FP.zc - FP.openW / 2, oz1 = FP.zc + FP.openW / 2, oyTop = FP.hearthH + FP.openH;
  box(FP.depth, H, oz0 - FP.z0, fx, H / 2, (FP.z0 + oz0) / 2, M.stone, { collide: true });
  box(FP.depth, H, FP.z1 - oz1, fx, H / 2, (oz1 + FP.z1) / 2, M.stone, { collide: true });
  box(FP.depth, H - oyTop, FP.openW, fx, (H + oyTop) / 2, FP.zc, M.stone);
  box(0.06, 0.13, FP.openW + 0.24, FP.faceX - 0.03, oyTop + 0.065, FP.zc, M.hearth);                 // 화구 위 상인방 돌
  // 화구 테두리: 양옆 설주와 아래 낮은 턱 (안쪽 벽돌과 바깥 화강암 사이를 판석으로 두른다)
  for (const z of [oz0 - 0.06, oz1 + 0.06]) box(0.06, FP.openH, 0.12, FP.faceX - 0.03, FP.hearthH + FP.openH / 2, z, M.hearth, { vgrain: true });
  box(0.11, 0.045, FP.openW + 0.24, FP.faceX - 0.055, FP.hearthH + 0.0225, FP.zc, M.hearth);
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
  ctx.woodPile = put(F.logStack(M), FP.faceX - 0.27, FP.hearthH, FP.z1 - 0.08);
  ctx.interact.push({ id: 'woodpile', label: '장작 넣기', pos: [FP.faceX - 0.27, FP.hearthH + 0.3, FP.z1 - 0.08], radius: 0.4 });
  put(F.fireTools(M), FP.faceX - 0.14, FP.hearthH, FP.z0 + 0.2);
  ctx.interact.push({ id: 'poker', label: '불 뒤적이기', pos: [FP.faceX - 0.14, FP.hearthH + 0.5, FP.z0 + 0.2], radius: 0.3 });
  const kettle = put(F.kettle(M), FP.faceX - 0.3, FP.hearthH, oz0 - 0.02, 2.3); ctx.kettle = kettle;
  ctx.interact.push({ id: 'kettle', label: '주전자', pos: [kettle.position.x, FP.hearthH + 0.12, kettle.position.z], radius: 0.22 });
  // 선반 위: 시계, 촛불, 책, 그림
  const mt = FP.mantelY + 0.05;
  const clock = put(F.mantelClock(M), FP.faceX - 0.12, mt, FP.zc + 0.12, -Math.PI / 2); ctx.clock = clock;
  // 액자 3개: 큰 풍경화 하나는 벽에, 작은 둘은 선반에 기대어. 모두 내 이미지를 넣을 수 있다
  ctx.frames = [];
  const addFrame = (w, h, x, y, z, lean, seed) => { const p = put(F.painting(M, w, h, { seed, f: w > 0.5 ? 0.05 : 0.028, frame: w > 0.5 ? M.brass : M.woodDark }), x, y, z, -Math.PI / 2); p.rotation.order = 'YXZ'; p.rotation.x = -lean; const i = ctx.frames.push(p) - 1; ctx.interact.push({ id: 'frame:' + i, label: '액자에 내 그림 넣기', pos: [x - 0.03, y, z], radius: Math.max(0.16, h * 0.5), frame: i }); return p; };
  addFrame(0.9, 0.58, FP.faceX - 0.014, 2.02, FP.zc - 0.1, 0, 77);
  addFrame(0.3, 0.38, FP.faceX - 0.075, mt + 0.218, FP.z1 - 0.72, 0.13, 78);
  addFrame(0.2, 0.15, FP.faceX - 0.1, mt + 0.1, FP.z1 - 0.3, 0.16, 79);
  ctx.candles = [];
  const addCandle = (x, y, z, name, opts) => { const c = put(F.candle(M, opts), x, y, z); c.name = name; ctx.candles.push(c); ctx.interact.push({ id: 'candle:' + (ctx.candles.length - 1), label: '촛불', pos: [x, y + 0.12, z], radius: 0.16, candle: c }); return c; };
  // 선반 왼쪽 끝의 황동 촛대 둘
  for (const [dz, hh] of [[0.22, 0.24], [0.42, 0.15]]) { const cs = put(F.candlestick(M, hh), FP.faceX - 0.13, mt, FP.z0 + dz); addCandle(FP.faceX - 0.13, mt + cs.userData.top - 0.02, FP.z0 + dz, '선반 촛불', { h: 0.13, r: 0.011, bare: true }); }

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
        books.push({ along, a: u + t / 2, y: y + h / 2, dd: dep - 0.02 - d / 2 - r() * 0.02, t, h, d, lean, color: BOOK_COLORS[Math.floor(r() * BOOK_COLORS.length)], tone: 0.5 + r() * 0.5 });
        u += t + 0.002 + Math.abs(lean) * 0.06;
      }
    }
  };
  shelf('z', 0.03, D - 0.03, 4, SH.library);
  shelf('x', SH.depth, 1.93, 1, null);
  ctx.colliders.push({ min: [0, 0, 0], max: [SH.depth, SH.top, D] }, { min: [0, 0, 0], max: [1.95, SH.top, SH.depth] });
  // 책등 무늬(금박 띠)가 들어간 책 인스턴스
  const bandCv = document.createElement('canvas'); bandCv.width = 64; bandCv.height = 512; const bc = bandCv.getContext('2d');
  { // 책등: 천 결, 도드라진 띠(밴드), 금박 줄, 제목 딱지와 닳은 가장자리. 흰 바탕이라 책마다의 색이 곱해진다.
    const br = (() => { let v = 77; return () => ((v = (v * 16807) % 2147483647) / 2147483647); })();
    const gr = bc.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, '#8a8a8a'); gr.addColorStop(0.18, '#ffffff'); gr.addColorStop(0.82, '#f4f4f4'); gr.addColorStop(1, '#7c7c7c'); bc.fillStyle = gr; bc.fillRect(0, 0, 64, 512);   // 둥근 책등의 음영
    bc.globalAlpha = 0.1; for (let i = 0; i < 2400; i++) { bc.fillStyle = br() > 0.5 ? '#000' : '#fff'; bc.fillRect(br() * 64, br() * 512, 1, 2 + br() * 3); } bc.globalAlpha = 1;
    for (const y of [70, 150, 362, 442]) { bc.fillStyle = 'rgba(0,0,0,.28)'; bc.fillRect(0, y + 7, 64, 3); bc.fillStyle = 'rgba(255,255,255,.2)'; bc.fillRect(0, y - 2, 64, 2); bc.fillStyle = '#c9a24e'; bc.fillRect(0, y, 64, 2); bc.fillRect(0, y + 4, 64, 1); }
    bc.fillStyle = '#d8c69c'; bc.fillRect(5, 176, 54, 92); bc.fillStyle = '#b08c40'; bc.fillRect(5, 176, 54, 2); bc.fillRect(5, 266, 54, 2);
    bc.fillStyle = 'rgba(50,34,20,.75)'; for (let k = 0; k < 6; k++) bc.fillRect(12 + br() * 6, 190 + k * 12, 28 + br() * 14, 4);
    bc.fillStyle = '#c9a24e'; bc.beginPath(); bc.arc(32, 318, 9, 0, 7); bc.fill(); bc.fillStyle = '#fff'; bc.beginPath(); bc.arc(32, 318, 5, 0, 7); bc.fill();
    const eg = bc.createLinearGradient(0, 0, 0, 512); eg.addColorStop(0, 'rgba(0,0,0,.35)'); eg.addColorStop(0.04, 'rgba(0,0,0,0)'); eg.addColorStop(0.96, 'rgba(0,0,0,0)'); eg.addColorStop(1, 'rgba(0,0,0,.4)'); bc.fillStyle = eg; bc.fillRect(0, 0, 64, 512); }
  const bandTex = new THREE.CanvasTexture(bandCv); bandTex.colorSpace = THREE.SRGBColorSpace; bandTex.anisotropy = 8;
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

  // ---- 옮길 수 있는 가구. 각 가구는 충돌 상자와 상호작용 위치를 스스로 다시 맞춘다 (src/scene/arrange.js가 옮긴다).
  ctx.movables = [];
  const wp = new THREE.Vector3();
  const movable = (id, label, obj, r, h, its = [], extra) => {
    const col = { min: [0, 0, 0], max: [0, h, 0] }; ctx.colliders.push(col);
    const m = { id, label, obj, r, h, col, home: { x: obj.position.x, z: obj.position.z, yaw: obj.rotation.y },
      sync() {
        const p = obj.position; col.min[0] = p.x - r; col.min[2] = p.z - r; col.max[0] = p.x + r; col.max[2] = p.z + r; col.max[1] = h; obj.updateMatrixWorld(true);
        for (const [it, src, dy] of its) { (src || obj).getWorldPosition(wp); it.pos[0] = wp.x; it.pos[1] = wp.y + dy; it.pos[2] = wp.z; }
        extra?.(obj);
      } };
    ctx.movables.push(m); m.sync(); return m;
  };
  const inter = (o) => { ctx.interact.push(o); return o; };

  // 가죽 의자 2개 (둘 다 앉을 수 있다)
  for (const c of CHAIRS) {
    const ch = F.armchair(M, c.id === 'wing' ? { wing: true, pillow: M.cloth, throwMat: M.blanket } : {});
    put(ch, c.pos[0], 0, c.pos[1], c.yaw); ch.name = 'chair-' + c.id; c.obj = ch;
    const it = inter({ id: 'chair:' + c.id, label: '앉기', pos: [0, 0, 0], radius: 0.6, chair: c });
    movable('chair:' + c.id, c.label, ch, 0.47, 1.1, [[it, null, 0.55]], (o) => { c.pos[0] = o.position.x; c.pos[1] = o.position.z; c.yaw = o.rotation.y; });
  }
  // 읽기 의자 옆 탁자: 머그잔, 촛불, 책 (탁자와 함께 움직인다)
  const tb = put(F.sideTable(M), TABLE.x, 0, TABLE.z), top = tb.userData.top;
  const mug = F.mug(M); mug.position.set(-0.09, top, -0.07); mug.rotation.y = 0.8; tb.add(mug); ctx.mug = mug;
  const tc = F.candle(M); tc.position.set(0.1, top, 0.08); tc.name = '탁자 촛불'; tb.add(tc); ctx.candles.push(tc);
  const bs = F.bookStack(BOOK_COLORS, 2, 9); bs.position.set(-0.02, top, 0.12); bs.rotation.y = 1.1; tb.add(bs);
  movable('table', '보조 탁자', tb, 0.25, 0.7, [
    [inter({ id: 'mug', label: '차', pos: [0, 0, 0], radius: 0.14 }), mug, 0.06],
    [inter({ id: 'candle:' + (ctx.candles.length - 1), label: '촛불', pos: [0, 0, 0], radius: 0.16, candle: tc }), tc, 0.12],
  ]);
  addCandle(wn.x0 + 0.5, wn.y0, 0.06, '창가 촛불', { h: 0.12, r: 0.03, bare: true });

  // 플로어 스탠드 (불빛은 main이 ctx.lamp 위치를 따라 옮긴다)
  const lamp = put(F.floorLamp(M, LAMP.h), LAMP.x, 0, LAMP.z); ctx.lamp = lamp; ctx.lampShade = lamp.userData.shade;
  movable('lamp', '스탠드', lamp, 0.16, 1.8, [[inter({ id: 'lamp', label: '스탠드 켜기/끄기', pos: [0, 0, 0], radius: 0.35 }), null, LAMP.h]], (o) => ctx.onLampMove?.(o));

  // 고리버들 바구니 (윙체어 옆), 창 아래 철제 장작 선반과 기대 세운 책
  movable('basket', '바구니', put(F.basket(M), 2.0, 0, 1.25, 0.5), 0.24, 0.5);
  ctx.woodRack = put(F.logRack(M), 2.75, 0, 0.3);
  movable('rack', '장작 선반', ctx.woodRack, 0.3, 0.7, [[inter({ id: 'rack', label: '장작 채우기', pos: [0, 0, 0], radius: 0.5 }), null, 0.4]], (o) => { const p = o.position, c = Math.abs(Math.cos(o.rotation.y)), s2 = Math.abs(Math.sin(o.rotation.y)), hx = 0.47 * c + 0.19 * s2, hz = 0.19 * c + 0.47 * s2, m = ctx.movables.find((v) => v.id === 'rack'); if (m) { m.col.min[0] = p.x - hx; m.col.max[0] = p.x + hx; m.col.min[2] = p.z - hz; m.col.max[2] = p.z + hz; } });
  ctx.movables.find((v) => v.id === 'rack').sync();
  { const lb = F.bookStack(BOOK_COLORS, 3, 21); lb.rotation.set(0, 0.2, Math.PI / 2 - 0.22); put(lb, 3.72, 0.1, 0.36, 0.2); lb.rotation.z = Math.PI / 2 - 0.22; }
  return g;
}
