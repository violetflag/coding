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
  const FWD = 0.36, DROP = 0.42, TILT = 0.62;                       // m, m, 수평에서 일으킨 각(라디안)
  player.readPitch = -Math.atan2(DROP, FWD) + 0.04; player.readFov = 29;
  const target = new THREE.Vector3(), tq = new THREE.Quaternion(), eul = new THREE.Euler(), dir = new THREE.Vector3(), right = new THREE.Vector3(), eyeP = new THREE.Vector3();
  let rise = 0;
  function place(snap = false) {
    const c = player.chair; if (!c) return;
    const yaw = c.yaw, S = reader.set, single = S.single;
    right.set(Math.cos(yaw), 0, -Math.sin(yaw)); eyeP.set(player.pos.x, c.eye, player.pos.z);
    target.set(player.pos.x - Math.sin(yaw) * FWD, c.eye - DROP, player.pos.z - Math.cos(yaw) * FWD);
    dir.copy(target).sub(eyeP); const full = dir.length(); dir.normalize();
    // 확대: 책을 눈 쪽으로 당긴다 (무릎에서 살짝 들어 올리는 셈). 한 쪽 보기는 조금 더 가깝게.
    target.copy(eyeP).addScaledVector(dir, (full * (single ? 0.84 : 1)) / S.zoom);
    if (single) target.addScaledVector(right, api.single === 'R' ? -PW / 2 : PW / 2);
    eul.set(-(Math.PI / 2 - TILT), yaw, 0, 'YXZ'); tq.setFromEuler(eul);
    if (snap && !book.group.visible) { book.group.position.copy(target); book.group.quaternion.copy(tq); }
  }

  // ---- 책을 잡은 두 손 (책과 함께 움직인다): 쪽 아래 바깥 귀퉁이에 얹은 엄지, 책 밑을 받친 손, 스웨터 소매
  {
    const skin = new THREE.MeshStandardMaterial({ color: 0xb5805f, roughness: 0.7 }), nail = new THREE.MeshStandardMaterial({ color: 0xd3a088, roughness: 0.3 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.95 });
    const cap = (r, len, m) => { const o = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 12), m); o.castShadow = true; o.receiveShadow = true; return o; };
    for (const s of [-1, 1]) {
      const h = new THREE.Group(); h.position.set(s * (PW * 0.93), -PH * 0.45, 0.0); h.scale.setScalar(0.92);
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
      book.group.add(h);
    }
  }
  // ---- 무릎과 담요 (앉아 있는 동안 보인다): 체크 담요를 덮은 두 다리
  const lap = new THREE.Group(); lap.visible = false; scene.add(lap);
  {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d');
    c.fillStyle = '#6d6a60'; c.fillRect(0, 0, 256, 256);
    const band = (pos, w, col, a) => { c.globalAlpha = a; c.fillStyle = col; for (const o of [0, 128]) { c.fillRect(o + pos, 0, w, 256); c.fillRect(0, o + pos, 256, w); } };
    band(0, 44, '#2f4a48', 0.6); band(64, 28, '#8a2f28', 0.6); band(22, 5, '#e0d6bc', 0.7); band(100, 4, '#1c2424', 0.7); band(76, 3, '#e0d6bc', 0.55);
    c.globalAlpha = 0.16; for (let i = 0; i < 256; i += 2) { c.fillStyle = i % 4 ? '#000' : '#fff'; c.fillRect(i, 0, 1, 256); c.fillRect(0, i, 256, 1); } c.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3.2, 3.2); tex.anisotropy = 8;
    const plaid = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }); api.plaid = plaid;
    const part = (geo, x, y, z, rx = 0, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, plaid); m.position.set(x, y, z); m.rotation.x = rx; m.scale.set(sx, sy, sz); m.castShadow = true; m.receiveShadow = true; lap.add(m); return m; };
    // 좌표: 의자 기준. -Z가 앞, 원점은 바닥의 의자 중심.
    const thigh = new THREE.CapsuleGeometry(0.095, 0.4, 8, 16);
    for (const s of [-1, 1]) { part(thigh, s * 0.115, 0.56, -0.22, Math.PI / 2 - 0.06, 1.05, 1, 0.9); part(new THREE.CapsuleGeometry(0.075, 0.34, 8, 14), s * 0.12, 0.32, -0.5, 0.1); part(new THREE.SphereGeometry(0.1, 16, 12), s * 0.118, 0.555, -0.46, 0, 1.05, 0.95, 1.05); }
    part(new THREE.SphereGeometry(0.2, 20, 14), 0, 0.535, -0.18, 0, 1.25, 0.42, 1.5);        // 다리 사이로 처진 담요
    part(new THREE.SphereGeometry(0.2, 20, 14), 0, 0.5, 0.06, 0, 1.45, 0.5, 1.0);            // 허리 쪽에 뭉친 담요
    part(new THREE.SphereGeometry(0.2, 18, 12), 0, 0.34, -0.5, 0, 1.3, 1.25, 0.5);           // 무릎 아래로 늘어진 자락
  }
  async function openPicked() {
    await reader.ready;
    const id = (picked && reader.library.find((b) => b.id === picked)?.id) || reader.library[0]?.id;
    if (!id) { toast('서재에 책이 없습니다. 책 파일을 추가해 주세요'); ui.open('lib'); return false; }
    api.opening = true;
    try { toast('책을 펼치는 중…'); await reader.open(id, (p) => toast(`조판 중… ${Math.round(p * 100)}%`)); setPicked(id); }
    catch (e) { console.warn(e); toast(e.message || '책을 열 수 없습니다'); api.opening = false; return false; }
    api.opening = false; api.single = 'R'; place(); ui.update(); api.onOpen?.(reader.cur.meta);
    return true;
  }
  // 플레이어 상태가 바뀔 때 (main에서 호출)
  api.onState = async (s) => {
    if (s === 'reading') {
      if (document.pointerLockElement) document.exitPointerLock();
      place(); book.group.position.copy(target); book.group.position.y -= 0.1; book.group.quaternion.copy(tq); rise = 0;
      const had = !!reader.cur && (!picked || reader.cur.meta.id === picked);
      book.group.visible = had; ui.setReading(true);
      const ok = had || (await openPicked());
      if (player.state !== 'reading') return;
      if (!ok) { if (!reader.library.length) return; player.closeBook(); return; }
      book.group.visible = true; reader.spreadAt = performance.now(); sfx?.('open');
    } else if (api.wasReading) { ui.setReading(false); ui.close(); reader.stopTts(); reader.flush(); book.group.visible = false; sfx?.('close'); if (s === 'seated') player.lock(); }
    api.wasReading = s === 'reading';
  };
  api.advance = (d) => {
    if (reader.set.single) { const want = d > 0 ? 'R' : 'L'; if (api.single !== want) { api.single = want; place(); return; } api.single = d > 0 ? 'L' : 'R'; place(); }
    reader.turn(d);
  };
  api.picked = () => picked; api.setPicked = setPicked; api.place = place;

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
  canvas.addEventListener('wheel', (e) => {
    if (!active()) return; e.preventDefault();
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
    if (lap.visible) { lap.position.set(ch.pos[0], ch.eye - 1.08 - 0.075, ch.pos[1]); lap.rotation.y = ch.yaw; }
    reader.tick(dt, reading && book.group.visible);
    if (!book.group.visible) { bookLight.intensity = 0; return; }
    rise = Math.min(1, rise + dt * 2.2);
    const k = 1 - Math.exp(-dt * 10); book.group.position.lerp(target, k); book.group.quaternion.slerp(tq, k);
    bookLight.position.copy(book.group.position).addScaledVector(dir, -0.22); bookLight.position.y += 0.1;
    const steady = reader.set.contrast;
    // 밤에는 종이가 방보다 지나치게 희지 않게 낮추고(불빛 색을 띤 크림색), 낮에는 창빛만큼 밝힌다
    bookLight.intensity = steady ? 0.5 : 0.07 + 0.3 * light.fire + 0.55 * light.day;
    bookLight.color.setRGB(1, 0.69 + 0.31 * light.day, 0.44 + 0.56 * light.day);
  };
  return api;
}
