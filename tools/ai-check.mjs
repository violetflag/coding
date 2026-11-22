// 메모 그림(AI → Excalidraw) 흐름 점검. 키와 인터넷 없이 시험 모드(?aimock)로 돈다.
//   NANRO_URL=http://127.0.0.1:5335 node tools/ai-check.mjs
// 확인: 처음 켤 때 그림판 묶음을 불러오지 않음, 그림 만들기 → 요소 생성 → 메모 옆 저장, 창이 열린 동안 방의 키가 먹지 않음,
//       PNG 내보내기, 닫고 다시 열면 저장된 그림을 읽음(AI를 다시 부르지 않음), 다시 만들기, 키가 없을 때와 연결 실패 때의 안내.
// shots/ai-*.png 로 화면도 남긴다.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const URL0 = (process.env.NANRO_URL || 'http://127.0.0.1:5320').replace(/\/$/, '');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
mkdirSync('shots', { recursive: true });

const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--use-webgpu-adapter=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const reqs = [];
page.on('request', (r) => reqs.push(r.url()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[error]', m.text().slice(0, 300)); });
await page.goto(URL0 + '/?q=test&fixed&headless&aimock');
await page.waitForFunction(() => window.NANRO?.ready && window.NANRO_AI, null, { timeout: 180000 });
ok(!reqs.some((u) => /excalidraw|\/src\/ai\/view|\/src\/ai\/claude|anthropic-ai/.test(u)), '처음 켤 때 그림판과 API 묶음을 불러오지 않음');

const NOTE = `# 겨울 난롯가에서 — 읽으며 적은 것\n\n- 불은 한 번 붙이고 끝이 아니다. **조금씩 자주** 장작을 넣어야 한다.\n- 바람길을 열어 둘 것. 한꺼번에 많이 넣으면 연기만 난다.\n- 숯불이 남아 있으면 다시 살아난다 (할머니가 불씨를 묻어 두던 장면)\n\n> 꾸준한 작은 돌봄이 따뜻함을 오래 지킨다\n\n나에게 숯불 같은 습관은 무엇일까? 책도 매일 몇 쪽씩.`;
await page.evaluate((NOTE) => {
  window.__store = {}; window.__saves = 0;
  window.__open = () => window.NANRO_AI.openDiagram({
    markdown: NOTE, meta: { title: '겨울 난롯가에서', author: '난로 견본', position: '3장' }, noteFile: '겨울 난롯가에서.md',
    saveNoteFile: async (n, t) => { window.__store[n] = t; window.__saves++; },
    readNoteFile: async (n) => window.__store[n] ?? null,
  });
}, NOTE);

// 1) 새로 만들기
const t0 = Date.now();
let r = await page.evaluate(async () => { const h = await window.__open(); return { state: h.state, count: h.count(), keys: Object.keys(window.__store), saves: window.__saves }; });
ok(r.state === 'generated', `그림 만들기: ${r.state} (${Date.now() - t0}ms)`);
ok(r.count >= 20, `Excalidraw 요소 ${r.count}개`);
ok(r.keys.includes('겨울 난롯가에서.excalidraw') && r.saves === 1, `메모 옆에 저장: ${r.keys.join(', ')}`);
const saved = await page.evaluate(() => JSON.parse(window.__store['겨울 난롯가에서.excalidraw']));
ok(saved.type === 'excalidraw' && saved.elements.length === r.count, `저장 파일은 Excalidraw 형식, 요소 ${saved.elements.length}개`);
const arrows = saved.elements.filter((e) => e.type === 'arrow');
ok(arrows.length >= 5 && arrows.every((a) => a.startBinding?.elementId && a.endBinding?.elementId), `화살표 ${arrows.length}개가 모두 양 끝 상자에 붙음`);
const boxes = saved.elements.filter((e) => e.type === 'rectangle' && e.id.startsWith('n_'));
ok(boxes.every((b) => b.boundElements?.some((x) => x.type === 'text')), `상자 ${boxes.length}개 모두 글이 안에 붙음`);
ok(reqs.some((u) => /excalidraw\/fonts\//.test(u)) && !reqs.some((u) => /esm\.sh|unpkg|jsdelivr/.test(u)), '글꼴을 이 프로그램에서 읽음(CDN 없음)');
ok(!reqs.some((u) => /api\.anthropic\.com/.test(u)), '시험 모드는 API로 아무것도 보내지 않음');
await page.waitForTimeout(800);
await page.screenshot({ path: 'shots/ai-diagram.png' });

// 2) 창이 열린 동안 방의 키가 먹지 않는다
await page.click('#aiDiagram .ex canvas.interactive', { position: { x: 1200, y: 700 } }).catch(() => {});
await page.keyboard.down('KeyW');
const held = await page.evaluate(() => window.NANRO.player.keys?.has?.('KeyW'));
await page.keyboard.up('KeyW');
await page.keyboard.press('KeyO');
const setOpen = await page.evaluate(() => window.NANRO.settings.isOpen);
ok(!held && !setOpen, `방의 키 막힘 (W 이동: ${held ? '먹음' : '막힘'}, O 설정: ${setOpen ? '열림' : '막힘'})`);
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.down('KeyW');
const held2 = await page.evaluate(() => window.NANRO.player.keys?.has?.('KeyW'));
await page.keyboard.up('KeyW');
ok(!held2, '초점이 창 밖에 있어도 방의 키 막힘');
ok(!(await page.evaluate(() => !!document.pointerLockElement)), '마우스 잠금 없음');

// 3) PNG 내보내기(웹버전은 브라우저 내려받기)
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }).catch(() => null), page.click('#aiDiagram button:has-text("PNG로 내보내기")')]);
// 헤드리스 Chromium 은 한글 파일 이름을 'download'로 바꿔 준다(브라우저와 프로그램에서는 이름 그대로)
ok(dl && /^(겨울 난롯가에서\.png|download)$/.test(dl.suggestedFilename()), `PNG 내보내기: ${dl?.suggestedFilename()}`);
if (dl) { await dl.saveAs('shots/ai-export.png'); const p = await dl.path(); const { statSync } = await import('node:fs'); ok(statSync(p).size > 20000, `PNG 크기 ${(statSync(p).size / 1024).toFixed(0)}KB`); }

// 4) 고치고 닫기: 저장 안 된 변경이 있으면 한 번은 경고
await page.mouse.click(1320, 420); await page.keyboard.press('Control+a'); await page.keyboard.press('ArrowRight');
await page.waitForTimeout(200);
const dirty = await page.evaluate(() => window.NANRO_AI.current?.dirty());
await page.click('#aiDiagram button:has-text("닫기")');
const warned = await page.evaluate(() => !!document.getElementById('aiDiagram') && document.querySelector('#aiDiagram .st').textContent);
ok(dirty && warned && /저장되지 않았/.test(warned), `고친 뒤 닫으면 한 번 경고 (${dirty ? warned : '변경이 안 됨'})`);
if (dirty) await page.click('#aiDiagram button:has-text("저장하지 않고 닫기")');
ok(await page.evaluate(() => !document.getElementById('aiDiagram') && !window.NANRO_AI.current), '닫기');

// 5) 다시 열기: 저장된 그림을 읽는다(AI를 부르지 않음)
r = await page.evaluate(async () => { const s = window.__saves; const h = await window.__open(); return { state: h.state, count: h.count(), saves: window.__saves - s, st: document.querySelector('#aiDiagram .st').textContent }; });
ok(r.state === 'loaded' && r.count === saved.elements.length && r.saves === 0, `다시 열기: ${r.state}, 요소 ${r.count}개 · "${r.st}"`);

// 6) 저장 단추
await page.click('#aiDiagram button:has-text("저장")');
await page.waitForTimeout(200);
ok(await page.evaluate(() => window.__saves === 2), '저장 단추로 저장');

// 7) 다시 만들기(두 번 눌러야 시작)
await page.click('#aiDiagram button:has-text("다시 만들기")');
const asked = await page.evaluate(() => document.querySelector('#aiDiagram .st').textContent);
await page.click('#aiDiagram button:has-text("정말 다시 만들기")');
await page.waitForTimeout(250); await page.screenshot({ path: 'shots/ai-progress.png' });
await page.waitForFunction(() => window.__saves === 3, null, { timeout: 15000 }).catch(() => {});
ok(/새로/.test(asked) && await page.evaluate(() => window.__saves === 3), `다시 만들기 (${asked})`);
await page.evaluate(() => window.NANRO_AI.current.close(true));

// 8) 설정의 AI 탭(시험 모드 모델 목록)
await page.evaluate(() => window.NANRO.settings.open('ai'));
await page.waitForFunction(() => document.querySelector('#settings [data-tab=ai] select option'), null, { timeout: 10000 }).catch(() => {});
const sel = await page.evaluate(() => { const s = document.querySelector('#settings [data-tab=ai] select'); return s && s.selectedOptions[0]?.textContent; });
ok(/Opus/.test(sel || ''), `설정 AI 탭: 기본 모델 ${sel}`);
await page.click('#settings [data-tab=ai] button:has-text("연결 시험")');
await page.waitForTimeout(200);
const tst = await page.evaluate(() => document.querySelector('#settings [data-tab=ai] .state').textContent);
ok(/연결됨/.test(tst), `연결 시험: ${tst}`);
await page.screenshot({ path: 'shots/ai-settings.png' });
await page.evaluate(() => window.NANRO.settings.close());

// 9) 시험 모드를 끄고 키가 없을 때: 설정으로 안내
await page.evaluate(() => { window.NANRO_AI.mock(false); localStorage.removeItem('nanro.ai.key'); });
r = await page.evaluate(async () => { const h = await window.NANRO_AI.openDiagram({ markdown: '메모', meta: {}, noteFile: '새 메모.md', saveNoteFile: async () => {}, readNoteFile: async () => null }); return { state: h.state, text: document.querySelector('#aiDiagram .msg').textContent }; });
ok(r.state === 'nokey' && /API 키/.test(r.text), `키 없음 안내: ${r.text.slice(0, 50)}`);
await page.screenshot({ path: 'shots/ai-nokey.png' });
await page.evaluate(() => window.NANRO_AI.current.close(true));

// 10) 가짜 키로 실제 호출: 여기서는 인터넷이 막혀 있어 연결 실패(또는 키 오류)를 쉬운 말로 알려야 한다
await page.evaluate(() => { localStorage.setItem('nanro.ai.key', 'sk-ant-test-not-a-real-key'); localStorage.setItem('nanro.ai', JSON.stringify({ model: 'test-model', level: 'easy' })); });
r = await page.evaluate(async () => { const h = await window.NANRO_AI.openDiagram({ markdown: '메모', meta: {}, noteFile: '새 메모.md', saveNoteFile: async () => {}, readNoteFile: async () => null }); return { state: h.state, text: document.querySelector('#aiDiagram .msg').textContent }; });
ok(r.state === 'error' && /연결|키|모델/.test(r.text), `연결 실패 안내: ${r.text.slice(0, 70)}`);
await page.evaluate(() => { window.NANRO_AI.current?.close(true); localStorage.removeItem('nanro.ai.key'); localStorage.removeItem('nanro.ai'); });

await browser.close();
console.log(fails ? `\n${fails}개 실패` : '\n모두 통과');
process.exit(fails ? 1 : 0);
