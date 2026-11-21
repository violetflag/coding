// 난롯가의 컨셉 기능 (기획서 9.6): 책장에 꽂히는 내 책, 장작 타이머, 줄어드는 촛불, 식어 가는 차,
// 잠들기 모드, 인용구 카드, 앉아 있던 자리 기억. (책의 나이는 reader, 날씨 선택은 environment, 낭독은 reader가 맡는다)
import * as THREE from 'three/webgpu';
import * as store from './reader/store.js';
import { drawCover } from './reader/page.js';
import { FIREPLACE as FP } from './scene/layout.js';

const CANDLE_HOURS = 4, TEA_MINUTES = 18, SESSION = 'nanro.session', CANDLES = 'nanro.candles';
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 무시 */ } };

export function setupCozy({ scene, camera, ctx, player, fire, reading, prefs, toast, sfx, mixer, music, setLamp, env }) {
  const api = {}, reader = reading.reader;

  // ================= 1. 서재 책장 = 내 라이브러리 =================
  const shelf = ctx.libraryShelf, lib = new THREE.Group(); scene.add(lib);
  let spines = [];
  const spineTex = (b, w, h) => {
    const cv = document.createElement('canvas'); cv.width = 96; cv.height = 512; const c = cv.getContext('2d');
    c.fillStyle = b.color || '#5b2a22'; c.fillRect(0, 0, 96, 512);
    const g = c.createLinearGradient(0, 0, 96, 0); g.addColorStop(0, 'rgba(0,0,0,.35)'); g.addColorStop(0.3, 'rgba(255,255,255,.06)'); g.addColorStop(1, 'rgba(0,0,0,.3)'); c.fillStyle = g; c.fillRect(0, 0, 96, 512);
    c.fillStyle = '#d8b25a'; for (const y of [26, 34, 470, 478]) c.fillRect(8, y, 80, 3);
    // 제목은 책등을 따라 세로로 (위에서 아래로 읽는다)
    c.save(); c.translate(48, 256); c.rotate(Math.PI / 2); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#e6c878';
    let size = 46; c.font = `700 ${size}px "Noto Serif KR", "Batang", serif`; const t = b.title.length > 26 ? b.title.slice(0, 25) + '…' : b.title;
    while (c.measureText(t).width > 400 && size > 18) { size -= 2; c.font = `700 ${size}px "Noto Serif KR", "Batang", serif`; }
    c.fillText(t, 0, 2); c.restore();
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; return tex;
  };
  const paperMat = new THREE.MeshStandardMaterial({ color: 0xd8cdb4, roughness: 0.95 });
  function rebuildShelf(library) {
    for (const s of spines) { lib.remove(s.mesh); s.mesh.material.forEach((m) => { m.map?.dispose(); m !== paperMat && m.dispose(); }); s.mesh.geometry.dispose(); }
    ctx.interact = ctx.interact.filter((i) => !i.libBook); spines = [];
    let z = shelf.z0 + 0.01;
    for (const b of library) {
      const hsh = [...b.id].reduce((a, ch) => (a * 33 + ch.charCodeAt(0)) >>> 0, 7), t = 0.026 + (Math.min(b.size || 4e5, 3e6) / 3e6) * 0.024 + (hsh % 5) * 0.001, h = Math.min(shelf.height - 0.02, 0.2 + (hsh % 7) * 0.008), d = 0.15;
      if (z + t > shelf.z1 - 0.01) break;
      const cover = new THREE.MeshStandardMaterial({ color: b.color || '#5b2a22', roughness: 0.7 }), spine = new THREE.MeshStandardMaterial({ map: spineTex(b), roughness: 0.6, metalness: 0.15 });
      // 상자 면 순서: +x(책등), -x(배), +y, -y, +z, -z
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(d, h, t), [spine, paperMat, paperMat, paperMat, cover, cover]);
      mesh.position.set(shelf.x - d / 2, shelf.y + h / 2, z + t / 2); mesh.castShadow = true; mesh.receiveShadow = true; lib.add(mesh);
      const it = { id: 'libbook:' + b.id, label: `꺼내기: ${b.title.length > 22 ? b.title.slice(0, 21) + '…' : b.title}`, pos: [shelf.x, shelf.y + h / 2, z + t / 2], radius: Math.max(0.03, t * 0.9), libBook: b.id };
      ctx.interact.push(it); spines.push({ id: b.id, mesh, baseX: mesh.position.x, it }); z += t + 0.0015;
    }
    markPicked(reading.picked());
  }
  // 고른 책은 살짝 튀어나와 있다
  function markPicked(id) { for (const s of spines) s.mesh.position.x = s.baseX + (s.id === id ? 0.035 : 0); updateHeld(); }
  // 들고 다니는 책: 꺼낸 책이 화면 오른쪽 아래에 보인다
  scene.add(camera);
  const heldCv = document.createElement('canvas'); heldCv.width = 256; heldCv.height = 384; const heldTex = new THREE.CanvasTexture(heldCv); heldTex.colorSpace = THREE.SRGBColorSpace;
  const heldCover = new THREE.MeshStandardMaterial({ map: heldTex, roughness: 0.7 }), heldSide = new THREE.MeshStandardMaterial({ color: 0x5b2a22, roughness: 0.7 });
  const held = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.21, 0.028), [paperMat, heldSide, paperMat, paperMat, heldCover, heldSide]);
  held.position.set(0.2, -0.2, -0.42); held.rotation.set(-0.5, -0.45, 0.12); held.visible = false; camera.add(held);
  const heldLight = new THREE.PointLight(0xffc890, 0.12, 0.8, 2); heldLight.position.set(0.1, -0.05, -0.2); camera.add(heldLight);
  let heldId = null;
  async function updateHeld() {
    const id = reading.picked(), b = reader.library.find((x) => x.id === id);
    if (!b) { heldId = null; return; }
    if (heldId === id) return; heldId = id; heldSide.color.set(b.color || '#5b2a22');
    let bm = null; if (b.cover) { try { bm = await createImageBitmap(await (await fetch(b.cover)).blob()); } catch { /* 표지 없음 */ } }
    drawCover(heldCv, b, b.color, bm); heldTex.needsUpdate = true;
  }
  reading.onLibrary = rebuildShelf; reading.onPicked = (id) => { markPicked(id); if (id) sfx('book'); };
  reader.ready.then(() => rebuildShelf(reader.library));

  // ================= 2. 장작 타이머 =================
  const hearth = (api.hearth = { log: null, sleepT: null, base: 0.62, dim: 0 });
  const setFire = (v) => { if (fire) fire.target = v; api.firePower = v; };
  api.firePower = 0.62;
  hearth.startLog = () => {
    fire?.addLog(); sfx('log'); hearth.log = { total: prefs.logMinutes * 60, left: prefs.logMinutes * 60, warned: false };
    if (hearth.sleepT == null) setFire(0.72);
    store.addStat({ logs: 1 }).then((d) => toast(`장작을 넣었습니다 · ${prefs.logMinutes}분 타이머 · 오늘 장작 ${d.logs}개`)).catch(() => toast('장작을 넣었습니다'));
  };
  hearth.stopLog = () => { hearth.log = null; if (hearth.sleepT == null) setFire(hearth.base); toast('장작 타이머를 껐습니다'); };
  hearth.status = () => {
    const f = (s) => `${Math.floor(s / 60)}분 ${String(Math.floor(s % 60)).padStart(2, '0')}초`;
    return (hearth.log ? `장작이 타는 중: ${f(hearth.log.left)} 남음` : '장작 타이머가 꺼져 있습니다') + (hearth.sleepT != null ? ` · 잠들기까지 ${f(hearth.sleepT.left)}` : '');
  };
  // ================= 5. 잠들기 모드 =================
  const veil = document.createElement('div'); veil.style.cssText = 'position:fixed;inset:0;z-index:2;background:#000;opacity:0;pointer-events:none;transition:opacity 1s'; document.body.appendChild(veil);
  hearth.sleep = (minutes) => {
    if (!minutes) { if (hearth.sleepT == null) return; hearth.sleepT = null; hearth.dim = 0; veil.style.opacity = 0; mixer.setScale(1, 1.5); music.fade = 1; music.applyVolume(); setFire(hearth.log ? 0.72 : hearth.base); toast('잠들기 모드를 껐습니다'); return; }
    hearth.sleepT = { total: minutes * 60, left: minutes * 60 }; toast(`잠들기 모드: ${minutes}분에 걸쳐 불과 소리가 잦아듭니다`);
  };

  // ================= 3. 촛불의 흐름 =================
  const cs = load(CANDLES, {});
  ctx.candles.forEach((c, i) => { const s = cs[i]; if (s) c.userData.set(s.frac, false); });
  let candleSave = 0;
  api.toggleCandle = (c) => {
    const st = c.userData.state;
    if (st.frac <= 0.07) { c.userData.set(1, false); toast('새 초로 바꿨습니다'); sfx('click'); }
    else { c.userData.set(st.frac, !st.lit); sfx(st.lit ? 'match' : 'blow'); }
    saveCandles();
  };
  const saveCandles = () => save(CANDLES, Object.fromEntries(ctx.candles.map((c, i) => [i, { frac: +c.userData.state.frac.toFixed(4) }])));
  const candleLabel = (c) => { const st = c.userData.state; return st.frac <= 0.07 ? '새 초로 바꾸기' : st.lit ? `촛불 끄기 (남은 초 ${Math.round(st.frac * 100)}%)` : '촛불 켜기'; };

  // ================= 4. 식어 가는 차 한 잔 =================
  const tea = (api.tea = { temp: 1, level: 1 }); Object.assign(tea, load('nanro.tea', {}));
  const steamTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,.5)'); g.addColorStop(0.5, 'rgba(255,255,255,.18)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const mkSteam = (n, base, spread) => { const arr = []; for (let i = 0; i < n; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: steamTex, transparent: true, depthWrite: false, opacity: 0, color: 0xfff0dc })); m.userData = { ph: i / n, sx: (i * 0.618) % 1 }; scene.add(m); arr.push(m); } return { arr, base, spread }; };
  const mugPos = ctx.mug.position, steam = mkSteam(6, new THREE.Vector3(mugPos.x, mugPos.y + 0.085, mugPos.z), 0.02);
  const kp = ctx.kettle.position, sp = ctx.kettle.userData.spout.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), ctx.kettle.rotation.y), kSteam = mkSteam(5, new THREE.Vector3(kp.x + sp.x, kp.y + sp.y, kp.z + sp.z), 0.03);
  const animSteam = (S, t, amount, rise) => { for (const m of S.arr) { const u = (t * 0.22 + m.userData.ph) % 1; m.position.set(S.base.x + Math.sin(t * 0.9 + m.userData.sx * 9) * S.spread * (0.4 + u), S.base.y + u * rise, S.base.z + Math.cos(t * 0.7 + m.userData.sx * 7) * S.spread * (0.4 + u)); const s = 0.03 + u * 0.07; m.scale.set(s, s * 1.4, 1); m.quaternion.copy(camera.quaternion); m.material.opacity = amount * Math.sin(Math.PI * u) * 0.55; m.visible = amount > 0.01; } };
  api.sip = () => {
    if (tea.level <= 0.05) return toast('잔이 비었습니다. 벽난로 옆 주전자에서 채우세요');
    tea.level = Math.max(0, tea.level - 0.2); sfx('sip'); ctx.mug.userData.tea.position.y = 0.02 + 0.058 * tea.level; ctx.mug.userData.tea.visible = tea.level > 0.05;
    toast(tea.temp > 0.55 ? '따뜻한 차를 한 모금 마셨습니다' : tea.temp > 0.2 ? '미지근한 차를 마셨습니다' : '식은 차를 마셨습니다'); save('nanro.tea', tea);
  };
  api.refill = () => { tea.temp = 1; tea.level = 1; ctx.mug.userData.tea.position.y = 0.078; ctx.mug.userData.tea.visible = true; sfx('pour'); setTimeout(() => sfx('clink'), 1500); toast('뜨거운 차를 잔에 채웠습니다'); save('nanro.tea', tea); };
  ctx.mug.userData.tea.position.y = 0.02 + 0.058 * tea.level; ctx.mug.userData.tea.visible = tea.level > 0.05;

  // 상호작용 이름을 상태에 맞게 바꾼다
  const refreshLabels = () => {
    for (const it of ctx.interact) {
      if (it.candle) it.label = candleLabel(it.candle);
      else if (it.id === 'mug') it.label = tea.level <= 0.05 ? '빈 잔' : `차 마시기 (${tea.temp > 0.55 ? '따뜻함' : tea.temp > 0.2 ? '미지근함' : '식음'})`;
      else if (it.id === 'kettle') it.label = '차 채우기';
      else if (it.id === 'woodpile') it.label = hearth.log ? `장작 넣기 (${Math.ceil(hearth.log.left / 60)}분 남음)` : `장작 넣기 (${prefs.logMinutes}분 타이머)`;
    }
  };

  // ================= 7. 인용구 카드 =================
  // 지금 화면을 찍어 흐리게 깔고, 그 위에 종이 카드로 문장을 얹어 PNG로 저장한다.
  api.quoteCard = (text, meta) => { if (!text) return; ctx.captureNext = (shot) => {
    const W = 1600, H = 900, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
    c.fillStyle = '#120b07'; c.fillRect(0, 0, W, H);
    if (shot) { c.filter = 'blur(7px) brightness(.75) saturate(1.1)'; c.drawImage(shot, -30, -30, W + 60, H + 60); c.filter = 'none'; }
    const vg = c.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.9); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.6)'); c.fillStyle = vg; c.fillRect(0, 0, W, H);
    // 촛불빛 얼룩
    const cg = c.createRadialGradient(W * 0.82, H * 0.2, 0, W * 0.82, H * 0.2, 420); cg.addColorStop(0, 'rgba(255,170,80,.35)'); cg.addColorStop(1, 'rgba(255,170,80,0)'); c.fillStyle = cg; c.fillRect(0, 0, W, H);
    // 종이 카드
    const font = '"Noto Serif KR", "Nanum Myeongjo", "Batang", serif', cw = 1000; let size = text.length > 220 ? 30 : text.length > 110 ? 36 : 44, lines;
    const wrap = () => { c.font = `${size}px ${font}`; lines = []; let line = ''; for (const ch of text) { if (c.measureText(line + ch).width > cw - 150) { let cut = line.length; if (!/[\s가-힣]/.test(ch)) { const k = line.lastIndexOf(' '); if (k > line.length * 0.5) cut = k + 1; } lines.push(line.slice(0, cut).trimEnd()); line = line.slice(cut) + ch; } else line += ch; } lines.push(line); };
    wrap(); while (lines.length * size * 1.75 > 520 && size > 22) { size -= 2; wrap(); }
    const ch = lines.length * size * 1.75 + 190, x0 = (W - cw) / 2, y0 = (H - ch) / 2;
    c.save(); c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 40; c.shadowOffsetY = 14; c.fillStyle = '#eadfc6'; c.fillRect(x0, y0, cw, ch); c.restore();
    const pg = c.createLinearGradient(x0, y0, x0 + cw, y0 + ch); pg.addColorStop(0, 'rgba(255,200,120,.16)'); pg.addColorStop(1, 'rgba(90,50,10,.12)'); c.fillStyle = pg; c.fillRect(x0, y0, cw, ch);
    c.fillStyle = '#b08a4a'; c.font = `90px ${font}`; c.fillText('“', x0 + 46, y0 + 104);
    c.fillStyle = '#2a1e14'; c.font = `${size}px ${font}`; lines.forEach((l, i) => c.fillText(l, x0 + 75, y0 + 112 + i * size * 1.75));
    c.fillStyle = '#6a5238'; c.font = `24px ${font}`; c.textAlign = 'right'; c.fillText(`${meta?.title || ''}${meta?.author ? ' · ' + meta.author : ''}`, x0 + cw - 60, y0 + ch - 44); c.textAlign = 'left';
    c.fillStyle = 'rgba(233,220,198,.5)'; c.font = `20px ${font}`; c.fillText('난로', 40, H - 34);
    cv.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `인용구-${(meta?.title || '난로').slice(0, 20)}-${Date.now().toString(36)}.png`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); toast('인용구 카드를 저장했습니다'); api.lastQuote = cv; }, 'image/png');
  }; };

  // ================= 9. 서재가 기억하는 자리 =================
  let lastSession = '';
  api.saveSession = () => { const s = JSON.stringify({ chair: player.chair?.id || null, state: player.state === 'reading' ? 'reading' : player.chair ? 'seated' : 'walk', x: +player.pos.x.toFixed(2), z: +player.pos.z.toFixed(2), yaw: +player.yaw.toFixed(2) }); if (s !== lastSession) { lastSession = s; save(SESSION, JSON.parse(s)); } };
  api.session = load(SESSION, null);

  // ================= 매 프레임 =================
  let labelT = 0, t = 0;
  api.update = (dt) => {
    t += dt;
    // 장작 타이머
    const L = hearth.log;
    if (L) {
      L.left -= dt;
      if (L.left < 120 && hearth.sleepT == null) setFire(0.3 + 0.42 * Math.max(0, L.left) / 120);       // 마지막 2분은 불이 잦아든다
      if (L.left <= 0) { hearth.log = null; sfx('chime'); store.getStats().then((s) => toast(`장작이 다 탔습니다. 잠시 쉬어 가세요 · 오늘 장작 ${s[store.today()]?.logs || 0}개`)); if (hearth.sleepT == null) setFire(0.3); }
    }
    // 잠들기
    const S = hearth.sleepT;
    if (S) {
      S.left -= dt; const k = 1 - Math.max(0, S.left) / S.total, e = k * k * (3 - 2 * k);
      hearth.dim = e; setFire(Math.max(0.1, (hearth.log ? 0.72 : hearth.base) * (1 - e) + 0.1 * e)); veil.style.opacity = (e * 0.88).toFixed(3);
      mixer.setScale(1 - 0.9 * e, 2); music.fade = 1 - e; music.applyVolume();
      if (k > 0.5 && !S.lampOff) { S.lampOff = true; setLamp(false); }
      if (S.left <= 0) { hearth.sleepT = { total: 1, left: 0, lampOff: true, done: true }; if (!S.done) { reader.stopTts(); for (const c of ctx.candles) c.userData.set(c.userData.state.frac, false); } }
    }
    // 촛불: 켜져 있는 동안 실제 시간만큼 짧아진다
    for (const c of ctx.candles) { const st = c.userData.state; if (st.lit) { const f = st.frac - dt / (CANDLE_HOURS * 3600); c.userData.set(f, f > 0.07); if (f <= 0.07) toast('초가 다 탔습니다'); } c.userData.flicker(t, prefs.flicker ? 1 : 0); }
    candleSave += dt; if (candleSave > 20) { candleSave = 0; saveCandles(); save('nanro.tea', tea); api.saveSession(); }
    // 차: 식어 가며 김이 줄어든다
    tea.temp = Math.max(0, tea.temp - dt / (TEA_MINUTES * 60));
    animSteam(steam, t, tea.level > 0.05 ? Math.max(0, tea.temp - 0.15) / 0.85 : 0, 0.16);
    const boil = Math.max(0, Math.min(1, ((fire ? fire.power : api.firePower) - 0.3) / 0.3)); api.kettleBoil = boil; animSteam(kSteam, t * 1.3, boil * 0.8, 0.22);
    // 들고 있는 책
    held.visible = !!heldId && player.state !== 'reading' && !!reader.library.find((b) => b.id === heldId);
    held.position.y = -0.2 + (player.state === 'walk' ? Math.sin(player.bob) * 0.004 : 0);
    labelT -= dt; if (labelT <= 0) { labelT = 0.5; refreshLabels(); }
  };
  refreshLabels();
  return api;
}
