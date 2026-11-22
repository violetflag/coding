// 메모 파일 저장소. 책을 읽으며 쓴 메모(.md)와 그 메모로 그린 그림(.excalidraw 같은 것)을 이름으로 읽고 쓴다.
//   프로그램 창: 메모 폴더(기본 C:\Nanro\notes, 설정에서 바꿀 수 있다)의 파일. 읽고 쓰는 일은 src-tauri 가 한다.
//   웹버전: 이 브라우저(IndexedDB)에 둔다. 파일로 갖고 싶으면 "내려받기 (.md)".
// 다른 기능(메모를 그림으로 설명하기)도 saveNoteFile, readNoteFile 로 같은 폴더에 파일을 둔다.
import * as db from '../reader/store.js';
import { DESKTOP, saveFile } from '../desktop.js';

const T = window.__TAURI__, KEY = 'note:';
export const NOTE_EXT = ['md', 'markdown', 'txt', 'excalidraw', 'json', 'svg'];
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

// 책 제목 같은 글을 파일 이름의 앞부분으로 만든다: 윈도우가 못 쓰는 글자, 폴더 경로, 끝의 점은 뺀다.
export function safeStem(raw) {
  let s = String(raw ?? '').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, ' ').replace(/\.{2,}/g, '.').replace(/\s+/g, ' ').trim();
  s = s.replace(/^[.\s]+|[.\s]+$/g, '');
  if ([...s].length > 80) s = [...s].slice(0, 80).join('').trim().replace(/[.\s]+$/, '');
  if (!s) s = '메모';
  if (RESERVED.test(s)) s += '_';
  return s;
}
// 메모 폴더에 둘 수 있는 이름인지 (src-tauri 의 note_name 과 같은 규칙)
export function validName(name) {
  const n = String(name ?? '').trim(), i = n.lastIndexOf('.');
  if (!n || [...n].length > 160 || n.startsWith('.') || n.endsWith('.') || n.endsWith(' ') || n.includes('..') || /[\u0000-\u001f\u007f<>:"/\\|?*]/.test(n) || i <= 0) return false;
  const stem = n.slice(0, i).trim();
  return !!stem && !RESERVED.test(stem) && NOTE_EXT.includes(n.slice(i + 1).toLowerCase());
}
const check = (name) => { if (!validName(name)) throw new Error('메모 파일 이름을 쓸 수 없습니다: ' + name); return String(name).trim(); };

// [{ name, size, modified(밀리초) }]
export async function listNotes() {
  if (DESKTOP) return (await T.core.invoke('notes_list')).files.map((f) => ({ name: f.name, size: f.size, modified: f.modified * 1000 }));
  const out = [];
  for (const k of await db.keys('kv')) {
    if (!String(k).startsWith(KEY)) continue;
    const v = await db.get('kv', k); if (v) out.push({ name: String(k).slice(KEY.length), size: (v.text || '').length, modified: v.modified || 0 });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
// 파일의 글. 없으면 null
export async function readNoteFile(fileName) {
  const name = check(fileName);
  if (DESKTOP) return T.core.invoke('note_read', { name });
  return (await db.get('kv', KEY + name))?.text ?? null;
}
export async function saveNoteFile(fileName, text) {
  const name = check(fileName);
  if (DESKTOP) return T.core.invoke('note_write', { name, text: String(text) });
  await db.put('kv', KEY + name, { text: String(text), modified: Date.now() });
}
// 메모 폴더의 자리 (웹버전은 null)
export async function notesFolder() { return DESKTOP ? (await T.core.invoke('notes_list')).dir : null; }
export const openNotesFolder = () => DESKTOP && T.core.invoke('open_notes_folder');
export const chooseNotesFolder = () => (DESKTOP ? T.core.invoke('choose_notes_folder') : null);
// 메모를 .md 파일로 내려받는다. 프로그램 창에서는 내려받기 폴더에 쓰고 그 경로를 돌려준다.
export const downloadNote = (fileName, text) => saveFile(new Blob([text], { type: 'text/markdown;charset=utf-8' }), fileName);
