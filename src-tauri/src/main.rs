// 난로의 윈도우 프로그램 틀. 화면(방, 불, 책)은 웹버전과 같은 코드이고, 여기서는 창만 다룬다.
//   - 창 하나를 만들고, 마지막 크기와 위치, 전체 화면 여부를 기억한다.
//   - 책과 설정은 프로그램 폴더와 다른 자료 폴더에 둔다. 새 버전을 덮어 깔아도 남는다.
//   - 이미 켜져 있으면 새로 켜지 않고 켜져 있는 창을 앞으로 가져온다.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{fs, path::PathBuf, sync::Mutex};

use serde::{Deserialize, Serialize};
use tauri::{Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

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
}

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

#[tauri::command]
fn toggle_fullscreen(window: WebviewWindow) -> bool {
    let on = !window.is_fullscreen().unwrap_or(false);
    let _ = window.set_fullscreen(on);
    on
}

#[tauri::command]
fn quit(window: WebviewWindow) {
    save(&window);
    window.app_handle().exit(0);
}

fn main() {
    tauri::Builder::default()
        // 두 번째로 켜면 새 창을 만들지 않고 켜져 있는 창을 앞으로 가져온다.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![toggle_fullscreen, quit])
        .setup(|app| {
            let dir = data_dir(app);
            let saved = load_state(&dir);
            app.manage(Shell { dir: dir.clone(), win: Mutex::new(saved) });

            // 주소 방식(https://tauri.localhost)은 책과 설정이 담기는 저장 공간의 이름이 되므로 바꾸지 않는다.
            let win = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("난로")
                .inner_size(1600.0, 900.0)
                .min_inner_size(640.0, 400.0)
                .visible(false)
                .use_https_scheme(true)
                .disable_drag_drop_handler() // 책 파일을 창에 끌어다 놓는 일은 화면 쪽 코드가 받는다
                .data_directory(dir.join("webview"))
                .build()?;

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
                WindowEvent::Moved(_) | WindowEvent::Resized(_) => remember(&win),
                WindowEvent::CloseRequested { .. } => save(&win),
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("난로를 시작하지 못했습니다");
}
