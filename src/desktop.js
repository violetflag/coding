// 윈도우 프로그램(src-tauri) 안에서만 하는 일. 웹버전에서는 아무것도 하지 않는다.
//   F11: 전체 화면과 창을 오간다(브라우저에서는 브라우저가 직접 한다).
//   시작 화면의 "끝내기", 멈춤 띠의 안내: 전체 화면에는 닫기 단추가 없기 때문이다.
//   책 파일을 "난로로 열기"로 넘겨받기, 서재 폴더의 책을 서재에 꽂기, Edge 에서 쓰던 책과 설정 옮겨 오기.
const T = window.__TAURI__;
export const DESKTOP = !!T?.core;

export function setupDesktop() {
  if (!DESKTOP) return;
  const call = (cmd) => T.core.invoke(cmd).catch(() => {});
  addEventListener('keydown', (e) => { if (e.key === 'F11' && !e.repeat) { e.preventDefault(); call('toggle_fullscreen'); } }, true);
  const wrap = document.getElementById('quitWrap');
  if (wrap) { wrap.hidden = false; document.getElementById('quitApp').addEventListener('click', (e) => { e.stopPropagation(); call('quit'); }); }
  const pause = document.getElementById('pause');
  if (pause) pause.append('\u00a0 · \u00a0F11 창/전체 화면');
  // 방 안에서도 누를 수 있는 "끝내기" 단추: 마우스가 풀려 있을 때(멈춤, 책 읽기, 메뉴) 왼쪽 위에 보인다.
  // 마우스로 둘러보는 동안에는 숨는다. 시작 화면에는 원래의 끝내기가 있어 숨긴다.
  const st = document.createElement('style');
  st.textContent = `#quitCorner { position: fixed; left: 14px; top: 12px; z-index: 7; padding: 6px 14px; border-radius: 16px; font: 13px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
    background: rgba(20,14,9,.72); color: #e9dcc6; border: 1px solid rgba(233,220,198,.28); cursor: pointer; opacity: 0; pointer-events: none; transition: opacity .2s; }
    #quitCorner.on { opacity: .85; pointer-events: auto; } #quitCorner:hover { opacity: 1; background: rgba(120,50,20,.85); }`;
  document.head.append(st);
  const corner = Object.assign(document.createElement('button'), { id: 'quitCorner', type: 'button', textContent: '끝내기', title: '난로 끝내기 (Alt+F4)' });
  corner.addEventListener('click', (e) => { e.stopPropagation(); call('quit'); });
  corner.addEventListener('mousedown', (e) => e.stopPropagation());
  document.body.append(corner);
  const start = document.getElementById('start');
  const sync = () => corner.classList.toggle('on', !document.pointerLockElement && !!start?.classList.contains('off'));
  document.addEventListener('pointerlockchange', sync); setInterval(sync, 400); sync();
}

// 파일 저장(백업, 밑줄 내보내기, 인용구 카드). 웹버전은 브라우저의 내려받기를 쓰고 null 을 돌려준다.
// 프로그램 창에서는 브라우저식 내려받기가 되지 않아서, 내용을 프로그램에 넘겨 내려받기 폴더에 쓰게 하고 저장된 경로를 돌려준다.
// 설정창 아래의 "난로 끝내기" 단추 (프로그램에서만)
export function quitButton() {
  if (!DESKTOP) return null;
  const b = Object.assign(document.createElement('button'), { type: 'button', textContent: '난로 끝내기' });
  b.addEventListener('click', () => T.core.invoke('quit').catch(() => {}));
  return b;
}

export async function saveFile(blob, name) {
  if (!DESKTOP) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); return null;
  }
  const hex = Array.from(new TextEncoder().encode(name), (b) => b.toString(16).padStart(2, '0')).join('');   // 머리말에는 한글을 그대로 못 넣는다
  return T.core.invoke('save_download', new Uint8Array(await blob.arrayBuffer()), { headers: { 'x-file-name': hex } });
}

// ---- 책 파일 넘겨받기와 서재 폴더. 파일은 프로그램 쪽이 읽어 주고(넘어온 책 파일과 서재 폴더 안의 책 파일만), 여기서는 File 로 만들어 화면의 책 넣기에 넘긴다.
const fileOf = async (b) => new File([await T.core.invoke('read_book', { path: b.path })], b.name);

// 책 파일을 더블클릭했거나 "난로로 열기"를 골랐을 때: 켜는 중이든 이미 켜져 있든 그 책을 받아 onFiles 에 넘긴다.
export function watchOpened(onFiles) {
  if (!DESKTOP) return;
  let line = Promise.resolve();
  const pull = () => (line = line.then(async () => {
    const files = [];
    for (const b of await T.core.invoke('opened_books')) { try { files.push(await fileOf(b)); } catch (e) { console.warn(b.name, e); } }
    if (files.length) await onFiles(files);
  }).catch((e) => console.warn(e)));
  T.event?.listen('nanro-open', pull); pull();
}

// 서재 폴더에 있는 책 가운데 아직 꽂지 않은 것을 서재에 꽂는다.
// 한 번 본 파일은 적어 둔다: 서재에서 뺀 책이 다시 들어오지 않고, 열 수 없는 파일을 켤 때마다 다시 읽지 않는다.
let syncLine = Promise.resolve();
export function syncLibraryFolder({ addFile, store, toast }) {
  if (!DESKTOP) return Promise.resolve(null);
  return (syncLine = syncLine.catch(() => {}).then(async () => {
    const lib = await T.core.invoke('library_books'), seen = (await store.get('kv', 'folderSeen')) || {};
    let added = 0, failed = 0;
    for (const b of lib.books) {
      const key = `${b.path}|${b.size}|${b.modified}`; if (seen[key]) continue;
      try { await addFile(await fileOf(b)); added++; } catch (e) { console.warn(b.name, e); failed++; }
      seen[key] = 1; await store.put('kv', 'folderSeen', seen);
    }
    if (added) toast(`서재 폴더에서 책 ${added}권을 꽂았습니다`);
    if (failed) toast(`서재 폴더의 파일 ${failed}개는 열 수 없었습니다`);
    return { dir: lib.dir, total: lib.books.length, added, failed };
  }));
}

// 서재 창의 "서재 폴더" 칸.
export function libraryFolderPanel(body, { sync, rerender }) {
  if (!DESKTOP) return;
  const make = (tag, props) => Object.assign(document.createElement(tag), props);
  const where = make('p', { className: 'sub', textContent: '서재 폴더를 확인하는 중…' });
  const show = (dir, total) => { where.textContent = `${dir} · 책 파일 ${total}개`; };
  const read = async () => { try { const r = await sync(); show(r.dir, r.total); if (r.added) rerender(); } catch (e) { where.textContent = '서재 폴더를 읽지 못했습니다'; console.warn(e); } };
  const row = make('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' });
  row.append(
    make('button', { textContent: '폴더 열기', onclick: () => T.core.invoke('open_library_folder') }),
    make('button', { textContent: '다시 읽기', onclick: read }),
    make('button', { textContent: '폴더 바꾸기', onclick: async () => { if (await T.core.invoke('choose_library_folder')) read(); } }));
  body.append(make('h3', { textContent: '서재 폴더' }), row, where,
    make('p', { className: 'sub', textContent: '이 폴더에 책 파일(EPUB · PDF · TXT)을 넣어 두면 난로를 켤 때 서재에 꽂힙니다. 폴더에서 파일을 지워도 서재의 책과 읽던 곳은 남습니다.' }));
  T.core.invoke('library_books').then((l) => show(l.dir, l.books.length), () => {});
}

// 시작 화면의 "Edge 에서 쓰던 책과 설정 옮겨 오기". 서재가 비어 있을 때만 보인다.
export function setupMoveIn({ isEmpty, bring }) {
  const box = document.getElementById('moveIn'); if (!DESKTOP || !box) return () => {};
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json', style: 'display:none' });
  input.addEventListener('change', () => { const f = input.files[0]; input.value = ''; if (f) bring(f); });
  document.body.append(input);
  document.getElementById('moveInBtn').addEventListener('click', (e) => { e.stopPropagation(); input.click(); });
  const refresh = () => { box.hidden = !isEmpty(); };
  refresh(); return refresh;
}
