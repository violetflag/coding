// 헤드리스 Chromium으로 장면 스크린샷을 찍는다 (room-at-dawn의 tools/shot.mjs와 같은 용도).
//   npm run dev   (다른 터미널)
//   node tools/shot.mjs [이름…]         → shots/<이름>.png   (이름: start, fire, seated, reading, shelf)
// GPU가 없는 환경에서는 소프트웨어 렌더러(SwiftShader)로 돌아가 매우 느리다. --frames 수 로 촬영 전 진행할 프레임 수를 조절한다.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const url = opt('url', 'http://127.0.0.1:5320/'), frames = Number(opt('frames', 260)), query = opt('query', 'q=test&fixed&stats&headless');
const W = Number(opt('w', 1280)), H = Number(opt('h', 720));
// --dom: 3D 화면 위에 실제 화면 요소(시작 화면, 설정창, 읽기 메뉴)까지 함께 찍는다. --eval "코드": 찍기 직전에 페이지에서 실행한다(화면 요소를 여는 용도).
const evalJs = opt('eval', ''), DOM = args.includes('--dom') ? !!args.splice(args.indexOf('--dom'), 1) : false;
const names = args.length ? args : ['start', 'fire', 'seated', 'reading'];
const VIEWS = {
  start: null,
  fire: { pos: [3.2, 2.0], yaw: [5.33, 1.6], pitch: -0.18 },
  shelf: { pos: [3.6, 3.2], yaw: [0.3, 1.0], pitch: 0 },
  window: { pos: [2.8, 2.3], yaw: [2.8, 0], pitch: 0.0 },
  room1: { pos: [2.9, 4.4], yaw: [3.3, 0.5], pitch: -0.12 },
  room2: { pos: [4.6, 4.2], yaw: [1.0, 1.2], pitch: -0.1 },
  chair1: { pos: [2.0, 2.3], yaw: [3.05, 3.75], pitch: -0.42 },
  chair2: { pos: [2.75, 3.0], yaw: [1.2, 2.05], pitch: -0.4 },
  hearthclose: { pos: [4.0, 1.0], yaw: [5.0, 2.2], pitch: -0.75 },
  spines: { pos: [1.1, 3.0], yaw: [0.2, 3.0], pitch: 0.0 },
  ceiling: { pos: [2.8, 3.6], yaw: [2.8, 1.0], pitch: 1.0 },
  ceiling2: { pos: [3.5, 2.5], yaw: [5.6, 2.5], pitch: 0.9 },
  shelfwall: { pos: [2.6, 2.4], yaw: [0, 2.4], pitch: 0.05 },
  shelftop: { pos: [0.85, 2.0], yaw: [0.1, 2.2], pitch: -0.62 },
  shelfwin: { pos: [1.2, 2.6], yaw: [1.0, 0], pitch: 0.0 },
  door: { pos: [3.4, 3.4], yaw: [5.6, 3.5], pitch: -0.05, door: true },
  doorshut: { pos: [3.4, 3.4], yaw: [5.6, 3.5], pitch: -0.05 },
  house: { pos: [10.5, -3.0], yaw: [2.8, 2.6], pitch: 0.12, door: true },
  house2: { pos: [-4.5, 10.5], yaw: [2.8, 2.0], pitch: 0.1 },
  porch: { pos: [6.3, 3.5], yaw: [12, 2.5], pitch: -0.05, door: true },
  // 내 서재 책장: 빈 책장, 가짜 책(주소 옵션 shelfdemo=권수)으로 채운 책장, 가까이(제목), 위에서(책 모양)
  shelfempty: { pos: [1.75, 3.0], yaw: [0.3, 3.0], pitch: -0.1 },
  shelffull: { pos: [1.75, 3.0], yaw: [0.3, 3.0], pitch: -0.1, q: 'shelfdemo=150' },
  shelfwide: { pos: [3.6, 3.2], yaw: [0.3, 1.0], pitch: 0, q: 'shelfdemo=150' },
  shelfclose: { pos: [1.25, 2.75], yaw: [0.3, 2.75], pitch: -0.28, q: 'shelfdemo=150' },
  shelfabove: { pos: [0.85, 2.7], yaw: [0.3, 2.95], pitch: -0.62, q: 'shelfdemo=40' },
  shelfend: { pos: [0.55, 3.2], yaw: [0.3, 3.75], pitch: -0.3, q: 'shelfdemo=7' },   // 줄 끝 책의 앞표지(표지 그림)
  shelfpick: { pos: [1.05, 3.7], yaw: [0.3, 3.35], pitch: -0.3, q: 'shelfdemo=12', sample: true },   // 견본 책을 서재에 넣고 꺼내 든다
  tablebooks: { pos: [3.45, 3.55], yaw: [3.8, 4.05], pitch: -0.95 },
  // 하늘 점검: 마당에서 올려다보기(남쪽), 창 너머, 해·달 쪽 보기(look: 'sun'|'moon'|방위각°). env 는 환경 설정(별자리 선 등)
  skynight: { pos: [12, 5], look: 180, pitch: 0.75 },
  skynames: { pos: [12, 5], look: 180, pitch: 0.75, env: { constellations: 'names' } },
  skyeast: { pos: [12, 5], look: 110, pitch: 0.6, env: { constellations: 'names' } },
  skyup: { pos: [12, 5], look: 180, pitch: 1.4 },
  skynorth: { pos: [12, 5], look: 0, pitch: 0.65 },
  skywin: { pos: [2.8, 2.9], yaw: [2.8, 0], pitch: 0.3 },
  skysun: { pos: [12, 5], look: 'sun', pitch: 0.25 },
  skymoon: { pos: [12, 5], look: 'moon', pitch: 0.3 },
  skywest: { pos: [12, 5], look: 240, pitch: 0.3 },
  skysouth: { pos: [12, 5], look: 175, pitch: 0.35 },
  // 날씨 점검(주소 옵션 weathermock=이름 과 함께): 마당에서 집과 하늘, 문밖 마루와 계단의 눈, 구름 하늘
  weatheryard: { pos: [11.5, -2.0], yaw: [2.8, 2.4], pitch: 0.2, door: true },
  weatherdeck: { pos: [9.4, 1.2], yaw: [6.4, 3.6], pitch: -0.42 },
  weathersky: { pos: [12, 5], look: 200, pitch: 0.4 },
};

mkdirSync('shots', { recursive: true });
const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader', '--use-webgpu-adapter=swiftshader', '--ignore-gpu-blocklist'] });
// 소프트웨어 WebGPU에서는 두 번째 읽어오기가 멈추는 일이 있어, 장면마다 새 페이지를 연다.
for (const name of names) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text().slice(0, 400)); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(url + '?' + query + (VIEWS[name]?.q ? '&' + VIEWS[name].q : ''));
  await page.waitForFunction(() => window.NANRO?.ready, null, { timeout: 120000 });
  if (!DOM) await page.evaluate(() => { document.getElementById("start").style.display = "none"; }); await page.evaluate(() => Promise.all([window.NANRO.texturesReady, window.NANRO.brickReady]));
  await page.evaluate(async ({ name, VIEWS }) => {
    const p = window.NANRO.player, v = VIEWS[name];
    const until = (f) => new Promise((r) => { const t = setInterval(() => { if (f()) { clearInterval(t); r(); } }, 50); });
    if (name.startsWith('book') || name.startsWith('demo')) {
      // demo*: 견본 책(tools/sample-epub.mjs가 만든다), 사진을 공개해도 된다. book*: 로컬 테스트용 책(books/test.epub, 저장소에는 넣지 않는다)을 서재에 넣고 펼친다
      const R = window.NANRO.reading, fn = name.startsWith('demo') ? 'sample.epub' : name.includes('pdf') ? 'test.pdf' : 'test.epub', f = await (await fetch('/books/' + fn)).blob();
      await R.reader.ready; const meta = await R.reader.addFile(new File([f], fn)); R.setPicked(meta.id);
      p.seatNow(window.NANRO.ctx.interact.find(i => i.id === (name.includes('wing') ? 'chair:wing' : 'chair:reading')).chair); p.openBook();
      await until(() => !p.tween && R.reader.cur && !R.opening);
      const m = name.match(/^(?:book|demo)(\d+)/); if (m) await R.reader.gotoPage(+m[1]);
      if (name.endsWith('old')) await R.reader.setMeta(meta.id, { age: 'old' });
      if (name.includes('skip')) await R.reader.setMeta(meta.id, { skipCover: true });   // 표지(첫 쪽) 빼기
      if (m && !name.includes('pdf')) { const pg = R.reader.pages[R.reader.cur.spread], g = pg.g0 + 60; R.reader.addHighlight(g, g + 70, 'yellow'); R.reader.addHighlight(g + 160, g + 215, 'pencil', '다시 읽어 볼 것'); R.reader.addHighlight(g + 300, g + 350, 'blue'); R.reader.toggleBookmark(); }
      if (name.includes('flip')) { R.reader.set.flip = 9999; R.reader.next(); await until(() => R.reader.book3d.flip); R.reader.book3d.flip.t = 0.42; }
      if (name.includes('opening')) { R.setRise(0.45); await new Promise((r) => setTimeout(r, 1500)); }
      if (name.includes('single')) { R.reader.set.single = true; R.place(); }
      { const ev = name.match(/ev(\d+)/); if (ev) R.reader.set.bEven = +ev[1] / 100; }   // 밝기 고르게(%)
      { const dl = name.match(/dl([\d.]+)_([\d.]+)/); if (dl) R.debugLight = { direct: +dl[1], fill: +dl[2] }; }   // 종이 빛 보정용: 바로 받는 빛과 채우는 빛을 따로 본다
      if (name.includes('hands')) { R.reader.set.hands = true; R.place(); await R.hands.ready; await new Promise((r) => setTimeout(r, 1200)); }
      // demo…notes: 메모장을 펴고 견본 메모를 넣는다(notesview 는 미리 보기)
      if (name.includes('notes')) {
        const N = window.NANRO.notes; await N.open(); R.reader.setSelection(null);
        N.editor.setValue('## 읽으며 적은 것\n\n- **불**은 서두르는 사람을 좋아하지 않는다\n- 굵은 장작은 *비스듬히* 얹는다\n- [x] 2장까지 읽기\n- [ ] 마지막 장 다시 읽기\n');
        N.editor.buttons.here.click();
        N.editor.insertBlock('| 장 | 한 줄로 |\n| --- | --- |\n| 1. 첫눈 | 오두막에 불을 지핀다 |\n| 2. 불 피우기 | 기다리는 법 |');
        document.querySelector('#notes .tags input').value = '겨울, 다시 읽기';
        if (name.includes('view')) await N.editor.setPreview(true);
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (name.includes('look')) { Object.assign(R.reader.set, { vPitch: -17, vYaw: name.includes('wing') ? -32 : 30, vFov: 62, bH: 0.13, bTilt: 58, bDist: 0.42 }); R.place(); await new Promise((r) => setTimeout(r, 1500)); }
      setTimeout(() => console.error('[bookE] ' + name + ' ' + R.lastE), 4000);
      window.__bookReady = true;
    } else if (name === 'seated' || name === 'reading') {
      if (p.state === 'walk') { p.sit(window.NANRO.ctx.interact.find(i => i.id === 'chair:reading').chair); await until(() => p.state === 'seated' && !p.tween); }
      if (name === 'reading') { p.openBook(); await until(() => !p.tween); }
    } else if (v) {
      if (v.sample) { const R = window.NANRO.reading; await R.reader.ready; const f = await (await fetch('/books/sample.epub')).blob(); const meta = await R.reader.addFile(new File([f], 'sample.epub')); R.setPicked(meta.id); }
      p.pos.x = v.pos[0]; p.pos.z = v.pos[1]; p.pitch = v.pitch; p.feet = window.NANRO.ctx.groundAt?.(p.pos.x, p.pos.z) ?? 0;
      if (v.door) { window.NANRO.ctx.door.toggle(); window.NANRO.ctx.door.t = 0.999; }
      if (v.env) window.NANRO.env.set(v.env);
      if (v.look !== undefined) {                       // 방위각(북 0, 동 90)으로 바라보기. 장면에서 북 = +Z, 동 = -X
        const S = window.NANRO.env.state, m = window.NANRO.env.sky.u.moonDir.value, mAz = Math.atan2(-m.x, m.z), mAlt = Math.asin(m.y) * 180 / Math.PI;
        const az = v.look === 'sun' ? S.sunAz : v.look === 'moon' ? mAz : v.look * Math.PI / 180;
        p.yaw = Math.atan2(Math.sin(az), -Math.cos(az));
        if (v.look === 'sun' || v.look === 'moon') p.pitch = Math.max(-0.3, Math.min(1.2, (v.look === 'sun' ? S.sunAlt : mAlt) * Math.PI / 180 + 0.12));
      } else p.yaw = Math.atan2(-(v.yaw[0] - v.pos[0]), -(v.yaw[1] - v.pos[1]));
    }
  }, { name, VIEWS });
  // 시간 대신 프레임 수로 기다린다(불이 붙어 자리 잡는 데 약 250프레임).
  if (name.startsWith('book') || name.startsWith('demo')) { await page.waitForFunction(() => window.__bookReady, null, { timeout: 300000 }); await page.waitForTimeout(1500); }
  await page.waitForFunction((n) => (window.__nanroFrames | 0) >= n, frames, { timeout: 900000, polling: 500 });
  const url64 = await page.evaluate(({ W, H }) => window.NANRO.capture(W, H), { W, H });
  if (DOM) {
    await page.evaluate(async ({ url64, evalJs }) => { const im = new Image(); im.src = url64; im.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:1'; document.body.insertBefore(im, document.body.firstChild); await im.decode(); if (evalJs) await (0, eval)(`(async () => { ${evalJs} })()`); }, { url64, evalJs });
    await page.waitForTimeout(700); await page.screenshot({ path: `shots/${name}.png` });
  } else
  writeFileSync(`shots/${name}.png`, Buffer.from(url64.split(',')[1], 'base64'));
  console.log('shots/' + name + '.png', await page.evaluate(() => document.getElementById('stats').textContent.replace(/\n/g, ' | ')));
  await page.close();
}
await browser.close();
