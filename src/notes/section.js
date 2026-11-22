// 설정창의 "메모" 탭: 메모가 저장되는 곳. 프로그램 창에서는 메모 폴더를 열거나 바꾼다.
import { DESKTOP } from '../desktop.js';
import { notesFolder, openNotesFolder, chooseNotesFolder } from './store.js';

const E = (tag, props = {}, ...kids) => { const e = document.createElement(tag); for (const k in props) { if (k.startsWith('on')) e.addEventListener(k.slice(2), props[k]); else e[k] = props[k]; } for (const c of kids) if (c != null) e.append(c); return e; };

export function notesSection(notes) {
  let where = null;
  const show = async () => { if (!where) return; try { where.textContent = (await notesFolder()) || ''; } catch { where.textContent = '메모 폴더를 읽지 못했습니다'; } };
  return {
    key: 'notes', label: '메모',
    build(el) {
      el.append(E('h3', { textContent: '메모장' }), E('div', { className: 'note', textContent: '책을 읽다가 M 키나 오른쪽 위의 "메모" 단추로 엽니다. 위의 단추로 굵게, 제목, 목록 같은 꾸밈을 넣을 수 있고, 치다가 멈추면 1초 뒤에 저절로 저장됩니다. 메모 파일 맨 위에는 책 제목, 저자, 읽던 곳이 함께 적힙니다.' }));
      if (!DESKTOP) { el.append(E('h3', { textContent: '저장되는 곳' }), E('div', { className: 'note', textContent: '웹에서는 메모가 이 브라우저에 저장됩니다. 메모장의 "내려받기 (.md)"를 누르면 파일로 받을 수 있습니다.' })); return; }
      where = E('span', { textContent: '확인하는 중…', style: 'word-break:break-all' });
      el.append(E('h3', { textContent: '메모 폴더' }),
        E('div', { className: 'row wide' }, E('label', { textContent: '저장되는 곳' }), where),
        E('div', { className: 'btns', style: 'justify-content:flex-start;margin-top:6px' },
          E('button', { textContent: '폴더 열기', onclick: () => openNotesFolder() }),
          E('button', { textContent: '폴더 바꾸기', onclick: async () => { if (await chooseNotesFolder()) { await show(); notes?.reload?.(); } } })),
        E('div', { className: 'note', style: 'margin-top:10px', textContent: '메모는 책마다 "책 제목.md" 파일로 이 폴더에 저장됩니다. 메모 프로그램(옵시디언, 메모장 같은 것)으로 열어 봐도 됩니다. 폴더를 바꾸면 그다음 메모부터 새 폴더에 저장되고, 예전 메모는 옮겨지지 않습니다.' }));
      show();
    },
    onShow: () => show(),
  };
}
