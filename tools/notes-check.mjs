// 메모장 시험: 견본 책을 펼치고 메모장을 열어 글을 치고, 도구 막대 단추를 눌러 보고, 저절로 저장되는지, 머리말이 맞는지, 다시 열어 읽히는지 본다.
//   npm run dev (다른 터미널) 뒤에  node tools/notes-check.mjs      (NANRO_URL 로 주소를 바꾼다)
// 웹버전(브라우저에 저장)과 프로그램 창(가짜 window.__TAURI__ 로 메모 폴더 명령을 흉내 낸다)을 둘 다 본다.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const base = process.env.NANRO_URL || 'http://127.0.0.1:5320';
const url = base + '/?nofire&fixed&fresh&time=13&headless';
mkdirSync('shots/notes', { recursive: true });
const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader', '--use-webgpu-adapter=swiftshader', '--ignore-gpu-blocklist'] });
let fail = 0;
const check = (name, ok, extra = '') => { console.log((ok ? '통과 ' : '실패 ') + name + (extra !== '' ? '  (' + extra + ')' : '')); if (!ok) fail++; };
const errors = [];
const SAMPLE = readFileSync('books/sample.epub').toString('base64');

// 가짜 프로그램 틀: 메모 폴더를 메모리에 둔다. 이름 검사는 프로그램(note_name)과 같게 화면 쪽 validName 이 먼저 한다.
const fakeTauri = () => {
  const files = {}, calls = [];
  window.__FAKE__ = { files, calls, dir: 'C:\\Nanro\\notes' };
  window.__TAURI__ = {
    core: {
      invoke: async (cmd, args) => {
        calls.push(cmd + (args?.name ? ':' + args.name : ''));
        if (cmd === 'notes_list') return { dir: window.__FAKE__.dir, files: Object.keys(files).map((name) => ({ name, size: files[name].length, modified: 1700000000 })) };
        if (cmd === 'note_read') { if (args.name === window.__FAKE__.failRead) throw new Error('읽기 실패'); return files[args.name] ?? null; }
        if (cmd === 'note_write') { if (/[\\/]|\.\./.test(args.name)) throw new Error('메모 파일 이름을 쓸 수 없습니다'); files[args.name] = args.text; return null; }
        if (cmd === 'choose_notes_folder') { window.__FAKE__.dir = 'D:\\메모'; return window.__FAKE__.dir; }
        if (cmd === 'opened_books') return [];
        if (cmd === 'library_books') return { dir: 'C:\\Nanro\\books', books: [] };
        return null;
      },
    },
    event: { listen: async () => () => {} },
  };
};

const newPage = async (ctx) => {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404|pointer lock|Device Lost|Instance dropped|방 그리기를 멈춥니다/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  await page.goto(url);
  await page.waitForFunction(() => window.NANRO?.ready, null, { timeout: 120000 });
  return page;
};
const waitFor = (page, f, arg, t = 60000) => page.waitForFunction(f, arg, { timeout: t, polling: 200 }).then(() => true, () => false);
// 견본 책을 서재에 넣고 읽기 의자에 앉아 펼친다
const openSample = async (page, add = true) => {
  await page.evaluate(async ({ b64, add }) => {
    const R = window.NANRO.reading, p = window.NANRO.player; await R.reader.ready;
    if (add) { const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); const meta = await R.reader.addFile(new File([bytes], 'sample.epub')); R.setPicked(meta.id); }
    else R.setPicked(R.reader.library[0].id);
    p.seatNow(window.NANRO.ctx.interact.find((i) => i.id === 'chair:reading').chair); p.openBook();
  }, { b64: SAMPLE, add });
  return waitFor(page, () => window.NANRO.player.state === 'reading' && window.NANRO.reading.reader.cur && !window.NANRO.reading.opening && !window.NANRO.player.tween, null, 120000);
};
const ta = '#notes .mdtext';
const value = (page) => page.$eval(ta, (t) => t.value);
const setText = (page, v, s = v.length, e = s) => page.$eval(ta, (t, [v, s, e]) => { t.focus(); t.value = v; t.setSelectionRange(s, e); t.dispatchEvent(new InputEvent('input', { inputType: 'insertReplacementText' })); }, [v, s, e]);
const select = (page, s, e) => page.$eval(ta, (t, [s, e]) => { t.focus(); t.setSelectionRange(s, e); }, [s, e]);
const tool = (page, k) => page.click(`#notes .tb[data-k="${k}"]`);
const panelOpen = (page) => page.evaluate(() => document.getElementById('notes').classList.contains('open'));

// ---- 1. 웹버전
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  let page = await newPage(ctx);
  check('견본 책이 펴진다', await openSample(page));
  check('읽는 동안 오른쪽 위에 "메모" 단추가 보인다', await waitFor(page, () => document.getElementById('noteBtn').classList.contains('on'), null, 5000));
  await page.keyboard.press('KeyM');
  check('M 키로 메모장이 열린다', await waitFor(page, () => document.getElementById('notes').classList.contains('open') && document.activeElement?.classList.contains('mdtext'), null, 10000));
  check('메모장 머리에 책 제목과 쪽이 나온다', await page.evaluate(() => /겨울 난롯가에서/.test(document.querySelector('#notes .bt').textContent) && /쪽/.test(document.querySelector('#notes .bi').textContent)), await page.$eval('#notes .bi', (e) => e.textContent));
  check('책이 메모장에 다 가리지 않는다 (메모장 폭이 화면의 절반보다 좁다)', await page.evaluate(() => document.getElementById('notes').getBoundingClientRect().width < innerWidth * 0.5));
  check('메모 파일 이름이 책 제목.md', (await page.$eval('#notes select', (s) => s.value)) === '겨울 난롯가에서.md', await page.$eval('#notes select', (s) => s.value));

  // 글을 치는 동안 걷기·쪽 넘기기·책 덮기 키가 먹지 않는다
  const s0 = await page.evaluate(() => ({ spread: window.NANRO.reading.reader.cur.spread, x: window.NANRO.player.pos.x, state: window.NANRO.player.state }));
  await page.keyboard.type('wasd e x b f t l ');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Space'); await page.keyboard.press('PageDown'); await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
  const s1 = await page.evaluate(() => ({ spread: window.NANRO.reading.reader.cur.spread, x: window.NANRO.player.pos.x, state: window.NANRO.player.state, bm: window.NANRO.reading.reader.cur.marks.bookmarks.length, menu: window.NANRO.reading.ui.isOpen, keys: window.NANRO.player.keys.size, tts: !!window.NANRO.reading.reader.tts }));
  check('치는 동안 쪽이 넘어가지 않고 책도 덮이지 않는다', s1.spread === s0.spread && s1.state === 'reading' && s1.x === s0.x, JSON.stringify(s1));
  check('치는 동안 북마크·메뉴·낭독이 켜지지 않는다', s1.bm === 0 && !s1.menu && !s1.tts && s1.keys === 0, JSON.stringify(s1));
  check('친 글이 그대로 들어간다', (await value(page)).startsWith('wasd e x b f t l '), JSON.stringify(await value(page)));
  check('마우스가 잡혀 있지 않다', await page.evaluate(() => !document.pointerLockElement));

  // 도구 막대
  await setText(page, '불은 서두르는 사람을 좋아하지 않는다', 3, 6);
  await tool(page, 'bold');
  check('굵게: 고른 글을 ** 로 감싼다', (await value(page)) === '불은 **서두르**는 사람을 좋아하지 않는다', await value(page));
  await tool(page, 'bold');
  check('굵게를 다시 누르면 뺀다', (await value(page)) === '불은 서두르는 사람을 좋아하지 않는다', await value(page));
  await page.keyboard.press('Control+B');
  check('Ctrl+B 도 된다', (await value(page)).includes('**서두르**'), await value(page));
  await tool(page, 'italic');
  check('기울임은 굵게와 겹쳐도 된다', (await value(page)).includes('***서두르***'), await value(page));
  await page.keyboard.press('Control+I');
  check('Ctrl+I 로 기울임을 뺀다', (await value(page)).includes('**서두르**') && !(await value(page)).includes('***'), await value(page));
  await page.keyboard.press('Control+Z');
  check('Ctrl+Z 로 되돌린다', (await value(page)).includes('***서두르***'), await value(page));
  await page.keyboard.press('Control+Y');
  check('Ctrl+Y 로 다시 한다', !(await value(page)).includes('***'), await value(page));
  await tool(page, 'undo'); await tool(page, 'undo');
  check('"실행 취소" 단추', (await value(page)).includes('**서두르**') && !(await value(page)).includes('***'), await value(page));
  await tool(page, 'redo');
  check('"다시 실행" 단추', (await value(page)).includes('***서두르***'), await value(page));
  await setText(page, '오래된 책', 2, 2); await tool(page, 'strike');
  check('커서만 있으면 그 낱말에 취소선', (await value(page)) === '~~오래된~~ 책', await value(page));
  await setText(page, '첫눈\n둘째 줄', 1, 1); await tool(page, 'h2');
  check('제목 2: 줄 앞에 ## ', (await value(page)) === '## 첫눈\n둘째 줄', await value(page));
  await tool(page, 'h1');
  check('제목 1로 바꾼다', (await value(page)) === '# 첫눈\n둘째 줄', await value(page));
  await tool(page, 'h1');
  check('제목 1을 다시 누르면 뺀다', (await value(page)) === '첫눈\n둘째 줄', await value(page));
  await setText(page, '사과\n배\n감', 0, 6); await tool(page, 'ul');
  check('글머리 목록: 고른 줄마다 - ', (await value(page)) === '- 사과\n- 배\n- 감', await value(page));
  await tool(page, 'ol');
  check('번호 목록으로 바꾸면 1. 2. 3.', (await value(page)) === '1. 사과\n2. 배\n3. 감', await value(page));
  await tool(page, 'task');
  check('할 일 목록', (await value(page)) === '- [ ] 사과\n- [ ] 배\n- [ ] 감', await value(page));
  await tool(page, 'task');
  check('할 일 목록을 다시 누르면 뺀다', (await value(page)) === '사과\n배\n감', await value(page));
  await tool(page, 'quote');
  check('인용', (await value(page)) === '> 사과\n> 배\n> 감', await value(page));
  await setText(page, '- 사과'); await page.keyboard.press('Enter'); await page.keyboard.type('배'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  check('목록에서 Enter 를 치면 다음 항목, 빈 항목에서 다시 치면 목록을 끝낸다', (await value(page)) === '- 사과\n- 배\n', JSON.stringify(await value(page)));
  await setText(page, '위 글'); await tool(page, 'hr');
  check('구분선은 빈 줄을 두고 넣는다 (제목으로 바뀌지 않게)', (await value(page)) === '위 글\n\n---\n\n', JSON.stringify(await value(page)));
  await setText(page, '난로', 0, 2); await tool(page, 'link');
  check('링크: [글](주소) 에서 주소를 골라 둔다', (await value(page)) === '[난로](https://)' && (await page.$eval(ta, (t) => t.value.slice(t.selectionStart, t.selectionEnd))) === 'https://', await value(page));
  await select(page, 0, (await value(page)).length); await page.keyboard.press('Control+K');
  check('Ctrl+K 를 링크 위에서 누르면 링크를 뺀다', (await value(page)) === '난로', await value(page));
  await setText(page, 'let a = 1', 0, 9); await tool(page, 'code');
  check('코드 (한 줄)', (await value(page)) === '`let a = 1`', await value(page));
  await setText(page, 'a\nb', 0, 3); await tool(page, 'code');
  check('코드 (여러 줄은 코드 블록)', (await value(page)) === '```\na\nb\n```', JSON.stringify(await value(page)));
  await setText(page, ''); await tool(page, 'table');
  check('표 넣기', (await value(page)).startsWith('| 제목 | 내용 |\n| --- | --- |') && (await page.$eval(ta, (t) => t.value.slice(t.selectionStart, t.selectionEnd))) === '제목', JSON.stringify(await value(page)));
  check('모든 단추에 한국어 설명이 붙어 있다', await page.evaluate(() => [...document.querySelectorAll('#notes .tb')].every((b) => /[가-힣]/.test(b.title) && b.getAttribute('aria-label'))));

  // 지금 읽는 곳: 장 첫 쪽에서는 장 제목을 빼고 본문 첫 문장을 넣는다. "1. " 로 시작해도 인용 안에서 목록이 되지 않는다.
  await page.evaluate(() => window.NANRO.reading.reader.gotoPage(0)); await page.waitForTimeout(1200);
  await setText(page, ''); await tool(page, 'here');
  const q0 = (await value(page)).split('\n')[1] || '', ch0 = await page.evaluate(() => window.NANRO.reading.reader.info().chapter);
  check('장 첫 쪽: 인용에 장 제목이 섞이지 않고 첫 문장이 들어간다', q0.startsWith('> ') && !q0.slice(2).startsWith(ch0.replace(/^(\d+)\./, '$1\\.')) && !q0.slice(2).startsWith(ch0) && /[.!?]$/.test(q0), q0);
  check('인용한 글이 목록(1. )으로 바뀌지 않는다', !/^> \d+[.)]\s/.test(q0), q0);
  await page.evaluate(() => window.NANRO.reading.reader.gotoPage(5)); await page.waitForTimeout(1200);
  await setText(page, '## 읽으며 적은 것\n\n- 불은 서두르지 않는다\n- [ ] 다시 읽기\n\n<img src=x onerror="window.__xss=1">');
  await tool(page, 'here');
  const v1 = await value(page), info = await page.evaluate(() => window.NANRO.reading.reader.info());
  check('"지금 읽는 곳 넣기"가 장·쪽·퍼센트를 인용으로 넣는다', new RegExp(`> \\*\\*.+\\*\\* · ${info.page}–${info.page + 1}쪽 / ${info.pages}쪽 · ${Math.round(info.percent * 100)}%`).test(v1), v1.split('\n').slice(-4).join(' / '));
  check('그 쪽의 글 한 대목도 함께 넣는다', /\n> [^*\n]{10,}/.test(v1), v1.split('\n').slice(-3).join(' / '));
  await page.fill('#notes .tags input', '겨울, 다시 읽기');
  check('고친 뒤 "저장 안 됨"이 보인다', /저장 안 됨/.test(await page.$eval('#notes .st', (e) => e.textContent)));
  check('치다 멈추면 1초쯤 뒤에 저장되고 "저장됨"이 보인다', await waitFor(page, () => /^저장됨/.test(document.querySelector('#notes .st').textContent), null, 4000), await page.$eval('#notes .st', (e) => e.textContent));
  const saved = await page.evaluate(async () => (await import('/src/notes/store.js')).readNoteFile('겨울 난롯가에서.md'));
  const fm = saved.split('\n---\n')[0];
  check('파일이 머리말(---)로 시작한다', saved.startsWith('---\ntitle: "겨울 난롯가에서"\nauthor: "난로 견본"\nlanguage: "ko"\n'), saved.slice(0, 80));
  check('머리말에 원본 파일, 책 id, 형식', /source_file: "sample.epub"\nbook_id: "[^"]+"\nformat: "epub"/.test(fm), fm);
  check('머리말에 읽던 곳(장, 쪽, 퍼센트)', new RegExp(`position:\\n  chapter: ".+"\\n  page: ${info.page}\\n  pages: ${info.pages}\\n  percent: [\\d.]+`).test(fm), fm.match(/position:[\s\S]*?(?=\ncreated)/)?.[0]);
  check('머리말에 만든 때와 고친 때(시간대 포함)', /created: \d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d\nupdated: \d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d/.test(fm), fm.match(/created.*\n.*/)?.[0]);
  check('머리말에 태그', fm.includes('tags: ["겨울", "다시 읽기"]'), fm.match(/tags.*/)?.[0]);
  check('머리말 아래에 쓴 글이 그대로', saved.endsWith(v1) || saved.includes('\n---\n' + v1), saved.slice(-60));
  check('편집기에는 머리말이 보이지 않는다', !(await value(page)).includes('book_id'));

  // 미리 보기 (marked + DOMPurify)
  await tool(page, 'preview');
  await waitFor(page, () => !document.querySelector('#notes .mdview').hidden && document.querySelector('#notes .mdview').innerHTML.length > 10, null, 10000);
  const pv = await page.evaluate(() => { const v = document.querySelector('#notes .mdview'); return { h2: !!v.querySelector('h2'), li: v.querySelectorAll('li').length, box: !!v.querySelector('input[type=checkbox]'), bq: !!v.querySelector('blockquote strong'), onerror: v.innerHTML.includes('onerror'), xss: !!window.__xss }; });
  check('미리 보기에 제목, 목록, 할 일 상자, 인용이 꾸며져 나온다', pv.h2 && pv.li >= 2 && pv.box && pv.bq, JSON.stringify(pv));
  check('미리 보기는 위험한 HTML 을 걸러 낸다', !pv.onerror && !pv.xss, JSON.stringify(pv));
  await page.waitForTimeout(400); await page.screenshot({ path: 'shots/notes/1-preview.png' });
  await page.click('#notes .mdview input[type=checkbox]');
  check('미리 보기의 할 일 상자를 누르면 원문이 [x] 로 바뀐다', (await value(page)).includes('- [x] 다시 읽기'));
  await tool(page, 'preview');
  check('"편집으로" 누르면 글 상자로 돌아온다', await page.evaluate(() => !document.querySelector('#notes .mdtext').hidden));

  // AI 그림 설명: 키가 없으면 안내 창, 시험 모드(가짜 AI)에서는 그림을 만들어 메모 옆에 .excalidraw 로 저장한다
  await tool(page, 'ai');
  check('"AI 그림 설명": 키가 없으면 키를 넣으라는 안내 창이 뜬다', await waitFor(page, () => window.NANRO_AI?.current?.state === 'nokey' && !!document.getElementById('aiDiagram'), null, 20000), await page.evaluate(() => window.NANRO_AI?.current?.state));
  await page.evaluate(() => { window.NANRO_AI.current.close(true); window.NANRO_AI.mock(true); });
  await tool(page, 'ai');
  check('"AI 그림 설명": 메모로 그림을 만든다(가짜 AI)', await waitFor(page, () => window.NANRO_AI?.current?.state === 'generated', null, 30000), await page.evaluate(() => window.NANRO_AI?.current?.state));
  const drawn = await page.evaluate(async () => (await import('/src/notes/store.js')).readNoteFile('겨울 난롯가에서.excalidraw'));
  check('그림이 메모 옆에 "겨울 난롯가에서.excalidraw" 로 저장된다', !!drawn && drawn.includes('"type": "excalidraw"') || (!!drawn && drawn.includes('"type":"excalidraw"')), String(drawn).slice(0, 60));
  await page.evaluate(() => { window.NANRO_AI.current.close(true); window.NANRO_AI.mock(false); });
  await page.waitForTimeout(300);
  await page.click('#notes .mdtext');

  // 닫기와 다시 열기
  await page.keyboard.press('Escape');
  check('Esc 로 메모장이 닫힌다', !(await panelOpen(page)));
  check('Esc 는 메모장만 닫고 책은 그대로', (await page.evaluate(() => window.NANRO.player.state)) === 'reading');
  const before = await page.evaluate(() => window.NANRO.reading.reader.cur.spread);
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(1500);
  check('닫은 뒤에는 ← → 로 다시 쪽이 넘어간다', (await page.evaluate(() => window.NANRO.reading.reader.cur.spread)) === before + 2);
  const stored = await page.evaluate(async () => (await import('/src/notes/store.js')).readNoteFile('겨울 난롯가에서.md'));
  check('닫을 때 저장한다', stored.includes('- [x] 다시 읽기'));
  await page.click('#noteBtn');
  check('"메모" 단추로 다시 열린다', await waitFor(page, () => document.getElementById('notes').classList.contains('open'), null, 5000));
  check('다시 열면 쓰던 글이 그대로', (await value(page)).includes('- [x] 다시 읽기'));

  // 새 메모
  await page.click('#notes .files button:has-text("새 메모")');
  check('"새 메모"는 "책 제목 (2).md"', await waitFor(page, () => document.querySelector('#notes select').value === '겨울 난롯가에서 (2).md', null, 5000), await page.$eval('#notes select', (s) => s.value));
  check('새 메모는 비어 있다', (await value(page)) === '');
  await page.keyboard.type('둘째 메모');
  await waitFor(page, () => /^저장됨/.test(document.querySelector('#notes .st').textContent), null, 4000);
  const opts = await page.$$eval('#notes select option', (o) => o.map((x) => x.value));
  check('목록에 이 책의 메모 둘이 나온다', opts.length === 2 && opts[0] === '겨울 난롯가에서.md', opts.join(', '));
  await page.selectOption('#notes select', '겨울 난롯가에서.md');
  check('목록에서 고르면 그 메모로 바뀐다', await waitFor(page, () => document.querySelector('#notes .mdtext').value.includes('다시 읽기'), null, 5000));
  check('웹버전은 "내려받기 (.md)" 단추가 있다', await page.isVisible('#notes .files button:has-text("내려받기")'));
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }).catch(() => null), page.click('#notes .files button:has-text("내려받기")')]);
  // 이 시험 환경의 헤드리스 Chromium 은 한글 파일 이름을 "download" 로 바꿔 알려 준다(다른 내려받기도 같다). 그래서 내용으로 확인한다.
  const dlText = dl ? readFileSync(await dl.path(), 'utf8') : '';
  check('"내려받기"가 머리말이 든 .md 를 내려받는다', ['겨울 난롯가에서.md', 'download'].includes(dl?.suggestedFilename()) && dlText.startsWith('---\ntitle: "겨울 난롯가에서"') && dlText.includes('다시 읽기'), dl?.suggestedFilename());
  await page.screenshot({ path: 'shots/notes/2-edit.png' });
  await page.keyboard.press('Escape');

  // 다시 불러와서 읽어 본다
  await page.close();
  page = await newPage(ctx);
  check('다시 켜고 책을 펼친다', await openSample(page, false));
  await page.keyboard.press('KeyM');
  await waitFor(page, () => document.querySelector('#notes .mdtext').value.length > 0, null, 10000);
  const back = await value(page);
  check('다시 켜도 가장 최근에 고친 메모가 열린다', back === '둘째 메모', JSON.stringify(back.slice(0, 40)));
  await page.selectOption('#notes select', '겨울 난롯가에서.md');
  await waitFor(page, () => document.querySelector('#notes .mdtext').value.includes('다시 읽기'), null, 5000);
  check('다시 켜도 첫 메모의 글과 태그가 그대로', (await value(page)).includes('## 읽으며 적은 것') && (await page.$eval('#notes .tags input', (e) => e.value)) === '겨울, 다시 읽기');
  const created0 = (await page.evaluate(async () => (await import('/src/notes/store.js')).readNoteFile('겨울 난롯가에서.md'))).match(/created: (.*)/)[1];
  await page.keyboard.type(' 덧붙임'); await waitFor(page, () => /^저장됨/.test(document.querySelector('#notes .st').textContent), null, 4000);
  const again = await page.evaluate(async () => (await import('/src/notes/store.js')).readNoteFile('겨울 난롯가에서.md'));
  check('다시 저장해도 머리말은 하나, 만든 때는 그대로', again.split(/^---$/m).length === 3 && again.includes('created: ' + created0), again.slice(0, 40));

  // 외부 기능이 쓰는 저장 함수: 아무 이름이나(.excalidraw 도), 위험한 이름은 거절
  const api = await page.evaluate(async () => {
    const s = await import('/src/notes/store.js'); await s.saveNoteFile('겨울 난롯가에서.excalidraw', '{"type":"excalidraw"}');
    const bad = []; for (const n of ['../x.md', 'a/b.md', 'C:\\x.md', 'CON.md', 'nul.tar.md', 'x.exe', '.hidden.md', 'x.md.']) { try { await s.saveNoteFile(n, 'x'); bad.push(n); } catch { /* 거절 */ } }
    return { read: await s.readNoteFile('겨울 난롯가에서.excalidraw'), bad, stem: s.safeStem('a/b\\c:d*e?"f<g>h|i..md  '), con: s.safeStem('con'), nul: s.safeStem('nul.tar') };
  });
  check('saveNoteFile / readNoteFile 이 .excalidraw 파일도 다룬다', api.read === '{"type":"excalidraw"}');
  check('폴더 밖을 가리키거나 위험한 이름은 거절한다', !api.bad.length, api.bad.join(', '));
  check('책 제목은 윈도우에서 쓸 수 있는 이름으로 바뀐다', api.stem === 'a b c d e f g h i.md' && api.con === 'con_' && api.nul === 'nul_.tar', `${api.stem} / ${api.con} / ${api.nul}`);
  await page.keyboard.press('Escape');

  // 걷는 중에도 M 으로 열 수 있고, 치는 동안 걷지 않는다
  await page.keyboard.press('KeyX');
  await waitFor(page, () => window.NANRO.player.state === 'seated' && !window.NANRO.player.tween, null, 20000);
  await page.keyboard.press('Space');
  await waitFor(page, () => window.NANRO.player.state === 'walk' && !window.NANRO.player.tween, null, 20000);
  await page.keyboard.press('KeyM');
  check('걷는 중에도 M 으로 열린다', await waitFor(page, () => document.getElementById('notes').classList.contains('open'), null, 5000));
  const p0 = await page.evaluate(() => [window.NANRO.player.pos.x, window.NANRO.player.pos.z]);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(700); await page.keyboard.up('KeyW');
  await page.click('#notes .bt'); await page.keyboard.down('KeyS'); await page.waitForTimeout(500); await page.keyboard.up('KeyS');
  const p1 = await page.evaluate(() => [window.NANRO.player.pos.x, window.NANRO.player.pos.z]);
  check('메모장이 열려 있으면 W, S 를 눌러도 걷지 않는다', Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) < 1e-6, JSON.stringify([p0, p1]));
  await page.keyboard.press('Escape');
  check('걷는 중에도 Esc 로 닫힌다', !(await panelOpen(page)));
  check('닫은 뒤 눌린 채 남은 키가 없다', await page.evaluate(() => window.NANRO.player.keys.size === 0));
  await ctx.close();
}

// ---- 2. 프로그램 창: 메모 폴더 명령
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(fakeTauri);
  const page = await newPage(ctx);
  check('[프로그램] 견본 책이 펴진다', await openSample(page));
  await page.keyboard.press('KeyM');
  await waitFor(page, () => document.getElementById('notes').classList.contains('open'), null, 10000);
  await page.keyboard.type('# 메모\n\n프로그램에서 쓴 글');
  check('[프로그램] 1초 뒤 메모 폴더에 쓴다 (note_write)', await waitFor(page, () => window.__FAKE__.calls.includes('note_write:겨울 난롯가에서.md'), null, 5000), (await page.evaluate(() => window.__FAKE__.calls)).join(', '));
  const f = await page.evaluate(() => window.__FAKE__.files['겨울 난롯가에서.md']);
  check('[프로그램] 쓴 파일에 머리말과 글', f?.startsWith('---\ntitle: "겨울 난롯가에서"') && f.endsWith('# 메모\n\n프로그램에서 쓴 글'), f?.slice(-30));
  check('[프로그램] 아래에 저장 위치가 나온다', (await page.$eval('#notes .ft', (e) => e.textContent)).includes('C:\\Nanro\\notes\\겨울 난롯가에서.md'), await page.$eval('#notes .ft', (e) => e.textContent));
  await page.click('#notes .files button:has-text("폴더 열기")');
  check('[프로그램] "폴더 열기"가 프로그램에 전달된다', await page.evaluate(() => window.__FAKE__.calls.includes('open_notes_folder')));
  await page.screenshot({ path: 'shots/notes/3-desktop.png' });
  // 있는데 읽지 못한 메모는 빈 메모로 덮어쓰지 않는다
  await page.evaluate(() => { window.__FAKE__.files['겨울 난롯가에서 (2).md'] = 'ORIGINAL'; window.__FAKE__.failRead = '겨울 난롯가에서 (2).md'; });
  await page.click('#notes .bt'); await page.keyboard.press('Escape'); await page.keyboard.press('KeyM');
  await waitFor(page, () => [...document.querySelectorAll('#notes select option')].some((o) => o.value === '겨울 난롯가에서 (2).md'), null, 5000);
  await page.selectOption('#notes select', '겨울 난롯가에서 (2).md'); await page.waitForTimeout(400);
  await page.click(ta); await page.keyboard.type('덮어쓰면 안 되는 글'); await page.waitForTimeout(1800);
  check('[프로그램] 읽지 못한 메모 파일은 덮어쓰지 않는다', await page.evaluate(() => window.__FAKE__.files['겨울 난롯가에서 (2).md'] === 'ORIGINAL'), await page.$eval('#notes .st', (e) => e.textContent));
  await page.keyboard.press('Escape');
  // 설정창의 메모 탭
  await page.evaluate(() => window.NANRO.settings.open('notes'));
  check('[프로그램] 설정의 "메모" 탭에 메모 폴더가 나온다', await waitFor(page, () => document.querySelector('#settings [data-tab=notes]')?.textContent.includes('C:\\Nanro\\notes'), null, 5000));
  await page.click('#settings [data-tab=notes] button:has-text("폴더 바꾸기")');
  check('[프로그램] "폴더 바꾸기" 뒤 새 폴더가 나온다', await waitFor(page, () => document.querySelector('#settings [data-tab=notes]').textContent.includes('D:\\메모'), null, 5000));
  await page.waitForTimeout(300); await page.screenshot({ path: 'shots/notes/4-settings.png' });
  await ctx.close();
}

check('화면 오류가 없다', !errors.length, errors.slice(0, 5).join(' | '));
await browser.close();
console.log(fail ? `실패 ${fail}건` : '모두 통과');
process.exit(fail ? 1 : 0);
