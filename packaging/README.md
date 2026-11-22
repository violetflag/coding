# 윈도우 프로그램 만들기

난로의 화면은 웹버전과 같은 코드(`src/`)이고, `src-tauri/` 가 그것을 윈도우 창에 담는 틀(Tauri)입니다.
설치 파일은 Inno Setup 으로 만듭니다(`packaging/nanro.iss`).

## 순서 (윈도우 PC에서)

1. 화면 묶기: `npm ci` 뒤 `npm run build` (결과는 `dist/`)
2. 실행 파일: MSVC 환경을 켠 뒤 `cd src-tauri` 하고 `cargo build --release --locked`
   - `dist/` 가 실행 파일 안에 들어갑니다. 그래서 1번을 먼저 해야 합니다.
   - tauri CLI 는 쓰지 않습니다(설치 파일을 Inno Setup 으로 만들기 때문).
3. 설치 파일: `ISCC packaging\nanro.iss` (결과는 `release\NanroSetup-v버전.exe`)
   - 실행 파일이 다른 곳에 있으면 `ISCC /DExePath=<경로> packaging\nanro.iss`

## 설치되는 곳

| 무엇 | 어디 |
| --- | --- |
| 프로그램 | `C:\NanroApp` (설치할 때 바꿀 수 있음) |
| 자료: 책, 읽던 곳, 설정, 창 크기 | `C:\Nanro` (환경 변수 `NANRO_DATA` 로 바꿀 수 있음) |
| 서재 폴더: 넣어 둔 책 파일을 서재에 꽂는 곳 | `C:\Nanro\books` (서재 창에서 바꿀 수 있고, 고른 곳은 자료 폴더의 `settings.json` 에 적힘) |

프로그램을 지우거나 새 버전을 덮어 깔아도 자료 폴더는 그대로 남습니다.

설치 파일은 지금 사용자의 레지스트리(`HKCU\Software\Classes`)에 `Applications\nanro.exe` 와 `Nanro.Book` 을 적어, 책 파일(.epub, .pdf)의 "연결 프로그램" 목록에 난로가 나오게 합니다. 어떤 확장자의 기본 프로그램도 바꾸지 않고, 난로를 지우면 함께 지워집니다.

## 책 파일을 넘겨받는 길

`nanro.exe "책 파일 경로"` 로 켜면 그 책이 서재에 꽂히고 바로 펴집니다. 이미 켜져 있으면 켜져 있는 창이 받습니다.
화면 쪽은 파일을 직접 읽지 못하고 프로그램에 부탁합니다(`read_book`). 프로그램은 이렇게 넘어온 책 파일과 서재 폴더 안의 책 파일(.epub, .pdf, .txt)만 읽어 줍니다.

## 버전을 올릴 때

`package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`(서버나 PC에서 `cargo check` 를 한 번 돌리면 맞춰짐), `src-tauri/tauri.conf.json`, `packaging/nanro.iss` 의 버전을 함께 바꿉니다.
