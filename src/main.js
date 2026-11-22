// 난로 — 진입점.
// 방은 three.js WebGPURenderer로, 불은 별도 WebGPU 캔버스(src/fire/fireLayer.js)로 그린다.
import * as THREE from 'three/webgpu';
import { ROOM, FIREPLACE as FP, LAMP, CHAIRS, RUG } from './scene/layout.js';
import { buildRoom } from './scene/room.js';
import { resolveCoplanar } from './scene/coplanar.js';
import { applyPhotoTextures } from './scene/textures.js';
import { Environment } from './scene/environment.js';
import { Player } from './player/player.js';
import { FireLayer } from './fire/fireLayer.js';
import { Mixer } from './audio/mixer.js';
import { FireSound } from './audio/fireSound.js';
import { Sfx, Ambient } from './audio/sfx.js';
import { Music } from './audio/music.js';
import { loadFireConfig, applyUrl, toQuality, FIRE_PRESETS } from './ui/fireConfig.js';
import { Settings } from './ui/settings.js';
import { buildSections, loadPrefs } from './ui/sections.js';
import { setupReading } from './reading.js';
import { setupCozy } from './cozy.js';
import { setupArrange } from './scene/arrange.js';
import { setupPost } from './scene/post.js';
import { setupDesktop, quitButton, watchOpened, syncLibraryFolder, libraryFolderPanel, setupMoveIn } from './desktop.js';
import { bringBackup } from './reader/ui.js';
import * as store from './reader/store.js';

const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const roomCanvas = $('room'), fireCanvas = $('fire');
// 헤드리스 테스트 환경은 WebGPU 캔버스에 그리면 장치가 죽는다: 화면 출력은 건너뛰고 NANRO.capture()로만 읽는다.
const HEADLESS = Q.has('headless');
const LAMP_ON = 4.0;
// 켜는 동안 단계마다 걸린 시간(페이지가 열린 뒤 몇 ms 인지). 측정용으로 NANRO.marks 에서 읽는다.
const marks = {}, mark = (k) => { marks[k] = Math.round(performance.now()); };

async function main() {
  setupDesktop();
  const renderer = new THREE.WebGPURenderer({ canvas: roomCanvas, antialias: !Q.has('nomsaa'), alpha: true, forceWebGL: Q.has('webgl') });
  mark('start'); await renderer.init(); mark('rendererInit');
  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = !Q.has('noshadow');   // 측정용 주소 옵션: noshadow, nomsaa, nocandle, rs=배율 renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 60);
  const ctx = { colliders: [], interact: [], animated: [] };
  scene.add(buildRoom(ctx));
  const prefs = loadPrefs();

  // ---- 조명: 불빛(그림자), 불빛의 반사광, 스탠드. 해·달·하늘빛은 Environment가 맡는다.
  // 불빛의 세기는 불 레이어의 실제 광량 신호를 따른다.
  const fireLight = new THREE.PointLight(0xff8a3c, 0, 9, 1.6);
  fireLight.position.set(FP.faceX - 0.12, FP.hearthH + 0.3, FP.zc); fireLight.castShadow = true;
  fireLight.shadow.mapSize.set(1024, 1024); fireLight.shadow.bias = -0.004; fireLight.shadow.radius = 4;
  fireLight.shadow.autoUpdate = false; fireLight.shadow.needsUpdate = true;   // 불빛 그림자는 매 프레임이 아니라 초당 10번쯤만 다시 그린다(방 안은 거의 움직이지 않는다)
  scene.add(fireLight);
  // 불빛이 벽과 천장에 반사되어 방 전체에 퍼지는 빛(그림자 없음): 벽난로 그늘에 가린 쪽이 새까맣게 되지 않게 한다
  const bounce = new THREE.PointLight(0xff9a55, 0, 12, 1.2); bounce.position.set(ROOM.W / 2 + 0.3, 1.9, ROOM.D / 2 + 0.2); scene.add(bounce);
  const lamp = new THREE.PointLight(0xffc98a, LAMP_ON, 7, 1.8); lamp.position.set(LAMP.x, LAMP.h + 0.05, LAMP.z); scene.add(lamp);
  // 스탠드도 그림자를 드리운다. 움직이지 않는 빛이라 그림자는 가구나 스탠드를 옮겼을 때만 다시 그린다.
  lamp.castShadow = !Q.has('nolampshadow'); lamp.shadow.mapSize.set(1024, 1024); lamp.shadow.bias = -0.004; lamp.shadow.radius = 6; lamp.shadow.autoUpdate = false; lamp.shadow.needsUpdate = true;
  // 방의 반사와 간접광: 방 한가운데서 여섯 방향을 찍어 환경 맵으로 쓴다(금속과 가죽, 마룻바닥의 윤기). 조명이 바뀔 때만 다시 찍는다.
  const cubeRT = new THREE.CubeRenderTarget(128, { type: THREE.HalfFloatType }), cubeCam = new THREE.CubeCamera(0.1, 30, cubeRT); cubeCam.position.set(ROOM.W / 2 - 0.2, 1.25, ROOM.D / 2);
  let envDue = 0.5; const ENV_I = Q.has('noenv') ? 0 : 0.55;
  const refreshEnv = () => { if (!ENV_I) return; lamp.shadow.needsUpdate = true; scene.environment = null; cubeCam.update(renderer, scene); scene.environment = cubeRT.texture; };
  ctx.refreshEnv = (delay = 0.3) => { envDue = Math.max(0.05, delay); };
  const env = new Environment(scene, ctx, renderer, { url: Q });
  // 같은 평면에 겹친 면(창틀과 창살이 만나는 곳 등)은 깜빡이므로 작은 쪽을 1mm 내민다. 주소 옵션 nocoplanar 로 끈다(비교용).
  if (!Q.has('nocoplanar')) resolveCoplanar(scene);
  env.recompute();
  if (!HEADLESS) env.locate();
  // ambientCG 사진 텍스처를 읽어 코드로 그린 임시 텍스처와 바꾼다 (없으면 그대로 둔다)
  const texturesReady = Q.has('notex') ? Promise.resolve(0) : applyPhotoTextures(ctx.materials, { scene, onGround: (t) => env.setGroundTextures(t) }).catch((e) => { console.warn('사진 텍스처를 읽지 못했습니다', e); return 0; });

  // ---- 불 레이어
  const fireCfg = applyUrl(loadFireConfig(), Q);
  let fire = null, fireErr = '';
  if (!Q.has('nofire')) {
    try { fire = await FireLayer.create(fireCanvas, { q: toQuality(fireCfg.values), name: fireCfg.custom || fireCfg.fromUrl ? '사용자 지정' : FIRE_PRESETS[fireCfg.preset].name, debug: { nosim: Q.has('nosim'), norender: Q.has('norender'), nowarm: HEADLESS || Q.has('nowarm') } }); }
    catch (e) { fireErr = e.message || String(e); console.warn('[fire] 물리 불꽃을 쓸 수 없어 대체 표시로 전환:', e); }
  }
  mark('fireCreated');
  const brickReady = fire && !Q.has('notex') ? fire.loadBrick() : Promise.resolve(false);
  if (!fire) { ctx.fireHole.visible = false; ctx.fireboxFallback.visible = true; fireCanvas.style.display = 'none'; }

  // ---- 소리 (첫 클릭에서 켠다)
  const mixer = new Mixer(), music = new Music(mixer);
  let fireSound = null, sfxEngine = null, ambient = null, settings = null, cozy = null;
  const sfx = (name, opt) => sfxEngine?.play(name, opt);
  mixer.onChange = () => music.applyVolume();
  const startSound = async () => {
    if (mixer.ctx || Q.has('mute')) return mixer.ctx?.resume().catch(() => {});
    try {
      mixer.start(); sfxEngine = new Sfx(mixer); ambient = new Ambient(mixer, sfxEngine.noise);
      if (music.state.auto && music.state.url) music.play();
      fireSound = await FireSound.create(mixer, fire);
    } catch (e) { console.warn('소리를 켤 수 없습니다', e); }
  };

  // ---- 플레이어와 상호작용
  const toast = (msg) => { const t = $('toast'); if (!msg) { clearTimeout(toast.h); t.style.opacity = 0; return; } t.textContent = msg; t.style.opacity = 1; clearTimeout(toast.h); toast.h = setTimeout(() => (t.style.opacity = 0), 2600); };
  let lampOn = true, fitSoon = () => {}, stateT = 0, showHint = null, syncSoon = null;
  const setLamp = (on) => { ctx.refreshEnv?.(0.1); lampOn = on; lamp.intensity = on ? LAMP_ON : 0; ctx.lampShade.material.emissiveIntensity = on ? 1.6 : 0.02; ctx.lamp.userData.bulb.visible = on; };
  // 처음 들어왔을 때: 어두우면 스탠드와 촛불을 켜 둔다
  setLamp(env.state.day < 0.6);
  const player = new Player({
    camera, canvas: roomCanvas, ctx,
    onInteract(it) {
      if (it.id === 'lamp') { setLamp(!lampOn); sfx('click'); }
      else if (it.door) sfx(ctx.door.toggle() ? 'dooropen' : 'doorclose');
      else if (it.id === 'woodpile') { if (cozy.hearth.startLog()) fireSound?.trigger('log-shift', 0.6); }
      else if (it.id === 'poker') { fire?.stoke(); fireSound?.trigger('log-shift', 1); toast('불을 뒤적였습니다'); }
      else if (it.candle) cozy.toggleCandle(it.candle);
      else if (it.id === 'mug') cozy.sip();
      else if (it.id === 'kettle') cozy.refill();
      else if (it.libBook) reading.setPicked(it.libBook), toast('책을 꺼냈습니다. 의자에 앉아 E로 펼치세요');
      else if (it.id === 'shelf') reading.ui.open('lib');
      else if (it.frame !== undefined) arrange.pickFrame(it.frame);
    },
    onState(s) { reading.onState(s); stateT = 0; syncSoon?.(); if (s === 'seated' || s === 'reading') showHint?.(s); if (s === 'reading' || s === 'seated') fitSoon(); if (s === 'sitting') sfx('sit'); else if (s === 'standing') sfx('stand'); cozy?.saveSession(); },
  });
  const applyPrefs = () => {
    player.sens = 0.0019 * prefs.sens; player.invertY = prefs.invertY; player.sway = prefs.sway;
    if (player.baseFov !== prefs.fov) { if (player.state !== 'reading') player.fov = prefs.fov; player.baseFov = prefs.fov; }
    if (ambient) ambient.clock = prefs.clockTick;
    resetRes?.();
  };
  let resetRes = null;
  applyPrefs();

  // ---- 읽기 모드 (리더, 3D 책, 메뉴)
  const uiMode = () => player.state === 'reading' || reading.ui.isOpen || !!settings?.isOpen;
  const start = $('start'), hint = $('hint'), dot = $('dot'), prompt = $('prompt'), stats = $('stats');
  // 시작 화면은 처음 들어올 때만 보인다. 한 번 들어온 뒤에 마우스가 풀리면 화면을 가리지 않는 작은 안내만 띄운다.
  let entered = false;
  const pause = $('pause'), help = $('help');
  const syncOverlay = () => {
    const on = player.locked, ui = uiMode(); if (on || player.state === 'reading') entered = true;
    start.classList.toggle('off', entered || on || ui); pause.classList.toggle('on', entered && !on && !ui && !help.classList.contains('on')); dot.style.opacity = on ? 1 : 0;
  };
  syncSoon = syncOverlay;   // 상태가 바뀔 때마다(앉기, 책 펴기, 덮기) 안내 띠와 시작 카드를 다시 맞춘다
  // 상황에 맞는 한 줄 안내: 상태가 바뀔 때 잠깐 보이고, 상태마다 세 번까지만 보인다. H를 누르면 전체 조작법.
  const HINTS = { walk: '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 걷기 · 의자를 보고 <kbd>E</kbd> 앉기 · <kbd>H</kbd> 조작법', seated: '<kbd>E</kbd> 책 펼치기 · <kbd>Space</kbd> 일어나기', reading: '쪽을 누르거나 <kbd>←</kbd> <kbd>→</kbd> 넘기기 · 오른쪽 단추로 끌어 시선 돌리기 · <kbd>Tab</kbd> 메뉴 · <kbd>X</kbd> 책 덮기' };
  const hintSeen = (() => { try { return JSON.parse(localStorage.getItem('nanro.hints') || '{}'); } catch { return {}; } })();
  showHint = (k) => {
    if (!HINTS[k] || (hintSeen[k] | 0) >= 3 || HEADLESS) return;
    hintSeen[k] = (hintSeen[k] | 0) + 1; try { localStorage.setItem('nanro.hints', JSON.stringify(hintSeen)); } catch { /* 무시 */ }
    hint.innerHTML = HINTS[k]; hint.style.opacity = 0.9; clearTimeout(showHint.h); showHint.h = setTimeout(() => (hint.style.opacity = 0), 7000);
  };
  const toggleHelp = (on = !help.classList.contains('on')) => { help.classList.toggle('on', on); if (on && player.locked) document.exitPointerLock(); syncOverlay(); };
  help.addEventListener('click', () => toggleHelp(false));

  // 읽는 중에 옆 메뉴를 열면 책이 메뉴에 가리지 않게 화면을 왼쪽으로 민다
  const panelShift = (open) => { const w = Math.min(420, innerWidth * 0.4); if (open && player.state === 'reading' && innerWidth > 900) camera.setViewOffset(innerWidth, innerHeight, w / 2, 0, innerWidth, innerHeight); else camera.clearViewOffset(); };
  const reading = setupReading({
    scene, camera, player, canvas: roomCanvas, toast, sfx,
    onUiMode: (open) => { panelShift(open); if (open) { if (player.locked) document.exitPointerLock(); } else if (player.state !== 'reading' && !settings?.isOpen) player.lock(); syncOverlay(); },
    // 낭독 중에는 불 소리와 음악을 낮춘다 (브라우저 음성 합성에는 잔향을 직접 입힐 수 없어, 방의 소리를 낮춰 목소리가 묻히지 않게 한다)
    onTts: (on) => { if (!cozy?.hearth.sleepT) mixer.setScale(on ? 0.45 : 1); music.duck = on ? 0.35 : 1; music.applyVolume(); },
    onQuote: (text, meta) => cozy.quoteCard(text, meta),
  });
  ctx.onLampMove = (o) => { lamp.position.set(o.position.x, LAMP.h + 0.05, o.position.z); ctx.refreshEnv(0.4); };
  const arrange = setupArrange({ ctx, player, camera, canvas: roomCanvas, toast, sfx });
  cozy = setupCozy({ scene, camera, ctx, player, fire, reading, prefs, toast, sfx, mixer, music, setLamp, env });
  if (env.state.day < 0.5) for (const c of ctx.candles) if (c.userData.state.frac > 0.07) c.userData.set(c.userData.state.frac, true);

  // ---- 화면 크기와 해상도 자동 조절 (room-at-dawn 방식: 프레임이 느리면 해상도를 낮춘다)
  // 방을 그리는 크기의 상한은 설정의 그래픽 탭에서 고른다(기본 가로 1920: 4K 화면에서도 1080p와 같은 부하, 나머지는 화면이 늘려 보여 준다).
  const cap = () => Math.min(devicePixelRatio, prefs.resW === 'native' ? Infinity : (+prefs.resW || 1920) / innerWidth);
  const fireCap = () => Math.min(devicePixelRatio, 1.5, 1920 / innerWidth);   // 불은 자기 품질 설정을 따로 가진다
  let scale = cap();
  if (Q.has('rs')) scale = +Q.get('rs') || scale;
  if (Q.has('nocandle')) scene.traverse((o) => { if (o.isPointLight && o.distance === 2.6) o.visible = false; });
  const fit = () => {
    // 책을 읽는 동안은 글자가 또렷하도록 화면 해상도를 낮추지 않는다
    const pr = player.state === 'reading' ? Math.max(Math.min(scale, cap()), Math.min(devicePixelRatio, 2, 2240 / innerWidth)) : Q.has('rs') ? scale : Math.min(scale, cap());   // 읽는 동안은 또렷하게, 다만 가로 2240픽셀을 넘기지 않는다
    renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    fire?.resize(innerWidth, innerHeight, fireCap()); // 불은 구멍 영역만 그리므로 방의 해상도 조절과 무관하게 화면 픽셀 기준
  };
  addEventListener('resize', fit); fit(); fitSoon = () => fit();
  resetRes = () => { if (!Q.has('rs')) scale = cap(); fit(); };

  // ---- 시작 화면과 포인터 잠금
  // 시작 화면의 두 갈래: 곧바로 읽기(읽기 의자에 앉아 책을 펼친다)와 방 둘러보기.
  const goRead = $('goRead'), startFile = Object.assign(document.createElement('input'), { type: 'file', accept: '.epub,.pdf,.txt', multiple: true, style: 'display:none' });
  document.body.append(startFile);
  const sitAndRead = () => {
    if (player.state === 'walk') player.seatNow(CHAIRS.find((c) => c.id === (cozy.session?.chair || 'reading')) || CHAIRS[0]);
    if (player.state === 'seated') player.openBook();
    entered = true; syncOverlay();
  };
  // 시작 화면이 떠 있는 동안 넣은 책(파일 고르기든 끌어다 놓기든)은 바로 앉아서 펼친다
  const addFiles0 = reading.ui.addFiles.bind(reading.ui);
  reading.ui.addFiles = async (files) => { const added = await addFiles0(files); if (added && !entered) sitAndRead(); return added; };
  startFile.addEventListener('change', () => { const files = [...startFile.files]; startFile.value = ''; if (files.length) reading.ui.addFiles(files); });
  const labelStart = () => {
    const lib = reading.reader.library, b = lib.find((x) => x.id === reading.picked()) || lib[0];
    goRead.innerHTML = b ? `${b.percent > 0.005 ? '이어서 읽기' : '책 읽기'}<small></small>` : '책 넣고 읽기<small>EPUB · PDF · TXT 파일을 고르거나 창에 끌어다 놓으세요</small>';
    if (b) goRead.querySelector('small').textContent = `${b.title} · ${Math.round((b.percent || 0) * 100)}%`;
  };
  // 화면 준비: 미리 그리기가 끝나고 끊기지 않는 프레임이 이어질 때까지 시작 단추를 내놓지 않는다.
  // 프로그램을 켠 직후에는 그래픽 준비로 화면이 몇 초씩 멈추는데, 그동안 단추가 먼저 떠서 눌러도 반응이 없어 보이는 일을 막는다.
  let warmed = false, settleN = 0, settleT = 0, lastNow = performance.now(), settled; const gfxReady = new Promise((r) => (settled = r));
  if (HEADLESS || Q.has('nowarmup')) settled();
  reading.reader.ready.then(() => { labelStart(); $('startMsg').textContent = '불을 지피는 중…'; });
  // 윈도우 프로그램: Edge 에서 쓰던 책과 설정 옮겨 오기(서재가 비어 있을 때만 보인다), 서재 폴더, "난로로 열기"로 넘어온 책.
  const moveIn = setupMoveIn({ isEmpty: () => !reading.reader.library.length, bring: (f) => bringBackup(f, reading.ui, () => true) });
  const syncFolder = () => syncLibraryFolder({ addFile: (f) => reading.reader.addFile(f), store, toast });
  reading.ui.host.libExtra = (body, ui) => libraryFolderPanel(body, { sync: syncFolder, rerender: () => ui.renderPanel() });
  // 넘어온 책은 서재에 꽂고, 걷고 있었든 앉아 있었든 바로 앉아서 펼친다
  const openFiles = async (files) => { const added = await addFiles0(files); if (added && player.state !== 'reading') sitAndRead(); };
  Promise.all([reading.reader.ready, gfxReady]).then(() => {
    $('startMsg').hidden = true; $('startActs').hidden = false;
    watchOpened(openFiles);
    // 서재 폴더는 켤 때 한 번, 그리고 다른 창에 갔다가 돌아올 때(폴더에 책을 넣고 돌아왔을 수 있다) 다시 본다
    const look = () => syncFolder().catch((e) => console.warn('서재 폴더를 읽지 못했습니다', e));
    let looked = performance.now(); look();
    addEventListener('focus', () => { if (performance.now() - looked > 5000) { looked = performance.now(); look(); } });
  });
  const prevLib = reading.onLibrary; reading.onLibrary = (l) => { prevLib?.(l); labelStart(); moveIn(); };
  goRead.addEventListener('click', (e) => { e.stopPropagation(); startSound(); if (reading.reader.library.length) sitAndRead(); else startFile.click(); });
  $('goWalk').addEventListener('click', (e) => { e.stopPropagation(); startSound(); player.lock(); });
  $('openHelp').addEventListener('click', (e) => { e.stopPropagation(); toggleHelp(true); });
  start.addEventListener('click', () => { startSound(); player.lock(); });
  roomCanvas.addEventListener('click', () => { startSound(); if (!player.locked && !uiMode()) player.lock(); });
  addEventListener('keydown', () => startSound(), { once: true });
  addEventListener('keydown', (e) => {
    if (e.code !== 'BracketLeft' && e.code !== 'BracketRight') return;
    mixer.setVolume('master', mixer.volume('master') + (e.code === 'BracketRight' ? 0.1 : -0.1));
    toast('전체 볼륨 ' + Math.round(mixer.volume('master') * 100) + '%');
  });
  // ---- 설정창 (O 키 또는 시작 화면의 버튼)
  settings = new Settings({
    quitButton: quitButton(),
    cfg: fireCfg, fire, mixer,
    sections: buildSections({ renderSize: () => { const v = new THREE.Vector2(); renderer.getDrawingBufferSize(v); return `${v.x}×${v.y}`; }, fps: () => fpsMs ? `초당 ${(1000 / fpsMs).toFixed(0)}프레임` : '', env, music, mixer, player, prefs, applyPrefs, hearth: cozy.hearth, arrange }),
    onOpen: () => { if (player.locked) document.exitPointerLock(); syncOverlay(); },
    onClose: () => { syncOverlay(); if (player.state !== 'reading' && !reading.ui.isOpen && mixer.ctx) player.lock(); },
    getStats: () => `현재 ${(1000 / fpsMs).toFixed(0)} fps (${fpsMs.toFixed(1)} ms)` + (fire ? ` · 불 격자 ${fire.sim.res.join('×')} · 불 화면 ${fire.w}×${fire.h}` : ' · 불: 대체 표시'),
  });
  $('openSettings').addEventListener('click', (e) => { e.stopPropagation(); settings.open(); });
  const typing = (e) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
  addEventListener('keydown', (e) => { if (e.code === 'KeyO' && !e.repeat && !typing(e)) settings.toggle(); });
  document.addEventListener('pointerlockerror', () => syncOverlay());   // 마우스 잡기가 거부돼도 멈춤 띠는 떠야 한다
  document.addEventListener('pointerlockchange', () => {
    const on = player.locked; syncOverlay();
    if (on && player.state === 'walk') showHint('walk');
  });
  addEventListener('keydown', (e) => { if (typing(e)) return; if (e.code === 'KeyH' && !e.repeat) toggleHelp(); else if (e.code === 'Escape' && help.classList.contains('on')) toggleHelp(false); });
  let showStats = Q.has('stats');
  addEventListener('keydown', (e) => { if (e.code === 'F3') { e.preventDefault(); showStats = !showStats; stats.textContent = ''; } });
  addEventListener('beforeunload', () => { cozy.saveSession(); reading.reader.flush(); });

  // ---- 서재가 기억하는 자리: 앉아 있던 의자에서 다시 시작한다. 책은 시작 화면의 "이어서 읽기"를 눌렀을 때 펼친다(시작 카드 뒤에서 혼자 펴지지 않게).
  const ses = cozy.session, wantSeat = prefs.startSeated || (ses && ses.state !== 'walk');
  if (!Q.has('fresh') && !HEADLESS) {
    if (wantSeat) {
      const chair = CHAIRS.find((c) => c.id === (ses?.chair || 'reading')) || CHAIRS[0]; player.seatNow(chair);
    } else if (ses?.state === 'walk' && ses.x) { if (!player.blocked(ses.x, ses.z)) { player.pos.x = ses.x; player.pos.z = ses.z; player.yaw = ses.yaw; } }
  }

  // ---- 루프
  const clock = new THREE.Timer();
  let acc = 0, frames = 0, lastFit = 0, fpsMs = 16.7, fbT = 0, prevCam = new THREE.Vector3(), level = 1, stepPhase = 0, skip = false, elapsed = 0;
  const clockPos = new THREE.Vector3(ctx.clock.position.x, ctx.clock.position.y, ctx.clock.position.z), kettlePos = ctx.kettle.position;
  const shot = document.createElement('canvas');
  const REC_HZ = 30, REC_N = (Q.has('rec') ? +Q.get('rec') || 5 : 60) * REC_HZ, rec = { buf: new Float32Array(REC_N), n: 0, acc: 0, on: false, i: 0, dir: 1, t: 0 };  // 불빛 기록(기본 60초)
  ctx.fireRec = rec;
  const post = Q.has('nopost') ? null : setupPost(renderer, scene, camera);
  texturesReady.then(() => ctx.refreshEnv(0.2));
  // 미리 준비: 시작 화면 뒤에서, 아직 한 번도 화면에 나오지 않은 물체(등 뒤의 가구, 책, 넘기는 책장, 무릎)까지 한 프레임 그려 둔다.
  // 그리기 준비(셰이더 조립)는 물체가 처음 보일 때 일어나서, 그대로 두면 책장을 처음 넘기거나 처음 고개를 돌릴 때 한 번 끊긴다.
  let warmT = HEADLESS || Q.has('nowarmup') ? 0 : -1;
  // 그래픽 장치가 끊기면 그리기가 매 프레임 실패한다. 다섯 번 이어서 실패하면 방 그리기를 멈춰 같은 오류가 끝없이 쌓이지 않게 한다.
  let drawFails = 0, lostHits = 0;
  const stopDrawing = (e) => { drawFails = 5; console.error('방 그리기를 멈춥니다(그래픽 장치가 끊긴 것으로 보입니다)', e); $('toast').textContent = '그래픽 장치가 끊겼습니다. 난로를 다시 켜 주세요.'; $('toast').style.opacity = 1; };
  const draw = () => {
    if (drawFails >= 5) return;
    try { if (post && prefs.post) post.render(); else renderer.render(scene, camera); drawFails = 0; }
    catch (e) { if (++drawFails >= 5) stopDrawing(e); }
  };
  // 장치가 끊긴 것을 알림 없이 "거절된 약속"으로만 알게 되는 경우도 있다(매 프레임 수백 번씩 쌓인다).
  addEventListener('unhandledrejection', (e) => { if (drawFails < 5 && /Instance dropped|device (is|was) lost/i.test(String(e.reason?.message || e.reason)) && ++lostHits >= 20) stopDrawing(e.reason); });
  // 숨은 물체를 잠깐 보이게 하고 시야 밖 물체도 빼지 않게 한다. 돌려주는 함수를 부르면 원래대로 돌아간다.
  const showAll = () => {
    const undo = [], b3 = reading.reader.book3d;
    for (const o of [b3.group, b3.flipF, b3.flipB, reading.lap]) if (o && !o.visible) { o.visible = true; undo.push(() => (o.visible = false)); }
    scene.traverse((o) => { if (o.isMesh && o.frustumCulled) { o.frustumCulled = false; undo.push(() => (o.frustumCulled = true)); } });
    return () => { for (const f of undo) f(); };
  };
  const warmUp = () => { const undo = showAll(); try { draw(); } finally { undo(); fireLight.shadow.needsUpdate = true; } };
  // 그리기 준비를 방을 처음 그리기 전에, 여러 개를 동시에 해 둔다(켜는 시간 줄이기).
  // 그냥 그리기 시작하면 준비가 물체마다 하나씩 차례로 일어나 화면이 몇 초씩 멈춘다. 그것도 사진 텍스처가 오기 전과 온 뒤에 두 번이다.
  // 그래서 사진 텍스처가 다 올 때까지 방은 그리지 않고, 환경 맵용과 화면용 준비를 한꺼번에 맡긴 뒤에 그리기 시작한다. 그동안 화면에는 불만 보인다.
  let roomReady = HEADLESS || Q.has('nowarmup');
  const prewarm = async () => {
    mark('textures');
    const undo = showAll();
    try {
      if (ENV_I) {
        const rt = renderer.getRenderTarget(), e0 = scene.environment; cubeCam.updateMatrixWorld();
        scene.environment = null; renderer.setRenderTarget(cubeRT, 0);
        try { await renderer.compileAsync(scene, cubeCam.children[0]); } finally { renderer.setRenderTarget(rt); scene.environment = e0; }
        mark('envCompiled'); refreshEnv(); envDue = 0; mark('envDrawn');
      }
      if (post && prefs.post) await post.sp.compileAsync(renderer); else await renderer.compileAsync(scene, camera);
      mark('roomCompiled');
    } finally { undo(); }
  };
  if (!roomReady) texturesReady.then(() => Promise.race([prewarm(), new Promise((r) => setTimeout(r, 20000))])).catch((e) => console.warn('그리기 준비를 미리 마치지 못했습니다', e)).then(() => { roomReady = true; warmT = 0.3; mark('roomReady'); });
  let envAge = 0, envDay = -1, shT = 0, viewSig = 0, stillT = 0, idleN = 0, mouseHeld = false;
  addEventListener('pointerdown', () => (mouseHeld = true), true); for (const k of ['pointerup', 'pointercancel', 'blur']) addEventListener(k, () => (mouseHeld = false), true); // 끌어서 밑줄을 긋는 동안은 매 프레임 그린다
  let capT = 0;
  const frame = () => {
    if (window.NANRO_AI?.current) return;   // 메모 그림 창(src/ai)이 화면을 다 덮는 동안은 방을 그리지 않는다(GPU 절약)
    // 프레임 제한(설정의 그래픽 탭): 정한 간격이 지나지 않았으면 이번 화면 갱신은 건너뛴다(시간은 다음 프레임에 몰아서 흐른다)
    if (prefs.fpsCap > 0) { const t = performance.now(), ms = 1000 / prefs.fpsCap; if (t - capT < ms - 2) return; capT = Math.max(capT + ms, t - ms); }
    clock.update(); const dt = Math.min(0.05, clock.getDelta()); elapsed += dt;
    const now = performance.now(), gap = now - lastNow; lastNow = now;
    if (warmed && settleN >= 0) { settleT += gap; settleN = gap < 50 ? settleN + 1 : 0; if (settleN >= 30 || settleT > 15000) { settleN = -1; mark('settled'); settled(); } }
    player.update(dt);
    window.__nanroFrames = (window.__nanroFrames | 0) + 1;
    for (const fn of ctx.animated) fn(elapsed);
    { const out = (ctx.door?.t || 0) > 0 || (ctx.outsideAt?.(player.pos.x, player.pos.z) || 0) > 0; if (out !== env.outdoorView) env.setOutdoorView((env.outdoorView = out)); }
    env.update(dt, elapsed); ctx.clock.userData.tick(new Date());                // 선반 시계는 방의 시각 설정과 상관없이 항상 컴퓨터 시계를 따른다
    cozy.update(dt); arrange.update(dt);

    // 불빛 신호 → 방 조명. 물리 불이 없으면 느린 잡음으로 대신한다(대체 표시).
    // 불빛 측정값이 아직 없거나 끊기면(읽어오기 지연) 같은 잡음으로 이어 간다.
    fbT += dt;
    const synth = 1 + 0.12 * Math.sin(fbT * 12.6) * Math.sin(fbT * 3.1) + 0.08 * Math.sin(fbT * 7.3 + 1.3);
    let power = cozy.firePower, target = synth;
    if (fire) {
      fire.moving = prevCam.distanceToSquared(camera.position) > 1e-8 || player.tween !== null;
      // 책을 읽는 동안: 불빛을 1분쯤 기록해 두었다가, 불이 화면에 없으면 계산을 멈추고 기록한 불빛을 되풀이한다.
      const canReplay = prefs.fireReplay && player.state === 'reading' && !player.tween && !HEADLESS && rec.n >= REC_N && !fire.visibleFrom(camera);
      if (canReplay) {
        if (!rec.on) { rec.on = true; rec.i = rec.n - 1; rec.dir = -1; rec.t = 0; fireCanvas.style.visibility = 'hidden'; fire.hidden = true; }
        // 끝에서 되돌아오는 왕복 재생이라 이음매가 없다
        rec.t += dt * REC_HZ; while (rec.t >= 1) { rec.t -= 1; rec.i += rec.dir; if (rec.i <= 0 || rec.i >= rec.n - 1) rec.dir = -rec.dir; }
        const i0 = Math.max(0, Math.min(rec.n - 1, rec.i)), i1 = Math.max(0, Math.min(rec.n - 1, rec.i + rec.dir));
        target = rec.buf[i0] + (rec.buf[i1] - rec.buf[i0]) * rec.t; power = fire.power;
      } else {
        rec.on = false; fire.wantLight = prefs.fireReplay && player.state === 'reading' && rec.n < REC_N;
        fire.update(dt, camera, !HEADLESS);
        power = fire.power;
        if (fire.light.ref > 0 && performance.now() - fire.light.at < 500) {
          target = fire.light.level;
          rec.acc += dt * REC_HZ; while (rec.acc >= 1) { rec.acc -= 1; if (rec.n < REC_N) rec.buf[rec.n++] = target; else { rec.buf.copyWithin(0, 1); rec.buf[REC_N - 1] = target; } }
        }
      }
    } else ctx.emberMat.emissiveIntensity = 0.05 + 0.4 * power;
    if (!prefs.flicker) target = 1;                                       // 접근성: 불빛 흔들림 끄기
    level += (target - level) * (1 - Math.exp(-dt * 30));
    const camFire = fire ? fire.camPos(camera) : [camera.position.z - FP.fire.z, camera.position.y - FP.fire.y, FP.fire.x - camera.position.x];
    fireSound?.update(power, level, camFire);
    prevCam.copy(camera.position);
    const lv = Math.max(0.3, Math.min(1.8, level));
    fireLight.intensity = 9 * power * lv;
    // 불빛의 위치는 고정한다: 그림자를 초당 10번만 다시 그리므로, 빛이 그 사이에 움직이면 창틀 같은 가는 물체의 그림자가 깜박인다
    // 그림자 갱신: 평소 초당 10번, 책장을 넘기거나 가구를 옮기는 동안은 초당 30번. 설정에서 그림자를 끄면 드리우지 않는다.
    const shOn = prefs.shadows !== false && !Q.has('noshadow'); if (fireLight.castShadow !== shOn) { fireLight.castShadow = shOn; lamp.castShadow = shOn && !Q.has('nolampshadow'); }
    const busy = arrange.held || player.tween || (player.state === 'reading' && reading.reader.book3d.flipping);
    if ((shT -= dt) <= 0) { shT = busy ? 1 / 30 : 0.1; fireLight.shadow.needsUpdate = true; if (arrange.held) lamp.shadow.needsUpdate = true; }
    bounce.intensity = 2.6 * power * (0.6 + 0.4 * level);
    reading.update(dt, { fire: power * lv / 0.62, day: env.state.day });

    // 환경음과 발소리
    if (ambient) {
      const kd = Math.hypot(camera.position.x - kettlePos.x, camera.position.z - kettlePos.z);
      ambient.update({ dt, outside: Math.max(ctx.outsideAt?.(player.pos.x, player.pos.z) || 0, (ctx.door?.t || 0) * 0.35), weather: env.state.weather, day: env.state.day, season: env.state.season, clockDist: camera.position.distanceTo(clockPos), kettle: (cozy.kettleBoil || 0) / (1 + kd * kd * 0.5) });
      if (player.state === 'walk' && player.speed > 0.3) {
        const ph = Math.floor(player.bob / Math.PI);
        if (ph !== stepPhase) { stepPhase = ph; const onRug = Math.abs(player.pos.x - RUG.x) < RUG.w / 2 && Math.abs(player.pos.z - RUG.z) < RUG.d / 2; sfx(onRug ? 'steprug' : 'step', { pan: ph % 2 ? 0.15 : -0.15, gain: Math.min(1, player.speed / 1.4) }); }
      }
    }

    // 가만히 있는 동안은 절전: 시선과 몸이 멈춰 있으면 방을 한 프레임 걸러 그린다(불은 따로 그려지므로 그대로 부드럽다).
    // 둘러보거나 걷거나 장을 넘기거나 가구를 옮기는 동안, 화면을 찍을 때는 매 프레임 그린다.
    const sig = player.yaw * 7 + player.pitch * 13 + player.pos.x * 17 + player.pos.z * 19 + player.eye * 23 + player.fov;
    if (sig !== viewSig || player.tween || arrange.held || reading.moving || reading.reader.book3d.flipping) { viewSig = sig; stillT = 0; } else stillT += dt;
    // 책을 읽는 동안(불이 화면 밖)에는 움직이는 것이 불빛의 느린 일렁임뿐이라 세 프레임에 한 번만 그린다. 주소 옵션 idle=N 은 측정용.
    const idle = prefs.readSave && !Q.has('noidle') && stillT > 0.25 && !ctx.captureNext && !mouseHeld;
    idleN = idle ? (idleN + 1) % (+Q.get('idle') || (player.state === 'reading' && (!fire || fire.hidden) ? 3 : 2)) : 0; skip = idle && idleN !== 0;
    // 환경 맵: 예약된 때, 또는 낮밤이 눈에 띄게 달라졌을 때 다시 찍는다
    envAge += dt; if (roomReady && envDue > 0 && (envDue -= dt) <= 0) { envDue = 0; refreshEnv(); envAge = 0; envDay = env.state.day; }
    else if (envAge > 60 && Math.abs(env.state.day - envDay) > 0.04) ctx.refreshEnv(0.05);
    scene.environmentIntensity = ENV_I * (0.75 + 0.25 * Math.min(1.4, level));
    if (warmT > 0 && (warmT -= dt) <= 0) { if (lamp.shadow.needsUpdate || envDue > 0) warmT = 0.2; else { mark('warmStart'); warmUp(); skip = false; warmed = true; mark('warmEnd'); } }   // 바로 아래에서 제대로 된 화면을 다시 그리므로 준비용 화면은 보이지 않는다
    if (!HEADLESS && !skip && roomReady) draw();
    if (ctx.captureNext && !HEADLESS) {
      // 인용구 카드용: 방금 그린 화면(불 + 방)을 2D 캔버스로 옮긴다
      const cb = ctx.captureNext; ctx.captureNext = null;
      try { shot.width = 1600; shot.height = 900; const c2 = shot.getContext('2d'); c2.fillStyle = '#000'; c2.fillRect(0, 0, 1600, 900);
        if (fire && !fire.hidden) { const r = fireCanvas.getBoundingClientRect(), kx = 1600 / innerWidth, ky = 900 / innerHeight; c2.drawImage(fireCanvas, r.left * kx, r.top * ky, r.width * kx, r.height * ky); }
        c2.drawImage(roomCanvas, 0, 0, 1600, 900); cb(shot);
      } catch (e) { console.warn('화면을 찍지 못했습니다', e); cb(null); }
    } else if (ctx.captureNext && HEADLESS) { const cb = ctx.captureNext; ctx.captureNext = null; window.NANRO.capture(1600, 900).then((u) => { const im = new Image(); im.onload = () => cb(im); im.src = u; }, () => cb(null)); }

    // 상호작용 힌트
    // 앉아 있을 때의 '책 펼치기' 안내는 잠깐만 보인다(불을 바라보는 동안 화면 한가운데를 가리지 않게)
    stateT += dt;
    const f0 = player.locked && !arrange.held ? player.focus : null, f = f0 && f0.id === 'book' && stateT > 6 ? null : f0, mv = player.locked ? arrange.target : null;
    const label = (f ? `<kbd>E</kbd>${f.label}` : '') + (mv ? `${f ? ' &nbsp; ' : ''}<kbd>G</kbd>${mv.label} 옮기기` : '');
    prompt.style.opacity = label ? 1 : 0;
    if (label && prompt.dataset.label !== label) { prompt.dataset.label = label; prompt.innerHTML = label; }

    // 해상도 자동 조절 + 성능 표시
    acc += dt; frames++;
    if (acc > 1) {
      fpsMs = acc / frames * 1000; acc = 0; frames = 0;
      const now = performance.now();
      if (!Q.has('fixed') && !Q.has('rs') && prefs.autoRes !== false && player.state !== 'reading' && now - lastFit > 1500) {
        if (fpsMs > 24 && scale > 0.5) { scale = Math.max(0.5, scale * 0.88); lastFit = now; fit(); }
        else if (fpsMs < 12.5 && scale < cap()) { scale = Math.min(cap(), scale * 1.08); lastFit = now; fit(); }
      }
      if (showStats) {
        const be = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
        stats.textContent = `${(1000 / fpsMs).toFixed(0)} fps (${fpsMs.toFixed(1)} ms) · 방 ${be} ×${scale.toFixed(2)}\n` +
          (fire && rec.on ? `불: 기록 재생 중 (${(REC_N / REC_HZ) | 0}초) · 광량 ${level.toFixed(2)}` : fire ? `불: 물리 시뮬레이션 ${fire.quality} ${fire.sim.res.join('×')} · ${fire.w}×${fire.h} · 광량 ${level.toFixed(2)}` : `불: 대체 표시 (${fireErr || '꺼짐'})`) +
          `\n상태: ${player.state} · ${env.state.season} ${env.state.weather} · 해 ${env.state.sunAlt.toFixed(0)}°`;
      }
    }
  };
  if (HEADLESS && fire) {
    // 소프트웨어 WebGPU는 프레임을 내는 속도보다 처리 속도가 느려 일이 쌓인다. GPU가 끝낼 때까지 기다렸다가 다음 프레임을 낸다.
    const tick = async () => { try { frame(); } catch (e) { console.error('frame:', e.stack || e); } await fire.device.queue.onSubmittedWorkDone(); setTimeout(tick, 0); };
    tick();
  } else renderer.setAnimationLoop(frame);
  syncOverlay();

  // 테스트·스크린샷 도구용
  mark('mainDone');
  window.NANRO = {
    renderer, scene, camera, player, fire, ctx, mixer, env, reading, cozy, music, prefs, sfx, texturesReady, brickReady, arrange, get settings() { return settings; }, get fireSound() { return fireSound; }, get fpsMs() { return fpsMs; }, get roomReady() { return roomReady; }, marks, ready: true,
    async capture(w, h) { const { capture } = await import('./dev/capture.js'); return capture({ renderer, scene, camera, fire, post: post && prefs.post ? post : null }, w, h); },
  };
}

main().catch((e) => {
  console.error(e);
  document.getElementById('startMsg').textContent = '시작하지 못했습니다: ' + (e.message || e);
});
