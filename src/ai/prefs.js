// AI 설정. API 키는 따로 된 칸('nanro.ai.key')에 이 컴퓨터에만 둔다. 화면에도, 기록(console)에도 내보내지 않는다.
const KEY = 'nanro.ai.key', OPTS = 'nanro.ai';
export const AI_DEFAULTS = { model: '', modelName: '', level: 'easy' };

export function getKey() { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } }
export function setKey(k) { try { k ? localStorage.setItem(KEY, k.trim()) : localStorage.removeItem(KEY); } catch { /* 무시 */ } }
export function aiPrefs() { const p = { ...AI_DEFAULTS }; try { Object.assign(p, JSON.parse(localStorage.getItem(OPTS) || '{}')); } catch { /* 기본값 */ } return p; }
export function saveAiPrefs(p) { try { localStorage.setItem(OPTS, JSON.stringify({ model: p.model, modelName: p.modelName, level: p.level })); } catch { /* 무시 */ } }

// 시험용: 주소에 ?aimock 을 붙이거나 NANRO_AI.mock(true) 를 부르면 키와 인터넷 없이 미리 만든 그림을 돌려준다
let mock = (() => { try { return new URLSearchParams(location.search).has('aimock'); } catch { return false; } })();
export const isMock = () => !!mock;
// on 에 그림 자료를 넘기면 시험 모드가 그 자료를 돌려준다(배치 점검용)
export const setMock = (on = true) => { mock = on && typeof on === 'object' ? on : !!on; };
export const mockData = () => (typeof mock === 'object' ? mock : null);
