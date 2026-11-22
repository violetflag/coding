// 사용 흐름 시험: 시작 화면에서 실제로 단추를 눌러 읽기까지 가는지 확인한다.
//   npm run dev (다른 터미널) 뒤에  node tools/flow.mjs
// 견본 책(books/sample.epub, tools/sample-epub.mjs 가 만든다)을 파일 고르기 창으로 넣는다. 실패하면 종료 코드 1.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

// 묶은 결과(dist)를 시험하려면  npx vite preview --port 5321  뒤에 NANRO_URL=http://127.0.0.1:5321 을 준다.
const url = (process.env.NANRO_URL || 'http://127.0.0.1:5320') + '/?nofire&fixed&fresh&time=13';
mkdirSync('shots/flow', { recursive: true });
// 실제 GPU로 돌리려면 환경 변수 NANRO_GPU=1 (Edge 창이 잠깐 뜬다). 기본은 소프트웨어 렌더러라서 화면 그리기는 확인하지 못하고 동작의 흐름만 확인한다.
// 윈도우 프로그램(src-tauri)을 시험하려면: 프로그램을 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9336 으로 켠 뒤
//   NANRO_CDP=http://127.0.0.1:9336 NANRO_URL=https://tauri.localhost node tools/flow.mjs   (켜져 있는 창에 붙어서 시험한다)
const CDP = process.env.NANRO_CDP;
const GPU = !!process.env.NANRO_GPU || !!CDP;
const browser = CDP ? await chromium.connectOverCDP(CDP) : await chromium.launch(GPU ? { channel: 'msedge', headless: false, args: ['--enable-unsafe-webgpu'] } : { args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader', '--use-webgpu-adapter=swiftshader', '--ignore-gpu-blocklist'] });
const page = CDP ? browser.contexts()[0].pages()[0] : await browser.newPage({ viewport: { width: 1280, height: 720 } });
// 소프트웨어 렌더러에서는 화면에 직접 그리는 길에서 그래픽 장치가 끊긴다(이 시험 환경의 한계). 그 알림은 실제 GPU로 돌릴 때만 오류로 센다.
const errors = [], note = (t) => { if (/favicon|404 \(Not Found\)|not valid for pointer lock/.test(t)) return; if (GPU || !/Device Lost|Instance dropped|방 그리기를 멈춥니다/.test(t)) errors.push(t.slice(0, 300)); };
page.on('pageerror', (e) => note(e.message)); page.on('console', (m) => { if (m.type() === 'error') note(m.text()); });
let fail = 0;
const check = (name, ok, extra = '') => { console.log((ok ? '통과 ' : '실패 ') + name + (extra ? '  (' + extra + ')' : '')); if (!ok) fail++; };
const vis = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const c = getComputedStyle(e); return c.display !== 'none' && c.visibility !== 'hidden' && +c.opacity > 0.05 && e.getBoundingClientRect().width > 0; }, sel);
const state = () => page.evaluate(() => window.NANRO.player.state);
// 시작 카드는 0.7초에 걸쳐 흐려지고, 창이 가려져 있으면 그 움직임이 멈추기도 한다. 그래서 '사라졌다'는 흐려진 정도가 아니라 꺼짐 표시로 판단한다.
const cardOff = () => page.evaluate(() => document.getElementById('start').classList.contains('off'));
const pauseOn = () => page.evaluate(() => document.getElementById('pause').classList.contains('on'));
const waitFor = (f, arg, t = 60000) => page.waitForFunction(f, arg, { timeout: t, polling: 200 }).then(() => true, () => false);

await page.goto(url);
await page.waitForFunction(() => window.NANRO?.ready, null, { timeout: 120000 });
await waitFor(() => !document.getElementById('startActs').hidden);

// 1. 처음 화면
check('시작 카드가 보인다', await vis('#start'));
const label0 = await page.textContent('#goRead');
check('책이 없을 때 단추 글이 "책 넣고 읽기"', label0.includes('책 넣고 읽기'), label0.trim().slice(0, 30));
await page.screenshot({ path: 'shots/flow/1-start.png' });

// 2. 조작법 창
await page.click('#openHelp'); await page.waitForTimeout(400);
check('조작법 창이 열린다', await vis('#help'));
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
check('Esc 로 조작법 창이 닫힌다', !(await vis('#help')));
check('닫은 뒤 시작 카드가 그대로 있다', await vis('#start'));

// 3. 책 넣고 읽기: 파일을 고르면 바로 앉아서 책이 펴진다
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#goRead')]);
await chooser.setFiles('books/sample.epub');
const reached = await waitFor(() => window.NANRO.player.state === 'reading' && window.NANRO.reading.reader.cur && !window.NANRO.reading.opening, null, 120000);
check('파일을 고르면 읽기 상태가 된다', reached, await state());
await waitFor(() => !window.NANRO.reading.moving, null, 30000);
check('시작 카드가 사라진다', await cardOff());
check('책이 화면에 나와 있다', await page.evaluate(() => window.NANRO.reading.reader.book3d.group.visible));
await page.waitForTimeout(800); await page.screenshot({ path: 'shots/flow/2-reading.png' });

// 4. 쪽 넘기기
const before = await page.evaluate(() => window.NANRO.reading.reader.cur.spread);
await page.keyboard.press('ArrowRight');
const turned = await waitFor((b) => window.NANRO.reading.reader.cur.spread !== b && !window.NANRO.reading.reader.book3d.flipping, before, 60000);
check('오른쪽 화살표로 다음 쪽으로 넘어간다', turned);

// 5. 책 덮기: 앉은 상태로 돌아가고, 시작 카드는 다시 뜨지 않는다
await page.keyboard.press('Escape');
const closed = await waitFor(() => window.NANRO.player.state === 'seated', null, 30000);
check('Esc 로 책을 덮으면 앉은 상태가 된다', closed, await state());
await page.waitForTimeout(900);
check('책을 덮은 뒤 시작 카드가 다시 뜨지 않는다', await cardOff());
// 마우스가 잡혀 있으면 가운데 점만, 풀리면(Esc) 시작 카드 대신 작은 멈춤 띠가 뜬다
await page.evaluate(() => document.exitPointerLock()); await page.waitForTimeout(600);
check('마우스가 풀리면 멈춤 띠가 보인다', await pauseOn());
check('그때도 시작 카드는 뜨지 않는다', await cardOff());
await page.screenshot({ path: 'shots/flow/3-closed.png' });

// 6. 다시 열었을 때: 단추가 "이어서 읽기"로 바뀌고 한 번에 읽던 곳으로 간다
await page.goto(url.replace('&fresh', ''));
await page.waitForFunction(() => window.NANRO?.ready, null, { timeout: 120000 });
await waitFor(() => !document.getElementById('startActs').hidden);
const label1 = await page.textContent('#goRead');
check('다시 열면 단추 글이 "이어서 읽기"', label1.includes('이어서 읽기'), label1.trim().slice(0, 40));
await page.screenshot({ path: 'shots/flow/4-resume.png' });
if (await state() !== 'reading') await page.click('#goRead');
const again = await waitFor(() => window.NANRO.player.state === 'reading' && window.NANRO.reading.reader.cur && !window.NANRO.reading.opening, null, 120000);
check('"이어서 읽기" 한 번으로 읽기 상태가 된다', again, await state());
const spread = await page.evaluate(() => window.NANRO.reading.reader.cur?.spread);
check('읽던 쪽에서 이어진다', spread > 0, '펼침면 ' + spread);

// 7. 처음 화면에 책 파일을 끌어다 놓아도 바로 읽기로 간다
await page.goto(url);
await page.waitForFunction(() => window.NANRO?.ready, null, { timeout: 120000 });
await waitFor(() => !document.getElementById('startActs').hidden);
await page.evaluate((b64) => { const f = new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'sample.epub'), dt = new DataTransfer(); dt.items.add(f); dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); }, readFileSync('books/sample.epub').toString('base64'));
const dropped = await waitFor(() => window.NANRO.player.state === 'reading' && window.NANRO.reading.reader.cur && !window.NANRO.reading.opening, null, 120000);
check('시작 화면에 책을 끌어다 놓으면 읽기 상태가 된다', dropped, await state());
await page.waitForTimeout(1000);   // 시작 카드는 0.7초에 걸쳐 흐려진다
check('그때 시작 카드가 사라진다', await cardOff());

check('오류가 없다', errors.length === 0, errors.slice(0, 3).join(' / '));
await browser.close();
console.log(fail ? `실패 ${fail}건` : '모두 통과');
process.exit(fail ? 1 : 0);
