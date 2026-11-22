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
};

mkdirSync('shots', { recursive: true });
const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader', '--use-webgpu-adapter=swiftshader', '--ignore-gpu-blocklist'] });
// 소프트웨어 WebGPU에서는 두 번째 읽어오기가 멈추는 일이 있어, 장면마다 새 페이지를 연다.
for (const name of names) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text().slice(0, 400)); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(url + '?' + query);
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
      if (m && !name.includes('pdf')) { const pg = R.reader.pages[R.reader.cur.spread], g = pg.g0 + 60; R.reader.addHighlight(g, g + 70, 'yellow'); R.reader.addHighlight(g + 160, g + 215, 'pencil', '다시 읽어 볼 것'); R.reader.addHighlight(g + 300, g + 350, 'blue'); R.reader.toggleBookmark(); }
      if (name.includes('flip')) { R.reader.set.flip = 9999; R.reader.next(); await until(() => R.reader.book3d.flip); R.reader.book3d.flip.t = 0.42; }
      if (name.includes('opening')) { R.setRise(0.45); await new Promise((r) => setTimeout(r, 1500)); }
      if (name.includes('single')) { R.reader.set.single = true; R.place(); }
      if (name.includes('look')) { Object.assign(R.reader.set, { vPitch: -17, vYaw: name.includes('wing') ? -32 : 30, vFov: 62, bH: 0.13, bTilt: 58, bDist: 0.42 }); R.place(); await new Promise((r) => setTimeout(r, 1500)); }
      window.__bookReady = true;
    } else if (name === 'seated' || name === 'reading') {
      if (p.state === 'walk') { p.sit(window.NANRO.ctx.interact.find(i => i.id === 'chair:reading').chair); await until(() => p.state === 'seated' && !p.tween); }
      if (name === 'reading') { p.openBook(); await until(() => !p.tween); }
    } else if (v) {
      p.pos.x = v.pos[0]; p.pos.z = v.pos[1]; p.pitch = v.pitch;
      p.yaw = Math.atan2(-(v.yaw[0] - v.pos[0]), -(v.yaw[1] - v.pos[1]));
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
