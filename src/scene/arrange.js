// 가구 옮기기와 액자 그림 넣기.
// 가구: 걸어 다니다가 가구를 보고 G를 누르면 들고, 원하는 곳을 보며 다시 G(또는 클릭)로 내려놓는다. 휠 = 돌리기, Esc = 취소.
// 배치는 이 컴퓨터(localStorage)에 저장된다. 액자 그림은 IndexedDB에 저장된다.
import * as THREE from 'three/webgpu';
import { ROOM } from './layout.js';
import * as store from '../reader/store.js';

const KEY = 'nanro.layout';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };

export function setupArrange({ ctx, player, camera, canvas, toast, sfx }) {
  const api = { held: null, target: null };
  let saved = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* 무시 */ } };
  const apply = (m, p) => { m.obj.position.x = p.x; m.obj.position.z = p.z; m.obj.rotation.y = p.yaw; m.sync(); };
  for (const m of ctx.movables) if (saved[m.id]) apply(m, saved[m.id]);

  // 바라보는 가구 찾기 (2.6 m 이내)
  const d = new THREE.Vector3(), v = new THREE.Vector3();
  const look = () => {
    if (player.state !== 'walk' || api.held) return null;
    camera.getWorldDirection(d); let best = null, bt = 2.6;
    for (const m of ctx.movables) {
      const p = m.obj.position; v.set(p.x - camera.position.x, Math.min(m.h, 1.0) * 0.5 - camera.position.y, p.z - camera.position.z);
      const t = v.dot(d); if (t < 0.3 || t > bt) continue;
      if (v.addScaledVector(d, -t).length() < m.r + 0.12) { best = m; bt = t; }
    }
    return best;
  };
  // 다른 가구·벽과 겹치는지 (자기 충돌 상자는 뺀다)
  const overlaps = (m, x, z) => {
    if (x < m.r + 0.02 || x > ROOM.W - m.r - 0.02 || z < m.r + 0.02 || z > ROOM.D - m.r - 0.02) return true;
    for (const c of ctx.colliders) { if (c === m.col || c.max[1] < 0.08) continue; if (x + m.r > c.min[0] && x - m.r < c.max[0] && z + m.r > c.min[2] && z - m.r < c.max[2]) return true; }
    return Math.hypot(x - player.pos.x, z - player.pos.z) < m.r + 0.3;
  };
  const tint = (m, bad) => m.obj.traverse((o) => { const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const mt of mats) if (mt.emissive && !mt.userData.keepEmissive) { if (mt.userData.e0 === undefined) mt.userData.e0 = [mt.emissive.getHex(), mt.emissiveIntensity]; if (bad === null) { mt.emissive.setHex(mt.userData.e0[0]); mt.emissiveIntensity = mt.userData.e0[1]; } else if (!mt.emissiveMap && mt.userData.e0[1] === 0 || mt.userData.e0[0] === 0) { mt.emissive.setHex(bad ? 0x661008 : 0x30200c); mt.emissiveIntensity = 1; } } });

  api.grab = (m) => {
    api.held = { m, from: { x: m.obj.position.x, z: m.obj.position.z, yaw: m.obj.rotation.y }, dist: Math.max(0.9, Math.min(2.2, Math.hypot(m.obj.position.x - player.pos.x, m.obj.position.z - player.pos.z))), yaw: m.obj.rotation.y, bad: false };
    m.col.min[1] = 99; m.col.max[1] = 99;                                            // 들고 있는 동안은 지나갈 수 있게
    sfx?.('click'); toast(`${m.label}을(를) 옮기는 중 · G 또는 클릭: 내려놓기 · 휠: 돌리기 · Esc: 취소`);
  };
  api.drop = (cancel = false) => {
    const h = api.held; if (!h) return;
    if (!cancel && h.bad) { toast('여기에는 놓을 수 없습니다'); return; }
    const m = h.m; if (cancel) apply(m, h.from);
    m.col.min[1] = 0; m.sync(); tint(m, null); api.held = null;
    if (!cancel) { saved[m.id] = { x: +m.obj.position.x.toFixed(3), z: +m.obj.position.z.toFixed(3), yaw: +m.obj.rotation.y.toFixed(3) }; save(); sfx?.('book'); }
  };
  api.reset = () => { saved = {}; save(); for (const m of ctx.movables) apply(m, m.home); toast('가구 배치를 처음대로 되돌렸습니다'); };

  addEventListener('keydown', (e) => {
    if (e.repeat || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.code === 'KeyG' && player.locked) { if (api.held) api.drop(); else if (api.target) api.grab(api.target); }
    else if (e.code === 'Escape' && api.held) api.drop(true);
  });
  canvas.addEventListener('mousedown', (e) => { if (api.held && e.button === 0) { e.stopImmediatePropagation(); api.drop(); } }, true);
  canvas.addEventListener('wheel', (e) => { if (api.held) { e.preventDefault(); api.held.yaw += (e.deltaY > 0 ? 1 : -1) * Math.PI / 12; } }, { passive: false });
  document.addEventListener('pointerlockchange', () => { if (!player.locked && api.held) api.drop(true); });

  api.update = (dt) => {
    api.target = look();
    const h = api.held; if (!h) return;
    if (player.state !== 'walk') return api.drop(true);
    camera.getWorldDirection(d);
    // 시선이 바닥과 만나는 곳(너무 멀거나 위를 보면 정해 둔 거리)
    let dist = h.dist; if (d.y < -0.15) dist = Math.max(0.8, Math.min(2.6, (camera.position.y / -d.y) * Math.hypot(d.x, d.z)));
    const k = Math.hypot(d.x, d.z) || 1, m = h.m;
    const x = Math.max(m.r + 0.03, Math.min(ROOM.W - m.r - 0.03, player.pos.x + (d.x / k) * dist)), z = Math.max(m.r + 0.03, Math.min(ROOM.D - m.r - 0.03, player.pos.z + (d.z / k) * dist));
    const f = 1 - Math.exp(-dt * 14); m.obj.position.x += (x - m.obj.position.x) * f; m.obj.position.z += (z - m.obj.position.z) * f;
    m.obj.rotation.y += Math.atan2(Math.sin(h.yaw - m.obj.rotation.y), Math.cos(h.yaw - m.obj.rotation.y)) * f;
    m.sync(); m.col.min[1] = 99; m.col.max[1] = 99;
    const bad = overlaps(m, m.obj.position.x, m.obj.position.z); if (bad !== h.bad || h.tinted === undefined) { h.bad = bad; h.tinted = true; tint(m, bad); }
  };

  // ---- 액자 그림
  const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.style.display = 'none'; document.body.appendChild(fileInput);
  let pending = -1;
  const show = (i, blob) => new Promise((res) => { const im = new Image(), u = URL.createObjectURL(blob); im.onload = () => { ctx.frames[i].userData.setImage(im); URL.revokeObjectURL(u); res(true); }; im.onerror = () => { URL.revokeObjectURL(u); res(false); }; im.src = u; });
  // 큰 사진은 줄여서 저장한다 (긴 변 1600픽셀)
  const shrink = (file) => new Promise((res, rej) => { const im = new Image(), u = URL.createObjectURL(file); im.onload = () => { const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); c.toBlob((b) => (b ? res(b) : rej(new Error('변환 실패'))), 'image/jpeg', 0.9); }; im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('그림 파일을 읽을 수 없습니다')); }; im.src = u; });
  api.setFrame = async (i, file) => { try { const b = await shrink(file); await store.put('kv', 'frame:' + i, b); await show(i, b); toast('액자에 그림을 넣었습니다'); } catch (e) { toast(e.message || '그림을 넣지 못했습니다'); } };
  api.clearFrame = async (i) => { await store.del('kv', 'frame:' + i).catch(() => {}); ctx.frames[i].userData.setImage(null); };
  api.clearFrames = async () => { for (let i = 0; i < ctx.frames.length; i++) await api.clearFrame(i); toast('액자를 처음 그림으로 되돌렸습니다'); };
  api.pickFrame = (i) => { pending = i; fileInput.value = ''; if (document.pointerLockElement) document.exitPointerLock(); fileInput.click(); };
  fileInput.addEventListener('change', () => { const f = fileInput.files?.[0]; if (f && pending >= 0) api.setFrame(pending, f); });
  api.framesReady = Promise.all(ctx.frames.map(async (_, i) => { try { const b = await store.get('kv', 'frame:' + i); if (b) await show(i, b); } catch { /* 저장된 그림 없음 */ } }));
  return api;
}
