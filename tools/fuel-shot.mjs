// 화실 장작 상태별 사진: node tools/fuel-shot.mjs 1,1,1 0.5,0.25,0.08,6,10 0,0,0,0,0  (장작 셋의 남은 양, 더미 개수, 선반 개수) → shots/fuelN.png
import { createRequire } from 'node:module'; const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader', '--use-webgpu-adapter=swiftshader', '--ignore-gpu-blocklist'] });
const fuels = process.argv.slice(2).map((s) => s.split(',').map(Number));
for (const [k, fu] of fuels.entries()) {
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message)); page.on('console', (m) => { if (m.type() === 'error') console.log('[err]', m.text().slice(0, 300)); });
  await page.goto('http://127.0.0.1:5320/?q=test&fixed&headless&time=13&fresh');
  await page.waitForFunction(() => window.NANRO?.ready, null, { timeout: 120000 });
  await page.evaluate(() => { document.getElementById('start').style.display = 'none'; });
  await page.evaluate(() => Promise.all([window.NANRO.texturesReady, window.NANRO.brickReady]));
  await page.evaluate((fu) => { const N = window.NANRO, h = N.cozy.hearth; h.fuel = fu.slice(0, 3); h.pile = fu[3] ?? 15; h.rack = fu[4] ?? 18; N.prefs.logMinutes = 1e6; N.fire.setFuel(h.fuel); N.ctx.woodPile.userData.setCount(h.pile); N.ctx.woodRack.userData.setCount(h.rack);
    const p = N.player; p.pos.x = 4.15; p.pos.z = 1.6; p.pitch = -0.62; p.yaw = Math.atan2(-(5.33 - 4.15), -(1.6 - 1.6)); N.camera.fov = 40; N.camera.updateProjectionMatrix(); N.prefs.fov = 40; }, fu);
  await page.waitForFunction((n) => (window.__nanroFrames | 0) >= n, 230, { timeout: 900000, polling: 500 });
  const url = await page.evaluate(() => window.NANRO.capture(1280, 720));
  (await import('node:fs')).writeFileSync(`shots/fuel${k}.png`, Buffer.from(url.split(',')[1], 'base64')); console.log('fuel' + k); await page.close();
}
await b.close();
