// 시험용 가짜 응답: 키와 인터넷 없이 그림 만들기의 전체 흐름(부르기, 바꾸기, 보여 주기, 저장, 다시 열기)을 확인한다.
// 견본 책 "겨울 난롯가에서"에 붙인 메모를 AI가 정리했다고 치고 늘 같은 자료를 돌려준다.
export const MOCK_DIAGRAM = {
  title: '불을 지키는 저녁',
  summary: '불은 한 번 붙이면 끝나는 것이 아니라, 장작을 제때 넣고 바람길을 열어 주며 돌보는 것이다. 메모의 중심 생각은 "꾸준한 작은 돌봄이 따뜻함을 오래 간다"는 것이고, 이는 책 읽기에도 그대로 들어맞는다.',
  nodes: [
    { id: 'n1', label: '꾸준한 작은 돌봄이 따뜻함을 오래 지킨다', kind: 'main', group: '' },
    { id: 'n2', label: '장작은 조금씩 자주 넣기', kind: 'concept', group: '불 돌보기' },
    { id: 'n3', label: '바람길을 열어 두기', kind: 'concept', group: '불 돌보기' },
    { id: 'n4', label: '숯불이 남아 있으면 다시 살아난다', kind: 'concept', group: '불 돌보기' },
    { id: 'n5', label: '한꺼번에 많이 넣으면 연기만 난다', kind: 'example', group: '불 돌보기' },
    { id: 'n6', label: '할머니가 저녁마다 불씨를 묻어 두던 장면', kind: 'example', group: '' },
    { id: 'n7', label: '책도 매일 몇 쪽씩 읽는 편이 오래 간다', kind: 'insight', group: '읽기' },
    { id: 'n8', label: '나에게 숯불 같은 습관은 무엇일까?', kind: 'question', group: '읽기' },
  ],
  edges: [
    { from: 'n1', to: 'n2', label: '방법' },
    { from: 'n1', to: 'n3', label: '방법' },
    { from: 'n1', to: 'n4', label: '그래서' },
    { from: 'n2', to: 'n5', label: '반대로' },
    { from: 'n4', to: 'n6', label: '예를 들면' },
    { from: 'n1', to: 'n7', label: '내 삶에' },
    { from: 'n7', to: 'n8', label: '더 생각' },
  ],
};

import { mockData } from './prefs.js';

export async function mockDiagram({ signal, onStatus = () => {} } = {}) {
  const wait = (ms) => new Promise((ok, no) => { const t = setTimeout(ok, ms); signal?.addEventListener('abort', () => { clearTimeout(t); no(Object.assign(new Error('취소했습니다.'), { code: 'abort' })); }, { once: true }); });
  onStatus('(시험) 메모를 읽고 생각하는 중…'); await wait(500);
  onStatus('(시험) 그림을 짜는 중…'); await wait(400);
  return structuredClone(mockData() || MOCK_DIAGRAM);
}

// 시험 모드의 설정 탭: 모델 목록과 연결 시험도 가짜로(실제 모델 이름이 아니다)
export const mockApi = {
  async listModels() { return [{ id: 'mock-opus', display_name: '(시험) Opus', created_at: '2026-01-02T00:00:00Z' }, { id: 'mock-sonnet', display_name: '(시험) Sonnet', created_at: '2026-01-01T00:00:00Z' }]; },
  pickDefault: (m) => m.find((x) => /opus/i.test(x.display_name)) || m[0],
  async testConnection(model) { return { id: model, display_name: '(시험) 연결 확인' }; },
};
