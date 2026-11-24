// 방 치수와 가구 배치 (단위: 미터). 기획서 4.1을 따른다.
// X: 창문 벽을 따라 0…W, Z: 방 안쪽으로 0…D (창문 벽이 z = 0, 바깥은 z < 0), Y: 위쪽.
export const ROOM = { W: 5.6, D: 4.8, H: 2.7, wall: 0.3 };

export const WINDOW = { x0: 2.15, x1: 3.45, y0: 0.72, y1: 2.42, cols: 3, rows: 4, sill: 0.26 };

// 벽난로: 오른쪽 벽(x = W)에 붙은 굴뚝 벽. 화구는 올린 화로대 위에 있다.
export const FIREPLACE = {
  z0: 0.6, z1: 2.6,          // 굴뚝 벽의 z 범위
  depth: 0.5,                // 방 안으로 돌출
  hearthH: 0.25,             // 화로대(바닥 돌) 높이
  hearthOut: 0.55,           // 화로대가 굴뚝 벽 앞으로 더 나오는 길이
  openW: 0.9, openH: 0.75,   // 화구 입구
  mantelY: 1.4,
};
FIREPLACE.zc = (FIREPLACE.z0 + FIREPLACE.z1) / 2;
FIREPLACE.faceX = ROOM.W - FIREPLACE.depth;                 // 굴뚝 벽 앞면
// 불의 중심(장작 받침대 한가운데, 화로대 윗면)
FIREPLACE.fire = { x: ROOM.W - FIREPLACE.depth + 0.23, y: FIREPLACE.hearthH, z: FIREPLACE.zc };

// 앉을 수 있는 의자. seat = 앉았을 때 눈 위치, yaw = 바라보는 방향(라디안, 0 = -Z를 봄).
const aim = (from, to) => Math.atan2(-(to[0] - from[0]), -(to[1] - from[1]));
const fireXZ = [FIREPLACE.fire.x, FIREPLACE.fire.z];
// 참고 사진의 배치: 책장 앞 윙체어는 벽난로를, 방 가운데 뒤쪽의 읽기 의자는 창과 벽난로 사이를 본다. (가구 옮기기로 바뀔 수 있다)
export const CHAIRS = [
  { id: 'reading', label: '읽기 의자', pos: [3.05, 3.75], yaw: aim([3.05, 3.75], [4.3, 1.1]), eye: 1.08 },
  { id: 'wing', label: '윙체어', pos: [1.2, 2.05], yaw: aim([1.2, 2.05], fireXZ), eye: 1.08 },
];

export const RUG = { x: 3.0, z: 2.5, w: 3.3, d: 2.3 };
export const LAMP = { x: 0.78, z: 1.12, h: 1.5 };
// 책장: 깊이, 맨 아래 칸 바닥 높이, 칸 간격, 칸 수, 전체 높이. library = 불러온 책이 꽂히는 칸(왼쪽 벽 책장)
export const SHELF = { depth: 0.3, y0: 0.1, pitch: 0.35, rows: 7, top: 2.55, library: { row: 3, bay: 2 } };
// 읽기 의자 오른쪽의 보조 탁자
{ const c = CHAIRS[0]; var TABLE_POS = { x: c.pos[0] + Math.cos(c.yaw) * 0.8 - Math.sin(c.yaw) * 0.05, z: c.pos[1] - Math.sin(c.yaw) * 0.8 - Math.cos(c.yaw) * 0.05 }; }
export const TABLE = TABLE_POS;
export const PLAYER_START = { x: 2.0, z: 4.25, yaw: aim([2.0, 4.25], [4.4, 1.2]) };
