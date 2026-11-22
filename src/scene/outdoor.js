// 집 바깥: 벽난로 오른쪽의 문, 문밖 나무 마루와 돌계단, 집 밑의 돌 기초, 박공지붕과 굴뚝.
// 문을 열면 마루로 나가 집 둘레 마당을 걸을 수 있다. 걷는 곳과 발 높이는 walkable(), groundAt()이 정한다.
import * as THREE from 'three/webgpu';
import { ROOM, FIREPLACE as FP } from './layout.js';
import { boxUV } from './textures.js';

const { W, D, H } = ROOM;
// 문: 오른쪽 벽(x = W)의 z 범위와 높이. 벽난로(z 0.6~2.6, 화로대 끝 2.75)의 오른쪽(방 안에서 벽난로를 볼 때)에 있다.
export const DOOR = { z0: 3.1, z1: 4.0, h: 2.05, open: -1.75 };
const GROUND = -0.45;
// 집의 바깥 둘레(벽 두께 포함)와 기초가 벽 밖으로 나온 만큼
const FOOT = { x0: -0.13, x1: W + 0.13, z0: -0.33, z1: D + 0.13 };
// 문밖 마루(바닥 높이 0)와 그 끝의 돌계단(한 칸 0.15m, 두 칸 뒤 땅)
const DECK = { x0: FOOT.x1, x1: W + 1.9, z0: 2.75, z1: 4.45 }, STEP = { run: 0.3, rise: 0.15, n: 2 };
// 마당: 걸어 다닐 수 있는 범위(숲과 먼 언덕까지는 가지 않는다)
const YARD = { x0: -6, x1: W + 9, z0: -4.2, z1: D + 7 };
// 지붕: 용마루는 x 방향, 벽 위 둘레의 가운데(z)에 있고 30도로 기운다
const ROOF = { a: 30 * Math.PI / 180, t: 0.14, over: 0.45, side: 0.5 };
ROOF.zr = (FOOT.z0 + 0.03 + FOOT.z1 - 0.03) / 2; ROOF.base = H + 0.1;

export function buildOutdoor(ctx, M) {
  const g = new THREE.Group(); g.name = 'outdoor';
  const box = (w, h, d, x, y, z, m, { cast = true, rx = 0 } = {}) => {
    const mesh = new THREE.Mesh(boxUV(new THREE.BoxGeometry(w, h, d), w, h, d), m);
    mesh.position.set(x, y, z); mesh.rotation.x = rx; mesh.castShadow = cast; mesh.receiveShadow = true; g.add(mesh); return mesh;
  };

  // ---- 기초: 집 밑의 돌 받침(땅에서 바닥까지). 윗면은 방 바닥 아래에 숨는다.
  box(FOOT.x1 - FOOT.x0, 0.6, FOOT.z1 - FOOT.z0, (FOOT.x0 + FOOT.x1) / 2, -0.3, (FOOT.z0 + FOOT.z1) / 2, M.hearth, { cast: false });

  // ---- 문틀(안과 밖의 문선), 문턱, 문짝
  const dzc = (DOOR.z0 + DOOR.z1) / 2, dw = DOOR.z1 - DOOR.z0, cw = 0.07;
  for (const [x, dx] of [[W - 0.01, 0.02], [W + 0.11, 0.02]]) {
    box(dx, DOOR.h + cw, cw, x, (DOOR.h + cw) / 2, DOOR.z0 - cw / 2, M.woodDark, { cast: false });
    box(dx, DOOR.h + cw, cw, x, (DOOR.h + cw) / 2, DOOR.z1 + cw / 2, M.woodDark, { cast: false });
    box(dx, cw, dw, x, DOOR.h + cw / 2, dzc, M.woodDark, { cast: false });
  }
  box(0.14, 0.02, dw, W + 0.05, 0.01, dzc, M.woodDark, { cast: false });
  // 문짝: 세로 널판 넷과 가로 띠장 둘. 경첩은 z1 쪽 바깥 모서리에 있고 문은 바깥(마루 쪽)으로 열린다.
  const hinge = new THREE.Group(); hinge.position.set(W + 0.08, 0, DOOR.z1 - 0.004); g.add(hinge);
  const leaf = new THREE.Group(); hinge.add(leaf);
  const lw = dw - 0.008, lh = DOOR.h - 0.012, lt = 0.045, part = (w, h, d, x, y, z, m) => { const p = new THREE.Mesh(boxUV(new THREE.BoxGeometry(w, h, d), w, h, d), m); p.position.set(x, y, z); p.castShadow = p.receiveShadow = true; leaf.add(p); return p; };
  for (let i = 0; i < 4; i++) part(lt, lh, lw / 4 - 0.004, -lt / 2, 0.006 + lh / 2, -(i + 0.5) * lw / 4, M.wood);
  for (const y of [0.35, 1.7]) for (const s of [-1, 1]) part(0.02, 0.12, lw - 0.06, -lt / 2 + s * (lt / 2 + 0.01), y, -lw / 2, M.woodDark);
  // 손잡이(쇠 고리 손잡이와 받침판) 양쪽
  for (const s of [-1, 1]) {
    part(0.006, 0.16, 0.05, -lt / 2 + s * (lt / 2 + 0.023), 1.0, -lw + 0.1, M.iron);
    const grip = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.007, 6, 14, Math.PI), M.iron); grip.rotation.set(0, Math.PI / 2, Math.PI / 2); grip.position.set(-lt / 2 + s * (lt / 2 + 0.026), 1.0, -lw + 0.1); leaf.add(grip);
  }
  const door = (ctx.door = { open: false, t: 0, hinge });
  // 열린 문짝이 마루에서 길을 막는 상자 (닫혀 있을 때는 벽 안에 숨는다)
  const col = { min: [0, 0, 0], max: [0, 0, 0] }; ctx.colliders.push(col);
  const syncCol = () => {
    if (door.t < 0.5) { col.min = [W, 0, DOOR.z0]; col.max = [W + 0.1, DOOR.h, DOOR.z1]; return; }
    col.min = [W + 0.1, 0, DOOR.z1 - 0.02]; col.max = [W + 0.98, DOOR.h, DOOR.z1 + 0.2];
  };
  syncCol();
  ctx.interact.push({ id: 'door', label: '문 열기', pos: [W + 0.05, 1.05, dzc], radius: 0.5, door: true });
  let last = 0;
  ctx.animated.push((el) => {
    const dt = Math.min(0.05, el - last); last = el;
    const goal = door.open ? 1 : 0; if (door.t === goal) return;
    door.t = goal > door.t ? Math.min(1, door.t + dt / 0.9) : Math.max(0, door.t - dt / 0.75);
    const e = door.t * door.t * (3 - 2 * door.t); hinge.rotation.y = DOOR.open * e; syncCol();
    ctx.onDoorMove?.(door.t);
  });
  door.toggle = () => { door.open = !door.open; const it = ctx.interact.find((i) => i.id === 'door'); if (it) it.label = door.open ? '문 닫기' : '문 열기'; return door.open; };

  // ---- 문밖 마루: 나무 널 윗면과 그 밑의 돌 받침, 끝의 돌계단 둘
  const deckW = DECK.x1 - DECK.x0, deckD = DECK.z1 - DECK.z0, dcx = (DECK.x0 + DECK.x1) / 2, dcz = (DECK.z0 + DECK.z1) / 2;
  box(deckW, 0.05, deckD, dcx, -0.025, dcz, M.floor);
  box(deckW - 0.08, 0.5, deckD - 0.08, dcx - 0.02, -0.3, dcz, M.hearth, { cast: false });
  for (let k = 1; k <= STEP.n; k++) {
    const top = -k * STEP.rise, x0 = DECK.x1 + (k - 1) * STEP.run;
    box(STEP.run, top - GROUND + 0.1, deckD - 0.3, x0 + STEP.run / 2, (top + GROUND - 0.1) / 2, dcz, M.hearth);
  }

  // ---- 지붕: 두 경사면(널판 지붕), 용마루 덮개, 양쪽 박공 벽, 굴뚝
  const { a, t } = ROOF, zr = ROOF.zr, base = ROOF.base, ze0 = FOOT.z0 + 0.03 - ROOF.over, ze1 = FOOT.z1 - 0.03 + ROOF.over;
  const yAt = (z) => base + (z < zr ? z - (FOOT.z0 + 0.03) : FOOT.z1 - 0.03 - z) * Math.tan(a);   // 경사면 밑면의 높이
  const len = (zr - ze0) / Math.cos(a), rw = W + 0.2 + 2 * ROOF.side;
  for (const s of [-1, 1]) {
    const zm = s < 0 ? (ze0 + zr) / 2 : (zr + ze1) / 2, n = new THREE.Vector3(0, Math.cos(a), s < 0 ? -Math.sin(a) : Math.sin(a));
    box(rw, t, len, W / 2, yAt(zm) + n.y * t / 2, zm + n.z * t / 2, M.roof, { rx: s < 0 ? -a : a });
  }
  const ridgeY = yAt(zr) + t / Math.cos(a);
  box(rw + 0.04, 0.08, 0.34, W / 2, ridgeY, zr, M.woodDark);
  // 박공: 벽 위의 세모 (지붕 밑까지)
  const tri = new THREE.Shape(); tri.moveTo(FOOT.z0 + 0.03, base); tri.lineTo(FOOT.z1 - 0.03, base); tri.lineTo(zr, yAt(zr) + 0.02); tri.closePath();
  const tg = new THREE.ExtrudeGeometry(tri, { depth: 0.1, bevelEnabled: false });
  for (const x of [0, W + 0.1]) { const m = new THREE.Mesh(tg, M.wall); m.rotation.y = -Math.PI / 2; m.position.set(x, 0, 0); m.castShadow = m.receiveShadow = true; g.add(m); }
  // 굴뚝: 벽난로 바로 위에서 지붕을 뚫고 올라온다
  const chx = (FP.faceX + W) / 2, chTop = ridgeY + 0.55;
  box(0.56, chTop - base, 0.7, chx, (chTop + base) / 2, FP.zc, M.stone);
  box(0.64, 0.06, 0.78, chx, chTop + 0.03, FP.zc, M.hearth);

  // ---- 걷기: 방 안, 열린 문, 마당 (집 둘레와 마루 포함)
  ctx.walkable = (x, z, r) => {
    if (x >= r + 0.02 && x <= W - r - 0.02 && z >= r + 0.05 && z <= D - r - 0.02) return true;                     // 방 안
    if (door.t > 0.6 && z >= DOOR.z0 + 0.2 && z <= DOOR.z1 - 0.2 && x > W - 0.7 && x < W + 0.7) return true;         // 문간
    if (x < YARD.x0 || x > YARD.x1 || z < YARD.z0 || z > YARD.z1) return false;
    return !(x > FOOT.x0 - r && x < FOOT.x1 + r && z > FOOT.z0 - r && z < FOOT.z1 + r);                             // 집 밖 마당
  };
  // 발 높이: 집 안과 마루는 0, 계단은 칸마다, 나머지 마당은 땅 높이
  ctx.groundAt = (x, z) => {
    if (x >= FOOT.x0 && x <= DECK.x1 && z >= FOOT.z0 && z <= FOOT.z1 && (x <= FOOT.x1 || (z >= DECK.z0 && z <= DECK.z1))) return 0;
    if (z >= DECK.z0 + 0.15 && z <= DECK.z1 - 0.15 && x > DECK.x1 && x < DECK.x1 + STEP.n * STEP.run) return -Math.ceil((x - DECK.x1) / STEP.run) * STEP.rise;
    return GROUND;
  };
  // 집 밖에 있는가 (0 = 방 안, 1 = 바깥). 문간에서는 그 사이 값
  ctx.outsideAt = (x, z) => (x <= W && x >= 0 && z >= 0 && z <= D ? 0 : x > W && x < W + 0.4 && z > DOOR.z0 && z < DOOR.z1 ? (x - W) / 0.4 : 1);
  return g;
}
