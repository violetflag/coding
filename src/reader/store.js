// 저장소: 책 파일과 서재 목록, 읽던 위치, 북마크·밑줄·메모, 독서 통계를 브라우저(IndexedDB)에 둔다.
// 서버로 보내는 것은 없다. 백업은 파일 하나(JSON)로 내보내고 가져온다.
const DB = 'nanro', STORES = ['books', 'files', 'marks', 'kv'];
let dbp = null;
const open = () => dbp || (dbp = new Promise((res, rej) => {
  const rq = indexedDB.open(DB, 1);
  rq.onupgradeneeded = () => { for (const s of STORES) if (!rq.result.objectStoreNames.contains(s)) rq.result.createObjectStore(s); };
  rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
}));
const tx = async (store, mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction(store, mode), rq = fn(t.objectStore(store)); t.oncomplete = () => res(rq?.result); t.onerror = () => rej(t.error); }); };
export const get = (store, key) => tx(store, 'readonly', (s) => s.get(key));
export const put = (store, key, val) => tx(store, 'readwrite', (s) => s.put(val, key));
export const del = (store, key) => tx(store, 'readwrite', (s) => s.delete(key));
export const all = (store) => tx(store, 'readonly', (s) => s.getAll());
export const keys = (store) => tx(store, 'readonly', (s) => s.getAllKeys());

export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ---- 서재
export async function listBooks() { return (await all('books')).sort((a, b) => (b.lastOpened || b.addedAt) - (a.lastOpened || a.addedAt)); }
export async function saveBook(meta, blob) { await put('books', meta.id, meta); if (blob) await put('files', meta.id, blob); }
export async function removeBook(id) { await del('books', id); await del('files', id); await del('marks', id); }
export const bookFile = (id) => get('files', id);
export async function getMarks(id) { return (await get('marks', id)) || { bookmarks: [], highlights: [] }; }
export const saveMarks = (id, m) => put('marks', id, m);

// ---- 독서 통계: 날짜별 { seconds, pages, logs(장작 수) }
export async function addStat(patch, day = today()) {
  const stats = (await get('kv', 'stats')) || {}; const d = (stats[day] = stats[day] || { seconds: 0, pages: 0, logs: 0 });
  for (const k in patch) d[k] = (d[k] || 0) + patch[k];
  await put('kv', 'stats', stats); return d;
}
export const getStats = async () => (await get('kv', 'stats')) || {};

// ---- 백업: 서재 목록·위치·밑줄·통계 + (선택) 책 파일 + 설정(글자, 그래픽, 가구 배치, 볼륨 같은 것)과 액자 그림
const b64 = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
const unb64 = async (url) => (await fetch(url)).blob();
const LOCAL = 'nanro.';
export async function exportBackup(withFiles = true) {
  const out = { app: 'nanro', version: 2, at: Date.now(), books: await all('books'), marks: {}, files: {}, stats: await getStats(), local: {}, frames: {} };
  for (const b of out.books) { out.marks[b.id] = await getMarks(b.id); if (withFiles) { const f = await bookFile(b.id); if (f) out.files[b.id] = await b64(f); } }
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(LOCAL)) out.local[k] = localStorage.getItem(k); } } catch { /* 설정 없이 내보낸다 */ }
  for (const k of await keys('kv')) if (String(k).startsWith('frame:')) { const b = await get('kv', k); if (b) out.frames[k] = await b64(b); }
  return new Blob([JSON.stringify(out)], { type: 'application/json' });
}
// 책은 언제나 가져온다. 백업에 설정이 들어 있으면 wantSettings()에 물어서, 그렇다고 하면 설정과 액자 그림도 가져온다(지금 설정을 덮어쓴다).
// 돌려주는 값: { count: 가져온 책 수, settings: 설정을 가져왔는지 }. 설정을 가져왔으면 화면을 다시 불러와야 적용된다.
export async function importBackup(file, wantSettings = () => false) {
  const data = JSON.parse(await file.text()); if (data.app !== 'nanro') throw new Error('난로 백업 파일이 아닙니다');
  for (const b of data.books || []) { await put('books', b.id, b); if (data.marks?.[b.id]) await saveMarks(b.id, data.marks[b.id]); if (data.files?.[b.id]) await put('files', b.id, await unb64(data.files[b.id])); }
  if (data.stats) { const cur = await getStats(); await put('kv', 'stats', { ...data.stats, ...cur }); }
  const has = Object.keys(data.local || {}).length + Object.keys(data.frames || {}).length > 0;
  const settings = has && !!(await wantSettings());
  if (settings) {
    for (const k in data.local) if (k.startsWith(LOCAL)) { try { localStorage.setItem(k, data.local[k]); } catch { /* 무시 */ } }
    for (const k in data.frames || {}) if (k.startsWith('frame:')) await put('kv', k, await unb64(data.frames[k]));
  }
  return { count: (data.books || []).length, settings };
}
