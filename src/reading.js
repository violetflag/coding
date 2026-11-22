// 읽기 모드: 의자에 앉아 책을 펼치면 3D 책을 눈앞에 들고, 마우스와 키로 넘기고 밑줄을 친다.
// 리더(reader.js)와 화면(ui.js), 플레이어 상태, 방의 불빛을 서로 잇는다.
import * as THREE from 'three/webgpu';
import { Reader } from './reader/reader.js';
import { ReaderUI } from './reader/ui.js';
import { PW, PH } from './reader/book3d.js';

const PICK = 'nanro.picked';

export function setupReading({ scene, camera, player, canvas, toast, sfx, onUiMode, extraTabs, onQuote, onTts }) {
  let picked = null; try { picked = localStorage.getItem(PICK); } catch { /* 무시 */ }
  let lastChange = '';
  const api = { reader: null, ui: null, single: 'R', opening: false };
  const reader = (api.reader = new Reader({
    toast, onTts: (on) => onTts?.(on), onPageTurn: () => sfx?.('page'),
    onChange: (what) => { lastChange = what; api.ui?.update(); if (what === 'library') api.onLibrary?.(reader.library); },
  }));
  const book = reader.book3d; scene.add(book.group);
  // 책 위로 떨어지는 빛: 불빛이 방 안에서 되비친 것 + 낮의 하늘빛. 불의 세기와 흔들림을 그대로 따른다.
  const bookLight = new THREE.PointLight(0xffb070, 0, 1.4, 1.6); scene.add(bookLight);

  const setPicked = (id) => { picked = id; try { id ? localStorage.setItem(PICK, id) : localStorage.removeItem(PICK); } catch { /* 무시 */ } api.onPicked?.(id); };
  const host = {
    reader, toast, extraTabs, picked: () => picked, quoteCard: (t) => onQuote?.(t, reader.cur?.meta),
    onPanel: (open) => onUiMode?.(open), onView: () => place(true),
    closeBook: () => { if (player.state === 'reading') player.closeBook(); },
    async pickBook(id) {
      setPicked(id);
      if (player.state === 'reading') { await openPicked(); ui.close(); }
      else if (player.state === 'seated') { ui.close(); player.openBook(); }
      else toast('책을 꺼냈습니다. 의자에 앉아 E로 펼치세요');
    },
    onAdded: (meta) => { setPicked(meta.id); if (player.state === 'reading') openPicked(); },
    onRemoved: (id) => { if (picked === id) setPicked(null); if (player.state === 'reading' && !reader.cur) player.closeBook(); },
  };
  const ui = (api.ui = new ReaderUI(host));

  // ---- 책을 드는 자리: 무릎 위에 얹고 두 손으로 잡은 책. 눈에서 앞으로 FWD, 아래로 DROP 떨어진 곳에 TILT만큼 세워 둔다.
  const DROP = 0.37, DEG = Math.PI / 180;                           // 눈에서 무릎 위 책까지의 기본 높이 차(m)
  const target = new THREE.Vector3(), tq = new THREE.Quaternion(), eul = new THREE.Euler(), dir = new THREE.Vector3(), right = new THREE.Vector3(), eyeP = new THREE.Vector3();
  // rise: 책을 펼치는 움직임(0 → 1), closing: 덮는 움직임(1 → 0). 덮인 책은 양쪽 면이 CLOSED도까지 접혀 있다.
  let rise = 1, closing = 0; const hands = [], CLOSED = 76, smooth = (t) => t * t * (3 - 2 * t);
  // 시선: 읽는 동안의 눈길(위아래·좌우)과 시야각. 설정이나 오른쪽 끌기로 바꾸면 바로 따라간다.
  function applyView(now = true) {
    const S = reader.set, c = player.chair;
    player.readPitch = S.vPitch * DEG; player.readYaw = S.vYaw * DEG; player.readFov = S.vFov;
    if (now && c && player.state === 'reading' && !player.tween) { player.pitch = player.readPitch; player.yaw = c.yaw + player.readYaw; player.fov = S.vFov; }
    for (const h of hands) h.visible = !!S.hands;
  }
  function place(snap = false) {
    applyView(); if (rise >= 1 && closing <= 0) book.setOpen(reader.set.bOpen ?? 16);
    const c = player.chair; if (!c) return;
    const yaw = c.yaw, S = reader.set, single = S.single;
    right.set(Math.cos(yaw), 0, -Math.sin(yaw)); eyeP.set(player.pos.x, c.eye, player.pos.z);
    target.set(player.pos.x - Math.sin(yaw) * S.bDist, c.eye - DROP + S.bH, player.pos.z - Math.cos(yaw) * S.bDist).addScaledVector(right, S.bSide);
    dir.copy(target).sub(eyeP); const full = dir.length(); dir.normalize();
    // 확대: 책을 눈 쪽으로 당긴다 (무릎에서 살짝 들어 올리는 셈). 한 쪽 보기는 조금 더 가깝게.
    target.copy(eyeP).addScaledVector(dir, (full * (single ? 0.84 : 1)) / S.zoom);
    if (single) target.addScaledVector(right, api.single === 'R' ? -PW / 2 : PW / 2);
    eul.set(-(Math.PI / 2 - S.bTilt * DEG), yaw, 0, 'YXZ'); tq.setFromEuler(eul);
    if (snap && !book.group.visible) { book.group.position.copy(target); book.group.quaternion.copy(tq); }
  }
  applyView(false);

  // ---- 책을 잡은 두 손 (책과 함께 움직인다): 쪽 아래 바깥 귀퉁이에 얹은 엄지, 책 밑을 받친 손, 스웨터 소매
  {
    const skin = new THREE.MeshStandardMaterial({ color: 0xb5805f, roughness: 0.7 }), nail = new THREE.MeshStandardMaterial({ color: 0xd3a088, roughness: 0.3 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.95 });
    const cap = (r, len, m) => { const o = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 12), m); o.castShadow = true; o.receiveShadow = true; return o; };
    for (const s of [-1, 1]) {
      const h = new THREE.Group(); h.position.set(s * (PW * 1.03), -PH * 0.54, 0.0); h.scale.setScalar(0.92);
      // 엄지: 쪽 여백 위에 비스듬히 얹힌다
      const t1 = cap(0.0112, 0.03, skin); t1.position.set(s * 0.012, -0.012, 0.021); t1.rotation.z = s * 0.75; t1.rotation.x = 0.12; h.add(t1);
      const t2 = cap(0.0095, 0.022, skin); t2.position.set(s * -0.012, 0.016, 0.02); t2.rotation.z = s * 1.02; h.add(t2);
      const tn = new THREE.Mesh(new THREE.SphereGeometry(0.0062, 12, 8), nail); tn.scale.set(1, 1.2, 0.22); tn.position.set(s * -0.0235, 0.0225, 0.0287); tn.rotation.z = s * 1.02; h.add(tn);
      // 엄지 뿌리와 손바닥 옆(책 가장자리를 감싼다), 책 밑의 손가락
      const base = cap(0.017, 0.03, skin); base.position.set(s * 0.036, -0.03, 0.012); base.rotation.z = s * 0.5; h.add(base);
      const palm = new THREE.Mesh(new THREE.SphereGeometry(0.036, 14, 10), skin); palm.scale.set(1, 1.25, 0.5); palm.position.set(s * 0.05, -0.05, -0.006); palm.castShadow = true; h.add(palm);
      for (let k = 0; k < 4; k++) { const f = cap(0.0085, 0.05, skin); f.position.set(s * (0.0 - k * 0.004), -0.02 + k * 0.017, -0.016); f.rotation.z = s * (1.35 + k * 0.05); h.add(f); }
      // 손목과 소매
      const wrist = cap(0.026, 0.05, skin); wrist.scale.z = 0.75; wrist.position.set(s * 0.075, -0.1, 0.006); wrist.rotation.z = s * 0.5; wrist.rotation.x = -0.25; h.add(wrist);
      const arm = cap(0.04, 0.3, sleeve); arm.position.set(s * 0.15, -0.25, 0.06); arm.rotation.z = s * 0.5; arm.rotation.x = -0.32; h.add(arm);
      const cuff = cap(0.043, 0.02, sleeve); cuff.position.set(s * 0.093, -0.135, 0.016); cuff.rotation.z = s * 0.5; cuff.rotation.x = -0.3; h.add(cuff);
      book.group.add(h); hands.push(h); h.visible = !!reader.set.hands;
    }
  }
  // ---- 앉은 사람의 몸 (앉아 있는 동안 보인다): 스웨터를 입은 배, 편한 바지를 입은 두 다리, 털양말을 신은 발.
  // 다리는 엉덩이에서 무릎을 지나 발목까지 굵기가 변하는 하나의 관으로 만든다.
  const lap = new THREE.Group(); lap.visible = false; scene.add(lap);
  {
    // 천: 가는 능직 결. tint로 옷마다 색을 준다
    const weave = (base, a, b2, rep) => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d'); c.fillStyle = base; c.fillRect(0, 0, 128, 128);
      let sd = 7; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      for (let y = 0; y < 128; y += 2) for (let x = 0; x < 128; x += 2) { c.globalAlpha = 0.1 + r() * 0.22; c.fillStyle = ((x + y) / 2) % 4 < 2 ? a : b2; c.fillRect(x, y, 2, 2); }
      c.globalAlpha = 1; const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.anisotropy = 8; return t;
    };
    const trouser = new THREE.MeshStandardMaterial({ map: weave('#3a4254', '#4a5368', '#2b3140', [14, 40]), roughness: 0.95 }); trouser.bumpMap = trouser.map; trouser.bumpScale = 0.5;
    const knit = new THREE.MeshStandardMaterial({ map: weave('#cfc4ad', '#e6dcc6', '#a89c84', [16, 10]), roughness: 1 });
    const sock = new THREE.MeshStandardMaterial({ map: weave('#8c8478', '#b3aa9a', '#5e584e', [8, 10]), roughness: 1 });
    api.bodyMats = [trouser, knit, sock];
    // pts: [x, y, z, 반지름] 의 줄. 사이를 부드럽게 이어 관을 만든다. flat = 단면의 납작한 정도(앉으면 허벅지가 눌린다)
    // fold(t, a): 옷 주름. 길이 방향 위치 t(0…1)와 둘레 각 a에서 반지름에 곱할 값
    const limb = (pts, mat, flat = 1, RING = 20, STEP = 8, fold = null) => {
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), false, 'centripetal'), n = (pts.length - 1) * STEP;
      const rad = (t) => { const f = t * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), k = f - i, e = k * k * (3 - 2 * k); return pts[i][3] * (1 - e) + pts[i + 1][3] * e; };
      const P = [], U = [], I = [], T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), side = new THREE.Vector3(1, 0, 0);
      for (let i = 0; i <= n; i++) {
        const t = i / n; curve.getPoint(t, C); curve.getTangent(t, T); B.crossVectors(T, side).normalize(); N.crossVectors(B, T).normalize();   // N = 옆, B = 위아래
        const r0 = rad(t);
        for (let j = 0; j <= RING; j++) { const a = (j / RING) * Math.PI * 2, r = r0 * (fold ? fold(t, a) : 1), cx = Math.cos(a) * r, cy = Math.sin(a) * r * flat; P.push(C.x + N.x * cx + B.x * cy, C.y + N.y * cx + B.y * cy, C.z + N.z * cx + B.z * cy); U.push(j / RING, t); }
      }
      for (let i = 0; i < n; i++) for (let j = 0; j < RING; j++) { const a = i * (RING + 1) + j, b3 = a + RING + 1; I.push(a, a + 1, b3, a + 1, b3 + 1, b3); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); geo.setIndex(I); geo.computeVertexNormals();
      // 이음매(j = 0과 RING)의 법선을 맞춘다
      const nor = geo.attributes.normal; for (let i = 0; i <= n; i++) { const a = i * (RING + 1), b3 = a + RING, x = nor.getX(a) + nor.getX(b3), y = nor.getY(a) + nor.getY(b3), z = nor.getZ(a) + nor.getZ(b3), l = Math.hypot(x, y, z) || 1; nor.setXYZ(a, x / l, y / l, z / l); nor.setXYZ(b3, x / l, y / l, z / l); }
      const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; lap.add(m); return m;
    };
    const blob = (mat, x, y, z, sx, sy, sz, rx = 0) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.x = rx; m.castShadow = true; m.receiveShadow = true; lap.add(m); return m; };
    // 좌표: 의자 기준. -Z가 앞, 원점은 바닥의 의자 중심. 오른발을 조금 더 내밀어 좌우가 똑같지 않게 한다.
    for (const s of [-1, 1]) {
      const f = s > 0 ? 0.05 : 0, kx = s * 0.125;
      limb([[s * 0.1, 0.55, 0.2, 0.1], [s * 0.105, 0.55, 0.02, 0.097], [s * 0.115, 0.555, -0.2, 0.084], [kx, 0.555, -0.38, 0.068], [kx, 0.53, -0.47 - f * 0.3, 0.06],
        [kx, 0.44, -0.52 - f * 0.6, 0.057], [kx, 0.3, -0.55 - f, 0.054], [kx, 0.16, -0.565 - f * 1.2, 0.046], [kx, 0.085, -0.57 - f * 1.3, 0.043]], trouser, 0.86, 28, 14,
        // 주름: 무릎에서 접힌 가로 주름, 허벅지를 따라 흐르는 완만한 세로 주름, 발목에 고인 바지 끝단
        (t, a) => { const g = (c, w) => Math.exp(-(((t - c) / w) ** 2)); return 1 + 0.05 * g(0.47, 0.07) * Math.sin(t * 150 + 1.6 * Math.sin(a + s)) + 0.022 * g(0.22, 0.2) * Math.sin(3 * a + t * 16 + s) + 0.06 * g(0.93, 0.06) * Math.sin(t * 170 + 2 * Math.sin(2 * a)) + 0.04 * g(0.99, 0.03); });
      // 양말: 발목에서 발등을 지나 발끝까지
      limb([[kx, 0.13, -0.57 - f * 1.3, 0.04], [kx, 0.07, -0.58 - f * 1.3, 0.041], [kx * 1.02, 0.047, -0.65 - f * 1.3, 0.043], [kx * 1.06, 0.04, -0.74 - f * 1.3, 0.04], [kx * 1.08, 0.036, -0.79 - f * 1.3, 0.026]], sock, 0.8, 16, 6);
      blob(sock, kx * 1.08, 0.036, -0.79 - f * 1.3, 0.027, 0.022, 0.03); blob(sock, kx, 0.05, -0.565 - f * 1.3, 0.042, 0.04, 0.05);
    }
    blob(knit, 0, 0.82, 0.17, 0.19, 0.3, 0.125, -0.12);                                      // 배와 가슴
    blob(knit, 0, 0.6, 0.14, 0.2, 0.09, 0.15);                                              // 스웨터 밑단
  }
  async function openPicked() {
    await reader.ready;
    const id = (picked && reader.library.find((b) => b.id === picked)?.id) || reader.library[0]?.id;
    if (!id) { toast('서재에 책이 없습니다. 책 파일을 추가해 주세요'); ui.open('lib'); return false; }
    api.opening = true;
    try { toast('책을 펼치는 중…'); await reader.open(id, (p) => toast(`책을 펼치는 중… ${Math.round(p * 100)}%`)); setPicked(id); }
    catch (e) { console.warn(e); toast(e.message || '책을 열 수 없습니다'); api.opening = false; return false; }
    api.opening = false; api.single = 'R'; place(); ui.update(); api.onOpen?.(reader.cur.meta);
    return true;
  }
  // 플레이어 상태가 바뀔 때 (main에서 호출)
  api.onState = async (s) => {
    if (s === 'reading') {
      if (document.pointerLockElement) document.exitPointerLock();
      place(); book.group.position.copy(target); book.group.position.y -= 0.12; book.group.quaternion.copy(tq); rise = 0; closing = 0; book.setOpen(CLOSED);
      const had = !!reader.cur && (!picked || reader.cur.meta.id === picked);
      book.group.visible = had; ui.setReading(true);
      const ok = had || (await openPicked());
      if (player.state !== 'reading') return;
      if (!ok) { if (!reader.library.length) return; player.closeBook(); return; }
      book.group.visible = true; reader.spreadAt = performance.now(); sfx?.('open');
    } else if (api.wasReading) { ui.setReading(false); ui.close(); reader.stopTts(); reader.flush(); if (book.group.visible) closing = 1; sfx?.('close'); if (s === 'seated') player.lock(); }
    api.wasReading = s === 'reading';
  };
  api.advance = (d) => {
    if (reader.set.single) { const want = d > 0 ? 'R' : 'L'; if (api.single !== want) { api.single = want; place(); return; } api.single = d > 0 ? 'L' : 'R'; place(); }
    reader.turn(d);
  };
  api.picked = () => picked; api.setPicked = setPicked; api.place = place;
  api.setRise = (v) => { rise = v; api.holdRise = v < 1; };   // 촬영 도구용: 펼치는 움직임을 중간에서 멈춘다

  // ---- 마우스: 끌어서 선택, 눌러서 넘기기
  const ndc = new THREE.Vector2(); let drag = null, lastWheel = 0;
  const pickAt = (e) => { ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); return book.pick(ndc, camera); };
  const active = () => player.state === 'reading' && !player.tween && book.group.visible && !ui.isOpen && reader.cur;
  canvas.addEventListener('mousedown', (e) => {
    if (!active() || e.button !== 0) return;
    if (ui.pop.classList.contains('open')) { ui.hidePop(); return; }
    ui.dict.classList.remove('open');
    const pk = pickAt(e); drag = { pk, g: pk ? reader.charAtPick(pk, false) : -1, moved: false, x: e.clientX, y: e.clientY };
  });
  addEventListener('mousemove', (e) => {
    if (!drag || drag.g < 0 || !active()) return;
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5 && !drag.moved) return;
    const pk = pickAt(e); if (!pk) return; const g2 = reader.charAtPick(pk, true);
    if (g2 >= 0 && g2 !== drag.g2) { drag.g2 = g2; drag.moved = true; reader.setSelection(drag.g, g2); }
  });
  addEventListener('mouseup', (e) => {
    const d = drag; drag = null; if (!d || !active()) return;
    if (d.moved && reader.selection) return ui.showPop(e.clientX, e.clientY, { range: reader.selection });
    if (!d.pk) return;
    const hl = d.g >= 0 ? reader.highlightAt(d.g) : null;
    if (hl) return ui.showPop(e.clientX, e.clientY, { hl });
    api.advance(d.pk.side === 'R' ? 1 : -1);
  });
  canvas.addEventListener('dblclick', (e) => { if (!active()) return; const pk = pickAt(e), g = pk ? reader.charAtPick(pk, false) : -1, w = g >= 0 && reader.wordAt(g); if (w) { reader.setSelection(w[0], w[1]); ui.showPop(e.clientX, e.clientY, { range: reader.selection }); } });
  // 오른쪽 단추로 끌기: 읽는 중에 시선을 돌린다 (불이나 창밖이 보이게). Shift+휠: 책 기울기, Alt+휠: 책 높이.
  let look = null;
  canvas.addEventListener('contextmenu', (e) => { if (player.state === 'reading') e.preventDefault(); });
  canvas.addEventListener('mousedown', (e) => { if (e.button === 2 && player.state === 'reading' && !player.tween) { look = { x: e.clientX, y: e.clientY }; e.preventDefault(); } });
  addEventListener('mousemove', (e) => {
    if (!look) return; if (!(e.buttons & 2) || player.state !== 'reading') { look = null; return; }
    const S = reader.set, k = 0.11;
    S.vYaw = Math.max(-70, Math.min(70, S.vYaw - (e.clientX - look.x) * k)); S.vPitch = Math.max(-75, Math.min(30, S.vPitch - (e.clientY - look.y) * k));
    look.x = e.clientX; look.y = e.clientY; applyView();
  });
  addEventListener('mouseup', (e) => { if (e.button === 2 && look) { look = null; reader.saveSettings(); } });
  canvas.addEventListener('wheel', (e) => {
    if (!active()) return; e.preventDefault();
    if (e.shiftKey) { reader.set.bTilt = Math.max(0, Math.min(90, reader.set.bTilt + (e.deltaY < 0 ? 2 : -2))); reader.saveSettings(); place(); return; }
    if (e.altKey) { reader.set.bH = Math.max(-0.15, Math.min(0.45, +(reader.set.bH + (e.deltaY < 0 ? 0.01 : -0.01)).toFixed(3))); reader.saveSettings(); place(); return; }
    if (e.ctrlKey) { reader.set.zoom = Math.max(0.7, Math.min(1.8, reader.set.zoom * (e.deltaY < 0 ? 1.06 : 0.94))); reader.saveSettings(); place(); return; }
    if (performance.now() - lastWheel < 260) return; lastWheel = performance.now(); api.advance(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });
  // ---- 키
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
    if (e.code === 'KeyL' && !e.repeat && player.state !== 'reading') { ui.toggle('lib'); return; }
    if (player.state !== 'reading') { if (e.code === 'Tab') { e.preventDefault(); ui.toggle(); } return; }
    const k = e.code;
    if (k === 'Tab') { e.preventDefault(); ui.toggle(reader.cur ? undefined : 'lib'); return; }
    if (k === 'Escape') { if (ui.isOpen || ui.pop.classList.contains('open') || ui.dict.classList.contains('open')) ui.closeAll(); else player.closeBook(); return; }
    if (ui.isOpen || !reader.cur) return;
    if (k === 'ArrowRight' || k === 'PageDown' || k === 'Space' || k === 'KeyD') { e.preventDefault(); api.advance(1); }
    else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'KeyA') { e.preventDefault(); api.advance(-1); }
    else if (e.repeat) return;
    else if (k === 'KeyX') player.closeBook();
    else if (k === 'KeyB') reader.toggleBookmark();
    else if (k === 'KeyF') { e.preventDefault(); ui.open('search'); }
    else if (k === 'KeyT') (reader.tts ? reader.stopTts() : reader.startTts());
    else if (k === 'KeyL') ui.toggle('lib');
    else if (k === 'Backspace') reader.back();
    else if (k === 'Home') reader.goto(0);
    else if (k === 'End') reader.goto(reader.cur.book.length - 1);
    else if (k === 'Equal' || k === 'Minus') { const T = reader.set.type; T.size = Math.max(22, Math.min(68, T.size + (k === 'Equal' ? 2 : -2))); reader.saveSettings(); reader.relayout().then(() => ui.update()); }
  });

  // 매 프레임: 책 위치 보간, 넘김 애니메이션, 책 위 조명. light = { fire: 불 세기×흔들림, day, steady }
  api.update = (dt, light) => {
    const reading = player.state === 'reading';
    // 무릎과 담요는 앉아 있는 의자를 따라간다
    const ch = player.chair; lap.visible = !!ch && (player.state === 'seated' || reading || (player.state === 'sitting' && player.tween?.t > 0.7));
    if (lap.visible) { lap.position.set(ch.pos[0], ch.eye - 1.08, ch.pos[1]); lap.rotation.y = ch.yaw; }
    reader.tick(dt, reading && book.group.visible);
    if (!book.group.visible) { bookLight.intensity = 0; api.moving = false; return; }
    const open = reader.set.bOpen ?? 16;
    if (closing > 0) {
      // 책을 덮는다: 양쪽 면을 모으며 무릎으로 내려놓고 사라진다
      closing -= dt / 0.38; const e = smooth(Math.max(0, closing)); book.setOpen(open + (CLOSED - open) * (1 - e)); book.group.position.y -= dt * 0.3;
      if (closing <= 0) { book.group.visible = false; book.setOpen(open); bookLight.intensity = 0; api.moving = false; return; }
    } else {
      if (rise < 1) { if (!api.holdRise) rise = Math.min(1, rise + dt * 1.7); book.setOpen(open + (CLOSED - open) * (1 - smooth(rise))); }   // 무릎에서 들어 올리며 펼친다
      const k = 1 - Math.exp(-dt * 10); book.group.position.lerp(target, k); book.group.quaternion.slerp(tq, k);
    }
    api.moving = closing > 0 || rise < 1 || book.group.position.distanceToSquared(target) > 1e-7;   // 책이 움직이는 동안은 화면을 매 프레임 그린다
    bookLight.position.copy(book.group.position).addScaledVector(dir, -0.22); bookLight.position.y += 0.1;
    const steady = reader.set.contrast;
    // 밤에는 종이가 방보다 지나치게 희지 않게 낮추고(불빛 색을 띤 크림색), 낮에는 창빛만큼 밝힌다
    bookLight.intensity = steady ? 0.5 : 0.07 + 0.3 * light.fire + 0.1 * light.day;
    // 낮에는 누운 책이 하늘빛과 창빛을 그대로 받아 종이가 하얗게 날아간다: 낮일수록 종이를 어둡게 받고, 방의 반사광은 받지 않게 한다. '종이 밝기'로 직접 맞출 수도 있다.
    const pk = (reader.set.bright ?? 1) * (1 - 0.66 * light.day);
    for (const m of Object.values(book.mat)) { m.color.setScalar(pk); m.envMapIntensity = 0; }
    bookLight.color.setRGB(1, 0.69 + 0.31 * light.day, 0.44 + 0.56 * light.day);
  };
  return api;
}
