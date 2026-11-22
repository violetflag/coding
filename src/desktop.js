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
