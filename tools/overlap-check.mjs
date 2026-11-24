// 겹치는 면(같은 평면에 겹친 두 면, 화면에서 깜빡임의 원인)이 남아 있는지 본다.
//   npm run dev (다른 터미널) 뒤에  node tools/overlap-check.mjs [--raw]
// --raw: 정리하기 전의 겹침을 센다(주소 옵션 nocoplanar). 남아 있는 겹침이 있으면 목록을 찍고 종료 코드 1.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const raw = process.argv.includes('--raw');
const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--use-webgpu-adapter=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto((process.env.NANRO_URL || 'http://127.0.0.1:5320') + '/?headless&nofire&fixed' + (raw ? '&nocoplanar' : ''));
await page.waitForFunction(() => window.NANRO?.ready, null, { timeout: 120000 });
const list = await page.evaluate(async () => {
  const { findCoplanar } = await import('/src/scene/coplanar.js');
  const name = (m) => { const n = []; for (let o = m; o && n.length < 3; o = o.parent) if (o.name) n.push(o.name); return n.join(' < ') || m.geometry.type; };
  return findCoplanar(window.NANRO.scene).map((p) => ({ a: name(p.a.mesh), b: name(p.b.mesh), axis: 'xyz'[p.axis] + (p.side > 0 ? '+' : '-'), at: p.a.mesh.getWorldPosition(new p.a.mesh.position.constructor()).toArray().map((v) => +v.toFixed(2)), area: +(p.area * 1e4).toFixed(1) }));
});
for (const l of list.slice(0, 80)) console.log(`${l.axis}  ${l.a}  ×  ${l.b}  @ ${l.at.join(',')}  (${l.area} cm²)`);
console.log(`겹치는 면 ${list.length}쌍` + (raw ? ' (정리 전)' : ''));
await browser.close();
process.exit(!raw && list.length ? 1 : 0);
