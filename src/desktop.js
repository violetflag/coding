// 윈도우 프로그램(src-tauri) 안에서만 하는 일. 웹버전에서는 아무것도 하지 않는다.
//   F11: 전체 화면과 창을 오간다(브라우저에서는 브라우저가 직접 한다).
//   시작 화면의 "끝내기", 멈춤 띠의 안내: 전체 화면에는 닫기 단추가 없기 때문이다.
const T = window.__TAURI__;
export const DESKTOP = !!T?.core;

export function setupDesktop() {
  if (!DESKTOP) return;
  const call = (cmd) => T.core.invoke(cmd).catch(() => {});
  addEventListener('keydown', (e) => { if (e.key === 'F11' && !e.repeat) { e.preventDefault(); call('toggle_fullscreen'); } }, true);
  const wrap = document.getElementById('quitWrap');
  if (wrap) { wrap.hidden = false; document.getElementById('quitApp').addEventListener('click', (e) => { e.stopPropagation(); call('quit'); }); }
  const pause = document.getElementById('pause');
  if (pause) pause.append('  ·  F11 창/전체 화면  ·  Alt+F4 끝내기');
}

// 파일 저장(백업, 밑줄 내보내기, 인용구 카드). 웹버전은 브라우저의 내려받기를 쓰고 null 을 돌려준다.
// 프로그램 창에서는 브라우저식 내려받기가 되지 않아서, 내용을 프로그램에 넘겨 내려받기 폴더에 쓰게 하고 저장된 경로를 돌려준다.
export async function saveFile(blob, name) {
  if (!DESKTOP) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); return null;
  }
  const hex = Array.from(new TextEncoder().encode(name), (b) => b.toString(16).padStart(2, '0')).join('');   // 머리말에는 한글을 그대로 못 넣는다
  return T.core.invoke('save_download', new Uint8Array(await blob.arrayBuffer()), { headers: { 'x-file-name': hex } });
}
