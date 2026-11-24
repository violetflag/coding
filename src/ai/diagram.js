// 메모를 AI가 Excalidraw 그림으로 쉽게 풀어 주는 창. 메모장에서 이렇게 부른다:
//   openDiagram({ markdown, meta, noteFile, saveNoteFile, readNoteFile })
//   markdown: 메모 본문(머리말 없이), meta: 책 정보 { title, author, position, ... }, noteFile: "책제목.md"
//   saveNoteFile(이름, 글) / readNoteFile(이름): 메모 폴더의 파일을 쓰고 읽는다(Promise, 없으면 null).
// 그림은 메모 옆에 "책제목.excalidraw"로 저장한다. 저장된 그림이 있으면 AI를 다시 부르지 않고 그것을 연다.
// 돌려주는 것: 창이 처음 자리 잡으면(그림이 뜨거나 안내가 뜨면) { state, close(), count() }.
// 그림판(Excalidraw, React)과 API 묶음은 이 창을 열 때만 따로 불러온다.
import { aiPrefs, getKey, isMock, setMock } from './prefs.js';
import { saveFile } from '../desktop.js';

const CSS = `
#aiDiagram { position: fixed; inset: 0; z-index: 20; display: flex; flex-direction: column; background: #17110c; font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; color: #e9dcc6; }
#aiDiagram .bar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid #4a3a28; font-size: 13px; flex-wrap: wrap; }
#aiDiagram .bar b { font-size: 15px; font-weight: 600; margin-right: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 40vw; }
#aiDiagram .bar .st { margin-right: auto; opacity: .75; font-size: 12px; }
#aiDiagram .ui button { background: #2a1f15; color: inherit; border: 1px solid #5c4a33; border-radius: 5px; padding: 6px 13px; font: inherit; font-size: 13px; cursor: pointer; }
#aiDiagram .ui button.primary { background: #a8621f; border-color: #d98a3a; color: #fff; }
#aiDiagram .ui button:hover { filter: brightness(1.2); } #aiDiagram .ui button:disabled { opacity: .45; cursor: default; filter: none; }
#aiDiagram .stage { position: relative; flex: 1; min-height: 0; background: #fffdf8; }
#aiDiagram .stage > .ex { position: absolute; inset: 0; }
#aiDiagram .msg { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(23,17,12,.92); z-index: 5; }
#aiDiagram .msg[hidden] { display: none; }
#aiDiagram .msg .card { max-width: 460px; padding: 22px 26px; background: #1f1710; border: 1px solid #4a3a28; border-radius: 10px; text-align: center; line-height: 1.7; font-size: 14px; }
#aiDiagram .msg .card .btns { display: flex; gap: 8px; justify-content: center; margin-top: 14px; flex-wrap: wrap; }
#aiDiagram .spin { display: inline-block; width: 14px; height: 14px; margin-right: 8px; vertical-align: -2px; border: 2px solid #e0933c; border-right-color: transparent; border-radius: 50%; animation: aiSpin .8s linear infinite; }
@keyframes aiSpin { to { transform: rotate(360deg); } }
`;

let current = null;   // 열려 있는 창(하나만)
const make = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };

export async function openDiagram({ markdown = '', meta = {}, noteFile = '메모.md', saveNoteFile, readNoteFile } = {}) {
  current?.close(true);
  if (!document.getElementById('aiDiagramCss')) document.head.append(make('style', { id: 'aiDiagramCss', textContent: CSS }));
  if (document.pointerLockElement) document.exitPointerLock();
  // Excalidraw 가 글꼴을 이 프로그램 안에서 찾게 한다(인터넷 없이도 되도록). 그림판을 부르기 전에 정해야 한다.
  window.EXCALIDRAW_ASSET_PATH = new URL(import.meta.env.BASE_URL + 'excalidraw/', location.href).href;
  const viewP = import('./view.js');

  const name = String(noteFile).replace(/\.md$/i, ''), file = name + '.excalidraw';
  const st = make('span', { className: 'st' });
  const btn = (text, onclick, primary) => make('button', { type: 'button', textContent: text, onclick, className: primary ? 'primary' : '' });
  const remake = btn('다시 만들기', () => askRemake()), save = btn('저장', () => doSave(), true), png = btn('PNG로 내보내기', () => doPng()), close = btn('닫기', () => tryClose());
  const ex = make('div', { className: 'ex' }), msg = make('div', { className: 'msg ui', hidden: true }), stage = make('div', { className: 'stage' }, ex, msg);
  const root = make('div', { id: 'aiDiagram' }, make('div', { className: 'bar ui' }, make('b', { textContent: '메모 그림 · ' + (meta?.title || name) }), st, remake, save, png, close), stage);
  // 창이 열려 있는 동안 방의 조작 키(이동, 책장 넘김, 설정 O, 조작법 H …)가 먹지 않게 한다.
  // 그림판은 자기 안에서 키를 받으므로(handleKeyboardGlobally 끔) 여기서 막아도 그림판에는 그대로 간다.
  for (const t of ['keydown', 'keypress']) root.addEventListener(t, (e) => e.stopPropagation());
  // 창 밖(body 등)에 초점이 있을 때 누른 키도 방으로 가지 않게 한다
  const guard = (e) => { if (!root.contains(e.target)) e.stopImmediatePropagation(); };
  addEventListener('keydown', guard, true);
  root.addEventListener('contextmenu', (e) => e.stopPropagation());
  document.body.append(root);

  let view = null, savedVer = null, ac = null, closing = false, armRemake = false;
  const status = (t) => { st.textContent = t || ''; };
  const busy = (on) => { remake.disabled = on; save.disabled = png.disabled = on || !view; };
  const showMsg = (text, buttons = [], spin = false) => {
    msg.replaceChildren(make('div', { className: 'card' }, spin ? make('span', { className: 'spin' }) : '', make('span', { textContent: text }), make('div', { className: 'btns' }, ...buttons.map(([t, f, p]) => btn(t, f, p)))));
    msg.hidden = false;
  };
  const hideMsg = () => { msg.hidden = true; };
  const dirty = () => view && savedVer !== view.version();

  const show = async (scene) => {
    const v = await viewP;
    if (closing) return;
    if (view) await view.replace(scene); else view = await v.mountView(ex, scene);
    hideMsg(); busy(false);
  };
  const doSave = async (auto) => {
    if (!view || !saveNoteFile) { if (!saveNoteFile) status('저장할 곳이 없습니다.'); return false; }
    try { await saveNoteFile(file, view.json()); savedVer = view.version(); status(auto ? `메모 옆에 "${file}"로 저장했습니다.` : `저장했습니다 · ${file}`); close.textContent = '닫기'; return true; }
    catch (e) { console.warn('그림 저장:', e?.message || e); status('저장하지 못했습니다. 메모 폴더를 확인해 주세요.'); return false; }
  };
  const doPng = async () => {
    if (!view) return;
    png.disabled = true; status('그림 파일을 만드는 중…');
    try { const path = await saveFile(await view.png(), name + '.png'); status(path ? `PNG를 저장했습니다 · ${path}` : 'PNG를 내려받았습니다.'); }
    catch (e) { console.warn('PNG 내보내기:', e?.message || e); status('PNG를 만들지 못했습니다.'); }
    png.disabled = false;
  };
  const tryClose = () => {
    if (dirty() && close.textContent === '닫기') { close.textContent = '저장하지 않고 닫기'; status('바꾼 내용이 아직 저장되지 않았습니다. "저장"을 누르거나 한 번 더 누르면 그냥 닫습니다.'); return; }
    handle.close(true);
  };
  const askRemake = () => {
    if (!armRemake) { armRemake = true; remake.textContent = '정말 다시 만들기'; status(isMock() ? '(시험) 새로 그립니다.' : 'AI에게 새로 그려 달라고 합니다(요금이 들고, 지금 그림은 새 그림으로 바뀝니다). 한 번 더 누르면 시작합니다.'); setTimeout(() => { armRemake = false; remake.textContent = '다시 만들기'; }, 5000); return; }
    armRemake = false; remake.textContent = '다시 만들기'; generate();
  };
  const openSettings = () => { handle.close(true); window.NANRO?.settings?.open('ai'); };

  // AI에게 그림을 받아 보여 주고, 바로 메모 옆에 저장한다(다시 열 때 요금이 들지 않게)
  const generate = async () => {
    if (!isMock() && (!getKey() || !aiPrefs().model)) {
      showMsg(!getKey() ? 'AI 설명을 쓰려면 Claude API 키가 필요합니다. 설정의 "AI" 탭에서 키를 넣어 주세요.' : '설정의 "AI" 탭에서 모델을 골라 주세요.', [['설정 열기', openSettings, true], ['닫기', () => handle.close(true)]]);
      return 'nokey';
    }
    if (!markdown.trim()) { showMsg('메모가 비어 있습니다. 내용을 조금 적은 뒤에 다시 해 보세요.', [['닫기', () => handle.close(true)]]); return 'empty'; }
    ac?.abort(); ac = new AbortController(); const signal = ac.signal;
    busy(true);
    const onStatus = (t) => { if (!signal.aborted) showMsg(t, [['취소', () => ac.abort()]], true); };
    onStatus('그림을 만드는 중…');
    try {
      const diagram = isMock() ? await (await import('./mock.js')).mockDiagram({ signal, onStatus })
        : await (await import('./claude.js')).requestDiagram({ markdown, meta, level: aiPrefs().level, signal, onStatus });
      if (closing) return 'closed';
      onStatus('그림판을 펴는 중…');
      const v = await viewP;
      await show(v.sceneFromDiagram(diagram, meta));
      await doSave(true);
      return 'generated';
    } catch (e) {
      if (closing) return 'closed';
      busy(false);
      if (e?.code === 'abort' || signal.aborted) { if (view) { hideMsg(); status('취소했습니다.'); } else showMsg('취소했습니다.', [['다시 해 보기', generate, true], ['닫기', () => handle.close(true)]]); return 'abort'; }
      const fix = e?.code === 'auth' || e?.code === 'model' || e?.code === 'nokey' || e?.code === 'nomodel';
      const more = fix ? [['설정 열기', openSettings, true]] : [['다시 해 보기', generate, true]];
      if (view) { hideMsg(); status(e.message); } else showMsg(e?.message || String(e), [...more, ['닫기', () => handle.close(true)]]);
      return 'error';
    }
  };

  const handle = {
    state: 'opening', file,
    count: () => view?.count() ?? 0,
    dirty,
    close(force) {
      if (closing) return; if (!force && dirty()) return tryClose();
      closing = true; ac?.abort(); removeEventListener('keydown', guard, true); try { view?.destroy(); } catch { /* 무시 */ } root.remove(); if (current === handle) current = null;
    },
  };
  current = handle;
  busy(true);

  // 저장된 그림이 있으면 그것을, 없으면 AI로 새로
  showMsg('그림을 여는 중…', [], true);
  let text = null;
  try { text = await readNoteFile?.(file); } catch (e) {
    // 읽기만 실패한 것일 수 있다: 저장된 그림을 덮어쓰거나 요금을 쓰지 않도록 묻는다
    console.warn('그림 읽기:', e?.message || e);
    showMsg(`저장된 그림("${file}")을 읽지 못했습니다. 새로 만들면 그 파일을 덮어씁니다.`, [['새로 만들기', () => generate(), true], ['닫기', () => handle.close(true)]]);
    busy(false); handle.state = 'readerror'; return handle;
  }
  if (text) {
    try {
      const v = await viewP, scene = v.sceneFromJSON(text);
      if (scene) { await show(scene); savedVer = view?.version(); status(`저장해 둔 그림을 열었습니다 · ${file}`); handle.state = 'loaded'; return handle; }
      showMsg('저장된 그림 파일을 읽지 못했습니다. 새로 만들까요?', [['다시 만들기', () => generate(), true], ['닫기', () => handle.close(true)]]);
      busy(false); handle.state = 'badfile'; return handle;
    } catch (e) {
      console.warn('그림판:', e?.message || e);
      showMsg('그림판을 열지 못했습니다.', [['닫기', () => handle.close(true)]]); handle.state = 'error'; return handle;
    }
  }
  handle.state = await generate();
  return handle;
}

// 개발·시험용: NANRO_AI.openDiagram(...), NANRO_AI.mock(true), NANRO_AI.current
window.NANRO_AI = { openDiagram, mock: setMock, get current() { return current; } };
