// 초고화질 불 미리 만들기 (주소 옵션 ?bake).
// 실시간으로는 돌릴 수 없는 큰 격자로 불을 천천히 계산하면서, 의자에 앉았을 때의 눈 자리에서 본 불 그림을 한 장씩 그려 동영상으로 묶는다.
// 만든 동영상은 이 컴퓨터의 브라우저 저장소(OPFS, fire-bake 폴더)에 두고, 앉아 있을 때 src/fire/baked.js 가 틀어 준다.
// 눈 자리가 같으면 고개를 어느 쪽으로 돌려도 같은 그림을 맞춰 붙일 수 있으므로 의자마다 동영상 한 벌이면 된다.
// 상태는 타고 있는 장작 수(0~3개)로 나눈다: 이 프로그램에서 불 세기는 남은 장작에서 나온다.
import * as THREE from 'three/webgpu';
import { Muxer, FileSystemWritableFileStreamTarget } from 'mp4-muxer';
import { FireLayer } from './fireLayer.js';
import { FIREPLACE as FP, CHAIRS } from '../scene/layout.js';
import { FIRE_PRESETS, applyUrl, toQuality } from '../ui/fireConfig.js';
import { BAKE_DIR, BAKE_JOB, FUELS, fuelPower, fireQuad, seatCamera } from './baked.js';

const CODECS = [['avc1.640034', 'avc'], ['vp09.00.51.08', 'vp9'], ['av01.0.12M.08', 'av1']];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}시간 ${Math.round((s % 3600) / 60)}분` : s >= 60 ? `${Math.floor(s / 60)}분 ${Math.round(s % 60)}초` : `${Math.round(s)}초`);

export async function runBake(Q) {
  const num = (k, d) => (Q.get(k) != null && Q.get(k) !== '' && isFinite(+Q.get(k)) ? +Q.get(k) : d);
  let job = null; try { job = JSON.parse(localStorage.getItem(BAKE_JOB) || 'null'); } catch { /* 없음 */ }
  const seats = (job?.seats?.length ? job.seats : CHAIRS.map((c) => ({ id: c.id, label: c.label, eye: [c.pos[0], c.eye, c.pos[1]] })));
  const P = {
    grid: num('grid', job?.grid ?? 240), secs: num('secs', job?.secs ?? 5), fps: num('fps', 30), settle: num('settle', 12), warm: num('warm', 20),
    samples: num('spp', 4), fov: num('fov', job?.fov ?? 42), density: num('density', 1), mbps: num('mbps', 12), maxPx: num('maxpx', 2.2) * 1e6,
    screen: (Q.get('screen') || '3840x2160').split('x').map(Number), states: (Q.get('states') || '3,2,1,0').split(',').map(Number),
  };
  // 품질: '균형' 프리셋(실시간 불의 기본)에 격자만 키운다. 주소 옵션으로 바탕 프리셋(?q=ultra)과 항목(?fq=simhz:120,vcycles:3)을 바꿀 수 있다.
  // 불 모양은 계산 속도(초당 걸음)에 따라 달라진다: PC에서 격자 240으로 견줘 보니 90걸음은 실시간 불처럼 위로 솟고, 120걸음은 낮고 옆으로 퍼진다.
  // 그리기 쪽(불꽃·표면 배율, 광선 걸음)은 따로 주지 않으면 늘 가장 촘촘하게 한다
  const Q2 = new URLSearchParams(Q); Q2.set('grid', P.grid);
  const fine = { volScale: 1, surfScale: 1, stepMul: 0.5 }, given = (Q.get('fq') || '') + ',' + (Q.get('rp') || '');
  const v = applyUrl({ preset: 'balanced', values: { ...FIRE_PRESETS.balanced.v, sparks: FIRE_PRESETS.ultra.v.sparks } }, Q2).values; for (const k in fine) if (!given.includes(k + ':')) v[k] = fine[k];
  const q = toQuality(v);
  const stepsPerFrame = Math.max(1, Math.round(v.simhz / P.fps));
  const cells = q.res[0] * q.res[1] * q.res[2];

  // ---- 화면
  document.title = '난로: 초고화질 불 만들기';
  document.body.innerHTML = '';
  const E = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
  const view = E('canvas', { style: 'position:static;width:auto;height:auto;max-width:100%;max-height:46vh;background:#000;border-radius:8px;display:block;margin:14px auto' });
  const line = E('div', { style: 'font-size:17px;margin:8px 0' }), sub = E('div', { style: 'opacity:.75;font-size:14px;line-height:1.7;white-space:pre-line' });
  const bar = E('div', { style: 'height:8px;background:#e8a04a;width:0;border-radius:4px;transition:width .3s' });
  const start = E('button', { textContent: '만들기 시작', style: 'font:inherit;padding:9px 22px;border-radius:8px;border:0;background:#e8a04a;color:#1b1410;cursor:pointer;margin-right:8px' });
  const back = E('button', { textContent: '난로로 돌아가기', style: 'font:inherit;padding:9px 22px;border-radius:8px;border:1px solid #6b5a4a;background:none;color:inherit;cursor:pointer' });
  back.onclick = () => { api.cancel = true; location.href = location.pathname; };
  document.body.append(E('div', { style: 'position:fixed;inset:0;overflow:auto;background:#17110d;color:#f1e6d8;font:15px/1.6 system-ui,"Malgun Gothic",sans-serif;padding:28px;box-sizing:border-box' },
    E('div', { style: 'max-width:860px;margin:0 auto' }, E('h2', { textContent: '초고화질 불 미리 만들기', style: 'font-weight:600;margin:0 0 6px' }), line,
      E('div', { style: 'background:#3a2c22;border-radius:4px;margin:10px 0' }, bar), view, sub, E('div', { style: 'margin-top:16px' }, start, back))));
  const api = (window.NANRO_BAKE = { state: 'idle', progress: 0, error: null, cancel: false, params: P, res: q.res, msPerStep: 0 });
  const clipSecs = P.states.length * P.secs, simSecs = P.warm + clipSecs + P.settle * (P.states.length - 1);
  line.textContent = `격자 ${q.res.join('×')} (약 ${(cells / 1e6).toFixed(1)}백만 칸), 장작 ${P.states.join('·')}개일 때의 불을 각 ${fmt(P.secs)}씩, 의자 ${seats.length}자리`;
  sub.textContent = `만드는 동안 그래픽카드를 거의 다 씁니다. 창을 닫거나 다른 화면으로 가면 멈추므로 이 창을 켜 두세요.\n불 속 시간으로 모두 ${fmt(simSecs)}를 계산합니다(초당 ${v.simhz}걸음, 동영상 초당 ${P.fps}장).`;
  if (!Q.has('auto') && Q.get('bake') !== 'auto') await new Promise((r) => (start.onclick = r));
  start.disabled = true; start.style.opacity = 0.4;

  try {
    api.state = 'running';
    try { await navigator.wakeLock?.request('screen'); } catch { /* 화면 꺼짐 방지를 못 써도 계속 */ }
    try { await navigator.storage.persist?.(); } catch { /* 무시 */ }
    line.textContent = '불을 준비하는 중입니다';
    const canvas = document.createElement('canvas');
    const fire = await FireLayer.create(canvas, { q, name: '미리 만들기', debug: {} });
    if (!Q.has('notex')) await fire.loadBrick();
    fire.popsFromAudio = false;

    // ---- 자리마다 시점과 그림 크기: 모든 자리가 같은 픽셀 크기를 쓴다(그림은 어차피 자리마다의 네모에 맞춰 늘여 붙인다)
    let W = 0, H = 0;
    for (const s of seats) {
      s.camera = seatCamera(s.eye, P.fov, P.screen[0] / P.screen[1]);
      const r = fire._holeRect(s.camera); if (!r) throw new Error(`${s.label || s.id}: 이 자리에서는 벽난로 구멍이 보이지 않습니다`);
      s.rect = r; s.quad = fireQuad(s.camera, r);
      W = Math.max(W, (r.x1 - r.x0) / 2 * P.screen[0] * P.density); H = Math.max(H, (r.y1 - r.y0) / 2 * P.screen[1] * P.density);
    }
    const shrink = Math.min(1, Math.sqrt(P.maxPx / (W * H)));
    W = Math.max(128, Math.ceil(W * shrink / 16) * 16); H = Math.max(128, Math.ceil(H * shrink / 16) * 16);
    fire.bakeSize(W, H); view.width = W; view.height = H; const vctx = view.getContext('2d');

    // ---- 동영상 형식: 이 컴퓨터가 만들 수 있는 것 가운데 앞의 것
    if (typeof VideoEncoder === 'undefined') throw new Error('이 프로그램 창은 동영상 만들기(WebCodecs)를 지원하지 않습니다');
    let codec = null;
    for (const [c, m] of CODECS) { const cfg = { codec: c, width: W, height: H, bitrate: P.mbps * 1e6, framerate: P.fps }; try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) { codec = { cfg, mux: m }; break; } } catch { /* 다음 */ } }
    if (!codec) throw new Error('이 컴퓨터에서 만들 수 있는 동영상 형식을 찾지 못했습니다');

    const root = await navigator.storage.getDirectory(), dir = await root.getDirectoryHandle(BAKE_DIR, { create: true });
    try { await dir.removeEntry('manifest.json'); } catch { /* 없음 */ }   // 만드는 동안에는 예전 것을 쓰지 않게
    const manifest = { v: 1, made: new Date().toISOString(), res: q.res, simhz: v.simhz, fps: P.fps, w: W, h: H, codec: codec.cfg.codec, seats: {}, clips: {} };
    for (const s of seats) manifest.seats[s.id] = { label: s.label || s.id, eye: s.eye, quad: s.quad };

    const totalSteps = Math.round(simSecs * v.simhz); let doneSteps = 0, t0 = performance.now(), lastUi = 0;
    const ui = (what) => {
      const now = performance.now(); if (now - lastUi < 400) return; lastUi = now;
      const el = (now - t0) / 1000; api.progress = doneSteps / totalSteps; api.msPerStep = doneSteps ? (now - t0) / doneSteps : 0;
      bar.style.width = (api.progress * 100).toFixed(1) + '%';
      line.textContent = `${what} · ${(api.progress * 100).toFixed(1)}%`;
      sub.textContent = `걸린 시간 ${fmt(el)}, 남은 시간 약 ${doneSteps > 20 ? fmt(el / doneSteps * (totalSteps - doneSteps)) : '계산 중'}\n격자 ${q.res.join('×')} · 그림 ${W}×${H} · 한 걸음 ${api.msPerStep.toFixed(0)}ms · 동영상 형식 ${codec.cfg.codec}`;
    };
    const advance = async (secs, what) => {
      let n = Math.round(secs * v.simhz);
      while (n > 0) { if (api.cancel) throw new Error('취소했습니다'); const k = Math.min(n, stepsPerFrame); await fire.bakeAdvance(k); n -= k; doneSteps += k; ui(what); }
    };

    for (let si = 0; si < P.states.length; si++) {
      const n = P.states[si], name = 'loop' + n, fuel = FUELS[n];
      fire.setFuel(fuel); fire.target = fuelPower(fuel);
      if (si === 0) { fire.power = fire.target; await advance(P.warm, '불을 붙이는 중'); } else await advance(P.settle, `장작 ${n}개: 불이 자리 잡는 중`);
      // 자리마다 동영상 하나
      const outs = [];
      for (const s of seats) {
        const fh = await dir.getFileHandle(`${s.id}-${name}.mp4`, { create: true }), ws = await fh.createWritable();
        const muxer = new Muxer({ target: new FileSystemWritableFileStreamTarget(ws), video: { codec: codec.mux, width: W, height: H, frameRate: P.fps }, fastStart: false });
        const o = { s, ws, muxer, light: [], err: null };
        o.enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { o.err = e; } });
        o.enc.configure({ ...codec.cfg, latencyMode: 'quality' });
        outs.push(o);
      }
      const frames = Math.round(P.secs * P.fps);
      for (let f = 0; f < frames; f++) {
        if (api.cancel) throw new Error('취소했습니다');
        await fire.bakeAdvance(stepsPerFrame); doneSteps += stepsPerFrame;
        for (const o of outs) {
          if (o.err) throw o.err;
          const px = await fire.bakeRender(o.s.camera, P.samples);
          // 불빛 세기: 그림의 평균 밝기(방 조명과 책 위의 불빛이 이 값을 따라 흔들린다)
          let L = 0, c = 0; for (let i = 0; i < px.data.length; i += 64) { L += 0.2126 * px.data[i] + 0.7152 * px.data[i + 1] + 0.0722 * px.data[i + 2]; c++; }
          o.light.push(L / c);
          const frame = new VideoFrame(px.data, { format: 'RGBA', codedWidth: W, codedHeight: H, timestamp: Math.round(f * 1e6 / P.fps), duration: Math.round(1e6 / P.fps), colorSpace: { primaries: 'bt709', transfer: 'iec61966-2-1', matrix: 'rgb', fullRange: true } });
          o.enc.encode(frame, { keyFrame: f % (P.fps * 2) === 0 }); frame.close();
          while (o.enc.encodeQueueSize > 3) await sleep(4);
          if (o === outs[0] && f % 3 === 0) vctx.putImageData(new ImageData(new Uint8ClampedArray(px.data.buffer, px.data.byteOffset, W * H * 4), W, H), 0, 0);
        }
        ui(`장작 ${n}개일 때의 불을 찍는 중 (${f + 1}/${frames}장)`);
      }
      const clip = (manifest.clips[name] = { logs: n, power: +fuelPower(fuel).toFixed(3), dur: frames / P.fps, frames, light: {} });
      for (const o of outs) {
        await o.enc.flush(); if (o.err) throw o.err; o.enc.close(); o.muxer.finalize(); await o.ws.close();
        const mean = o.light.reduce((a, b) => a + b, 0) / Math.max(1, o.light.length) || 1;
        clip.light[o.s.id] = o.light.map((x) => +(x / mean).toFixed(3));
      }
    }
    const mh = await dir.getFileHandle('manifest.json', { create: true }), mw = await mh.createWritable();
    await mw.write(JSON.stringify(manifest)); await mw.close();
    try { localStorage.removeItem(BAKE_JOB); } catch { /* 무시 */ }
    api.progress = 1; api.state = 'done'; api.seconds = (performance.now() - t0) / 1000; bar.style.width = '100%';
    line.textContent = `다 만들었습니다 (${fmt(api.seconds)} 걸림)`;
    sub.textContent = `격자 ${q.res.join('×')} · 그림 ${W}×${H} · 동영상 ${P.states.length * seats.length}개\n"난로로 돌아가기"를 누른 뒤 의자에 앉으면 미리 만든 불이 나옵니다.`;
  } catch (e) {
    console.error('[bake]', e); api.state = 'error'; api.error = String(e?.message || e);
    line.textContent = '만들지 못했습니다: ' + api.error; bar.style.background = '#b5483a';
  }
}
