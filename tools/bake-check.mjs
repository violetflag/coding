// 미리 만든 초고화질 불 점검: 아주 작은 격자로 짧게 만들어 보고(src/fire/bake.js), 앉았을 때 그 동영상이 벽난로 구멍 자리에 맞게 나오는지 본다(src/fire/baked.js).
//   npm run dev (다른 터미널) 뒤  NANRO_URL=http://127.0.0.1:5320 node tools/bake-check.mjs
// GPU가 있는 컴퓨터에서는 NANRO_GPU=1 로 실제 그래픽카드를 쓴다. NANRO_BAKE="grid=240&secs=5" 처럼 만들기 옵션을 바꿀 수 있다.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const URL0 = (process.env.NANRO_URL || 'http://127.0.0.1:5320').replace(/\/$/, '') + '/', GPU = !!process.env.NANRO_GPU;
const bakeQ = process.env.NANRO_BAKE || 'grid=48&secs=0.6&fps=10&settle=0.3&warm=1&spp=1&screen=1280x720&notex&states=3,1&fq=simhz:30,sparks:2048,stepMul:1,vcycles:1';
let fails = 0; const ok = (c, msg) => { console.log((c ? '통과 ' : '실패 ') + msg); if (!c) fails++; };

mkdirSync('shots', { recursive: true });
const browser = await chromium.launch(GPU ? { channel: 'msedge', headless: false, args: ['--enable-unsafe-webgpu'] } : { args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader', '--use-webgpu-adapter=swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const log = (page) => { page.on('console', (m) => { if (m.type() === 'error') console.log('[error]', m.text().slice(0, 300)); }); page.on('pageerror', (e) => console.log('[pageerror]', e.message)); };

// 1. 만들기
let page = await ctx.newPage(); log(page);
await page.goto(URL0 + '?bake=auto&' + bakeQ);
await page.waitForFunction(() => ['done', 'error'].includes(window.NANRO_BAKE?.state), null, { timeout: 3600000, polling: 500 });
const bake = await page.evaluate(() => ({ ...window.NANRO_BAKE }));
ok(bake.state === 'done', `만들기 끝남 (${bake.state}${bake.error ? ': ' + bake.error : ''}, 격자 ${bake.res}, ${Math.round(bake.seconds || 0)}초, 한 걸음 ${Math.round(bake.msPerStep)}ms)`);
await page.screenshot({ path: 'shots/bake-done.png' });
await page.close();

// 2. 틀기: 읽기 의자에 앉으면 동영상이 구멍 자리에 붙는지
page = await ctx.newPage(); log(page);
await page.goto(URL0 + (GPU ? '?fixed&mute' : '?q=test&fixed&headless&mute'));
await page.waitForFunction(() => window.NANRO?.ready, null, { timeout: 180000 });
await page.evaluate(() => { document.getElementById('start').style.display = 'none'; });
const info = await page.evaluate(async () => {
  const N = window.NANRO, B = N.ctx.fireBaked; for (let i = 0; i < 100 && !B.seats.length; i++) await new Promise((r) => setTimeout(r, 100));
  return { seats: B.seats.map((s) => s.id), clips: B.seats[0] ? Object.keys(B.seats[0].clips) : [], w: B.info?.w, h: B.info?.h, codec: B.info?.codec, bytes: B.seats.flatMap((s) => Object.values(s.clips).map((c) => c.size)) };
});
ok(info.seats.length === 2 && info.clips.length >= 1, `저장된 동영상을 읽음 (자리 ${info.seats}, 상태 ${info.clips}, ${info.w}×${info.h}, ${info.codec}, 크기 ${info.bytes.map((b) => Math.round(b / 1024) + 'KB')})`);
ok(info.bytes.every((b) => b > 2000), '동영상 파일이 비어 있지 않음');

// 구멍 입구의 네 귀퉁이를 두 길로 화면에 옮겨 견준다: (가) 지금 시점으로 바로 투영, (나) 동영상 속 자리를 구한 뒤 동영상에 걸린 변환으로. 눈 자리가 같으면 같아야 한다
const probe = () => page.evaluate(() => {
  const N = window.NANRO, B = N.ctx.fireBaked, cam = N.camera, el = document.getElementById('fireBaked');
  const q = B.seat?.quad || B._quad, eye = cam.position, M = new DOMMatrix(getComputedStyle(el).transform), V = q[0].constructor;
  const hole = N.ctx.fireHole, hw = hole.geometry.parameters.width / 2, hh = hole.geometry.parameters.height / 2; hole.updateMatrixWorld();
  let err = 0;
  if (q) for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) {
    const X = new V(sx * hw, sy * hh, 0).applyMatrix4(hole.matrixWorld);
    const a = X.clone().applyMatrix4(cam.matrixWorldInverse).applyMatrix4(cam.projectionMatrix), ax = (a.x + 1) / 2 * innerWidth, ay = (1 - a.y) / 2 * innerHeight;
    // 눈에서 X로 가는 선이 동영상 네모의 평면과 만나는 곳 → 동영상 속 자리(0~1)
    const e1 = q[1].clone().sub(q[0]), e2 = q[3].clone().sub(q[0]), n = e1.clone().cross(e2), d = X.clone().sub(eye), t = q[0].clone().sub(eye).dot(n) / d.dot(n), P = eye.clone().addScaledVector(d, t).sub(q[0]);
    const u = P.dot(e1) / e1.lengthSq(), v = P.dot(e2) / e2.lengthSq(), b = M.transformPoint(new DOMPoint(u * B.info.w, v * B.info.h, 0, 1));
    err = Math.max(err, Math.hypot(b.x / b.w - ax, b.y / b.w - ay));
  }
  return { full: B.full, gain: B.gain, clip: B.video?._clip?.name, t: B.video?.currentTime, level: B.level, power: B.power, hidden: N.fire.hidden, vis: el.style.visibility, err };
});
const seat = (id) => page.evaluate(async (id) => { const N = window.NANRO, p = N.player; if (p.state !== 'walk') { p.chair = null; p._setState('walk'); } p.seatNow(N.ctx.interact.find((i) => i.id === 'chair:' + id).chair); }, id);
const waitFull = () => page.waitForFunction(() => window.NANRO.ctx.fireBaked.full, null, { timeout: 120000, polling: 200 });

for (const id of ['reading', 'wing']) {
  await seat(id); await page.evaluate(() => { const p = window.NANRO.player; p.yaw = Math.atan2(-(5.4 - p.pos.x), -(2.3 - p.pos.z)); p.pitch = -0.2; });
  await waitFull(); await page.waitForTimeout(600);
  const a = await probe();
  ok(a.full && a.hidden && a.vis === 'visible', `${id}: 앉으면 미리 만든 불이 나오고 실시간 불은 쉼 (${a.clip}, 불 세기 ${a.power})`);
  ok(a.err < 1.5, `${id}: 동영상 속 구멍이 방의 구멍 자리에 맞음 (어긋남 ${a.err.toFixed(2)}픽셀)`);
  await page.evaluate(() => { const c = document.getElementById('room'); c.style.visibility = 'hidden'; }); await page.screenshot({ path: `shots/baked-${id}.png` }); await page.evaluate(() => { document.getElementById('room').style.visibility = ''; });
  // 고개를 돌려도 따라와야 한다
  await page.evaluate(() => { const p = window.NANRO.player; p.yaw += 0.22; p.pitch = 0.05; }); await page.waitForTimeout(700);
  const b = await probe();
  ok(b.full && b.err < 1.5, `${id}: 고개를 돌려도 구멍 자리에 맞음 (어긋남 ${b.err.toFixed(2)}픽셀)`);
  const t1 = b.t; await page.waitForTimeout(500); const c = await probe();
  ok(c.t !== t1, `${id}: 동영상이 흘러감 (${t1?.toFixed(2)} → ${c.t?.toFixed(2)}초, 불빛 ${c.level.toFixed(2)})`);
}
// 장작 수가 바뀌면 그 상태의 동영상으로
await page.evaluate(() => { const h = window.NANRO.cozy.hearth; h.fuel[1] = 0; h.fuel[2] = 0; });
await page.waitForFunction(() => window.NANRO.ctx.fireBaked.video?._clip?.name === 'loop1', null, { timeout: 60000, polling: 200 }).catch(() => {});
const d = await probe(); ok(d.clip === 'loop1', `장작이 하나 남으면 그 상태의 동영상으로 바뀜 (${d.clip}, 불 세기 ${d.power})`);
// 일어서면 실시간 불로
await page.evaluate(() => { const p = window.NANRO.player; p.chair = null; p._setState('walk'); p.pos.x = 3.2; p.pos.z = 2.0; });
await page.waitForFunction(() => !window.NANRO.ctx.fireBaked.active, null, { timeout: 60000, polling: 200 }).catch(() => {});
const e = await probe(); ok(!e.full && e.gain === 0 && !e.hidden, '일어서면 실시간 불로 돌아옴');
await browser.close();
console.log(fails ? `실패 ${fails}개` : '모두 통과');
process.exit(fails ? 1 : 0);
