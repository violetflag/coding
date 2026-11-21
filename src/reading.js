// 읽기 모드: 의자에 앉아 책을 펼치면 3D 책을 눈앞에 들고, 마우스와 키로 넘기고 밑줄을 친다.
// 리더(reader.js)와 화면(ui.js), 플레이어 상태, 방의 불빛을 서로 잇는다.
import * as THREE from 'three/webgpu';
import { Reader } from './reader/reader.js';
import { ReaderUI } from './reader/ui.js';
import { PW } from './reader/book3d.js';

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

  // ---- 책을 드는 자리: 앉은 눈에서 시선 방향으로
  const target = new THREE.Vector3(), tq = new THREE.Quaternion(), eul = new THREE.Euler(), dir = new THREE.Vector3(), right = new THREE.Vector3();
  let rise = 0;
  function place(snap = false) {
    const c = player.chair; if (!c) return;
    const yaw = c.yaw, p = player.readPitch, S = reader.set, single = S.single;
    dir.set(-Math.sin(yaw) * Math.cos(p), Math.sin(p), -Math.cos(yaw) * Math.cos(p)); right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    const dist = (single ? 0.285 : 0.345) / S.zoom;
    target.set(player.pos.x, c.eye, player.pos.z).addScaledVector(dir, dist);
    if (single) target.addScaledVector(right, api.single === 'R' ? -PW / 2 : PW / 2);
    eul.set(p, yaw, 0, 'YXZ'); tq.setFromEuler(eul);
    if (snap && !book.group.visible) { book.group.position.copy(target); book.group.quaternion.copy(tq); }
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
      place(); book.group.position.copy(target).addScaledVector(dir, -0.02); book.group.position.y -= 0.16; book.group.quaternion.copy(tq); rise = 0;
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
    reader.tick(dt, reading && book.group.visible);
    if (!book.group.visible) { bookLight.intensity = 0; return; }
    rise = Math.min(1, rise + dt * 2.2);
    const k = 1 - Math.exp(-dt * 10); book.group.position.lerp(target, k); book.group.quaternion.slerp(tq, k);
    bookLight.position.copy(book.group.position).addScaledVector(dir, -0.22); bookLight.position.y += 0.1;
    const steady = reader.set.contrast;
    bookLight.intensity = steady ? 0.5 : 0.1 + 0.5 * light.fire + 0.45 * light.day;
    bookLight.color.setRGB(1, 0.69 + 0.31 * light.day, 0.44 + 0.56 * light.day);
  };
  return api;
}
