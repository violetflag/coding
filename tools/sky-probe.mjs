// 개발용: 헤드리스로 페이지를 열어 하늘 상태를 출력한다. node tools/sky-probe.mjs "<주소 옵션>" "<평가할 식>"
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const url = process.env.NANRO_URL || 'http://127.0.0.1:5332';
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader', '--use-webgpu-adapter=swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage();
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text().slice(0, 300)); });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto(url + '/?' + (process.argv[2] || 'q=test&fixed&headless&time=13&date=2026-01-15&weather=clear'));
await p.waitForFunction(() => window.NANRO?.ready, null, { timeout: 120000 });
await p.waitForFunction(() => (window.__nanroFrames | 0) >= 20, null, { timeout: 300000 });
console.log(await p.evaluate(process.argv[3] || '(() => { const s = NANRO.env.sky, u = s.u; return JSON.stringify({ lines: s.lines?.visible, labels: s.labels?.visible, stars: s.stars?.visible, milky: s.milky?.visible, sun: s.sun.visible, moon: s.moon.visible, lim: u.lim.value, mw: u.mw.value, moonI: u.moonI.value, sunDisc: u.sunDisc.value }); })()'));
if (process.env.SHOT) { await p.waitForFunction(() => (window.__nanroFrames | 0) >= 40, null, { timeout: 300000 }); const u = await p.evaluate(() => window.NANRO.capture(1280, 720)); (await import('node:fs')).writeFileSync(process.env.SHOT, Buffer.from(u.split(',')[1], 'base64')); }
await b.close();
