// 난로의 윈도우 프로그램 틀. 화면(방, 불, 책)은 웹버전과 같은 코드이고, 여기서는 창만 다룬다.
//   - 창 하나를 만들고, 마지막 크기와 위치, 전체 화면 여부를 기억한다.
//   - 책과 설정은 프로그램 폴더와 다른 자료 폴더에 둔다. 새 버전을 덮어 깔아도 남는다.
//   - 이미 켜져 있으면 새로 켜지 않고 켜져 있는 창을 앞으로 가져온다.
//   - 책 파일을 "난로로 열기"로 넘겨받고, 서재 폴더에 있는 책 파일을 화면에 내준다.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::UNIX_EPOCH,
};

use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

/// 창을 기억하는 내용. x, y, w, h 는 보통 창(최대화도 전체 화면도 아닐 때)의 자리와 안쪽 크기(실제 픽셀)다.
#[derive(Clone, Copy, Serialize, Deserialize)]
struct WinState {
    x: i32,
    y: i32,
    w: u32,
    h: u32,
    maximized: bool,
    fullscreen: bool,
}

struct Shell {
    dir: PathBuf,
    win: Mutex<Option<WinState>>,
    /// 서재 폴더. 여기에 넣어 둔 책 파일은 화면이 읽어 서재에 꽂는다.
    library: Mutex<PathBuf>,
    /// 메모 폴더. 책을 읽으며 쓴 메모(.md)와 그 그림을 둔다.
    notes: Mutex<PathBuf>,
    /// "난로로 열기"로 넘어왔고 화면이 아직 받아 가지 않은 책 파일.
    waiting: Mutex<Vec<PathBuf>>,
    /// 화면이 읽어도 되는 파일. 넘어온 책 파일만 들어간다(화면이 아무 파일이나 읽지 못하게 한다).
    granted: Mutex<HashSet<PathBuf>>,
}

/// 자료 폴더의 settings.json 에 적어 두는 것.
#[derive(Default, Serialize, Deserialize)]
struct Settings {
    library_dir: Option<PathBuf>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    notes_dir: Option<PathBuf>,
}

/// 화면에 알려 주는 책 파일 하나. modified 는 1970년부터 센 초.
#[derive(Serialize)]
struct BookRef {
    path: String,
    name: String,
    size: u64,
    modified: u64,
}

#[derive(Serialize)]
struct Library {
    dir: String,
    books: Vec<BookRef>,
}

const BOOK_EXT: [&str; 3] = ["epub", "pdf", "txt"];
/// 화면에 통째로 넘기는 파일의 크기 한도.
const MAX_BOOK: u64 = 400 * 1024 * 1024;

/// 자료 폴더. 환경 변수 NANRO_DATA 가 있으면 그곳, 없으면 C:\Nanro, 그곳을 만들 수 없으면 윈도우의 기본 자리.
fn data_dir(app: &tauri::App) -> PathBuf {
    let wanted = std::env::var_os("NANRO_DATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(if cfg!(windows) { r"C:\Nanro" } else { "nanro-data" }));
    if fs::create_dir_all(&wanted).is_ok() {
        return wanted;
    }
    let fallback = app.path().app_local_data_dir().unwrap_or_else(|_| std::env::temp_dir().join("nanro"));
    let _ = fs::create_dir_all(&fallback);
    fallback
}

fn settings_file(dir: &Path) -> PathBuf {
    dir.join("settings.json")
}

fn load_settings(dir: &Path) -> Settings {
    fs::read_to_string(settings_file(dir))
        .ok()
        .and_then(|text| serde_json::from_str::<Settings>(&text).ok())
        .unwrap_or_default()
}

/// settings.json 의 한 항목만 바꿔 적는다. 다른 항목(서재 폴더, 메모 폴더)은 그대로 둔다.
fn change_settings(dir: &Path, change: impl FnOnce(&mut Settings)) {
    let mut s = load_settings(dir);
    change(&mut s);
    if let Ok(text) = serde_json::to_string(&s) {
        let _ = fs::write(settings_file(dir), text);
    }
}

/// 서재 폴더. 고른 적이 없거나 그 폴더가 없어졌으면 자료 폴더 안의 books.
fn load_library(dir: &Path) -> PathBuf {
    load_settings(dir).library_dir.filter(|p| p.is_dir()).unwrap_or_else(|| dir.join("books"))
}

/// 메모 폴더. 고른 적이 없거나 그 폴더가 없어졌으면 자료 폴더 안의 notes.
fn load_notes(dir: &Path) -> PathBuf {
    load_settings(dir).notes_dir.filter(|p| p.is_dir()).unwrap_or_else(|| dir.join("notes"))
}

fn is_book(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| BOOK_EXT.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

fn book_ref(path: &Path) -> Option<BookRef> {
    let meta = fs::metadata(path).ok()?;
    if !meta.is_file() {
        return None;
    }
    Some(BookRef {
        path: path.to_string_lossy().into_owned(),
        name: path.file_name()?.to_string_lossy().into_owned(),
        size: meta.len(),
        modified: meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0),
    })
}

/// 실행할 때 넘어온 값들 가운데 책 파일만 고른다. 첫 값(프로그램 자신)은 뺀 것을 받는다.
fn book_paths(args: impl Iterator<Item = PathBuf>, cwd: Option<&Path>) -> Vec<PathBuf> {
    args.map(|p| match cwd {
        Some(c) if p.is_relative() => c.join(p),
        _ => p,
    })
    .filter(|p| is_book(p) && p.is_file())
    .collect()
}

/// 폴더 안의 책 파일을 모은다. 하위 폴더는 세 단계까지만 내려간다.
fn scan(dir: &Path, depth: u32, out: &mut Vec<BookRef>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        if out.len() >= 2000 {
            return;
        }
        let path = entry.path();
        if path.is_dir() {
            if depth < 3 {
                scan(&path, depth + 1, out);
            }
        } else if is_book(&path) {
            out.extend(book_ref(&path));
        }
    }
}

fn state_file(dir: &PathBuf) -> PathBuf {
    dir.join("window.json")
}

fn load_state(dir: &PathBuf) -> Option<WinState> {
    serde_json::from_str(&fs::read_to_string(state_file(dir)).ok()?).ok()
}

/// 보통 창일 때만 자리와 크기를 적어 둔다. 최대화나 전체 화면의 크기를 적으면 되돌아올 크기를 잃는다.
fn remember(win: &WebviewWindow) {
    let shell = win.state::<Shell>();
    let normal = !win.is_maximized().unwrap_or(false) && !win.is_fullscreen().unwrap_or(false) && !win.is_minimized().unwrap_or(false);
    if !normal {
        return;
    }
    if let (Ok(p), Ok(s)) = (win.outer_position(), win.inner_size()) {
        if s.width >= 320 && s.height >= 240 {
            let mut g = shell.win.lock().unwrap();
            let old = g.unwrap_or(WinState { x: 0, y: 0, w: 0, h: 0, maximized: false, fullscreen: false });
            *g = Some(WinState { x: p.x, y: p.y, w: s.width, h: s.height, ..old });
        }
    }
}

fn save(win: &WebviewWindow) {
    let shell = win.state::<Shell>();
    let mut g = shell.win.lock().unwrap();
    let mut st = g.unwrap_or(WinState { x: 0, y: 0, w: 0, h: 0, maximized: false, fullscreen: false });
    st.maximized = win.is_maximized().unwrap_or(false);
    st.fullscreen = win.is_fullscreen().unwrap_or(false);
    *g = Some(st);
    if let Ok(text) = serde_json::to_string(&st) {
        let _ = fs::write(state_file(&shell.dir), text);
    }
}

/// 기억한 자리가 지금 연결된 화면 안에 있는지. 모니터를 떼어 낸 뒤 창이 화면 밖에 뜨는 일을 막는다.
fn on_screen(win: &WebviewWindow, st: &WinState) -> bool {
    let (cx, cy) = (st.x + st.w as i32 / 2, st.y + 20);
    win.available_monitors().map(|ms| {
        ms.iter().any(|m| {
            let (p, s) = (m.position(), m.size());
            cx >= p.x && cx < p.x + s.width as i32 && cy >= p.y && cy < p.y + s.height as i32
        })
    }).unwrap_or(false)
}

/// 창을 최소화하면 화면 엔진에 "안 보임"을 알려 그리기를 멈추게 한다. 알리지 않으면 최소화한 채로도 방과 불을 계속 그린다.
fn rest_when_minimized(win: &WebviewWindow) {
    let visible = !win.is_minimized().unwrap_or(false);
    #[cfg(windows)]
    let _ = win.with_webview(move |wv| unsafe {
        let _ = wv.controller().SetIsVisible(visible);
    });
    #[cfg(not(windows))]
    let _ = visible;
}

/// 위치를 묻는 창("tauri.localhost 이(가) 사용자의 위치를 파악하려고 합니다")을 띄우지 않고 허용한다.
/// 위치는 창밖의 해와 날씨를 맞추는 데만 쓰고, 윈도우의 위치 설정이 꺼져 있으면 화면 쪽이 서울을 쓴다. 다른 권한은 건드리지 않는다.
#[cfg(windows)]
fn allow_location(win: &WebviewWindow) {
    use webview2_com::{Microsoft::Web::WebView2::Win32::*, PermissionRequestedEventHandler};
    let _ = win.with_webview(|wv| unsafe {
        let Ok(core) = wv.controller().CoreWebView2() else { return };
        let handler = PermissionRequestedEventHandler::create(Box::new(|_, args| {
            if let Some(args) = args {
                let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
                args.PermissionKind(&mut kind)?;
                if kind == COREWEBVIEW2_PERMISSION_KIND_GEOLOCATION {
                    args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
                }
            }
            Ok(())
        }));
        let mut token = Default::default();
        let _ = core.add_PermissionRequested(&handler, &mut token);
    });
}

#[tauri::command]
fn toggle_fullscreen(window: WebviewWindow) -> bool {
    let on = !window.is_fullscreen().unwrap_or(false);
    let _ = window.set_fullscreen(on);
    on
}

/// 끝내기. 창을 닫는 길로 끈다(창 닫기 → 기억 → 종료). 프로세스를 바로 끊으면 화면 엔진이 저장하던 것을 마치지 못할 수 있다.
#[tauri::command]
fn quit(window: WebviewWindow) {
    save(&window);
    if window.close().is_err() {
        window.app_handle().exit(0);
    }
}

/// 파일 이름으로 쓸 수 없는 글자를 바꾸고 길이를 줄인다. 폴더 경로가 섞여 들어와도 이름만 남긴다.
fn safe_name(raw: &str) -> String {
    let base = raw.rsplit(['/', '\\']).next().unwrap_or("");
    let mut name: String = base
        .chars()
        .map(|c| if c.is_control() || "<>:\"/\\|?*".contains(c) { '_' } else { c })
        .take(120)
        .collect();
    name = name.trim().trim_end_matches('.').to_string();
    if name.is_empty() {
        name = "난로.dat".into();
    }
    name
}

fn unhex(text: &str) -> Option<String> {
    if text.len() % 2 != 0 {
        return None;
    }
    let bytes: Option<Vec<u8>> = (0..text.len()).step_by(2).map(|i| u8::from_str_radix(text.get(i..i + 2)?, 16).ok()).collect();
    String::from_utf8(bytes?).ok()
}

/// 화면 쪽에서 넘긴 내용을 내려받기 폴더에 쓴다(백업, 밑줄 내보내기, 인용구 카드). 같은 이름이 있으면 번호를 붙인다.
/// 돌려주는 값은 저장된 전체 경로.
#[tauri::command]
fn save_download(app: tauri::AppHandle, request: tauri::ipc::Request<'_>) -> Result<String, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("저장할 내용이 없습니다".into());
    };
    let name = request.headers().get("x-file-name").and_then(|v| v.to_str().ok()).and_then(unhex).map(|n| safe_name(&n)).unwrap_or_else(|| "난로.dat".into());
    let dir = app.path().download_dir().unwrap_or_else(|_| app.state::<Shell>().dir.join("내보내기"));
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name.as_str(), ""),
    };
    let mut path = dir.join(&name);
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("{stem} ({n}){ext}"));
        n += 1;
    }
    fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// "난로로 열기"로 넘어온 책 파일을 화면에 넘긴다. 한 번 넘긴 것은 다시 넘기지 않는다.
#[tauri::command]
fn opened_books(shell: tauri::State<'_, Shell>) -> Vec<BookRef> {
    let paths: Vec<PathBuf> = shell.waiting.lock().unwrap().drain(..).collect();
    let mut granted = shell.granted.lock().unwrap();
    paths
        .iter()
        .filter_map(|p| {
            let book = book_ref(p)?;
            granted.insert(p.clone());
            Some(book)
        })
        .collect()
}

/// 서재 폴더에 있는 책 파일 목록. 폴더가 없으면 만든다.
#[tauri::command(async)]
fn library_books(shell: tauri::State<'_, Shell>) -> Library {
    let dir = shell.library.lock().unwrap().clone();
    let _ = fs::create_dir_all(&dir);
    let mut books = Vec::new();
    scan(&dir, 0, &mut books);
    books.sort_by(|a, b| a.path.cmp(&b.path));
    Library { dir: dir.to_string_lossy().into_owned(), books }
}

/// 책 파일의 내용. 넘어온 책 파일이거나 서재 폴더 안에 있는 책 파일만 읽어 준다.
#[tauri::command(async)]
fn read_book(shell: tauri::State<'_, Shell>, path: String) -> Result<tauri::ipc::Response, String> {
    let path = PathBuf::from(path);
    let library = shell.library.lock().unwrap().clone();
    let in_library = match (fs::canonicalize(&path), fs::canonicalize(&library)) {
        (Ok(file), Ok(dir)) => file.starts_with(dir),
        _ => false,
    };
    if !is_book(&path) || !(in_library || shell.granted.lock().unwrap().contains(&path)) {
        return Err("이 파일은 열 수 없습니다".into());
    }
    if fs::metadata(&path).map_err(|e| e.to_string())?.len() > MAX_BOOK {
        return Err("파일이 너무 큽니다".into());
    }
    fs::read(&path).map(tauri::ipc::Response::new).map_err(|e| e.to_string())
}

/// 서재 폴더를 탐색기로 연다.
#[tauri::command]
fn open_library_folder(shell: tauri::State<'_, Shell>) {
    let dir = shell.library.lock().unwrap().clone();
    let _ = fs::create_dir_all(&dir);
    let _ = std::process::Command::new("explorer.exe").arg(&dir).spawn();
}

/// 서재 폴더를 고르는 창을 띄운다. 고르면 기억하고 그 경로를 돌려준다. 그만두면 아무것도 바꾸지 않는다.
#[tauri::command(async)]
fn choose_library_folder(window: WebviewWindow) -> Option<String> {
    let shell = window.state::<Shell>();
    let start = shell.library.lock().unwrap().clone();
    #[cfg(windows)]
    let picked = rfd::FileDialog::new().set_title("서재 폴더 고르기").set_directory(&start).set_parent(&window).pick_folder();
    #[cfg(not(windows))]
    let picked: Option<PathBuf> = { let _ = start; None };
    let dir = picked?;
    change_settings(&shell.dir, |s| s.library_dir = Some(dir.clone()));
    *shell.library.lock().unwrap() = dir.clone();
    Some(dir.to_string_lossy().into_owned())
}

// ---- 메모 폴더: 화면이 이름만 넘기고, 읽고 쓰는 곳은 언제나 메모 폴더 바로 안이다.

/// 메모 폴더에 둘 수 있는 파일 종류. 메모(.md)와 그 메모로 그린 그림(.excalidraw, .svg).
const NOTE_EXT: [&str; 6] = ["md", "markdown", "txt", "excalidraw", "json", "svg"];
/// 메모 파일 하나의 크기 한도.
const MAX_NOTE: usize = 20 * 1024 * 1024;

#[derive(Serialize)]
struct NoteRef {
    name: String,
    size: u64,
    modified: u64,
}

#[derive(Serialize)]
struct Notes {
    dir: String,
    files: Vec<NoteRef>,
}

/// 메모 파일 이름이 쓸 만한지 본다. 폴더 경로, "..", 윈도우가 못 쓰는 글자와 이름(CON, NUL 같은 것), 모르는 확장자는 받지 않는다.
fn note_name(raw: &str) -> Result<String, String> {
    let bad = || Err::<String, String>("메모 파일 이름을 쓸 수 없습니다".into());
    let name = raw.trim();
    if name.is_empty() || name.chars().count() > 160 || name.starts_with('.') || name.ends_with('.') || name.ends_with(' ') {
        return bad();
    }
    if name.chars().any(|c| c.is_control() || "<>:\"/\\|?*".contains(c)) || name.contains("..") {
        return bad();
    }
    let (stem, ext) = match name.rfind('.') {
        Some(i) => (&name[..i], name[i + 1..].to_ascii_lowercase()),
        None => return bad(),
    };
    let upper = stem.trim().to_ascii_uppercase();
    let reserved = ["CON", "PRN", "AUX", "NUL"].contains(&upper.as_str())
        || ((upper.starts_with("COM") || upper.starts_with("LPT")) && upper.len() == 4 && upper.as_bytes()[3].is_ascii_digit());
    if stem.trim().is_empty() || reserved || !NOTE_EXT.contains(&ext.as_str()) {
        return bad();
    }
    Ok(name.to_string())
}

fn notes_dir(shell: &Shell) -> PathBuf {
    let dir = shell.notes.lock().unwrap().clone();
    let _ = fs::create_dir_all(&dir);
    dir
}

/// 메모 폴더의 파일 목록(하위 폴더는 보지 않는다). 폴더가 없으면 만든다.
#[tauri::command(async)]
fn notes_list(shell: tauri::State<'_, Shell>) -> Notes {
    let dir = notes_dir(&shell);
    let mut files: Vec<NoteRef> = fs::read_dir(&dir)
        .map(|entries| {
            entries
                .flatten()
                .filter_map(|e| {
                    let name = e.file_name().to_string_lossy().into_owned();
                    note_name(&name).ok()?;
                    let meta = e.metadata().ok().filter(|m| m.is_file())?;
                    let modified = meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);
                    Some(NoteRef { name, size: meta.len(), modified })
                })
                .take(5000)
                .collect()
        })
        .unwrap_or_default();
    files.sort_by(|a, b| a.name.cmp(&b.name));
    Notes { dir: dir.to_string_lossy().into_owned(), files }
}

/// 메모 파일의 내용. 없으면 null.
#[tauri::command(async)]
fn note_read(shell: tauri::State<'_, Shell>, name: String) -> Result<Option<String>, String> {
    let path = notes_dir(&shell).join(note_name(&name)?);
    match fs::metadata(&path) {
        Err(_) => return Ok(None),
        Ok(m) if !m.is_file() => return Err("메모 파일이 아닙니다".into()),
        Ok(m) if m.len() > MAX_NOTE as u64 => return Err("메모 파일이 너무 큽니다".into()),
        Ok(_) => {}
    }
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    Ok(Some(String::from_utf8_lossy(&bytes).into_owned()))
}

/// 메모 파일을 쓴다. 옆에 임시 파일로 다 쓴 뒤 바꿔 끼워, 쓰다가 꺼져도 예전 내용이 남는다.
#[tauri::command(async)]
fn note_write(shell: tauri::State<'_, Shell>, name: String, text: String) -> Result<(), String> {
    if text.len() > MAX_NOTE {
        return Err("메모가 너무 깁니다".into());
    }
    let name = note_name(&name)?;
    let dir = notes_dir(&shell);
    let (path, tmp) = (dir.join(&name), dir.join(format!(".{name}.tmp")));
    fs::write(&tmp, text.as_bytes()).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })
}

/// 메모 폴더를 탐색기로 연다.
#[tauri::command]
fn open_notes_folder(shell: tauri::State<'_, Shell>) {
    let dir = notes_dir(&shell);
    let _ = std::process::Command::new("explorer.exe").arg(&dir).spawn();
}

/// 메모 폴더를 고르는 창을 띄운다. 고르면 기억하고 그 경로를 돌려준다.
#[tauri::command(async)]
fn choose_notes_folder(window: WebviewWindow) -> Option<String> {
    let shell = window.state::<Shell>();
    let start = notes_dir(&shell);
    #[cfg(windows)]
    let picked = rfd::FileDialog::new().set_title("메모 폴더 고르기").set_directory(&start).set_parent(&window).pick_folder();
    #[cfg(not(windows))]
    let picked: Option<PathBuf> = { let _ = start; None };
    let dir = picked?;
    change_settings(&shell.dir, |s| s.notes_dir = Some(dir.clone()));
    *shell.notes.lock().unwrap() = dir.clone();
    Some(dir.to_string_lossy().into_owned())
}

fn main() {
    tauri::Builder::default()
        // 두 번째로 켜면 새 창을 만들지 않고 켜져 있는 창을 앞으로 가져온다. 책 파일과 함께 켰으면 그 책을 켜져 있는 창에 넘긴다.
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            let books = book_paths(args.into_iter().skip(1).map(PathBuf::from), Some(Path::new(&cwd)));
            if let (false, Some(shell)) = (books.is_empty(), app.try_state::<Shell>()) {
                shell.waiting.lock().unwrap().extend(books);
                let _ = app.emit("nanro-open", ());
            }
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![
            toggle_fullscreen,
            quit,
            save_download,
            opened_books,
            library_books,
            read_book,
            open_library_folder,
            choose_library_folder,
            notes_list,
            note_read,
            note_write,
            open_notes_folder,
            choose_notes_folder
        ])
        .setup(|app| {
            let dir = data_dir(app);
            let saved = load_state(&dir);
            app.manage(Shell {
                dir: dir.clone(),
                win: Mutex::new(saved),
                library: Mutex::new(load_library(&dir)),
                notes: Mutex::new(load_notes(&dir)),
                waiting: Mutex::new(book_paths(std::env::args_os().skip(1).map(PathBuf::from), None)),
                granted: Mutex::new(HashSet::new()),
            });

            // 주소 방식(https://tauri.localhost)은 책과 설정이 담기는 저장 공간의 이름이 되므로 바꾸지 않는다.
            // 시험용: 환경 변수 NANRO_URL 이 있으면 그 주소를 연다(예: 개발 서버, 주소 옵션을 붙인 화면).
            let url = match std::env::var("NANRO_URL").ok().and_then(|u| u.parse().ok()) {
                Some(u) => WebviewUrl::External(u),
                None => WebviewUrl::App("index.html".into()),
            };
            let win = WebviewWindowBuilder::new(app, "main", url)
                .title("난로")
                .inner_size(1600.0, 900.0)
                .min_inner_size(640.0, 400.0)
                .visible(false)
                .use_https_scheme(true)
                .disable_drag_drop_handler() // 책 파일을 창에 끌어다 놓는 일은 화면 쪽 코드가 받는다
                .data_directory(dir.join("webview"))
                .build()?;

            #[cfg(windows)]
            allow_location(&win);

            match saved {
                Some(st) if st.w >= 320 && st.h >= 240 && on_screen(&win, &st) => {
                    let _ = win.set_size(PhysicalSize::new(st.w, st.h));
                    let _ = win.set_position(PhysicalPosition::new(st.x, st.y));
                    if st.maximized {
                        let _ = win.maximize();
                    }
                    if st.fullscreen {
                        let _ = win.set_fullscreen(true);
                    }
                }
                Some(st) => {
                    let _ = win.center();
                    if st.fullscreen {
                        let _ = win.set_fullscreen(true);
                    }
                }
                // 처음 켤 때는 전체 화면. F11 로 창으로 바꿀 수 있다.
                None => {
                    let _ = win.center();
                    let _ = win.set_fullscreen(true);
                }
            }
            let _ = win.show();
            let _ = win.set_focus();
            Ok(())
        })
        .on_window_event(|window, event| {
            let Some(win) = window.app_handle().get_webview_window(window.label()) else { return };
            match event {
                WindowEvent::Resized(_) | WindowEvent::Focused(_) => rest_when_minimized(&win),
                _ => {}
            }
            match event {
                WindowEvent::Moved(_) | WindowEvent::Resized(_) => remember(&win),
                WindowEvent::CloseRequested { .. } => save(&win),
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("난로를 시작하지 못했습니다");
}
