// 설정창의 "AI" 탭: Claude API 키, 모델, 설명 수준, 연결 시험. 메모를 그림으로 풀어 주는 기능(diagram.js)이 쓴다.
import { getKey, setKey, aiPrefs, saveAiPrefs, isMock } from './prefs.js';
import './diagram.js';   // 개발·시험용 NANRO_AI 를 등록한다(그림판 자체는 열 때 따로 불러온다)

const E = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.filter((k) => k != null)); return e; };
const api = () => (isMock() ? import('./mock.js').then((m) => m.mockApi) : import('./claude.js'));

export function aiSection() {
  const p = aiPrefs();
  let models = null;
  return { key: 'ai', label: 'AI', build(el) {
    const key = E('input', { type: 'password', placeholder: 'sk-ant- 로 시작하는 키를 붙여 넣기', spellcheck: false, value: getKey() });
    key.style.cssText = 'flex:1;min-width:0;box-sizing:border-box;background:#0e0a07;color:inherit;border:1px solid #4a3a28;border-radius:4px;padding:6px 8px;font:inherit';
    key.setAttribute('autocomplete', 'new-password');   // 브라우저가 비밀번호로 저장하자고 하지 않게
    const keyState = E('div', { className: 'note' });
    const modelBox = E('span'), modelState = E('div', { className: 'hint' });
    const level = E('select', {}, E('option', { value: 'easy', textContent: '쉽게' }), E('option', { value: 'detail', textContent: '자세히' }));
    level.value = p.level; level.addEventListener('change', () => { p.level = level.value; saveAiPrefs(p); });
    const test = E('button', { type: 'button', textContent: '연결 시험' }), testState = E('span', { className: 'state' });
    const showKey = () => { keyState.textContent = getKey() ? '키가 이 컴퓨터에 저장되어 있습니다.' : '아직 키가 없습니다.'; };

    // 모델 고르기: 키가 있으면 목록을 받아 고르게 하고, 받지 못하면 이름을 직접 적게 한다
    const textModel = (why) => {
      const t = E('input', { type: 'text', placeholder: '모델 이름', value: p.model, spellcheck: false });
      t.addEventListener('change', () => { p.model = t.value.trim(); p.modelName = ''; saveAiPrefs(p); });
      modelBox.replaceChildren(t); modelState.textContent = why;
    };
    const loadModels = async () => {
      if (!getKey() && !isMock()) { models = null; modelBox.replaceChildren(E('span', { className: 'rng', style: 'text-align:left', textContent: '키를 넣으면 고를 수 있습니다' })); modelState.textContent = ''; return; }
      modelState.textContent = '모델 목록을 받는 중…';
      try {
        const m = await api(); models = await m.listModels();
        if (!models.length) return textModel('받은 모델 목록이 비어 있습니다. 모델 이름을 직접 적어 주세요.');
        if (!models.some((x) => x.id === p.model)) { const d = m.pickDefault(models); p.model = d.id; p.modelName = d.display_name || d.id; saveAiPrefs(p); }
        const s = E('select', {}, ...models.map((x) => E('option', { value: x.id, textContent: x.display_name ? `${x.display_name} (${x.id})` : x.id })));
        s.value = p.model;
        s.addEventListener('change', () => { const x = models.find((y) => y.id === s.value); p.model = s.value; p.modelName = x?.display_name || s.value; saveAiPrefs(p); testState.textContent = ''; });
        modelBox.replaceChildren(s); modelState.textContent = '처음에는 목록에서 가장 새 Opus 모델을 고릅니다.';
      } catch (e) {
        models = null;
        if (e?.code === 'auth') { modelBox.replaceChildren(); modelState.textContent = e.message; } else textModel(`모델 목록을 받지 못했습니다(${e?.message || e}). 모델 이름을 직접 적을 수 있습니다.`);
      }
    };
    key.addEventListener('change', () => { setKey(key.value); key.value = getKey(); showKey(); testState.textContent = ''; loadModels(); });
    const clear = E('button', { type: 'button', textContent: '지우기', onclick: () => { setKey(''); key.value = ''; showKey(); testState.textContent = ''; loadModels(); } });
    test.addEventListener('click', async () => {
      testState.textContent = '확인하는 중…';
      try { const m = await (await api()).testConnection(p.model); testState.textContent = `연결됨 · ${m.display_name || m.id}`; }
      catch (e) { testState.textContent = e?.message || String(e); }
    });

    const row = (label, ...kids) => E('div', { className: 'row wide' }, E('label', { textContent: label }), ...kids);
    el.append(
      E('h3', { textContent: 'Claude API 키' }),
      row('API 키', E('span', { style: 'display:flex;gap:6px' }, key, clear)), keyState,
      E('div', { className: 'note', textContent: '메모를 그림으로 쉽게 풀어 주는 기능에 씁니다. 키는 console.anthropic.com 에 로그인한 뒤 "API Keys"에서 만들 수 있습니다. 쓸 때마다 그 계정에 사용한 만큼 요금이 붙습니다. 키는 이 컴퓨터에만 저장되고, Claude(api.anthropic.com) 말고는 어디로도 보내지 않습니다.' }),
      E('h3', { textContent: '그림 만들기' }),
      E('div', { className: 'row wide' }, E('label', { textContent: '모델' }), modelBox, modelState),
      row('설명 수준', level),
      E('div', { className: 'btns', style: 'justify-content:flex-start;margin-top:6px' }, test, testState),
      E('div', { className: 'note', textContent: '메모장에서 그림으로 보기를 누르면 메모와 책 정보를 Claude에 보내 그림을 받습니다. 만든 그림은 메모 옆에 "메모 이름.excalidraw"로 저장되어, 다음에 열 때는 요금 없이 바로 보입니다.' }),
      isMock() ? E('div', { className: 'note', textContent: '(시험 모드: 실제로 보내지 않고 미리 만든 그림을 씁니다)' }) : null);
    showKey();
    this._load = loadModels;
  }, onShow() { if (!models) this._load(); } };
}
