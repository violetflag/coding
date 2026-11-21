// 난로 — 진입점 (1단계 프로토타입).
// 방은 three.js WebGPURenderer로, 불은 별도 WebGPU 캔버스(src/fire/fireLayer.js)로 그린다.
import * as THREE from 'three/webgpu';
import { ROOM, FIREPLACE as FP, LAMP } from './scene/layout.js';
import { buildRoom } from './scene/room.js';
import { Player } from './player/player.js';
import { FireLayer } from './fire/fireLayer.js';
import { Mixer } from './audio/mixer.js';
import { FireSound } from './audio/fireSound.js';

const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const roomCanvas = $('room'), fireCanvas = $('fire');
// 헤드리스 테스트 환경은 WebGPU 캔버스에 그리면 장치가 죽는다: 화면 출력은 건너뛰고 NANRO.capture()로만 읽는다.
const HEADLESS = Q.has('headless');
const LAMP_ON = 4.0;

async function main() {
  const renderer = new THREE.WebGPURenderer({ canvas: roomCanvas, antialias: true, alpha: true, forceWebGL: Q.has('webgl') });
  await renderer.init();
  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 60);
  const ctx = { colliders: [], interact: [], animated: [] };
  scene.add(buildRoom(ctx));

  // ---- 임시 조명 (4단계에서 분리 굽기 + 하늘로 교체). 불빛의 세기는 불 레이어의 실제 광량 신호를 따른다.
  const fireLight = new THREE.PointLight(0xff8a3c, 0, 9, 1.6);
  fireLight.position.set(FP.faceX - 0.12, FP.hearthH + 0.3, FP.zc); fireLight.castShadow = true;
  fireLight.shadow.mapSize.set(1024, 1024); fireLight.shadow.bias = -0.004; fireLight.shadow.radius = 4;
  scene.add(fireLight);
  const lamp = new THREE.PointLight(0xffc98a, LAMP_ON, 7, 1.8); lamp.position.set(LAMP.x, LAMP.h + 0.05, LAMP.z); scene.add(lamp);
  scene.add(new THREE.HemisphereLight(0x223355, 0x120a06, 0.6));
  const moon = new THREE.DirectionalLight(0x8fa8d8, 0.25); moon.position.set(2.6, 4, -6); moon.target.position.set(2.8, 0, 2); scene.add(moon, moon.target);

  // ---- 불 레이어
  let fire = null, fireErr = '';
  if (!Q.has('nofire')) {
    try { fire = await FireLayer.create(fireCanvas, { quality: Q.get('q') || undefined }); }
    catch (e) { fireErr = e.message || String(e); console.warn('[fire] 물리 불꽃을 쓸 수 없어 대체 표시로 전환:', e); }
  }
  if (!fire) { ctx.fireHole.visible = false; ctx.fireboxFallback.visible = true; fireCanvas.style.display = 'none'; }

  // ---- 플레이어
  const toast = (msg) => { const t = $('toast'); t.textContent = msg; t.style.opacity = 1; clearTimeout(toast.h); toast.h = setTimeout(() => (t.style.opacity = 0), 2200); };
  let lampOn = true, fireSound = null;
  const mixer = new Mixer();
  const player = new Player({
    camera, canvas: roomCanvas, ctx,
    onInteract(it) {
      if (it.id === 'lamp') { lampOn = !lampOn; lamp.intensity = lampOn ? LAMP_ON : 0; ctx.lampShade.material.emissiveIntensity = lampOn ? 1.6 : 0.02; }
      else if (it.id === 'woodpile') { fire?.addLog(); fireSound?.trigger('log-shift', 0.6); toast('장작을 넣었습니다'); }
      else if (it.id === 'poker') { fire?.stoke(); fireSound?.trigger('log-shift', 1); toast('불을 뒤적였습니다'); }
      else if (it.id === 'shelf') toast('책장은 5단계에서 내 서재가 됩니다');
    },
    onState(s) { if (s === 'reading') toast('책은 5단계에서 구현됩니다 · Space로 덮기'); },
  });

  // ---- 화면 크기와 해상도 자동 조절 (room-at-dawn 방식: 프레임이 느리면 해상도를 낮춘다)
  let scale = Math.min(1, 1600 / innerWidth) * Math.min(devicePixelRatio, 1.5);
  const fit = () => {
    renderer.setPixelRatio(scale); renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    fire?.resize(innerWidth, innerHeight, Math.min(scale, 1));
  };
  addEventListener('resize', fit); fit();

  // ---- 시작 화면과 포인터 잠금
  const start = $('start'), hint = $('hint'), dot = $('dot'), prompt = $('prompt'), stats = $('stats');
  $('startMsg').textContent = '클릭해서 들어가기';
  // 소리는 첫 클릭에서 켠다(브라우저 정책). 실패해도 화면은 그대로 돈다.
  const startSound = async () => {
    if (mixer.ctx || Q.has('mute')) return mixer.ctx?.resume().catch(() => {});
    try { mixer.start(); fireSound = await FireSound.create(mixer, fire); } catch (e) { console.warn('소리를 켤 수 없습니다', e); }
  };
  start.addEventListener('click', () => { startSound(); player.lock(); });
  roomCanvas.addEventListener('click', () => { startSound(); if (!player.locked) player.lock(); });
  // 임시 볼륨 조절: [ 와 ] 로 전체 볼륨 (정식 소리 설정 화면은 6단계)
  addEventListener('keydown', (e) => {
    if (e.code !== 'BracketLeft' && e.code !== 'BracketRight') return;
    mixer.setVolume('master', mixer.volume('master') + (e.code === 'BracketRight' ? 0.1 : -0.1));
    toast('전체 볼륨 ' + Math.round(mixer.volume('master') * 100) + '%');
  });
  document.addEventListener('pointerlockchange', () => {
    const on = player.locked;
    start.style.display = on ? 'none' : 'grid'; dot.style.opacity = on ? 1 : 0;
    if (on) { hint.style.opacity = 0.85; setTimeout(() => (hint.style.opacity = 0), 7000); }
  });
  let showStats = Q.has('stats');
  addEventListener('keydown', (e) => { if (e.code === 'F3') { e.preventDefault(); showStats = !showStats; stats.textContent = ''; } });

  // ---- 루프
  const clock = new THREE.Clock();
  let acc = 0, frames = 0, lastFit = 0, fpsMs = 16.7, fbT = 0, prevCam = new THREE.Vector3(), level = 1;
  const frame = () => {
    const dt = Math.min(0.05, clock.getDelta());
    player.update(dt);
    window.__nanroFrames = (window.__nanroFrames | 0) + 1;
    for (const fn of ctx.animated) fn(clock.elapsedTime);

    // 불빛 신호 → 방 조명. 물리 불이 없으면 느린 잡음으로 대신한다(대체 표시).
    // 불빛 측정값이 아직 없거나 끊기면(읽어오기 지연) 같은 잡음으로 이어 간다.
    fbT += dt;
    const synth = 1 + 0.12 * Math.sin(fbT * 12.6) * Math.sin(fbT * 3.1) + 0.08 * Math.sin(fbT * 7.3 + 1.3);
    let power = 0.6, target = synth;
    if (fire) {
      fire.moving = prevCam.distanceToSquared(camera.position) > 1e-8 || player.tween !== null;
      fire.update(dt, camera, !HEADLESS);
      power = fire.power;
      if (fire.light.ref > 0 && performance.now() - fire.light.at < 500) target = fire.light.level;
    }
    level += (target - level) * (1 - Math.exp(-dt * 30));
    fireSound?.update(power, level, fire ? fire.camPos(camera) : [camera.position.z - FP.fire.z, camera.position.y - FP.fire.y, FP.fire.x - camera.position.x]);
    prevCam.copy(camera.position);
    fireLight.intensity = 9 * power * Math.max(0.3, Math.min(1.8, level));
    fireLight.position.y = FP.hearthH + 0.3 + 0.03 * (level - 1);

    if (!HEADLESS) renderer.render(scene, camera);

    // 상호작용 힌트
    const f = player.locked ? player.focus : null;
    prompt.style.opacity = f ? 1 : 0;
    if (f && prompt.dataset.id !== f.id) { prompt.dataset.id = f.id; prompt.innerHTML = `<kbd>E</kbd>${f.label}`; }

    // 해상도 자동 조절 + 성능 표시
    acc += dt; frames++;
    if (acc > 1) {
      fpsMs = acc / frames * 1000; acc = 0; frames = 0;
      const now = performance.now();
      if (!Q.has('fixed') && now - lastFit > 1500) {
        if (fpsMs > 24 && scale > 0.5) { scale = Math.max(0.5, scale * 0.88); lastFit = now; fit(); }
        else if (fpsMs < 12.5 && scale < Math.min(devicePixelRatio, 1.5)) { scale = Math.min(Math.min(devicePixelRatio, 1.5), scale * 1.08); lastFit = now; fit(); }
      }
      if (showStats) {
        const be = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
        stats.textContent = `${(1000 / fpsMs).toFixed(0)} fps (${fpsMs.toFixed(1)} ms) · 방 ${be} ×${scale.toFixed(2)}\n` +
          (fire ? `불: 물리 시뮬레이션 ${fire.quality} ${fire.sim.res.join('×')} · ${fire.w}×${fire.h} · 광량 ${level.toFixed(2)}` : `불: 대체 표시 (${fireErr || '꺼짐'})`) +
          `\n상태: ${player.state}`;
      }
    }
  };
  if (HEADLESS && fire) {
    // 소프트웨어 WebGPU는 프레임을 내는 속도보다 처리 속도가 느려 일이 쌓인다. GPU가 끝낼 때까지 기다렸다가 다음 프레임을 낸다.
    const tick = async () => { try { frame(); } catch (e) { console.error("frame:", e.stack || e); } await fire.device.queue.onSubmittedWorkDone(); setTimeout(tick, 0); };
    tick();
  } else renderer.setAnimationLoop(frame);

  // 테스트·스크린샷 도구용
  window.NANRO = {
    renderer, scene, camera, player, fire, ctx, mixer, get fireSound() { return fireSound; }, get fpsMs() { return fpsMs; }, ready: true,
    async capture(w, h) { const { capture } = await import('./dev/capture.js'); return capture({ renderer, scene, camera, fire }, w, h); },
  };
}

main().catch((e) => {
  console.error(e);
  document.getElementById('startMsg').textContent = '시작하지 못했습니다: ' + (e.message || e);
});
