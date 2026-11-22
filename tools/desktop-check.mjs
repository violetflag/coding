// 윈도우 프로그램에서만 도는 화면 코드(src/desktop.js)를 브라우저에서 시험한다.
//   npm run dev (다른 터미널) 뒤에  node tools/desktop-check.mjs
// 프로그램 틀(src-tauri)이 화면에 주는 것(window.__TAURI__)을 가짜로 만들어 넣는다. 그래서 틀 자체(파일 읽기, 폴더 고르기 창, 레지스트리)는 여기서 확인하지 못한다.
// 확인하는 것: "난로로 열기"로 넘어온 책이 바로 펴지는지, 서재 폴더의 책이 꽂히는지, 서재 창의 서재 폴더 칸, Edge 에서 옮겨 오기.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const base = process.env.NANRO_URL || 'http://127.0.0.1:5320';
// headless: 방을 화면에 그리지 않는다. 이 시험 환경(소프트웨어 렌더러)은 화면에 그리면 그래픽 장치가 끊겨서, 책을 두 권째 넣을 때 엉뚱한 오류가 난다.
const url = base + '/?nofire&fixed&fresh&time=13&headless';
mkdirSync('shots/desktop', { recursive: true });
const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader', '--use-webgpu-adapter=swiftshader', '--ignore-gpu-blocklist'] });
let fail = 0;
const check = (name, ok, extra = '') => { console.log((ok ? '통과 ' : '실패 ') + name + (extra !== '' ? '  (' + extra + ')' : '')); if (!ok) fail++; };
const errors = [];

// 가짜 프로그램 틀. files: 경로 → base64, opened: 넘어온 책, library: 서재 폴더의 책.
const fake = ({ files, opened, library }) => {
  const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
  const ref = (path) => ({ path, name: path.split('\\').pop(), size: atob(files[path]).length, modified: 1700000000 });
  const listeners = {}, calls = [];
  const state = { opened: [...opened], dir: 'C:\\Nanro\\books', library: [...library] };
  window.__FAKE__ = { calls, state, push: (path) => { state.opened.push(path); (listeners['nanro-open'] || []).forEach((f) => f({})); } };
  window.__TAURI__ = {
    core: {
      invoke: async (cmd, args) => {
        calls.push(cmd);
        if (cmd === 'opened_books') return state.opened.splice(0).map(ref);
        if (cmd === 'library_books') return { dir: state.dir, books: state.library.map(ref) };
        if (cmd === 'read_book') { if (!files[args.path]) throw new Error('이 파일은 열 수 없습니다'); return bytes(files[args.path]); }
        if (cmd === 'choose_library_folder') { state.dir = 'D:\\책'; state.library = ['D:\\책\\셋째.txt']; return state.dir; }
        return null;
      },
    },
    event: { listen: async (name, fn) => { (listeners[name] = listeners[name] || []).push(fn); return () => {}; } },
  };
};
const txt = (title) => Buffer.from(`${title}\n\n` + Array.from({ length: 40 }, (_, i) => `${title}의 ${i + 1}번째 문단입니다. 벽난로 앞에서 읽기 좋은 글입니다.`).join('\n\n')).toString('base64');
const FILES = {
  'C:\\내려받기\\sample.epub': readFileSync('books/sample.epub').toString('base64'),
  'C:\\Nanro\\books\\둘째.txt': txt('둘째 책'),
  'C:\\내려받기\\넷째.txt': txt('넷째 책'),
  'D:\\책\\셋째.txt': txt('셋째 책'),
};
const open = async (cfg) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }), page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404|pointer lock|Device Lost|Instance dropped|방 그리기를 멈춥니다/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  if (cfg) await page.addInitScript(fake, cfg);
  await page.goto(url);
  await page.waitForFunction(() => window.NANRO?.ready, null, { timeout: 120000 });
  return { ctx, page };
};
const waitFor = (page, f, arg, t = 120000) => page.waitForFunction(f, arg, { timeout: t, polling: 200 }).then(() => true, () => false);
const reading = (page, title) => waitFor(page, (t) => window.NANRO.player.state === 'reading' && !window.NANRO.reading.opening && window.NANRO.reading.reader.cur?.meta.title.includes(t), title);
const titles = (page) => page.evaluate(() => window.NANRO.reading.reader.library.map((b) => b.title));

// ---- 1. 책 파일과 함께 켰을 때
{
  const { ctx, page } = await open({ files: FILES, opened: ['C:\\내려받기\\sample.epub'], library: ['C:\\Nanro\\books\\둘째.txt'] });
  check('프로그램 창으로 알아본다 (끝내기 단추가 보임)', await page.evaluate(() => !document.getElementById('quitWrap').hidden));
  check('넘어온 책이 단추를 누르지 않아도 펴진다', await reading(page, '난롯가'), (await titles(page)).join(', '));
  check('시작 카드가 사라진다', await page.evaluate(() => document.getElementById('start').classList.contains('off')));
  check('서재 폴더의 책이 서재에 꽂힌다', await waitFor(page, () => window.NANRO.reading.reader.library.length === 2), (await titles(page)).join(', '));
  check('서재 폴더의 책이 꽂혀도 펴 놓은 책은 그대로다', await page.evaluate(() => window.NANRO.reading.reader.cur.meta.title.includes('난롯가')));
  await page.waitForTimeout(1500); await page.screenshot({ path: 'shots/desktop/1-opened.png' });

  // 켜져 있는 동안 다른 책이 넘어온다
  await page.evaluate(() => window.__FAKE__.push('C:\\내려받기\\넷째.txt'));
  check('읽는 중에 넘어온 책으로 바뀐다', await reading(page, '넷째'));
  await page.keyboard.press('Escape');
  await waitFor(page, () => window.NANRO.player.state === 'seated' && !window.NANRO.player.tween, null, 30000); await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  check('일어서서 걷는 상태가 된다', await waitFor(page, () => window.NANRO.player.state === 'walk', null, 30000));
  await page.evaluate(() => window.__FAKE__.push('C:\\내려받기\\sample.epub'));
  check('걷는 중에 넘어온 책도 앉아서 펴진다', await reading(page, '난롯가'));
  check('같은 책을 다시 열어도 서재에 두 번 꽂히지 않는다', (await titles(page)).length === 3, (await titles(page)).join(', '));

  // 서재 창의 서재 폴더 칸
  await page.keyboard.press('KeyL');
  await waitFor(page, () => [...document.querySelectorAll('h3')].some((h) => h.textContent === '서재 폴더'), null, 10000);
  const where = () => page.evaluate(() => [...document.querySelectorAll('h3')].find((h) => h.textContent === '서재 폴더')?.nextElementSibling?.nextElementSibling?.textContent || '');
  await waitFor(page, () => /책 파일 \d+개/.test(document.body.textContent), null, 10000);
  check('서재 창에 서재 폴더와 책 파일 수가 나온다', (await where()).includes('C:\\Nanro\\books · 책 파일 1개'), await where());
  await page.waitForTimeout(600); await page.screenshot({ path: 'shots/desktop/2-library.png' });
  await page.click('button:has-text("폴더 열기")');
  check('"폴더 열기"가 프로그램에 전달된다', await page.evaluate(() => window.__FAKE__.calls.includes('open_library_folder')));
  await page.click('button:has-text("폴더 바꾸기")');
  check('폴더를 바꾸면 새 폴더의 책이 꽂힌다', await waitFor(page, () => window.NANRO.reading.reader.library.some((b) => b.title.includes('셋째')), null, 30000), (await titles(page)).join(', '));
  await waitFor(page, () => document.body.textContent.includes('D:\\책 · 책 파일 1개'), null, 10000);
  check('바꾼 폴더가 서재 창에 나온다', (await where()).includes('D:\\책 · 책 파일 1개'), await where());

  // 서재에서 뺀 책은 폴더에 남아 있어도 다시 들어오지 않는다
  page.on('dialog', (d) => d.accept());
  const n0 = (await titles(page)).length;
  await page.evaluate(async () => { const r = window.NANRO.reading.reader, b = r.library.find((x) => x.title.includes('셋째')); await r.remove(b.id); });
  await page.click('button:has-text("다시 읽기")'); await page.waitForTimeout(1500);
  check('서재에서 뺀 책은 다시 꽂히지 않는다', (await titles(page)).length === n0 - 1, (await titles(page)).join(', '));

  // 다음 시험에 쓸 백업: 설정 하나를 바꿔서 함께 담는다
  const backup = await page.evaluate(async () => {
    localStorage.setItem('nanro.volume', JSON.stringify({ master: 0.37 }));
    const store = await import('/src/reader/store.js');
    return await (await store.exportBackup(true)).text();
  });
  writeFileSync('shots/desktop/backup.json', backup);
  const parsed = JSON.parse(backup);
  check('백업에 책과 설정이 함께 담긴다', parsed.books.length === n0 - 1 && Object.keys(parsed.files).length === n0 - 1 && 'nanro.volume' in parsed.local, `책 ${parsed.books.length}권, 설정 ${Object.keys(parsed.local).length}개`);
  await ctx.close();
}

// ---- 2. 처음 켠 프로그램(서재가 비어 있음): Edge 에서 쓰던 것 옮겨 오기
{
  const { ctx, page } = await open({ files: FILES, opened: [], library: [] });
  await waitFor(page, () => !document.getElementById('startActs').hidden);
  check('서재가 비어 있으면 옮겨 오기 안내가 보인다', await page.evaluate(() => !document.getElementById('moveIn').hidden));
  await page.screenshot({ path: 'shots/desktop/3-first-run.png' });
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#moveInBtn')]);
  check('안내를 눌러도 방으로 들어가지 않는다', await page.evaluate(() => !document.getElementById('start').classList.contains('off')));
  await Promise.all([page.waitForEvent('load', { timeout: 120000 }), chooser.setFiles('shots/desktop/backup.json')]);
  await page.waitForFunction(() => window.NANRO?.ready, null, { timeout: 120000 });
  await waitFor(page, () => !document.getElementById('startActs').hidden);
  check('가져온 뒤 서재에 책이 들어 있다', (await titles(page)).length === 3, (await titles(page)).join(', '));
  check('설정도 함께 옮겨진다', await page.evaluate(() => JSON.parse(localStorage.getItem('nanro.volume') || '{}').master === 0.37));
  check('책이 생기면 안내가 사라진다', await page.evaluate(() => document.getElementById('moveIn').hidden));
  const label = await page.textContent('#goRead');
  check('시작 단추가 "이어서 읽기" 또는 "책 읽기"로 바뀐다', /이어서 읽기|책 읽기/.test(label) && !label.includes('책 넣고'), label.trim().slice(0, 30));
  await page.screenshot({ path: 'shots/desktop/4-moved-in.png' });
  await ctx.close();
}

// ---- 3. 웹버전에는 아무것도 나타나지 않는다
{
  const { ctx, page } = await open(null);
  await waitFor(page, () => !document.getElementById('startActs').hidden);
  check('웹버전에는 옮겨 오기 안내가 없다', await page.evaluate(() => document.getElementById('moveIn').hidden));
  check('웹버전에는 끝내기 단추가 없다', await page.evaluate(() => document.getElementById('quitWrap').hidden));
  await page.keyboard.press('KeyL');
  await waitFor(page, () => [...document.querySelectorAll('h3')].some((h) => h.textContent === '백업'), null, 10000);
  check('웹버전의 서재 창에는 서재 폴더 칸이 없다', await page.evaluate(() => ![...document.querySelectorAll('h3')].some((h) => h.textContent === '서재 폴더')));
  await ctx.close();
}

check('오류가 없다', errors.length === 0, errors.slice(0, 3).join(' / '));
await browser.close();
console.log(fail ? `실패 ${fail}건` : '모두 통과');
process.exit(fail ? 1 : 0);
