// 미리 준비(warm-up) 확인: 책을 펴고, 처음 넘기고, 처음 덮을 때 그리기 준비(렌더 파이프라인 만들기)가 새로 몇 번 일어나는지 센다.
//   node tools/warm-check.mjs            미리 준비 켬(기본)
//   node tools/warm-check.mjs nowarmup   끔(비교용)
// 실제 GPU로 재려면 환경 변수 NANRO_GPU=1 (Edge 창이 잠깐 뜬다). 그때는 구간마다 가장 긴 프레임 간격(ms)도 함께 나온다.
// 소프트웨어 렌더러(기본)에서는 화면에 직접 그리는 길에서 그래픽 장치가 끊겨 숫자를 믿을 수 없다. 이 확인은 실제 GPU에서만 뜻이 있다.
// 숫자가 0에 가까울수록 그 순간의 끊김이 없다. 개발 서버와 books/sample.epub 이 필요하다.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const flag = process.argv[2] ? '&' + process.argv[2] : '';
const GPU = !!process.env.NANRO_GPU;
const browser = await chromium.launch(GPU ? { channel: 'msedge', headless: false, args: ['--enable-unsafe-webgpu'] } : { args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader', '--use-webgpu-adapter=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(() => {
  window.__pipes = 0; window.__gap = 0; let last = 0; const tick = (t) => { if (last) window.__gap = Math.max(window.__gap, t - last); last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  for (const k of ['createRenderPipeline', 'createRenderPipelineAsync']) { const f = GPUDevice.prototype[k]; GPUDevice.prototype[k] = function (...a) { window.__pipes++; return f.apply(this, a); }; }
});
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(Math.round(performance.now()) + 'ms ' + m.text().slice(0, 200)); });
const pipes = () => page.evaluate(() => window.__pipes), gap = () => page.evaluate(() => { const g = Math.round(window.__gap); window.__gap = 0; return g; }), frames = (n) => page.evaluate((n) => new Promise((r) => { const f = () => (n-- > 0 ? requestAnimationFrame(f) : r()); f(); }), n);
const wait = (f, arg) => page.waitForFunction(f, arg, { timeout: 120000, polling: 200 });
await page.goto('http://127.0.0.1:5320/?nofire&fixed&fresh&time=13' + flag);
await wait(() => window.NANRO?.ready); await wait(() => !document.getElementById('startActs').hidden);
await page.evaluate(() => window.NANRO.texturesReady); await page.waitForTimeout(6000); await frames(10);
const p0 = await pipes(); await gap();
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#goRead')]);
await chooser.setFiles('books/sample.epub');
await wait(() => window.NANRO.player.state === 'reading' && window.NANRO.reading.reader.cur && !window.NANRO.reading.opening);
await wait(() => !window.NANRO.reading.moving); await frames(10);
const p1 = await pipes(), g1 = await gap(); await page.waitForTimeout(1500); await gap();
const before = await page.evaluate(() => window.NANRO.reading.reader.cur.spread);
await page.keyboard.press('ArrowRight');
await wait((b) => window.NANRO.reading.reader.cur.spread !== b && !window.NANRO.reading.reader.book3d.flipping, before); await frames(10);
const p2 = await pipes(), g2 = await gap(); await page.waitForTimeout(1500); await gap();
await page.keyboard.press('Escape');
await wait(() => window.NANRO.player.state === 'seated'); await page.waitForTimeout(1500); await frames(10);
const p3 = await pipes(), g3 = await gap();
console.log(`${flag ? '미리 준비 끔' : '미리 준비 켬'}: 시작 화면까지 ${p0}개 · 책을 펼 때 +${p1 - p0} (${g1}ms) · 처음 넘길 때 +${p2 - p1} (${g2}ms) · 처음 덮을 때 +${p3 - p2} (${g3}ms)${errors.length ? ' · 오류: ' + errors.slice(0, 2).join(' / ') : ''}`);
await browser.close();
